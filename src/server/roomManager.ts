import { buildBoardGeometry } from '../game/boardGeometry.ts';
import {
  applyDiceRoll,
  chooseBestBotMove,
  COMEBACK_YARD_MERCY_CHANCES,
  commitMove,
  createDefaultPlayers,
  createInitialGameState,
  getAllLegalMoves,
  getNextActivePlayerIndex,
  resolveCrazyStarChaos,
  rollSmartDie,
  YARD_MERCY_CHANCES,
} from '../game/engine.ts';
import {
  acceptUnoKnockback,
  cancelUnoNumberCard,
  chooseBestUnoBotCard,
  chooseBestUnoKnockbackTarget,
  commitUnoKnockbackMove,
  commitUnoNumberMove,
  drawUnoCardAndPass,
  getUnoKnockbackMoves,
  playUnoActionCard,
  selectUnoNumberCard,
} from '../game/unoEngine.ts';
import type {
  GameConfig,
  GameMode,
  GameState,
  MoveOption,
  PlayerConfig,
  ThemeId,
  UnoCard,
} from '../game/types.ts';
import type {
  GameActionPayload,
  OnlineGameEvent,
  OnlineRoomSnapshot,
  OnlineSeat,
} from '../multiplayer/protocol.ts';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_IDLE_TTL_MS = 30 * 60 * 1000;

export interface ManagedRoom {
  roomCode: string;
  hostClientId: string;
  status: 'lobby' | 'playing';
  mode: GameMode;
  playerCount: number;
  tokensPerPlayer: 2 | 4;
  themeId: ThemeId;
  fillWithBots: boolean;
  seats: OnlineSeat[];
  gameState: GameState | null;
  createdAt: number;
  lastActivityAt: number;
}

export interface RoomActionOutcome {
  ok: true;
  room: ManagedRoom;
  event?: OnlineGameEvent;
  started?: boolean;
  roomUpdated?: boolean;
}

export interface RoomActionError {
  ok: false;
  code: string;
  message: string;
}

export type RoomResult = RoomActionOutcome | RoomActionError;

