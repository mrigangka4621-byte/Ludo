import {
  buildBoardGeometry,
  CLASSIC_ARM_PALETTE_INDICES,
  getPlayerArmAssignments,
  getTokenPoint,
} from './boardGeometry';
import { PLAYER_PALETTES } from './themes';
import { createInitialUnoState } from './unoEngine';
import type {
  BoardGeometry,
  DiceDirectorState,
  GameConfig,
  GameState,
  MoveDirection,
  MoveOption,
  PathWaypoint,
  PlayerConfig,
  PlayerState,
  TokenState,
} from './types';

export const YARD_MERCY_CHANCES = 10;
export const COMEBACK_YARD_MERCY_CHANCES = 8;
/** Standard 6 chance is 1/6 (~16.67%); +50% comeback boost = 1.5 * (1/6) = 0.25 (25%) */
export const COMEBACK_SIX_PROBABILITY = 0.25;
export const CRAZY_YARD_MERCY_CHANCES = 4;
export const CRAZY_MAX_CONSECUTIVE_SIXES = 2;
export const MAX_FIRE_STREAK_ROLLS = 6;

export function createInitialDiceDirector(): DiceDirectorState {
  return {
    yardStuckRolls: {},
    hasDeployedBefore: {},
    firePlayerId: null,
    fireRemaining: 0,
    fireCooldownTurns: 4,
  };
}

export function getDefaultPaletteForSeat(playerCount: number, seatIndex: number): number {
  const clamped = Math.max(2, Math.min(10, Math.round(playerCount)));
  if (clamped <= 4) {
    const arms = getPlayerArmAssignments(clamped);
    const arm = arms[seatIndex] ?? seatIndex;
    return CLASSIC_ARM_PALETTE_INDICES[arm] ?? seatIndex % PLAYER_PALETTES.length;
  }
  return seatIndex % PLAYER_PALETTES.length;
}

export function createDefaultPlayers(count: number, existing?: PlayerConfig[]): PlayerConfig[] {
  const clamped = Math.max(2, Math.min(10, Math.round(count)));
  return Array.from({ length: clamped }, (_, i) => {
    const prev = existing?.[i];
    const paletteIndex = getDefaultPaletteForSeat(clamped, i);
    if (prev) {
      return { ...prev, id: i, paletteIndex };
    }
    return {
      id: i,
      name: `Player ${i + 1}`,
      isBot: false,
      paletteIndex,
    };
  });
}

export function createDefaultConfig(): GameConfig {
  return {
    playerCount: 4,
    mode: 'flip',
    tokensPerPlayer: 4,
    themeId: 'arcade',
    players: createDefaultPlayers(4),
  };
}

export function createInitialGameState(
  config: GameConfig,
  rng: () => number = Math.random
): GameState {
  const armAssignments = getPlayerArmAssignments(config.playerCount);
  const geometry = buildBoardGeometry(config.playerCount);
  const isUno = config.mode === 'uno';

  const players: PlayerState[] = config.players.slice(0, config.playerCount).map((pCfg, idx) => {
    const armIndex = armAssignments[idx];
    const startIdx = geometry.startIndices[armIndex];
    const tokens: TokenState[] = Array.from({ length: config.tokensPerPlayer }, (_, slotIndex) => ({
      id: `p${idx}-t${slotIndex}`,
      playerId: idx,
      slotIndex,
      // In UNO Ludo mode, all pawns begin already deployed on their colored Start Square
      // while the Home Yard displays each player's UNO cards!
      zone: isUno ? 'track' : 'yard',
      ringIndex: isUno ? startIdx : -1,
      lapProgress: 0,
      homeIndex: -1,
    }));

    return {
      id: idx,
      name: pCfg.name.trim() || `Player ${idx + 1}`,
      isBot: pCfg.isBot,
      armIndex,
      paletteIndex: pCfg.paletteIndex % PLAYER_PALETTES.length,
      tokens,
      finishedRank: null,
      captures: 0,
      backwardMoves: 0,
    };
  });

  return {
    config: { ...config, players: config.players.slice(0, config.playerCount) },
    players,
    activePlayerIndex: 0,
    phase: isUno ? 'choosing_card' : 'awaiting_roll',
    diceValue: null,
    selectedDirection: 'forward',
    consecutiveSixes: 0,
    turnNumber: 1,
    finishedOrder: [],
    lastEvent: {
      id: 1,
      message: isUno
        ? `🃏 ${players[0].name}'s turn — play a UNO card from your 6-card hand!`
        : config.mode === 'crazy'
          ? `⚡ CRAZY MODE! ${players[0].name} rolls first — watch out for snipes & chaos stars!`
          : `${players[0].name} rolls first.`,
      playerId: 0,
      kind: 'info',
    },
    continueAfterFirstWin: false,
    totalCaptures: 0,
    totalBackwardMoves: 0,
    dynamicSafeRings: {},
    diceDirector: createInitialDiceDirector(),
    turnDirection: 1,
    crazyRevengeCharges: {},
    unoState: isUno ? createInitialUnoState(players.length, rng) : undefined,
  };
}

/**
 * Find the next player index who has not finished all tokens yet, respecting turnDirection (1 = CW, -1 = CCW).
 */
export function getNextActivePlayerIndex(state: GameState, fromIndex: number): number {
  const total = state.players.length;
  const dir = state.turnDirection === -1 ? -1 : 1;
  for (let offset = 1; offset <= total; offset++) {
    const candidate = (fromIndex + offset * dir + total * 4) % total;
    if (state.players[candidate].finishedRank === null) {
      return candidate;
    }
  }
  return fromIndex;
}

/**
 * Count total track tokens (across all players) currently occupying a given ring square.
 */
function countTotalTokensOnRing(players: PlayerState[], ringIndex: number): number {
  let total = 0;
  for (const player of players) {
    for (const token of player.tokens) {
      if (token.zone === 'track' && token.ringIndex === ringIndex) {
        total += 1;
      }
    }
  }
  return total;
}

/**
 * Determine whether a main-track ring square is currently a safe point:
 * 1. Built-in safe tiles (colored Start squares & Star tiles).
 * 2. Any non-built-in track square currently occupied by 2 or more tokens:
 *    - When a player stacks 2+ of their own pieces on a square, it becomes a Safe Point.
 *    - If another player lands there, no capture occurs and both coexist safely.
 *    - If one of Player 1's pieces leaves while another piece (either Player 1's 2nd piece
 *      OR another player's piece) remains on that square (total >= 2), it stays a Safe Point.
 *    - As soon as only 1 piece remains alone on that square (no other piece sharing it),
 *      it IMMEDIATELY reverts to a normal square!
 */
export function isRingSquareSafe(
  state: GameState,
  geometry: BoardGeometry,
  ringIndex: number
): boolean {
  if (geometry.safeIndices.has(ringIndex)) {
    return true;
  }
  return countTotalTokensOnRing(state.players, ringIndex) >= 2;
}

