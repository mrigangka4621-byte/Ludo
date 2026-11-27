import type {
  ClientToServerMessage,
  GameActionPayload,
  OnlineGameEvent,
  OnlineRoomSnapshot,
  ServerToClientMessage,
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
 * Lightweight auto-reconnecting WebSocket client for Mango Ludo online room-code matches.
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

  constructor() {
    this.clientId = getOrCreateClientId();
  }

  setHandlers(handlers: OnlineClientHandlers) {
    this.handlers = handlers;
  }

  connect() {
    this.shouldReconnect = true;
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
      this.reconnectAttempts = 0;
      this.handlers.onConnectionChange?.('connected');

      // Rejoin active room automatically if this was a reconnect
      if (this.activeRoomCode && this.pendingQueue.length === 0) {
        this.sendRaw({
          type: 'room:join',
          clientId: this.clientId,
          roomCode: this.activeRoomCode,
          playerName: this.activePlayerName,
        });
      }

      // Flush queued messages
      while (this.pendingQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
        const next = this.pendingQueue.shift()!;
        ws.send(JSON.stringify(next));
      }

      if (this.heartbeatTimer !== null) window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = window.setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25_000);
    };

    ws.onmessage = (ev) => {
      let msg: ServerToClientMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerToClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'pong') return;

      if (msg.type === 'room:joined') {
        this.activeRoomCode = msg.room.roomCode;
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
      } else if (msg.type === 'room:error') {
        this.handlers.onError?.({ code: msg.code, message: msg.message });
      }
    };

    ws.onclose = () => {
      if (this.heartbeatTimer !== null) {
        window.clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      this.ws = null;
      this.handlers.onConnectionChange?.('disconnected');

      if (this.shouldReconnect && this.activeRoomCode) {
        const delay = Math.min(5000, 600 * Math.pow(1.6, this.reconnectAttempts));
        this.reconnectAttempts += 1;
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
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
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
    });
  }

  joinRoom(roomCode: string, playerName: string) {
    this.activePlayerName = playerName.trim() || 'Player';
    this.sendRaw({
      type: 'room:join',
      clientId: this.clientId,
      roomCode: roomCode.trim().toUpperCase(),
      playerName: this.activePlayerName,
    });
  }

  leaveRoom() {
    const wasActive = Boolean(this.activeRoomCode);
    this.activeRoomCode = null;
    if (wasActive && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'room:leave', clientId: this.clientId }));
    }
  }

  updateSettings(patch: {
    mode?: GameMode;
    playerCount?: number;
    tokensPerPlayer?: 2 | 4;
    fillWithBots?: boolean;
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
}