function sanitizeName(raw: string, fallback: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ').slice(0, 18);
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function assignPaletteIndices(seats: OnlineSeat[], playerCount: number): OnlineSeat[] {
  const defaults = createDefaultPlayers(Math.max(2, Math.min(10, playerCount)));
  return seats.map((seat, idx) => ({
    ...seat,
    seatIndex: idx,
    paletteIndex: defaults[idx]?.paletteIndex ?? idx % 10,
  }));
}

export function snapshotRoom(room: ManagedRoom): OnlineRoomSnapshot {
  return {
    roomCode: room.roomCode,
    hostClientId: room.hostClientId,
    status: room.status,
    mode: room.mode,
    playerCount: room.playerCount,
    tokensPerPlayer: room.tokensPerPlayer,
    themeId: room.themeId,
    fillWithBots: room.fillWithBots,
    seats: room.seats.map((s) => ({ ...s })),
    createdAt: room.createdAt,
  };
}

/**
 * Pure, database-free in-memory authoritative RoomManager for Mango Ludo online rooms.
 * Keeps all live room & game state in memory and runs the exact shared Ludo/UNO engine rules.
 */
export class RoomManager {
  private rooms = new Map<string, ManagedRoom>();
  private clientToRoom = new Map<string, string>();
  private rng: () => number;

  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 100; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += CODE_ALPHABET[Math.floor(this.rng() * CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return `ML${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  getRoom(roomCode: string): ManagedRoom | undefined {
    return this.rooms.get(normalizeRoomCode(roomCode));
  }

  getRoomByClientId(clientId: string): ManagedRoom | undefined {
    const code = this.clientToRoom.get(clientId);
    if (!code) return undefined;
    return this.rooms.get(code);
  }

  getSeatIndex(room: ManagedRoom, clientId: string): number {
    return room.seats.findIndex((s) => s.clientId === clientId);
  }

  createRoom(params: {
    clientId: string;
    playerName: string;
    mode: GameMode;
    playerCount: number;
    tokensPerPlayer: 2 | 4;
    themeId: ThemeId;
    fillWithBots?: boolean;
  }): { room: ManagedRoom; seatIndex: number } {
    // If client was previously in another room, remove cleanly first
    this.leaveRoom(params.clientId);

    const playerCount = Math.max(2, Math.min(10, Math.round(params.playerCount)));
    const tokensPerPlayer: 2 | 4 = params.tokensPerPlayer === 2 ? 2 : 4;
    const roomCode = this.generateRoomCode();
    const now = Date.now();

    const hostSeat: OnlineSeat = {
      seatIndex: 0,
      clientId: params.clientId,
      name: sanitizeName(params.playerName, 'Player 1'),
      connected: true,
      isHost: true,
      paletteIndex: createDefaultPlayers(playerCount)[0].paletteIndex,
      voiceJoined: false,
      voiceMuted: false,
      voiceSpeaking: false,
    };

    const room: ManagedRoom = {
      roomCode,
      hostClientId: params.clientId,
      status: 'lobby',
      mode: params.mode,
      playerCount,
      tokensPerPlayer,
      themeId: params.themeId,
      fillWithBots: params.fillWithBots ?? true,
      seats: [hostSeat],
      gameState: null,
      createdAt: now,
      lastActivityAt: now,
    };

    this.rooms.set(roomCode, room);
    this.clientToRoom.set(params.clientId, roomCode);
    return { room, seatIndex: 0 };
  }

  joinRoom(params: {
    clientId: string;
    roomCode: string;
    playerName: string;
  }): { ok: true; room: ManagedRoom; seatIndex: number } | RoomActionError {
    const code = normalizeRoomCode(params.roomCode);
    const room = this.rooms.get(code);
    if (!room) {
      return {
        ok: false,
        code: 'ROOM_NOT_FOUND',
        message: `Room "${code || params.roomCode}" was not found. Double-check the 6-letter code.`,
      };
    }

    // Reconnecting player reclaims their existing seat cleanly
    const existingIdx = room.seats.findIndex((s) => s.clientId === params.clientId);
    if (existingIdx !== -1) {
      room.seats[existingIdx].connected = true;
      if (params.playerName.trim()) {
        room.seats[existingIdx].name = sanitizeName(params.playerName, room.seats[existingIdx].name);
      }
      room.lastActivityAt = Date.now();
      this.clientToRoom.set(params.clientId, code);
      return { ok: true, room, seatIndex: existingIdx };
    }

    if (room.status === 'playing') {
      return {
        ok: false,
        code: 'MATCH_IN_PROGRESS',
        message: 'This room has already started its match.',
      };
    }

    if (room.seats.length >= room.playerCount) {
      return {
        ok: false,
        code: 'ROOM_FULL',
        message: `Room ${code} is already full (${room.playerCount}/${room.playerCount} players).`,
      };
    }

    // Leave any previous room before joining this one
    this.leaveRoom(params.clientId);

    const nextSeatIndex = room.seats.length;
    const defaults = createDefaultPlayers(room.playerCount);
    room.seats.push({
      seatIndex: nextSeatIndex,
      clientId: params.clientId,
      name: sanitizeName(params.playerName, `Player ${nextSeatIndex + 1}`),
      connected: true,
      isHost: false,
      paletteIndex: defaults[nextSeatIndex]?.paletteIndex ?? nextSeatIndex % 10,
      voiceJoined: false,
      voiceMuted: false,
      voiceSpeaking: false,
    });
    room.seats = assignPaletteIndices(room.seats, room.playerCount);
    room.lastActivityAt = Date.now();
    this.clientToRoom.set(params.clientId, code);

    return { ok: true, room, seatIndex: nextSeatIndex };
  }

  markDisconnected(clientId: string): ManagedRoom | null {
    const room = this.getRoomByClientId(clientId);
    if (!room) return null;
    const seat = room.seats.find((s) => s.clientId === clientId);
    if (seat) {
      seat.connected = false;
      seat.voiceJoined = false;
      seat.voiceMuted = false;
      seat.voiceSpeaking = false;
      room.lastActivityAt = Date.now();
    }
    return room;
  }

  updateVoiceState(
    clientId: string,
    patch: { joined: boolean; muted: boolean; speaking?: boolean }
  ): {
    room: ManagedRoom;
    fullChanged: boolean;
    speakingChanged: boolean;
    speaking: boolean;
  } | null {
    const room = this.getRoomByClientId(clientId);
    if (!room) return null;
    const seat = room.seats.find((s) => s.clientId === clientId);
    if (!seat) return null;

    const nextJoined = Boolean(patch.joined);
    const nextMuted = nextJoined ? Boolean(patch.muted) : false;
    const nextSpeaking = nextJoined && !nextMuted ? Boolean(patch.speaking) : false;

    const fullChanged =
      Boolean(seat.voiceJoined) !== nextJoined || Boolean(seat.voiceMuted) !== nextMuted;
    const speakingChanged = Boolean(seat.voiceSpeaking) !== nextSpeaking;

    seat.voiceJoined = nextJoined;
    seat.voiceMuted = nextMuted;
    seat.voiceSpeaking = nextSpeaking;
    room.lastActivityAt = Date.now();

    return {
      room,
      fullChanged,
      speakingChanged,
      speaking: nextSpeaking,
    };
  }

  canRelayVoiceSignal(fromClientId: string, targetClientId: string): ManagedRoom | null {
    if (!fromClientId || !targetClientId || fromClientId === targetClientId) return null;
    const room = this.getRoomByClientId(fromClientId);
    if (!room) return null;
    const fromSeat = room.seats.find((s) => s.clientId === fromClientId && s.connected);
    const targetSeat = room.seats.find((s) => s.clientId === targetClientId && s.connected);
    if (!fromSeat || !targetSeat) return null;
    room.lastActivityAt = Date.now();
    return room;
  }

  leaveRoom(clientId: string): { room: ManagedRoom | null; deleted: boolean } {
    const code = this.clientToRoom.get(clientId);
    if (!code) return { room: null, deleted: false };
    this.clientToRoom.delete(clientId);

    const room = this.rooms.get(code);
    if (!room) return { room: null, deleted: false };

    const idx = room.seats.findIndex((s) => s.clientId === clientId);
    if (idx === -1) return { room, deleted: false };

    if (room.status === 'lobby') {
      room.seats.splice(idx, 1);
      if (room.seats.length === 0) {
        this.rooms.delete(code);
        return { room: null, deleted: true };
      }
      room.seats = assignPaletteIndices(room.seats, room.playerCount);
      if (room.hostClientId === clientId) {
        room.hostClientId = room.seats[0].clientId;
        room.seats[0].isHost = true;
      }
      room.lastActivityAt = Date.now();
      return { room, deleted: false };
    }

    // During a live match: mark seat disconnected & hand it over to CPU bot so others never get stuck!
    room.seats[idx].connected = false;
    room.seats[idx].voiceJoined = false;
    room.seats[idx].voiceMuted = false;
    room.seats[idx].voiceSpeaking = false;
    if (room.gameState && room.gameState.players[idx]) {
      room.gameState = {
        ...room.gameState,
        players: room.gameState.players.map((p, pIdx) =>
          pIdx === idx
            ? { ...p, isBot: true, name: `${p.name.replace(/ \(CPU\)$/, '')} (CPU)` }
            : p
        ),
        lastEvent: {
          id: (room.gameState.lastEvent?.id ?? 0) + 1,
          message: `${room.seats[idx].name} left — CPU took over their pawns.`,
          playerId: idx,
          kind: 'info',
        },
      };
    }

    const anyConnected = room.seats.some((s) => s.connected);
    if (!anyConnected) {
      this.rooms.delete(code);
      return { room: null, deleted: true };
    }

    if (room.hostClientId === clientId) {
      const nextHost = room.seats.find((s) => s.connected);
      if (nextHost) {
        room.hostClientId = nextHost.clientId;
        room.seats.forEach((s) => {
          s.isHost = s.clientId === nextHost.clientId;
        });
      }
    }

    room.lastActivityAt = Date.now();
    return { room, deleted: false };
  }

  updateSettings(
    clientId: string,
    patch: {
      mode?: GameMode;
      playerCount?: number;
      tokensPerPlayer?: 2 | 4;
      fillWithBots?: boolean;
    }
  ): RoomResult {
    const room = this.getRoomByClientId(clientId);
    if (!room) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'You are not in a room.' };
    }
    if (room.hostClientId !== clientId) {
      return { ok: false, code: 'NOT_HOST', message: 'Only the room host can change settings.' };
    }
    if (room.status !== 'lobby') {
      return { ok: false, code: 'ALREADY_STARTED', message: 'Cannot change settings after start.' };
    }

    if (patch.mode) room.mode = patch.mode;
    if (typeof patch.playerCount === 'number') {
      const minSeats = Math.max(2, room.seats.length);
      room.playerCount = Math.max(minSeats, Math.min(10, Math.round(patch.playerCount)));
      room.seats = assignPaletteIndices(room.seats, room.playerCount);
    }
    if (patch.tokensPerPlayer === 2 || patch.tokensPerPlayer === 4) {
      room.tokensPerPlayer = patch.tokensPerPlayer;
    }
    if (typeof patch.fillWithBots === 'boolean') {
      room.fillWithBots = patch.fillWithBots;
    }

    room.lastActivityAt = Date.now();
    return { ok: true, room, roomUpdated: true };
  }

  startMatch(clientId: string): RoomResult {
    const room = this.getRoomByClientId(clientId);
    if (!room) {
      return { ok: false, code: 'NOT_IN_ROOM', message: 'You are not in a room.' };
    }
    if (room.hostClientId !== clientId) {
      return { ok: false, code: 'NOT_HOST', message: 'Only the host can start the match.' };
    }

    const totalPlayers = room.fillWithBots ? room.playerCount : room.seats.length;
    if (totalPlayers < 2) {
      return {
        ok: false,
        code: 'NEED_MORE_PLAYERS',
        message: 'Wait for at least 1 friend to join, or enable "Fill Empty Seats with CPU".',
      };
    }

    const defaults = createDefaultPlayers(totalPlayers);
    const players: PlayerConfig[] = defaults.map((def, idx) => {
      const human = room.seats[idx];
      if (human) {
        return {
          id: idx,
          name: human.name,
          isBot: false,
          paletteIndex: def.paletteIndex,
        };
      }
      return {
        id: idx,
        name: `CPU ${idx + 1}`,
        isBot: true,
        paletteIndex: def.paletteIndex,
      };
    });

    const config: GameConfig = {
      playerCount: totalPlayers,
      mode: room.mode,
      tokensPerPlayer: room.tokensPerPlayer,
      themeId: room.themeId,
      players,
    };

    room.status = 'playing';
    room.gameState = createInitialGameState(config);
    room.lastActivityAt = Date.now();

    return { ok: true, room, started: true };
  }

  /**
   * Determines which seatIndex is legally allowed to submit an action right now.
   */
  getControllingSeatIndex(state: GameState): number {
    if (
      state.config.mode === 'uno' &&
      state.phase === 'choosing_knockback_target' &&
      state.unoState?.pendingKnockback
    ) {
      return state.unoState.pendingKnockback.chooserPlayerId;
    }
    return state.activePlayerIndex;
  }

  applyGameAction(clientId: string, action: GameActionPayload): RoomResult {
    const room = this.getRoomByClientId(clientId);
    if (!room || !room.gameState) {
      return { ok: false, code: 'NO_ACTIVE_MATCH', message: 'No active online match.' };
    }

    const seatIndex = this.getSeatIndex(room, clientId);
    if (seatIndex === -1) {
      return { ok: false, code: 'NOT_SEATED', message: 'You are not seated in this room.' };
    }

    if (action.type === 'restart_match') {
      if (room.hostClientId !== clientId) {
        return { ok: false, code: 'NOT_HOST', message: 'Only the host can restart the match.' };
      }
      room.gameState = createInitialGameState(room.gameState.config);
      room.lastActivityAt = Date.now();
      return {
        ok: true,
        room,
        event: { kind: 'state_sync', nextState: room.gameState },
      };
    }

    if (action.type === 'continue_ranks') {
      if (room.hostClientId !== clientId) {
        return { ok: false, code: 'NOT_HOST', message: 'Only the host can continue for ranks.' };
      }
      const prev = room.gameState;
      const nextIdx = getNextActivePlayerIndex(prev, prev.activePlayerIndex);
      room.gameState = {
        ...prev,
        continueAfterFirstWin: true,
        activePlayerIndex: nextIdx,
        phase: prev.config.mode === 'uno' ? 'choosing_card' : 'awaiting_roll',
        diceValue: null,
        consecutiveSixes: 0,
        lastEvent: {
          id: (prev.lastEvent?.id ?? 0) + 1,
          message: `Continuing for podium ranks — ${prev.players[nextIdx].name}'s turn.`,
          playerId: nextIdx,
          kind: 'info',
        },
      };
      room.lastActivityAt = Date.now();
      return {
        ok: true,
        room,
        event: { kind: 'state_sync', nextState: room.gameState },
      };
    }

    const controllingSeat = this.getControllingSeatIndex(room.gameState);
    if (seatIndex !== controllingSeat) {
      return { ok: false, code: 'NOT_YOUR_TURN', message: 'Please wait for your turn.' };
    }

    return this.executeSeatAction(room, seatIndex, action);
  }

  /**
   * Executes one server-side CPU step if the current controlling seat is a bot.
   * Returns null if a human controls the current turn or match is finished.
   */
  runBotStep(roomCode: string): RoomActionOutcome | null {
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== 'playing' || !room.gameState) return null;

    const state = room.gameState;
    if (state.phase === 'finished') return null;

    const controllingSeat = this.getControllingSeatIndex(state);
    const controller = state.players[controllingSeat];
    if (!controller || !controller.isBot) return null;

    // UNO knockback target selection by bot chooser
    if (state.config.mode === 'uno' && state.phase === 'choosing_knockback_target') {
      const targetMove = chooseBestUnoKnockbackTarget(state);
      if (!targetMove) return null;
      const res = this.executeSeatAction(room, controllingSeat, {
        type: 'select_move',
        tokenId: targetMove.tokenId,
        direction: targetMove.direction,
      });
      return res.ok ? res : null;
    }

    // UNO bot turn
    if (state.config.mode === 'uno' && state.phase === 'choosing_card') {
      const decision = chooseBestUnoBotCard(state);
      if (decision.type === 'accept_knockback') {
        const res = this.executeSeatAction(room, controllingSeat, { type: 'uno_accept_knockback' });
        return res.ok ? res : null;
      }
      if (decision.type === 'draw_pass') {
        const res = this.executeSeatAction(room, controllingSeat, { type: 'uno_draw_card' });
        return res.ok ? res : null;
      }
      if (decision.type === 'play_action') {
        const res = this.executeSeatAction(room, controllingSeat, {
          type: 'uno_select_card',
          cardId: decision.cardId,
        });
        return res.ok ? res : null;
      }
      if (decision.type === 'play_number') {
        const selected = selectUnoNumberCard(state, decision.cardId);
        room.gameState = selected;
        const res = this.executeSeatAction(room, controllingSeat, {
          type: 'select_move',
          tokenId: decision.move.tokenId,
          direction: decision.move.direction,
        });
        return res.ok ? res : null;
      }
    }

    // Dice modes: roll if awaiting_roll
    if (state.phase === 'awaiting_roll') {
      const res = this.executeSeatAction(room, controllingSeat, { type: 'roll_dice' });
      return res.ok ? res : null;
    }

    // Dice modes: move if choosing_move
    if (state.phase === 'choosing_move' && state.diceValue !== null) {
      const best = chooseBestBotMove(state, state.diceValue);
      if (!best) return null;
      const res = this.executeSeatAction(room, controllingSeat, {
        type: 'select_move',
        tokenId: best.tokenId,
        direction: best.direction,
      });
      return res.ok ? res : null;
    }

    return null;
  }

  private executeSeatAction(
    room: ManagedRoom,
    seatIndex: number,
    action: GameActionPayload
  ): RoomResult {
    const current = room.gameState!;
    room.lastActivityAt = Date.now();

    if (action.type === 'roll_dice') {
      if (current.phase !== 'awaiting_roll') {
        return { ok: false, code: 'INVALID_PHASE', message: 'Cannot roll right now.' };
      }

      const rollResult = rollSmartDie(current, this.rng);
      const finalRoll = rollResult.rolledValue;
      const outcome = applyDiceRoll(current, finalRoll);
      const roller = current.players[current.activePlayerIndex];

      const nextRevenge = { ...(outcome.nextState.crazyRevengeCharges ?? {}) };
      if (rollResult.consumedRevengeCharge && roller) {
        nextRevenge[roller.id] = false;
      }

      let nextState: GameState = {
        ...outcome.nextState,
        diceDirector: rollResult.nextDirector,
        crazyRevengeCharges: nextRevenge,
      };

      const isCrazyDoubleSix =
        current.config.mode === 'crazy' &&
        finalRoll === 6 &&
        !outcome.forfeited &&
        outcome.nextState.consecutiveSixes === 2;

      if (roller && nextState.lastEvent) {
        if (rollResult.reason === 'crazy_snipe') {
          nextState = {
            ...nextState,
            lastEvent: {
              ...nextState.lastEvent,
              message: `🎯 CRAZY SNIPE! ${roller.name} locked on and rolled ${finalRoll} to capture the pawn ahead!`,
              kind: 'capture',
            },
          };
        } else if (rollResult.reason === 'crazy_revenge_six') {
          nextState = {
            ...nextState,
            lastEvent: {
              ...nextState.lastEvent,
              message: `⚡ REVENGE 6! ${roller.name} stormed right back with a guaranteed 6!`,
              kind: 'bonus',
            },
          };
        } else if (isCrazyDoubleSix) {
          nextState = {
            ...nextState,
            lastEvent: {
              ...nextState.lastEvent,
              message: `⚡ DOUBLE SIX (2×6)! Pick your move, then roll your bonus turn (1–5 only)!`,
              kind: 'bonus',
            },
          };
        } else if (rollResult.reason === 'comeback_mercy_six') {
          nextState = {
            ...nextState,
            lastEvent: {
              ...nextState.lastEvent,
              message: `🍀 COMEBACK 6! ${roller.name} bounced right back within ${COMEBACK_YARD_MERCY_CHANCES} yard rolls!`,
              kind: 'bonus',
            },
          };
        } else if (rollResult.reason === 'mercy_six') {
          nextState = {
            ...nextState,
            lastEvent: {
              ...nextState.lastEvent,
              message: `🍀 ${roller.name} unlocked a Mercy 6 after ${YARD_MERCY_CHANCES} yard rolls!`,
              kind: 'bonus',
            },
          };
        } else if (rollResult.fireJustIgnited) {
          nextState = {
            ...nextState,
            lastEvent: {
              ...nextState.lastEvent,
              message: `🔥 ${roller.name} is ON FIRE (${rollResult.ignitedCharges} hot rolls)! Rolled ${finalRoll}.`,
              kind: 'bonus',
            },
          };
        }
      }

      room.gameState = nextState;
      return {
        ok: true,
        room,
        event: {
          kind: 'dice_rolled',
          rollerSeatIndex: seatIndex,
          diceValue: finalRoll,
          rollReason: rollResult.reason,
          fireJustIgnited: rollResult.fireJustIgnited,
          ignitedCharges: rollResult.ignitedCharges,
          forfeited: outcome.forfeited,
          noMoves: outcome.noMoves,
          isCrazyDoubleSix,
          nextState,
        },
      };
    }

    if (action.type === 'select_direction') {
      if (current.config.mode !== 'flip') {
        return { ok: false, code: 'INVALID_MODE', message: 'Direction toggle is Flip-Track only.' };
      }
      room.gameState = { ...current, selectedDirection: action.direction };
      return {
        ok: true,
        room,
        event: {
          kind: 'state_sync',
          nextState: room.gameState,
          sound: action.direction === 'backward' ? 'direction_bwd' : 'direction_fwd',
        },
      };
    }

    if (action.type === 'uno_select_card') {
      if (current.config.mode !== 'uno') {
        return { ok: false, code: 'INVALID_MODE', message: 'Not in UNO mode.' };
      }
      if (current.phase !== 'choosing_card' && current.phase !== 'choosing_move') {
        return { ok: false, code: 'INVALID_PHASE', message: 'Cannot play a card right now.' };
      }
      const hand = current.unoState?.hands[seatIndex] ?? [];
      const card = hand.find((c) => c.id === action.cardId);
      if (!card) {
        return { ok: false, code: 'CARD_NOT_FOUND', message: 'Card not found in your hand.' };
      }

      if (card.kind === 'number') {
        const nextState = selectUnoNumberCard(current, card.id);
        room.gameState = nextState;
        return {
          ok: true,
          room,
          event: { kind: 'state_sync', nextState, sound: 'card_snap' },
        };
      }

      const result = playUnoActionCard(current, card.id);
      if (!result || result.actionKind === 'number') {
        return { ok: false, code: 'ILLEGAL_CARD', message: 'That UNO card cannot be played now.' };
      }
      room.gameState = result.nextState;
      return {
        ok: true,
        room,
        event: {
          kind: 'uno_action_played',
          actorSeatIndex: seatIndex,
          card,
          actionKind: result.actionKind,
          prevState: current,
          nextState: result.nextState,
        },
      };
    }

    if (action.type === 'uno_cancel_card') {
      room.gameState = cancelUnoNumberCard(current);
      return { ok: true, room, event: { kind: 'state_sync', nextState: room.gameState } };
    }

    if (action.type === 'uno_accept_knockback') {
      room.gameState = acceptUnoKnockback(current);
      return {
        ok: true,
        room,
        event: { kind: 'state_sync', nextState: room.gameState, sound: 'skip' },
      };
    }

    if (action.type === 'uno_draw_card') {
      room.gameState = drawUnoCardAndPass(current);
      return {
        ok: true,
        room,
        event: { kind: 'state_sync', nextState: room.gameState, sound: 'card_snap' },
      };
    }

    if (action.type === 'select_move') {
      const isUnoKnockback =
        current.config.mode === 'uno' && current.phase === 'choosing_knockback_target';

      if (current.phase !== 'choosing_move' && !isUnoKnockback) {
        return { ok: false, code: 'INVALID_PHASE', message: 'No move can be selected now.' };
      }

      let validMove: MoveOption | undefined;
      if (isUnoKnockback && current.unoState?.pendingKnockback) {
        const kb = current.unoState.pendingKnockback;
        validMove = getUnoKnockbackMoves(current, kb.victimPlayerId, kb.totalSteps).find(
          (m) => m.tokenId === action.tokenId
        );
      } else if (current.diceValue !== null) {
        const all = getAllLegalMoves(current, current.activePlayerIndex, current.diceValue);
        const pool = action.direction === 'backward' ? all.backward : all.forward;
        validMove =
          pool.find((m) => m.tokenId === action.tokenId) ??
          [...all.forward, ...all.backward].find((m) => m.tokenId === action.tokenId);
      }

      if (!validMove) {
        return { ok: false, code: 'ILLEGAL_MOVE', message: 'Selected move is not legal.' };
      }

      if (isUnoKnockback) {
        const nextState = commitUnoKnockbackMove(current, validMove);
        room.gameState = nextState;
        return {
          ok: true,
          room,
          event: {
            kind: 'move_committed',
            actorSeatIndex: seatIndex,
            move: validMove,
            isUnoKnockback: true,
            playedCard: null,
            prevState: current,
            nextState,
            matchEnded: false,
            starChaosLabel: null,
          },
        };
      }

      let playedCard: UnoCard | null = null;
      if (current.config.mode === 'uno' && current.unoState?.selectedCardId) {
        playedCard =
          (current.unoState.hands[current.activePlayerIndex] ?? []).find(
            (c) => c.id === current.unoState?.selectedCardId
          ) ?? null;
      }

      const result =
        current.config.mode === 'uno'
          ? commitUnoNumberMove(current, validMove)
          : commitMove(current, validMove);

      let finalNextState = result.nextState;
      let starChaosLabel: string | null = null;

      if (
        current.config.mode === 'crazy' &&
        !result.matchEnded &&
        validMove.targetZone === 'track'
      ) {
        const geometry = buildBoardGeometry(current.config.playerCount);
        if (geometry.trackCells[validMove.targetRingIndex]?.isSafeStar) {
          const chaos = resolveCrazyStarChaos(
            finalNextState,
            current.activePlayerIndex,
            validMove.tokenId,
            this.rng
          );
          if (chaos) {
            finalNextState = chaos.nextState;
            starChaosLabel = chaos.label;
          }
        }
      }

      room.gameState = finalNextState;
      return {
        ok: true,
        room,
        event: {
          kind: 'move_committed',
          actorSeatIndex: seatIndex,
          move: validMove,
          isUnoKnockback: false,
          playedCard,
          prevState: current,
          nextState: finalNextState,
          matchEnded: result.matchEnded,
          starChaosLabel,
        },
      };
    }

    return { ok: false, code: 'UNKNOWN_ACTION', message: 'Unsupported action.' };
  }

  pruneIdleRooms(now: number = Date.now()): number {
    let removed = 0;
    for (const [code, room] of this.rooms.entries()) {
      const anyConnected = room.seats.some((s) => s.connected);
      if (!anyConnected && now - room.lastActivityAt > ROOM_IDLE_TTL_MS) {
        for (const seat of room.seats) {
          if (this.clientToRoom.get(seat.clientId) === code) {
            this.clientToRoom.delete(seat.clientId);
          }
        }
        this.rooms.delete(code);
        removed += 1;
      }
    }
    return removed;
  }
}
