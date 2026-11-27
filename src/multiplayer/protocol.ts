import type {
  GameMode,
  GameState,
  MoveDirection,
  MoveOption,
  ThemeId,
  UnoCard,
} from '../game/types';

export type PlayCategory = 'multiplayer' | 'computer' | 'local';

export interface OnlineSeat {
  seatIndex: number;
  clientId: string;
  name: string;
  connected: boolean;
  isHost: boolean;
  paletteIndex: number;
}

export interface OnlineRoomSnapshot {
  roomCode: string;
  hostClientId: string;
  status: 'lobby' | 'playing';
  mode: GameMode;
  playerCount: number;
  tokensPerPlayer: 2 | 4;
  themeId: ThemeId;
  fillWithBots: boolean;
  seats: OnlineSeat[];
  createdAt: number;
}

export type GameActionPayload =
  | { type: 'roll_dice' }
  | { type: 'select_direction'; direction: MoveDirection }
  | { type: 'select_move'; tokenId: string; direction: MoveDirection }
  | { type: 'uno_select_card'; cardId: string }
  | { type: 'uno_cancel_card' }
  | { type: 'uno_accept_knockback' }
  | { type: 'uno_draw_card' }
  | { type: 'continue_ranks' }
  | { type: 'restart_match' };

export type ClientToServerMessage =
  | {
      type: 'room:create';
      clientId: string;
      playerName: string;
      mode: GameMode;
      playerCount: number;
      tokensPerPlayer: 2 | 4;
      themeId: ThemeId;
      fillWithBots?: boolean;
    }
  | {
      type: 'room:join';
      clientId: string;
      roomCode: string;
      playerName: string;
    }
  | {
      type: 'room:leave';
      clientId: string;
    }
  | {
      type: 'room:update_settings';
      clientId: string;
      mode?: GameMode;
      playerCount?: number;
      tokensPerPlayer?: 2 | 4;
      fillWithBots?: boolean;
    }
  | {
      type: 'room:start';
      clientId: string;
    }
  | {
      type: 'game:action';
      clientId: string;
      action: GameActionPayload;
    }
  | {
      type: 'ping';
    };

export type OnlineGameEvent =
  | {
      kind: 'dice_rolled';
      rollerSeatIndex: number;
      diceValue: number;
      rollReason: string;
      fireJustIgnited: boolean;
      ignitedCharges: number;
      forfeited: boolean;
      noMoves: boolean;
      isCrazyDoubleSix: boolean;
      nextState: GameState;
    }
  | {
      kind: 'move_committed';
      actorSeatIndex: number;
      move: MoveOption;
      isUnoKnockback: boolean;
      playedCard: UnoCard | null;
      prevState: GameState;
      nextState: GameState;
      matchEnded: boolean;
      starChaosLabel: string | null;
    }
  | {
      kind: 'uno_action_played';
      actorSeatIndex: number;
      card: UnoCard;
      actionKind: 'reverse' | 'skip' | 'minus2' | 'minus4' | 'swap';
      prevState: GameState;
      nextState: GameState;
    }
  | {
      kind: 'state_sync';
      nextState: GameState;
      sound?: 'card_snap' | 'direction_fwd' | 'direction_bwd' | 'skip';
    };

export type ServerToClientMessage =
  | {
      type: 'room:joined';
      room: OnlineRoomSnapshot;
      mySeatIndex: number;
      gameState: GameState | null;
    }
  | {
      type: 'room:update';
      room: OnlineRoomSnapshot;
    }
  | {
      type: 'room:started';
      room: OnlineRoomSnapshot;
      gameState: GameState;
    }
  | {
      type: 'game:event';
      event: OnlineGameEvent;
    }
  | {
      type: 'room:error';
      code: string;
      message: string;
    }
  | {
      type: 'pong';
    };