/**
 * Recompute active dynamic safe squares after a move:
 * A non-built-in track square is dynamically safe if and only if >= 2 tokens share it.
 */
function computeNextDynamicSafeRings(
  _prevDynamicSafeRings: Record<number, number[]> | undefined,
  players: PlayerState[],
  geometry: BoardGeometry
): Record<number, number[]> {
  const ownersByRing = new Map<number, Set<number>>();
  const countByRing = new Map<number, number>();

  for (const player of players) {
    for (const token of player.tokens) {
      if (token.zone !== 'track') continue;
      if (geometry.safeIndices.has(token.ringIndex)) continue;
      countByRing.set(token.ringIndex, (countByRing.get(token.ringIndex) ?? 0) + 1);
      const set = ownersByRing.get(token.ringIndex) ?? new Set<number>();
      set.add(player.id);
      ownersByRing.set(token.ringIndex, set);
    }
  }

  const next: Record<number, number[]> = {};
  for (const [ringIndex, count] of countByRing.entries()) {
    if (count >= 2) {
      next[ringIndex] = Array.from(ownersByRing.get(ringIndex) ?? []);
    }
  }
  return next;
}

/**
 * Helper to find opponent tokens occupying a given non-safe ring square.
 * Safe squares (built-in Start/Star tiles AND dynamic stacked-piece safe points)
 * protect all occupying pieces from capture in both forward and backward directions.
 */
function findCapturableTokens(
  state: GameState,
  geometry: BoardGeometry,
  movingPlayerId: number,
  targetRingIndex: number
): string[] {
  if (isRingSquareSafe(state, geometry, targetRingIndex)) {
    return [];
  }
  const captured: string[] = [];
  for (const player of state.players) {
    if (player.id === movingPlayerId) continue;
    for (const token of player.tokens) {
      if (token.zone === 'track' && token.ringIndex === targetRingIndex) {
        captured.push(token.id);
      }
    }
  }
  return captured;
}

/**
 * Compute all legal MoveOptions for a given player, dice roll, and direction.
 *
 * Rules:
 * - Deploying from Yard requires rolling a 6 (places token on player's start square with lapProgress = 0).
 * - Classic Mode only allows direction = 'forward'.
 * - Flip-Track Mode allows choosing 'forward' (clockwise) or 'backward' (counter-clockwise) each turn:
 *   - On the main track, forward increments ringIndex & lapProgress (+1 per step);
 *     backward decrements ringIndex & lapProgress (-1 per step).
 *   - Home Entry threshold (forward): lapProgress reaches `ringLength - 2` (the arm's Tip cell after a full clockwise lap).
 *   - Home Entry threshold (backward): lapProgress reaches `-(ringLength + 2)` (the arm's Tip cell after a full counter-clockwise lap).
 *     This prevents 2-step backward home-entry exploits while rewarding full reverse laps and tactical backward captures/retreats!
 *   - Inside Home Stretch:
 *     - Forward moves toward Center Finish (must land exact on homeLength to finish).
 *     - Backward (in Flip-Track mode) can step back along Home Stretch (down to homeIndex = 0), letting a player stay active or dodge an exact-roll stall without exiting onto the main ring.
 */
