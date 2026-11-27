export type GameMode = 'classic' | 'flip' | 'crazy' | 'uno';

export type MoveDirection = 'forward' | 'backward';

export type AppScreen = 'home' | 'setup' | 'lobby' | 'playing' | 'paused' | 'gameover';

export type TurnPhase =
  | 'awaiting_roll'
  | 'rolling'
  | 'choosing_move'
  | 'choosing_card'
  | 'choosing_knockback_target'
  | 'animating'
  | 'finished';

export type ThemeId = 'arcade' | 'walnut' | 'emerald' | 'porcelain' | 'obsidian';

export type EmblemKind =
  | 'crown'
  | 'shield'
  | 'leaf'
  | 'sun'
  | 'diamond'
  | 'wave'
  | 'star'
  | 'flame'
  | 'moon'
  | 'clover';

export interface PlayerPalette {
  id: number;
  name: string;
  color: string;
  yardColor?: string;
  light: string;
  dark: string;
  contrastText: string;
  emblem: EmblemKind;
}

export interface PlayerConfig {
  id: number;
  name: string;
  isBot: boolean;
  paletteIndex: number;
}

export interface TokenState {
  id: string;
  playerId: number;
  slotIndex: number; // 0..tokensPerPlayer-1
  zone: 'yard' | 'track' | 'home_stretch' | 'finished';
  ringIndex: number; // 0..ringLength-1 when zone === 'track'
  /**
   * Signed distance traveled from the player's start square while on the main track.
   * Positive = net clockwise progress; negative = net counter-clockwise progress.
   * Prevents 2-step backward home-entry exploits while rewarding full reverse laps.
   */
  lapProgress: number;
  homeIndex: number; // 0..homeLength-1 when zone === 'home_stretch'
}

