import type {
  ClientToServerMessage,
  GameActionPayload,
  OnlineGameEvent,
  OnlineRoomSnapshot,
  ServerToClientMessage,
  VoiceSignalPayload,
} from './protocol';
import type { GameMode, GameState, ThemeId } from '../game/types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

export interface OnlineClientHandlers {
  onConnectionChange?: (status: ConnectionStatus) => void;
  onRoomJoined?: (payload: {
    room: OnlineRoomSnapshot;
    mySeatIndex: number;
    gameState: GameState | null;
  }) => void;
  onRoomUpdate?: (room: OnlineRoomSnapshot) => void;
  onRoomStarted?: (payload: { room: OnlineRoomSnapshot; gameState: GameState }) => void;
  onGameEvent?: (event: OnlineGameEvent) => void;
  onVoiceSignal?: (payload: { fromClientId: string; signal: VoiceSignalPayload }) => void;
  onVoiceSpeaking?: (payload: { clientId: string; speaking: boolean }) => void;
  onVoiceAudio?: (payload: { fromClientId: string; sampleRate: number; data: string }) => void;
  onError?: (err: { code: string; message: string }) => void;
}

const CLIENT_ID_STORAGE_KEY = 'mango_ludo_client_id_v1';

export function getOrCreateClientId(): string {
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `ml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `ml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

/**
 * Resilient auto-reconnecting WebSocket client for Mango Ludo online room-code matches & voice chat.
 */
export class MangoOnlineClient {
  readonly clientId: string;
  private ws: WebSocket | null = null;
  private handlers: OnlineClientHandlers = {};
  private pendingQueue: ClientToServerMessage[] = [];
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = false;
  private activeRoomCode: string | null = null;
  private activePlayerName = 'Player';
  private lifecycleListenersAttached = false;

  private readonly handleWindowWake = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    if (!this.shouldReconnect || !this.activeRoomCode) return;
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      if (this.reconnectTimer !== null) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.connect();
    } else if (this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // onclose will reconnect
      }
    }
  };

  constructor() {
    this.clientId = getOrCreateClientId();
  }

  setHandlers(handlers: OnlineClientHandlers) {
    this.handlers = handlers;
  }

  private attachLifecycleListeners() {
    if (this.lifecycleListenersAttached || typeof window === 'undefined') return;
    this.lifecycleListenersAttached = true;
    window.addEventListener('online', this.handleWindowWake);
    document.addEventListener('visibilitychange', this.handleWindowWake);
  }

  private detachLifecycleListeners() {
    if (!this.lifecycleListenersAttached || typeof window === 'undefined') return;
    this.lifecycleListenersAttached = false;
    window.removeEventListener('online', this.handleWindowWake);
    document.removeEventListener('visibilitychange', this.handleWindowWake);
  }

  connect() {
    this.shouldReconnect = true;
    this.attachLifecycleListeners();

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.handlers.onConnectionChange?.('connecting');
    const ws = new WebSocket(getWebSocketUrl());
    this.ws = ws;

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.reconnectAttempts = 0;
      this.handlers.onConnectionChange?.('connected');

      // ALWAYS rejoin active room first on reconnect unless the queue already starts with room:create or room:join
      const firstPending = this.pendingQueue[0];
      const alreadyJoining =
        firstPending && (firstPending.type === 'room:create' || firstPending.type === 'room:join');
      if (this.activeRoomCode && !alreadyJoining) {
        ws.send(
          JSON.stringify({
            type: 'room:join',
            clientId: this.clientId,
            roomCode: this.activeRoomCode,
            playerName: this.activePlayerName,
          } satisfies ClientToServerMessage)
        );
      }

      // Flush queued messages
      while (this.pendingQueue.length > 0 && this.ws === ws && ws.readyState === WebSocket.OPEN) {
        const next = this.pendingQueue.shift()!;
        ws.send(JSON.stringify(next));
      }

      if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = window.setInterval(() => {
        if (this.ws === ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 18_000);
    };

    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      let msg: ServerToClientMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerToClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'pong') return;

      if (msg.type === 'room:joined') {
        this.activeRoomCode = msg.room.roomCode;
        const mySeat = msg.room.seats.find((s) => s.seatIndex === msg.mySeatIndex);
        if (mySeat?.name) {
          this.activePlayerName = mySeat.name;
        }
        this.handlers.onRoomJoined?.({
          room: msg.room,
          mySeatIndex: msg.mySeatIndex,
          gameState: msg.gameState,
        });
      } else if (msg.type === 'room:update') {
        this.activeRoomCode = msg.room.roomCode;
        this.handlers.onRoomUpdate?.(msg.room);
      } else if (msg.type === 'room:started') {
        this.activeRoomCode = msg.room.roomCode;
        this.handlers.onRoomStarted?.({
          room: msg.room,
          gameState: msg.gameState,
        });
      } else if (msg.type === 'game:event') {
        this.handlers.onGameEvent?.(msg.event);
      } else if (msg.type === 'voice:signal') {
        this.handlers.onVoiceSignal?.({
          fromClientId: msg.fromClientId,
          signal: msg.signal,
        });
      } else if (msg.type === 'voice:speaking') {
        this.handlers.onVoiceSpeaking?.({
          clientId: msg.clientId,
          speaking: msg.speaking,
        });
      } else if (msg.type === 'voice:audio') {
        this.handlers.onVoiceAudio?.({
          fromClientId: msg.fromClientId,
          sampleRate: msg.sampleRate,
          data: msg.data,
        });
      } else if (msg.type === 'room:error') {
        this.handlers.onError?.({ code: msg.code, message: msg.message });
      }
    };

    ws.onclose = () => {
      // CRITICAL: Ignore close events from older/superseded sockets
      if (this.ws !== ws) return;
      if (this.heartbeatTimer !== null) {
        window.clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.ws = null;
      this.handlers.onConnectionChange?.('disconnected');

      if (this.shouldReconnect && this.activeRoomCode) {
        const delay = Math.min(4000, 500 * Math.pow(1.5, this.reconnectAttempts));
        this.reconnectAttempts += 1;
        if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = window.setTimeout(() => {
          this.reconnectTimer = null;
          this.connect();
        }, delay);
      }
    };

    ws.onerror = () => {
      // onclose handles reconnection cleanly
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.activeRoomCode = null;
    this.pendingQueue = [];
    this.detachLifecycleListeners();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    const prev = this.ws;
    this.ws = null;
    if (prev) {
      try {
        prev.close();
      } catch {
        // ignore
      }
    }
    this.handlers.onConnectionChange?.('disconnected');
  }

  private sendRaw(msg: ClientToServerMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pendingQueue.push(msg);
      this.connect();
    }
  }

  createRoom(params: {
    playerName: string;
    mode: GameMode;
    playerCount: number;
    tokensPerPlayer: 2 | 4;
    themeId: ThemeId;
    fillWithBots?: boolean;
    crazyTimerMinutes?: number;
  }) {
    this.activePlayerName = params.playerName.trim() || 'Player 1';
    this.sendRaw({
      type: 'room:create',
      clientId: this.clientId,
      playerName: this.activePlayerName,
      mode: params.mode,
      playerCount: params.playerCount,
      tokensPerPlayer: params.tokensPerPlayer,
      themeId: params.themeId,
      fillWithBots: params.fillWithBots ?? true,
      crazyTimerMinutes: params.crazyTimerMinutes,
    });
  }

  joinRoom(roomCode: string, playerName: string) {
    const normalized = roomCode.trim().toUpperCase();
    this.activeRoomCode = normalized;
    this.activePlayerName = playerName.trim();
    this.sendRaw({
      type: 'room:join',
      clientId: this.clientId,
      roomCode: normalized,
      playerName: this.activePlayerName,
    });
  }

  leaveRoom() {
    const wasActive = Boolean(this.activeRoomCode);
    this.activeRoomCode = null;
    this.pendingQueue = [];
    if (wasActive && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:leave', clientId: this.clientId }));
    }
  }

  updateSettings(patch: {
    mode?: GameMode;
    playerCount?: number;
    tokensPerPlayer?: 2 | 4;
    fillWithBots?: boolean;
    crazyTimerMinutes?: number;
  }) {
    this.sendRaw({
      type: 'room:update_settings',
      clientId: this.clientId,
      ...patch,
    });
  }

  startMatch() {
    this.sendRaw({
      type: 'room:start',
      clientId: this.clientId,
    });
  }

  sendAction(action: GameActionPayload) {
    this.sendRaw({
      type: 'game:action',
      clientId: this.clientId,
      action,
    });
  }

  sendVoiceState(joined: boolean, muted: boolean, speaking = false) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'voice:state',
        clientId: this.clientId,
        joined,
        muted,
        speaking,
      } satisfies ClientToServerMessage)
    );
  }

  sendVoiceSignal(targetClientId: string, signal: VoiceSignalPayload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'voice:signal',
        clientId: this.clientId,
        targetClientId,
        signal,
      } satisfies ClientToServerMessage)
    );
  }

  sendVoiceAudio(targetClientIds: string[], sampleRate: number, data: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || targetClientIds.length === 0) return;
    this.ws.send(
      JSON.stringify({
        type: 'voice:audio',
        clientId: this.clientId,
        targetClientIds,
        sampleRate,
        data,
      } satisfies ClientToServerMessage)
    );
  }
}