export function getLegalMovesForDirection(
  state: GameState,
  playerIndex: number,
  diceValue: number,
  direction: MoveDirection
): MoveOption[] {
  if (state.config.mode !== 'flip' && direction === 'backward') {
    return [];
  }

  const player = state.players[playerIndex];
  if (!player || player.finishedRank !== null) return [];

  const geometry = buildBoardGeometry(state.config.playerCount);
  const { ringLength, homeLength } = geometry;
  const startIdx = geometry.startIndices[player.armIndex];
  const forwardHomeThreshold = ringLength - 2;
  const backwardHomeThreshold = -(ringLength + 2);

  const options: MoveOption[] = [];

  for (const token of player.tokens) {
    if (token.zone === 'finished') continue;

    // 1. Yard deployment (on rolling 6)
    if (token.zone === 'yard') {
      if (diceValue === 6) {
        const startPt = getTokenPoint(geometry, player.armIndex, token.slotIndex, 'track', startIdx, -1);
        options.push({
          tokenId: token.id,
          direction,
          kind: 'deploy',
          targetZone: 'track',
          targetRingIndex: startIdx,
          targetLapProgress: 0,
          targetHomeIndex: -1,
          capturesTokenIds: [], // Start squares are always safe squares
          landsOnSafe: true,
          waypoints: [
            {
              zone: 'track',
              ringIndex: startIdx,
              armIndex: player.armIndex,
              slotIndex: token.slotIndex,
              point: startPt,
            },
          ],
        });
      }
      continue;
    }

    // 2. Main track movement
    if (token.zone === 'track') {
      const waypoints: PathWaypoint[] = [];
      let curZone: TokenState['zone'] = 'track';
      let curRing = token.ringIndex;
      let curProgress = token.lapProgress;
      let curHome = -1;
      let valid = true;

      for (let step = 1; step <= diceValue; step++) {
        if (curZone === 'track') {
          if (direction === 'forward') {
            if (curProgress === forwardHomeThreshold) {
              // Step into Home Stretch cell 0!
              curZone = 'home_stretch';
              curHome = 0;
              waypoints.push({
                zone: 'home_stretch',
                homeIndex: 0,
                armIndex: player.armIndex,
                slotIndex: token.slotIndex,
                point: getTokenPoint(geometry, player.armIndex, token.slotIndex, 'home_stretch', -1, 0),
              });
            } else {
              curRing = (curRing + 1) % ringLength;
              curProgress += 1;
              waypoints.push({
                zone: 'track',
                ringIndex: curRing,
                armIndex: player.armIndex,
                slotIndex: token.slotIndex,
                point: getTokenPoint(geometry, player.armIndex, token.slotIndex, 'track', curRing, -1),
              });
            }
          } else {
            // Backward movement on track
            if (curProgress === backwardHomeThreshold) {
              // Completed a full counter-clockwise lap and reached home entry!
              curZone = 'home_stretch';
              curHome = 0;
              waypoints.push({
                zone: 'home_stretch',
                homeIndex: 0,
                armIndex: player.armIndex,
                slotIndex: token.slotIndex,
                point: getTokenPoint(geometry, player.armIndex, token.slotIndex, 'home_stretch', -1, 0),
              });
            } else {
              curRing = (curRing - 1 + ringLength) % ringLength;
              curProgress -= 1;
              waypoints.push({
                zone: 'track',
                ringIndex: curRing,
                armIndex: player.armIndex,
                slotIndex: token.slotIndex,
                point: getTokenPoint(geometry, player.armIndex, token.slotIndex, 'track', curRing, -1),
              });
            }
          }
        } else if (curZone === 'home_stretch') {
          // Once entering home stretch during this move, continue inward toward center finish
          if (curHome + 1 < homeLength) {
            curHome += 1;
            waypoints.push({
              zone: 'home_stretch',
              homeIndex: curHome,
              armIndex: player.armIndex,
              slotIndex: token.slotIndex,
              point: getTokenPoint(geometry, player.armIndex, token.slotIndex, 'home_stretch', -1, curHome),
            });
          } else if (curHome + 1 === homeLength) {
            curZone = 'finished';
            curHome = homeLength;
            waypoints.push({
              zone: 'finished',
              armIndex: player.armIndex,
              slotIndex: token.slotIndex,
              point: getTokenPoint(geometry, player.armIndex, token.slotIndex, 'finished', -1, homeLength),
            });
          } else {
            // Overshot center finish
            valid = false;
            break;
          }
        } else {
          // Overshot finished
          valid = false;
          break;
        }
      }

      if (!valid) continue;

      const capturesTokenIds =
        curZone === 'track' ? findCapturableTokens(state, geometry, player.id, curRing) : [];

      const kind: MoveOption['kind'] =
        curZone === 'finished'
          ? 'finish'
          : curZone === 'home_stretch'
            ? 'enter_home'
            : 'track';

      const createsSafeStack =
        curZone === 'track' &&
        player.tokens.some(
          (other) => other.id !== token.id && other.zone === 'track' && other.ringIndex === curRing
        );

      options.push({
        tokenId: token.id,
        direction,
        kind,
        targetZone: curZone,
        targetRingIndex: curZone === 'track' ? curRing : -1,
        targetLapProgress: curProgress,
        targetHomeIndex: curZone === 'home_stretch' ? curHome : curZone === 'finished' ? homeLength : -1,
        capturesTokenIds,
        landsOnSafe:
          curZone !== 'track' ||
          isRingSquareSafe(state, geometry, curRing) ||
          createsSafeStack,
        waypoints,
      });
      continue;
    }

    // 3. Home Stretch movement
    if (token.zone === 'home_stretch') {
      const waypoints: PathWaypoint[] = [];
      if (direction === 'forward') {
        const target = token.homeIndex + diceValue;
        if (target > homeLength) continue; // Exact roll required to finish

        for (let step = 1; step <= diceValue; step++) {
          const nextIdx = token.homeIndex + step;
          if (nextIdx < homeLength) {
            waypoints.push({
              zone: 'home_stretch',
              homeIndex: nextIdx,
              armIndex: player.armIndex,
              slotIndex: token.slotIndex,
              point: getTokenPoint(geometry, player.armIndex, token.slotIndex, 'home_stretch', -1, nextIdx),
            });
          } else {
            waypoints.push({
              zone: 'finished',
              armIndex: player.armIndex,
              slotIndex: token.slotIndex,
              point: getTokenPoint(geometry, player.armIndex, token.slotIndex, 'finished', -1, homeLength),
            });
          }
        }

        const isFinish = target === homeLength;
        options.push({
          tokenId: token.id,
          direction,
          kind: isFinish ? 'finish' : 'home_move',
          targetZone: isFinish ? 'finished' : 'home_stretch',
          targetRingIndex: -1,
          targetLapProgress: token.lapProgress,
          targetHomeIndex: target,
          capturesTokenIds: [],
          landsOnSafe: true,
          waypoints,
        });
      } else {
        // Flip-Track: retreat backward within home stretch (staying safe inside home lane)
        const target = token.homeIndex - diceValue;
        if (target < 0) continue;

        for (let step = 1; step <= diceValue; step++) {
          const nextIdx = token.homeIndex - step;
          waypoints.push({
            zone: 'home_stretch',
            homeIndex: nextIdx,
            armIndex: player.armIndex,
            slotIndex: token.slotIndex,
            point: getTokenPoint(geometry, player.armIndex, token.slotIndex, 'home_stretch', -1, nextIdx),
          });
        }

        options.push({
          tokenId: token.id,
          direction,
          kind: 'home_move',
          targetZone: 'home_stretch',
          targetRingIndex: -1,
          targetLapProgress: token.lapProgress,
          targetHomeIndex: target,
          capturesTokenIds: [],
          landsOnSafe: true,
          waypoints,
        });
      }
    }
  }

  return options;
}

export function getAllLegalMoves(
  state: GameState,
  playerIndex: number,
  diceValue: number
): { forward: MoveOption[]; backward: MoveOption[] } {
  const forward = getLegalMovesForDirection(state, playerIndex, diceValue, 'forward');
  const backward =
    state.config.mode === 'flip'
      ? getLegalMovesForDirection(state, playerIndex, diceValue, 'backward')
      : [];
  return { forward, backward };
}

/**
 * Determine if the active player has NO meaningful choice between distinct pieces
 * (e.g., only 1 legal move, OR all legal moves start from the exact same square/yard
 * and land at the exact same destination with identical progress).
 * When true, returns the forced MoveOption so the piece moves automatically!
 */
export function getAutoMoveIfForced(state: GameState): MoveOption | null {
  if (state.phase !== 'choosing_move' || state.diceValue === null) {
    return null;
  }
  const player = state.players[state.activePlayerIndex];
  if (!player || player.finishedRank !== null) {
    return null;
  }

  const { forward, backward } = getAllLegalMoves(
    state,
    state.activePlayerIndex,
    state.diceValue
  );

  // In Flip-Track (forward/backward) mode, never auto-move pieces on the board so the player
  // can freely pick Forward or Backward. ONLY auto-deploy when all playable pieces are in the
  // Home Yard (since no piece can go backward from its Home Yard starting position).
  if (state.config.mode === 'flip') {
    const allMoves = [...forward, ...backward];
    if (allMoves.length > 0 && allMoves.every((m) => m.kind === 'deploy')) {
      return forward[0] ?? allMoves[0];
    }
    return null;
  }

  // In Classic mode, auto-move when only 1 legal move exists OR all movable pieces share the
  // exact same starting square/zone and produce the exact same destination.
  const moves = forward;
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  const tokenById = new Map(player.tokens.map((t) => [t.id, t]));
  const firstMove = moves[0];
  const firstTok = tokenById.get(firstMove.tokenId);
  if (!firstTok) return null;

  const allEquivalent = moves.every((m) => {
    const tok = tokenById.get(m.tokenId);
    if (!tok) return false;
    return (
      tok.zone === firstTok.zone &&
      tok.ringIndex === firstTok.ringIndex &&
      tok.homeIndex === firstTok.homeIndex &&
      m.kind === firstMove.kind &&
      m.targetZone === firstMove.targetZone &&
      m.targetRingIndex === firstMove.targetRingIndex &&
      m.targetHomeIndex === firstMove.targetHomeIndex &&
      m.targetLapProgress === firstMove.targetLapProgress
    );
  });

  return allEquivalent ? firstMove : null;
}

/**
 * Apply a dice roll to the game state.
 * Handles the triple-6 forfeit rule and auto-pass when zero legal moves exist in any allowed direction.
 */