export interface PlayerState {
  id: number;
  name: string;
  isBot: boolean;
  armIndex: number;
  paletteIndex: number;
  tokens: TokenState[];
  finishedRank: number | null; // 1 = 1st place, etc.
  captures: number;
  backwardMoves: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface BoardCell {
  index: number;
  armIndex: number;
  center: Point2D;
  corners: Point2D[];
  angleRad: number;
  isStart: boolean;
  startArmIndex: number | null;
  isSafeStar: boolean;
  isHomeEntry: boolean;
  homeEntryArmIndex: number | null;
}

export interface HomeStretchCell {
  armIndex: number;
  stepIndex: number; // 0..homeLength-1
  center: Point2D;
  corners: Point2D[];
  angleRad: number;
}

export interface HomeYardGeometry {
  armIndex: number;
  center: Point2D;
  polygon: Point2D[];
  slots: Point2D[]; // 4 socket positions
  labelPos: Point2D;
  angleRad: number;
}

export interface FinishWedgeGeometry {
  armIndex: number;
  polygon: Point2D[];
  center: Point2D;
  slots: Point2D[];
}

export interface BoardGeometry {
  armCount: number;
  stepsPerArm: number;
  cellsPerArm: number;
  ringLength: number;
  homeLength: number;
  cellSize: number;
  innerRadius: number;
  outerRadius: number;
  trackCells: BoardCell[];
  homeStretchCells: HomeStretchCell[][]; // [armIndex][stepIndex]
  yards: HomeYardGeometry[];
  finishWedges: FinishWedgeGeometry[];
  centerPolygon: Point2D[];
  startIndices: number[]; // track ring index where each arm starts
  homeEntryIndices: number[]; // track ring index where each arm enters home stretch
  safeIndices: Set<number>;
}

export interface PathWaypoint {
  zone: 'yard' | 'track' | 'home_stretch' | 'finished';
  ringIndex?: number;
  homeIndex?: number;
  armIndex: number;
  slotIndex: number;
  point: Point2D;
}

export interface MoveOption {
  tokenId: string;
  direction: MoveDirection;
  kind: 'deploy' | 'track' | 'enter_home' | 'home_move' | 'finish';
  targetZone: TokenState['zone'];
  targetRingIndex: number;
  targetLapProgress: number;
  targetHomeIndex: number;
  capturesTokenIds: string[];
  landsOnSafe: boolean;
  waypoints: PathWaypoint[];
}

export interface GameConfig {
  playerCount: number;
  mode: GameMode;
  tokensPerPlayer: 2 | 4;
  themeId: ThemeId;
  players: PlayerConfig[];
}

export interface TurnEventLog {
  id: number;
  message: string;
  playerId: number;
  kind: 'info' | 'capture' | 'finish' | 'bonus' | 'reverse' | 'forfeit';
}

export interface DiceDirectorState {
  /** Per-player consecutive rolls taken while all remaining pieces are stuck in Home Yard */
  yardStuckRolls: Record<number, number>;
  /** Tracks whether each player has previously left Home Yard at least once (enables 8-roll +50% Comeback Mercy 6 if captured back to empty board) */
  hasDeployedBefore?: Record<number, boolean>;
  /** Currently On-Fire playerId (at most one player at a time, or null in normal random mode) */
  firePlayerId: number | null;
  /** Remaining On-Fire rolls for firePlayerId (1..6 max; 0 when inactive) */
  fireRemaining: number;
  /** Normal-mode cooldown turns before another player can catch fire */
  fireCooldownTurns: number;
}

export type UnoCardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';

export type UnoCardKind = 'number' | 'reverse' | 'skip' | 'minus2' | 'minus4' | 'swap';

export interface UnoCard {
  id: string;
  kind: UnoCardKind;
  value?: number; // 1..6 when kind === 'number'
  color: UnoCardColor;
}

export interface UnoPendingKnockback {
  totalSteps: number;
  lastCardKind: 'minus2' | 'minus4';
  stackCount: number;
  /** Preceding player who threw the last -2/-4 card and gets to choose which victim pawn moves back */
  chooserPlayerId: number;
  /** Next player in turn order currently defending or taking the accumulated penalty */
  victimPlayerId: number;
}

export interface UnoState {
  hands: Record<number, UnoCard[]>;
  discardTop: UnoCard | null;
  selectedCardId: string | null;
  pendingKnockback: UnoPendingKnockback | null;
  nextCardSeq: number;
}

export interface GameState {
  config: GameConfig;
  players: PlayerState[];
  activePlayerIndex: number;
  phase: TurnPhase;
  diceValue: number | null;
  selectedDirection: MoveDirection;
  consecutiveSixes: number;
  turnNumber: number;
  finishedOrder: number[]; // playerIds in rank order
  lastEvent: TurnEventLog | null;
  continueAfterFirstWin: boolean;
  totalCaptures: number;
  totalBackwardMoves: number;
  /** Maps track ringIndex -> playerIds who stacked 2+ pieces there and still have >= 1 piece on that square */
  dynamicSafeRings?: Record<number, number[]>;
  /** Smart dice director state (10-roll yard mercy, capture boost, single-player On-Fire streak) */
  diceDirector?: DiceDirectorState;
  /** Turn order direction: 1 = clockwise (default), -1 = counter-clockwise (UNO Reverse) */
  turnDirection?: 1 | -1;
  /** Crazy Mode: players who just got captured earn a guaranteed Revenge 6 on their next roll */
  crazyRevengeCharges?: Record<number, boolean>;
  /** UNO Ludo Mode: 6-card hands, discard pile, and active -2/-4 knockback stack */
  unoState?: UnoState;
}

export interface BoardTheme {
  id: ThemeId;
  name: string;
  subtitle: string;
  isDark: boolean;
  pageBg: string;
  panelBg: string;
  panelBorder: string;
  panelMutedBg: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  accentText: string;
  boardFrameBg: string;
  boardFrameStroke: string;
  boardOuterGlow: string;
  tileBg: string;
  tileAltBg: string;
  tileStroke: string;
  safeStarFill: string;
  safeStarStroke: string;
  yardBg: string;
  yardStroke: string;
  centerBg: string;
  centerStroke: string;
  dieBg: string;
  diePip: string;
  dieStroke: string;
  previewRing: string;
  captureRing: string;
  swatches: [string, string, string];
}