export function applyDiceRoll(state: GameState, rolledValue: number): {
  nextState: GameState;
  forfeited: boolean;
  noMoves: boolean;
  legalForwardCount: number;
  legalBackwardCount: number;
} {
  const activePlayer = state.players[state.activePlayerIndex];
  const eventId = (state.lastEvent?.id ?? 0) + 1;
  const nextSixes = rolledValue === 6 ? state.consecutiveSixes + 1 : 0;
  const isCrazy = state.config.mode === 'crazy';

  // Classic/Flip triple-6 forfeit rule; Crazy Mode enforces strict Double Six (max 2×6 per turn)
  if (nextSixes >= 3) {
    const nextIdx = getNextActivePlayerIndex(state, state.activePlayerIndex);
    return {
      forfeited: true,
      noMoves: false,
      legalForwardCount: 0,
      legalBackwardCount: 0,
      nextState: {
        ...state,
        diceValue: rolledValue,
        consecutiveSixes: 0,
        activePlayerIndex: nextIdx,
        phase: 'awaiting_roll',
        turnNumber: state.turnNumber + 1,
        selectedDirection: 'forward',
        lastEvent: {
          id: eventId,
          message: isCrazy
            ? `⚡ Double Six cap (${CRAZY_MAX_CONSECUTIVE_SIXES}×6) — ${activePlayer.name} cannot roll a 3rd six! ${state.players[nextIdx].name}'s turn.`
            : `${activePlayer.name} rolled three 6s in a row — turn passes to ${state.players[nextIdx].name}.`,
          playerId: activePlayer.id,
          kind: 'forfeit',
        },
      },
    };
  }

  const tempState: GameState = {
    ...state,
    diceValue: rolledValue,
    consecutiveSixes: nextSixes,
  };

  const { forward, backward } = getAllLegalMoves(tempState, state.activePlayerIndex, rolledValue);

  if (forward.length === 0 && backward.length === 0) {
    const nextIdx = getNextActivePlayerIndex(state, state.activePlayerIndex);
    return {
      forfeited: false,
      noMoves: true,
      legalForwardCount: 0,
      legalBackwardCount: 0,
      nextState: {
        ...tempState,
        consecutiveSixes: 0,
        activePlayerIndex: nextIdx,
        phase: 'awaiting_roll',
        turnNumber: state.turnNumber + 1,
        selectedDirection: 'forward',
        lastEvent: {
          id: eventId,
          message: `${activePlayer.name} rolled ${rolledValue} with no legal moves. ${state.players[nextIdx].name}'s turn.`,
          playerId: activePlayer.id,
          kind: 'info',
        },
      },
    };
  }

  // Keep player's chosen direction if it has legal moves; otherwise gently switch to the direction that does
  let nextDirection = state.selectedDirection;
  if (state.config.mode !== 'flip') {
    nextDirection = 'forward';
  } else if (nextDirection === 'forward' && forward.length === 0 && backward.length > 0) {
    nextDirection = 'backward';
  } else if (nextDirection === 'backward' && backward.length === 0 && forward.length > 0) {
    nextDirection = 'forward';
  }

  return {
    forfeited: false,
    noMoves: false,
    legalForwardCount: forward.length,
    legalBackwardCount: backward.length,
    nextState: {
      ...tempState,
      phase: 'choosing_move',
      selectedDirection: nextDirection,
      lastEvent: {
        id: eventId,
        message:
          state.config.mode === 'flip'
            ? `${activePlayer.name} rolled ${rolledValue} — choose Forward or Backward and pick a token.`
            : `${activePlayer.name} rolled ${rolledValue} — pick a highlighted token.`,
        playerId: activePlayer.id,
        kind: 'info',
      },
    },
  };
}

/**
 * Commit a chosen MoveOption to the game state (called after hop animation finishes or directly in tests).
 */
export function commitMove(state: GameState, move: MoveOption): {
  nextState: GameState;
  capturedNames: string[];
  bonusTurn: boolean;
  playerJustFinished: boolean;
  matchEnded: boolean;
} {
  const activeIdx = state.activePlayerIndex;
  const activePlayer = state.players[activeIdx];
  const eventId = (state.lastEvent?.id ?? 0) + 1;
  const capturedIdSet = new Set(move.capturesTokenIds);
  const capturedNames: string[] = [];

  const isBackwardMove = move.direction === 'backward' && move.kind !== 'deploy';
  const geometry = buildBoardGeometry(state.config.playerCount);
  const isUnoMode = state.config.mode === 'uno';
  const isCrazyMode = state.config.mode === 'crazy';
  const nextRevengeCharges: Record<number, boolean> = { ...(state.crazyRevengeCharges ?? {}) };

  const updatedPlayers: PlayerState[] = state.players.map((player) => {
    let playerCaptures = player.captures;
    let playerBackwards = player.backwardMoves;
    const playerStartIdx = geometry.startIndices[player.armIndex];

    const updatedTokens = player.tokens.map((tok) => {
      // Moving token
      if (tok.id === move.tokenId) {
        return {
          ...tok,
          zone: move.targetZone,
          ringIndex: move.targetRingIndex,
          lapProgress: move.targetLapProgress,
          homeIndex: move.targetHomeIndex,
        };
      }
      // Captured opponent token returns to Yard (or Start Square in UNO mode since Home Yard holds cards!)
      if (capturedIdSet.has(tok.id)) {
        if (!capturedNames.includes(player.name)) {
          capturedNames.push(player.name);
        }
        if (isCrazyMode) {
          nextRevengeCharges[player.id] = true;
        }
        if (isUnoMode) {
          return {
            ...tok,
            zone: 'track' as const,
            ringIndex: playerStartIdx,
            lapProgress: 0,
            homeIndex: -1,
          };
        }
        return {
          ...tok,
          zone: 'yard' as const,
          ringIndex: -1,
          lapProgress: 0,
          homeIndex: -1,
        };
      }
      return tok;
    });

    if (player.id === activePlayer.id) {
      if (capturedIdSet.size > 0) playerCaptures += capturedIdSet.size;
      if (isBackwardMove) playerBackwards += 1;
    }

    return {
      ...player,
      tokens: updatedTokens,
      captures: playerCaptures,
      backwardMoves: playerBackwards,
    };
  });

  // Check if active player finished all tokens
  const movedPlayer = updatedPlayers[activeIdx];
  const allHome = movedPlayer.tokens.every((t) => t.zone === 'finished');
  let finishedOrder = [...state.finishedOrder];
  let playerJustFinished = false;

  if (allHome && movedPlayer.finishedRank === null) {
    finishedOrder.push(movedPlayer.id);
    updatedPlayers[activeIdx] = {
      ...movedPlayer,
      finishedRank: finishedOrder.length,
    };
    playerJustFinished = true;
  }

  // Check match end condition
  const remainingPlayers = updatedPlayers.filter((p) => p.finishedRank === null);
  const matchEnded =
    remainingPlayers.length <= 1 ||
    (playerJustFinished && finishedOrder.length === 1 && !state.continueAfterFirstWin);

  // If only 1 player left, assign them the final rank automatically
  if (remainingPlayers.length === 1 && matchEnded) {
    const lastPlayer = remainingPlayers[0];
    finishedOrder.push(lastPlayer.id);
    const lastIdx = updatedPlayers.findIndex((p) => p.id === lastPlayer.id);
    updatedPlayers[lastIdx] = {
      ...updatedPlayers[lastIdx],
      finishedRank: finishedOrder.length,
    };
  }

  const rolledSix = state.diceValue === 6;
  const didCapture = capturedIdSet.size > 0;
  const didFinishToken = move.kind === 'finish';
  const hitCrazyDoubleSixCap =
    isCrazyMode && rolledSix && state.consecutiveSixes >= CRAZY_MAX_CONSECUTIVE_SIXES;
  const grantSixBonus = rolledSix && !hitCrazyDoubleSixCap;
  const bonusTurn = !playerJustFinished && !matchEnded && (grantSixBonus || didCapture || didFinishToken);

  const nextPlayerIndex = bonusTurn
    ? activeIdx
    : getNextActivePlayerIndex({ ...state, players: updatedPlayers }, activeIdx);

  let message = '';
  let kind: NonNullable<GameState['lastEvent']>['kind'] = 'info';

  if (playerJustFinished) {
    const ordinal = formatOrdinal(finishedOrder.length);
    message = `${movedPlayer.name} finished in ${ordinal} place!`;
    kind = 'finish';
  } else if (didCapture) {
    const dirNote = isBackwardMove ? ' with a backward ambush' : '';
    message = `${movedPlayer.name} captured ${capturedNames.join(' & ')}${dirNote}! Bonus roll.`;
    kind = 'capture';
  } else if (didFinishToken) {
    message = `${movedPlayer.name} brought a token home! Bonus roll.`;
    kind = 'finish';
  } else if (hitCrazyDoubleSixCap) {
    message = `⚡ Double Six limit (2×6) reached for ${movedPlayer.name}! ${updatedPlayers[nextPlayerIndex].name}'s turn.`;
    kind = 'info';
  } else if (move.kind === 'deploy') {
    message = `${movedPlayer.name} deployed a token! Bonus roll for 6.`;
    kind = 'bonus';
  } else if (bonusTurn) {
    message = `${movedPlayer.name} rolled a 6 — bonus roll!`;
    kind = 'bonus';
  } else if (isBackwardMove) {
    message = `${movedPlayer.name} moved backward ${state.diceValue}. ${updatedPlayers[nextPlayerIndex].name}'s turn.`;
    kind = 'reverse';
  } else {
    message = `${updatedPlayers[nextPlayerIndex].name}'s turn.`;
    kind = 'info';
  }

  const nextDynamicSafeRings = computeNextDynamicSafeRings(
    state.dynamicSafeRings,
    updatedPlayers,
    geometry
  );

  const prevDir = state.diceDirector ?? createInitialDiceDirector();
  const nextHasDeployed: Record<number, boolean> = { ...(prevDir.hasDeployedBefore ?? {}) };
  if (move.kind === 'deploy' || movedPlayer.tokens.some((t) => t.zone !== 'yard')) {
    nextHasDeployed[movedPlayer.id] = true;
  }

  const nextState: GameState = {
    ...state,
    players: updatedPlayers,
    activePlayerIndex: matchEnded ? activeIdx : nextPlayerIndex,
    phase: matchEnded ? 'finished' : 'awaiting_roll',
    diceValue: matchEnded ? state.diceValue : null,
    consecutiveSixes: bonusTurn && rolledSix ? state.consecutiveSixes : 0,
    turnNumber: bonusTurn ? state.turnNumber : state.turnNumber + 1,
    finishedOrder,
    totalCaptures: state.totalCaptures + capturedIdSet.size,
    totalBackwardMoves: state.totalBackwardMoves + (isBackwardMove ? 1 : 0),
    dynamicSafeRings: nextDynamicSafeRings,
    diceDirector: {
      ...prevDir,
      hasDeployedBefore: nextHasDeployed,
    },
    crazyRevengeCharges: nextRevengeCharges,
    lastEvent: {
      id: eventId,
      message,
      playerId: movedPlayer.id,
      kind,
    },
  };

  return {
    nextState,
    capturedNames,
    bonusTurn,
    playerJustFinished,
    matchEnded,
  };
}

export function formatOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Tactical move evaluator for optional CPU seats (evaluates both Forward and Backward in Flip-Track mode!).
 */
export function chooseBestBotMove(state: GameState, diceValue: number): MoveOption | null {
  const { forward, backward } = getAllLegalMoves(state, state.activePlayerIndex, diceValue);
  const all = [...forward, ...backward];
  if (all.length === 0) return null;

  let best = all[0];
  let bestScore = -Infinity;

  for (const move of all) {
    let score = 0;
    if (move.kind === 'finish') score += 120;
    if (move.capturesTokenIds.length > 0) score += 95 * move.capturesTokenIds.length;
    if (move.kind === 'enter_home') score += 75;
    if (move.kind === 'deploy') score += 62;
    if (move.landsOnSafe && move.kind === 'track') score += 28;
    if (move.direction === 'forward' && move.kind === 'track') {
      score += 18 + Math.max(0, move.targetLapProgress) * 0.4;
    } else if (move.direction === 'backward' && move.kind === 'track') {
      // Backward is great when capturing or ducking onto a safe star!
      score += move.capturesTokenIds.length > 0 ? 15 : move.landsOnSafe ? 12 : -4;
    }
    if (move.kind === 'home_move') {
      score += move.direction === 'forward' ? 45 : -10;
    }

    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }

  return best;
}

export type SmartDiceReason =
  | 'normal'
  | 'mercy_six'
  | 'comeback_mercy_six'
  | 'fire_streak'
  | 'capture_boost'
  | 'clutch_finish'
  | 'safe_escape'
  | 'crazy_snipe'
  | 'crazy_six'
  | 'crazy_revenge_six';

export interface SmartDiceResult {
  rolledValue: number;
  reason: SmartDiceReason;
  nextDirector: DiceDirectorState;
  fireJustIgnited: boolean;
  fireJustEnded: boolean;
  ignitedPlayerId: number | null;
  ignitedCharges: number;
  consumedRevengeCharge?: boolean;
}

function isPlayerThreatenedOnTrack(
  state: GameState,
  geometry: BoardGeometry,
  playerIndex: number
): boolean {
  const player = state.players[playerIndex];
  if (!player) return false;
  const { ringLength } = geometry;
  const isFlip = state.config.mode === 'flip';

  for (const token of player.tokens) {
    if (token.zone !== 'track') continue;
    if (isRingSquareSafe(state, geometry, token.ringIndex)) continue;

    for (const opp of state.players) {
      if (opp.id === player.id) continue;
      for (const ot of opp.tokens) {
        if (ot.zone !== 'track') continue;
        const distBehind = (token.ringIndex - ot.ringIndex + ringLength) % ringLength;
        const distAhead = (ot.ringIndex - token.ringIndex + ringLength) % ringLength;
        if (distBehind >= 1 && distBehind <= 6) return true;
        if (isFlip && distAhead >= 1 && distAhead <= 6) return true;
      }
    }
  }
  return false;
}

function pickWeightedFace(weights: number[], rng: () => number): number {
  const total = weights.reduce((acc, w) => acc + Math.max(0, w), 0);
  if (total <= 0) {
    return Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
  }
  let threshold = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    threshold -= Math.max(0, weights[i]);
    if (threshold <= 0) return i + 1;
  }
  return 6;
}

/**
 * Smart Action Dice Director:
 * 1. 10-Roll Yard Mercy: If all of a player's remaining pieces are stuck in Home Yard,
 *    they get 10 random chances to roll a 6 naturally. If still stuck after 10 failed rolls,
 *    roll #11 automatically grants a 6 so nobody stays locked out of the match.
 * 2. Action Capture Boost: Faces that enable a legal capture (forward or backward) receive
 *    extra weight so clashes and knockbacks happen more often while staying unpredictable.
 * 3. Single-Player On-Fire Mode (1..6 rolls max): Occasionally ignites ONE player at a time
 *    for 1 to 6 high-impact rolls (favoring captures, finishes, safe escapes, and high faces
 *    while guarding against a 3rd-6 forfeit), then cools down back to normal random mode.
 * 4. Clutch Finish & Danger Escape Assists: Gently boosts exact Home Crown finishes and
 *    Safe-Star/Safe-Stack escapes when a rival is lurking within 6 squares.
 */
export function rollSmartDie(
  state: GameState,
  rng: () => number = Math.random
): SmartDiceResult {
  const prevDir = state.diceDirector ?? createInitialDiceDirector();
  const nextYardStuck: Record<number, number> = { ...prevDir.yardStuckRolls };
  const nextHasDeployed: Record<number, boolean> = { ...(prevDir.hasDeployedBefore ?? {}) };
  let firePlayerId = prevDir.firePlayerId;
  let fireRemaining = Math.min(MAX_FIRE_STREAK_ROLLS, Math.max(0, prevDir.fireRemaining));
  let fireCooldownTurns = Math.max(0, prevDir.fireCooldownTurns);

  let fireJustIgnited = false;
  let fireJustEnded = false;
  let ignitedPlayerId: number | null = null;
  let ignitedCharges = 0;

  const activeIdx = state.activePlayerIndex;
  const player = state.players[activeIdx];
  if (!player) {
    return {
      rolledValue: Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1)),
      reason: 'normal',
      nextDirector: {
        yardStuckRolls: nextYardStuck,
        hasDeployedBefore: nextHasDeployed,
        firePlayerId,
        fireRemaining,
        fireCooldownTurns,
      },
      fireJustIgnited: false,
      fireJustEnded: false,
      ignitedPlayerId: null,
      ignitedCharges: 0,
    };
  }

  // Clear fire state if the fire owner already finished the match
  if (firePlayerId !== null) {
    const fireOwner = state.players.find((p) => p.id === firePlayerId);
    if (!fireOwner || fireOwner.finishedRank !== null || fireRemaining <= 0) {
      firePlayerId = null;
      fireRemaining = 0;
    }
  }

  const hasActiveOnBoard = player.tokens.some(
    (t) => t.zone === 'track' || t.zone === 'home_stretch'
  );
  const hasInYard = player.tokens.some((t) => t.zone === 'yard');
  const isStuckInYard = !hasActiveOnBoard && hasInYard;
  const isCrazy = state.config.mode === 'crazy';

  // === CRAZY MODE SPECIAL DICE RULES ===
  // 1. GUARANTEED CAPTURE SNIPE: If ANY opponent's capturable piece sits 1..6 steps in front
  //    of the active player's piece, GUARANTEE rolling the exact dice number to capture it!
  //    (Respects Double Six cap: never rolls a 3rd consecutive 6!)
  // 2. REVENGE 6 CHARGE: If this player was just captured, guarantee a 6 on their next roll!
  // 3. BOOSTED 6 PROBABILITY (~36% chance to roll 6!) + fast 4-roll Yard Mercy + Double Six cap!
  if (isCrazy) {
    const reachedDoubleSix = state.consecutiveSixes >= CRAZY_MAX_CONSECUTIVE_SIXES;

    // Priority 1: Guaranteed Capture Snipe if any rival pawn is 1..6 squares in front
    if (hasActiveOnBoard) {
      const snipeFaces: number[] = [];
      const maxFace = reachedDoubleSix ? 5 : 6;
      for (let face = 1; face <= maxFace; face++) {
        const moves = getLegalMovesForDirection(state, activeIdx, face, 'forward');
        if (moves.some((m) => m.capturesTokenIds.length > 0)) {
          snipeFaces.push(face);
        }
      }
      if (snipeFaces.length > 0) {
        const picked = snipeFaces[Math.floor(rng() * snipeFaces.length) % snipeFaces.length];
        nextYardStuck[player.id] = 0;
        return {
          rolledValue: picked,
          reason: 'crazy_snipe',
          nextDirector: {
            yardStuckRolls: nextYardStuck,
            hasDeployedBefore: nextHasDeployed,
            firePlayerId,
            fireRemaining,
            fireCooldownTurns,
          },
          fireJustIgnited: false,
          fireJustEnded: false,
          ignitedPlayerId: null,
          ignitedCharges: 0,
        };
      }
    }

    // Priority 2: Revenge 6 Charge after getting captured (only if not at Double Six cap)
    if (state.crazyRevengeCharges?.[player.id] && !reachedDoubleSix) {
      nextYardStuck[player.id] = 0;
      return {
        rolledValue: 6,
        reason: 'crazy_revenge_six',
        nextDirector: {
          yardStuckRolls: nextYardStuck,
          hasDeployedBefore: nextHasDeployed,
          firePlayerId,
          fireRemaining,
          fireCooldownTurns,
        },
        fireJustIgnited: false,
        fireJustEnded: false,
        ignitedPlayerId: null,
        ignitedCharges: 0,
        consumedRevengeCharge: true,
      };
    }

    // Priority 3: Fast Yard Mercy (4 rolls) & heavily boosted 6 probability (~38%)
    if (isStuckInYard) {
      const prevStuck = nextYardStuck[player.id] ?? 0;
      if (prevStuck >= CRAZY_YARD_MERCY_CHANCES && !reachedDoubleSix) {
        nextYardStuck[player.id] = 0;
        return {
          rolledValue: 6,
          reason: 'mercy_six',
          nextDirector: {
            yardStuckRolls: nextYardStuck,
            hasDeployedBefore: nextHasDeployed,
            firePlayerId,
            fireRemaining,
            fireCooldownTurns,
          },
          fireJustIgnited: false,
          fireJustEnded: false,
          ignitedPlayerId: null,
          ignitedCharges: 0,
        };
      }
      // 38% chance to roll 6 right out of the yard in Crazy Mode (capped at Double Six)
      const rolledValue =
        !reachedDoubleSix && rng() < 0.38
          ? 6
          : Math.min(5, Math.max(1, Math.floor(rng() * 5) + 1));
      nextYardStuck[player.id] = rolledValue === 6 ? 0 : prevStuck + 1;
      return {
        rolledValue,
        reason: rolledValue === 6 ? 'crazy_six' : 'normal',
        nextDirector: {
          yardStuckRolls: nextYardStuck,
          hasDeployedBefore: nextHasDeployed,
          firePlayerId,
          fireRemaining,
          fireCooldownTurns,
        },
        fireJustIgnited: false,
        fireJustEnded: false,
        ignitedPlayerId: null,
        ignitedCharges: 0,
      };
    }

    // Active on board in Crazy Mode: ~36% chance of 6 (0% if already at Double Six cap), plus boosted finishes & Chaos Stars!
    nextYardStuck[player.id] = 0;
    const geometry = buildBoardGeometry(state.config.playerCount);
    const weights = [1, 2, 3, 4, 5, 6].map((face) => {
      if (reachedDoubleSix && face === 6) return 0;
      let w = face === 6 ? 3.2 : 1.0;
      const moves = getLegalMovesForDirection(state, activeIdx, face, 'forward');
      if (moves.some((m) => m.kind === 'finish')) w += 2.2;
      if (moves.some((m) => m.kind === 'track' && geometry.trackCells[m.targetRingIndex]?.isSafeStar)) {
        w += 0.9;
      }
      return w;
    });
    const rolledValue = pickWeightedFace(weights, rng);
    return {
      rolledValue,
      reason: rolledValue === 6 ? 'crazy_six' : 'normal',
      nextDirector: {
        yardStuckRolls: nextYardStuck,
        hasDeployedBefore: nextHasDeployed,
        firePlayerId,
        fireRemaining,
        fireCooldownTurns,
      },
      fireJustIgnited: false,
      fireJustEnded: false,
      ignitedPlayerId: null,
      ignitedCharges: 0,
    };
  }

  // 1. Yard Mercy Rule (Classic & Flip-Track):
  // - Opening start of game (player has NEVER left Home Yard yet): 10 random chances, Mercy 6 on roll #11.
  // - Comeback after capture (player already rolled 6 / deployed earlier, then all active pawns got captured back to Home Yard):
  //   50% higher chance to roll 6 (25% vs 16.67%) AND guaranteed Comeback Mercy 6 within max 8 moves!
  if (isStuckInYard) {
    const prevStuckCount = nextYardStuck[player.id] ?? 0;
    const isComeback =
      Boolean(nextHasDeployed[player.id]) ||
      player.tokens.some((t) => t.zone === 'finished');
    const mercyLimit = isComeback ? COMEBACK_YARD_MERCY_CHANCES : YARD_MERCY_CHANCES;

    if (prevStuckCount >= mercyLimit) {
      nextYardStuck[player.id] = 0;
      nextHasDeployed[player.id] = true;
      return {
        rolledValue: 6,
        reason: isComeback ? 'comeback_mercy_six' : 'mercy_six',
        nextDirector: {
          yardStuckRolls: nextYardStuck,
          hasDeployedBefore: nextHasDeployed,
          firePlayerId,
          fireRemaining,
          fireCooldownTurns,
        },
        fireJustIgnited: false,
        fireJustEnded: false,
        ignitedPlayerId: null,
        ignitedCharges: 0,
      };
    }

    // Comeback: +50% boosted 6 probability (25% chance of 6, 15% each for 1..5);
    // Opening: standard uniform 1..6 (16.67% each).
    const rolledValue = isComeback
      ? rng() < COMEBACK_SIX_PROBABILITY
        ? 6
        : Math.min(5, Math.max(1, Math.floor(rng() * 5) + 1))
      : Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));

    if (rolledValue === 6) {
      nextYardStuck[player.id] = 0;
      nextHasDeployed[player.id] = true;
    } else {
      nextYardStuck[player.id] = prevStuckCount + 1;
    }

    return {
      rolledValue,
      reason: 'normal',
      nextDirector: {
        yardStuckRolls: nextYardStuck,
        hasDeployedBefore: nextHasDeployed,
        firePlayerId,
        fireRemaining,
        fireCooldownTurns,
      },
      fireJustIgnited: false,
      fireJustEnded: false,
      ignitedPlayerId: null,
      ignitedCharges: 0,
    };
  }

  // Player has at least one active piece on the board -> clear yard-stuck counter & record deployment history
  nextYardStuck[player.id] = 0;
  nextHasDeployed[player.id] = true;

  // 2. Single-Player On-Fire Ignition (at most 1 player at a time, 1..6 rolls max)
  if (firePlayerId === null) {
    if (fireCooldownTurns > 0) {
      fireCooldownTurns -= 1;
    } else {
      const maxFinished = Math.max(
        ...state.players.map((p) => p.tokens.filter((t) => t.zone === 'finished').length)
      );
      const myFinished = player.tokens.filter((t) => t.zone === 'finished').length;
      const isTrailing = myFinished < maxFinished;
      const igniteChance = isTrailing ? 0.22 : 0.14;

      if (rng() < igniteChance) {
        firePlayerId = player.id;
        fireRemaining = Math.min(
          MAX_FIRE_STREAK_ROLLS,
          Math.max(1, Math.floor(rng() * MAX_FIRE_STREAK_ROLLS) + 1)
        );
        fireJustIgnited = true;
        ignitedPlayerId = player.id;
        ignitedCharges = fireRemaining;
      }
    }
  }

  // 3. Evaluate tactical outcomes for each candidate die face (1..6)
  const geometry = buildBoardGeometry(state.config.playerCount);
  const threatened = isPlayerThreatenedOnTrack(state, geometry, activeIdx);
  const isPlayerOnFire = firePlayerId === player.id && fireRemaining > 0;

  const faceFlags = [1, 2, 3, 4, 5, 6].map((face) => {
    const wouldForfeit = face === 6 && state.consecutiveSixes >= 2;
    if (wouldForfeit) {
      return { face, wouldForfeit: true, canCapture: false, canFinish: false, canSafeEscape: false };
    }
    const { forward, backward } = getAllLegalMoves(state, activeIdx, face);
    const all = [...forward, ...backward];
    return {
      face,
      wouldForfeit: false,
      canCapture: all.some((m) => m.capturesTokenIds.length > 0),
      canFinish: all.some((m) => m.kind === 'finish'),
      canSafeEscape: all.some((m) => m.kind === 'track' && m.landsOnSafe),
    };
  });

  const weights = faceFlags.map(({ face, wouldForfeit, canCapture, canFinish, canSafeEscape }) => {
    let w = 1.0;

    if (isPlayerOnFire) {
      if (wouldForfeit) return 0.12;
      if (canCapture) w += 3.2;
      if (canFinish) w += 3.0;
      if (canSafeEscape && threatened) w += 1.4;
      if (face >= 4) w += 1.1;
      return w;
    }

    if (wouldForfeit) return 0.85;
    if (canCapture) w += 1.5;
    if (canFinish) w += 0.9;
    if (canSafeEscape && threatened) w += 0.7;
    return w;
  });

  const rolledValue = pickWeightedFace(weights, rng);
  const chosen = faceFlags[rolledValue - 1];

  let reason: SmartDiceReason = 'normal';
  if (isPlayerOnFire) {
    reason = 'fire_streak';
    fireRemaining -= 1;
    if (fireRemaining <= 0) {
      firePlayerId = null;
      fireRemaining = 0;
      fireCooldownTurns = 8 + Math.floor(rng() * 5);
      fireJustEnded = true;
    }
  } else if (chosen.canCapture) {
    reason = 'capture_boost';
  } else if (chosen.canFinish) {
    reason = 'clutch_finish';
  } else if (chosen.canSafeEscape && threatened) {
    reason = 'safe_escape';
  }

  return {
    rolledValue,
    reason,
    nextDirector: {
      yardStuckRolls: nextYardStuck,
      hasDeployedBefore: nextHasDeployed,
      firePlayerId,
      fireRemaining,
      fireCooldownTurns,
    },
    fireJustIgnited,
    fireJustEnded,
    ignitedPlayerId,
    ignitedCharges,
  };
}

export type CrazyStarChaosKind = 'turbo_boost' | 'swaparoo' | 'bonus_roll';

export interface CrazyStarChaosResult {
  kind: CrazyStarChaosKind;
  nextState: GameState;
  label: string;
  message: string;
}

/**
 * Crazy Mode extra funny rule: Landing on any Safe Star triggers a random Chaos Event!
 * 1. ⚡ TURBO +2: Instantly rockets the pawn +2 extra squares forward (can even chain-capture!).
 * 2. 🌪️ SWAPAROO: Swaps that pawn's square with a random rival's unprotected track pawn!
 * 3. 🎁 BONUS ROLL: Grants an instant extra roll even if you didn't roll a 6!
 */
export function resolveCrazyStarChaos(
  stateAfterCommit: GameState,
  moverPlayerId: number,
  movedTokenId: string,
  rng: () => number = Math.random
): CrazyStarChaosResult | null {
  if (stateAfterCommit.config.mode !== 'crazy' || stateAfterCommit.phase === 'finished') {
    return null;
  }

  const moverIdx = stateAfterCommit.players.findIndex((p) => p.id === moverPlayerId);
  const mover = stateAfterCommit.players[moverIdx];
  if (!mover || mover.finishedRank !== null) return null;
  const token = mover.tokens.find((t) => t.id === movedTokenId);
  if (!token || token.zone !== 'track') return null;

  const geometry = buildBoardGeometry(stateAfterCommit.config.playerCount);
  if (!geometry.trackCells[token.ringIndex]?.isSafeStar) {
    return null;
  }

  const roll = rng();
  const eventId = (stateAfterCommit.lastEvent?.id ?? 0) + 1;

  // Option A: Turbo Boost +2 steps forward
  if (roll < 0.36) {
    const turboMoves = getLegalMovesForDirection(
      { ...stateAfterCommit, activePlayerIndex: moverIdx },
      moverIdx,
      2,
      'forward'
    );
    const boost = turboMoves.find((m) => m.tokenId === movedTokenId);
    if (boost) {
      const committed = commitMove(
        { ...stateAfterCommit, activePlayerIndex: moverIdx, diceValue: 2 },
        boost
      );
      const msg =
        boost.capturesTokenIds.length > 0
          ? `⚡ CHAOS STAR TURBO +2! ${mover.name} rocketed ahead and CHAIN-CAPTURED ${committed.capturedNames.join(' & ')}!`
          : `⚡ CHAOS STAR TURBO +2! ${mover.name} zoomed 2 extra squares!`;
      return {
        kind: 'turbo_boost',
        label: 'TURBO +2!',
        message: msg,
        nextState: {
          ...committed.nextState,
          lastEvent: {
            id: eventId,
            message: msg,
            playerId: mover.id,
            kind: 'bonus',
          },
        },
      };
    }
  }

  // Option B: Swaparoo with a rival's non-safe track pawn
  if (roll < 0.7) {
    const rivals: Array<{ player: PlayerState; token: TokenState }> = [];
    for (const p of stateAfterCommit.players) {
      if (p.id === mover.id) continue;
      for (const t of p.tokens) {
        if (t.zone === 'track' && !isRingSquareSafe(stateAfterCommit, geometry, t.ringIndex)) {
          rivals.push({ player: p, token: t });
        }
      }
    }
    if (rivals.length > 0) {
      const picked = rivals[Math.floor(rng() * rivals.length) % rivals.length];
      const { ringLength } = geometry;
      const moverStart = geometry.startIndices[mover.armIndex];
      const rivalStart = geometry.startIndices[picked.player.armIndex];
      const newMoverRing = picked.token.ringIndex;
      const newRivalRing = token.ringIndex;

      const updatedPlayers = stateAfterCommit.players.map((p) => {
        if (p.id === mover.id) {
          return {
            ...p,
            tokens: p.tokens.map((t) =>
              t.id === token.id
                ? {
                    ...t,
                    ringIndex: newMoverRing,
                    lapProgress: (newMoverRing - moverStart + ringLength) % ringLength,
                  }
                : t
            ),
          };
        }
        if (p.id === picked.player.id) {
          return {
            ...p,
            tokens: p.tokens.map((t) =>
              t.id === picked.token.id
                ? {
                    ...t,
                    ringIndex: newRivalRing,
                    lapProgress: (newRivalRing - rivalStart + ringLength) % ringLength,
                  }
                : t
            ),
          };
        }
        return p;
      });

      const msg = `🌪️ CHAOS SWAPAROO! ${mover.name} swapped spots with ${picked.player.name}!`;
      return {
        kind: 'swaparoo',
        label: 'SWAPAROO!',
        message: msg,
        nextState: {
          ...stateAfterCommit,
          players: updatedPlayers,
          dynamicSafeRings: computeNextDynamicSafeRings(
            stateAfterCommit.dynamicSafeRings,
            updatedPlayers,
            geometry
          ),
          lastEvent: {
            id: eventId,
            message: msg,
            playerId: mover.id,
            kind: 'bonus',
          },
        },
      };
    }
  }

  // Option C: Instant Free Bonus Roll!
  const msg = `🎁 CHAOS STAR BONUS! ${mover.name} gets a free extra roll!`;
  return {
    kind: 'bonus_roll',
    label: 'BONUS ROLL!',
    message: msg,
    nextState: {
      ...stateAfterCommit,
      activePlayerIndex: moverIdx,
      phase: 'awaiting_roll',
      diceValue: null,
      lastEvent: {
        id: eventId,
        message: msg,
        playerId: mover.id,
        kind: 'bonus',
      },
    },
  };
}


