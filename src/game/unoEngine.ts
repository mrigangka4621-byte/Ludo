import { buildBoardGeometry, getTokenPoint } from './boardGeometry.ts';
import {
  commitMove,
  getLegalMovesForDirection,
  getNextActivePlayerIndex,
  isRingSquareSafe,
} from './engine.ts';
import type {
  GameState,
  MoveOption,
  PathWaypoint,
  PlayerState,
  TokenState,
  UnoCard,
  UnoCardColor,
  UnoCardKind,
  UnoState,
} from './types.ts';

export const UNO_HAND_SIZE = 6;

const STANDARD_COLORS: UnoCardColor[] = ['red', 'blue', 'green', 'yellow'];

export function generateUnoCard(seq: number, rng: () => number = Math.random): UnoCard {
  const roll = rng();
  const color = STANDARD_COLORS[Math.floor(rng() * STANDARD_COLORS.length) % STANDARD_COLORS.length];

  // Weighted UNO Ludo deck: ~60% number (1-6), ~11% reverse, ~11% skip, ~10% -2, ~6% -4, ~2% swap
  if (roll < 0.6) {
    const value = Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
    return { id: `uno-${seq}`, kind: 'number', value, color };
  }
  if (roll < 0.71) {
    return { id: `uno-${seq}`, kind: 'reverse', color };
  }
  if (roll < 0.82) {
    return { id: `uno-${seq}`, kind: 'skip', color };
  }
  if (roll < 0.92) {
    return { id: `uno-${seq}`, kind: 'minus2', color };
  }
  if (roll < 0.98) {
    return { id: `uno-${seq}`, kind: 'minus4', color: 'wild' };
  }
  return { id: `uno-${seq}`, kind: 'swap', color: 'wild' };
}

/**
 * Deal a fresh 6-card hand guaranteed to include at least 3 number cards and at least 1 action card
 * so players immediately enjoy both movement and UNO tactical cards.
 */
export function dealUnoHand(
  count: number,
  startSeq: number,
  rng: () => number = Math.random
): { cards: UnoCard[]; nextSeq: number } {
  const cards: UnoCard[] = [];
  let seq = startSeq;
  for (let i = 0; i < count; i++) {
    cards.push(generateUnoCard(seq++, rng));
  }

  // Ensure at least 3 number cards when dealing a full 6-card hand
  if (count >= 6) {
    const numberCount = cards.filter((c) => c.kind === 'number').length;
    if (numberCount < 3) {
      let needed = 3 - numberCount;
      for (let i = 0; i < cards.length && needed > 0; i++) {
        if (cards[i].kind !== 'number') {
          const color = STANDARD_COLORS[Math.floor(rng() * 4) % 4];
          const value = Math.min(6, Math.max(1, Math.floor(rng() * 6) + 1));
          cards[i] = { id: cards[i].id, kind: 'number', value, color };
          needed -= 1;
        }
      }
    }
    // Ensure at least 1 action card in a fresh 6-card hand
    if (cards.every((c) => c.kind === 'number')) {
      const actionKinds: UnoCardKind[] = ['reverse', 'skip', 'minus2', 'minus4'];
      const chosenKind = actionKinds[Math.floor(rng() * actionKinds.length) % actionKinds.length];
      const color: UnoCardColor =
        chosenKind === 'minus4' ? 'wild' : STANDARD_COLORS[Math.floor(rng() * 4) % 4];
      cards[cards.length - 1] = {
        id: cards[cards.length - 1].id,
        kind: chosenKind,
        color,
      };
    }
  }

  return { cards, nextSeq: seq };
}

export function createInitialUnoState(
  playerCount: number,
  rng: () => number = Math.random
): UnoState {
  const hands: Record<number, UnoCard[]> = {};
  let nextSeq = 1;
  for (let i = 0; i < playerCount; i++) {
    const dealt = dealUnoHand(UNO_HAND_SIZE, nextSeq, rng);
    hands[i] = dealt.cards;
    nextSeq = dealt.nextSeq;
  }
  return {
    hands,
    discardTop: null,
    selectedCardId: null,
    pendingKnockback: null,
    nextCardSeq: nextSeq,
  };
}

/**
 * Consume a played card from playerId's hand.
 * If the player just played their LAST card (hand becomes empty), immediately refill 6 new random cards!
 */
export function consumeUnoCardAndRefill(
  unoState: UnoState,
  playerId: number,
  cardId: string,
  rng: () => number = Math.random
): { nextUno: UnoState; playedCard: UnoCard | null; refilled: boolean } {
  const hand = unoState.hands[playerId] ?? [];
  const playedCard = hand.find((c) => c.id === cardId) ?? null;
  if (!playedCard) {
    return { nextUno: unoState, playedCard: null, refilled: false };
  }

  let remaining = hand.filter((c) => c.id !== cardId);
  let nextSeq = unoState.nextCardSeq;
  let refilled = false;

  if (remaining.length === 0) {
    const fresh = dealUnoHand(UNO_HAND_SIZE, nextSeq, rng);
    remaining = fresh.cards;
    nextSeq = fresh.nextSeq;
    refilled = true;
  }

  return {
    playedCard,
    refilled,
    nextUno: {
      ...unoState,
      hands: {
        ...unoState.hands,
        [playerId]: remaining,
      },
      discardTop: playedCard,
      selectedCardId: null,
      nextCardSeq: nextSeq,
    },
  };
}

export function formatUnoCardLabel(card: UnoCard): string {
  switch (card.kind) {
    case 'number':
      return `${card.value ?? 1}`;
    case 'reverse':
      return 'Reverse';
    case 'skip':
      return 'Skip';
    case 'minus2':
      return '-2';
    case 'minus4':
      return '-4';
    case 'swap':
      return 'Swap';
  }
}

/**
 * Compute all legal backward knockback MoveOptions for a victim player receiving `-totalSteps`.
 * - Works on EVERY non-finished pawn of the victim — INCLUDING pawns sitting on their Start Square
 *   (lapProgress === 0) or already pushed into negative lapProgress!
 * - Pawns inside Home Stretch step backward toward homeIndex 0 and exit onto the main track
 *   if totalSteps exceeds their homeIndex!
 * - Knockback never triggers a capture (pure backward punishment).
 */
export function getUnoKnockbackMoves(
  state: GameState,
  victimPlayerId: number,
  totalSteps: number
): MoveOption[] {
  const victim = state.players.find((p) => p.id === victimPlayerId);
  if (!victim || victim.finishedRank !== null || totalSteps <= 0) return [];

  const geometry = buildBoardGeometry(state.config.playerCount);
  const { ringLength } = geometry;
  const homeEntryIdx = geometry.homeEntryIndices[victim.armIndex];
  const options: MoveOption[] = [];

  for (const token of victim.tokens) {
    if (token.zone === 'finished' || token.zone === 'yard') continue;

    const waypoints: PathWaypoint[] = [];
    let curZone: TokenState['zone'] = token.zone;
    let curRing = token.ringIndex;
    let curProgress = token.lapProgress;
    let curHome = token.homeIndex;

    for (let step = 1; step <= totalSteps; step++) {
      if (curZone === 'home_stretch') {
        if (curHome > 0) {
          curHome -= 1;
          waypoints.push({
            zone: 'home_stretch',
            homeIndex: curHome,
            armIndex: victim.armIndex,
            slotIndex: token.slotIndex,
            point: getTokenPoint(geometry, victim.armIndex, token.slotIndex, 'home_stretch', -1, curHome),
          });
        } else {
          // Step back out of Home Stretch onto the player's Home Entry track square!
          curZone = 'track';
          curHome = -1;
          curRing = homeEntryIdx;
          curProgress = ringLength - 2;
          waypoints.push({
            zone: 'track',
            ringIndex: curRing,
            armIndex: victim.armIndex,
            slotIndex: token.slotIndex,
            point: getTokenPoint(geometry, victim.armIndex, token.slotIndex, 'track', curRing, -1),
          });
        }
      } else {
        // Track (including starting square lapProgress === 0 or negative!) -> move backward around ring
        curRing = (curRing - 1 + ringLength) % ringLength;
        curProgress -= 1;
        waypoints.push({
          zone: 'track',
          ringIndex: curRing,
          armIndex: victim.armIndex,
          slotIndex: token.slotIndex,
          point: getTokenPoint(geometry, victim.armIndex, token.slotIndex, 'track', curRing, -1),
        });
      }
    }

    options.push({
      tokenId: token.id,
      direction: 'backward',
      kind: curZone === 'home_stretch' ? 'home_move' : 'track',
      targetZone: curZone,
      targetRingIndex: curZone === 'track' ? curRing : -1,
      targetLapProgress: curProgress,
      targetHomeIndex: curZone === 'home_stretch' ? curHome : -1,
      capturesTokenIds: [],
      landsOnSafe: curZone !== 'track' || isRingSquareSafe(state, geometry, curRing),
      waypoints,
    });
  }

  return options;
}

/**
 * Determine whether a specific UNO card in playerId's hand is legally playable right now.
 * Enforces the EXACT stacking rules:
 * - While defending a pending `-2` stack: ONLY `-2` or `-4` cards may be played!
 * - While defending a pending `-4` stack: ONLY `-4` cards may be played (NEVER `-2` on `-4`)!
 */
export function canPlayUnoCard(state: GameState, playerId: number, card: UnoCard): boolean {
  const uno = state.unoState;
  if (!uno) return false;
  const activePlayer = state.players[state.activePlayerIndex];
  if (!activePlayer || activePlayer.id !== playerId) return false;

  const pending = uno.pendingKnockback;
  if (pending) {
    if (pending.victimPlayerId !== playerId) return false;
    if (pending.lastCardKind === 'minus2') {
      return card.kind === 'minus2' || card.kind === 'minus4';
    }
    // lastCardKind === 'minus4': can stack -4 on -4, NEVER -2 on -4!
    return card.kind === 'minus4';
  }

  if (card.kind === 'number') {
    const val = card.value ?? 1;
    return getLegalMovesForDirection(state, state.activePlayerIndex, val, 'forward').length > 0;
  }

  if (card.kind === 'reverse' || card.kind === 'skip') {
    return true;
  }

  if (card.kind === 'minus2' || card.kind === 'minus4') {
    const nextIdx = getNextActivePlayerIndex(state, state.activePlayerIndex);
    const nextPlayer = state.players[nextIdx];
    if (!nextPlayer || nextPlayer.id === playerId) return false;
    return nextPlayer.tokens.some((t) => t.zone === 'track' || t.zone === 'home_stretch');
  }

  if (card.kind === 'swap') {
    const geometry = buildBoardGeometry(state.config.playerCount);
    const myHasTrack = activePlayer.tokens.some((t) => t.zone === 'track');
    if (!myHasTrack) return false;
    return state.players.some(
      (p) =>
        p.id !== playerId &&
        p.tokens.some(
          (t) => t.zone === 'track' && !isRingSquareSafe(state, geometry, t.ringIndex)
        )
    );
  }

  return false;
}

/**
 * Returns true if playing this UNO number card right now allows capturing at least one rival pawn!
 */
export function doesUnoCardCapture(
  state: GameState,
  playerId: number,
  card: UnoCard
): boolean {
  if (card.kind !== 'number' || !canPlayUnoCard(state, playerId, card)) return false;
  const moves = getLegalMovesForDirection(
    state,
    state.activePlayerIndex,
    card.value ?? 1,
    'forward'
  );
  return moves.some((m) => m.capturesTokenIds.length > 0);
}

/**
 * Select a number card (1..6) from the active player's hand to move a pawn forward.
 */
export function selectUnoNumberCard(state: GameState, cardId: string): GameState {
  const uno = state.unoState;
  if (!uno || uno.pendingKnockback) return state;
  const activePlayer = state.players[state.activePlayerIndex];
  const card = (uno.hands[activePlayer.id] ?? []).find((c) => c.id === cardId);
  if (!card || card.kind !== 'number' || !canPlayUnoCard(state, activePlayer.id, card)) {
    return state;
  }

  const val = card.value ?? 1;
  return {
    ...state,
    phase: 'choosing_move',
    diceValue: val,
    selectedDirection: 'forward',
    unoState: {
      ...uno,
      selectedCardId: cardId,
    },
    lastEvent: {
      id: (state.lastEvent?.id ?? 0) + 1,
      message: `${activePlayer.name} picked card ${val} — tap a highlighted pawn to move ${val}.`,
      playerId: activePlayer.id,
      kind: 'info',
    },
  };
}

export function cancelUnoNumberCard(state: GameState): GameState {
  if (state.config.mode !== 'uno' || state.phase !== 'choosing_move' || !state.unoState) {
    return state;
  }
  return {
    ...state,
    phase: 'choosing_card',
    diceValue: null,
    unoState: {
      ...state.unoState,
      selectedCardId: null,
    },
  };
}

/**
 * Play a UNO Action Card (Reverse, Skip, -2, -4, Swap).
 */
export function playUnoActionCard(
  state: GameState,
  cardId: string,
  rng: () => number = Math.random
): {
  nextState: GameState;
  actionKind: UnoCardKind;
  refilled: boolean;
  swappedTokens?: { myTokenId: string; rivalTokenId: string; rivalName: string };
} | null {
  const uno = state.unoState;
  if (!uno) return null;
  const activeIdx = state.activePlayerIndex;
  const activePlayer = state.players[activeIdx];
  const card = (uno.hands[activePlayer.id] ?? []).find((c) => c.id === cardId);
  if (!card || card.kind === 'number' || !canPlayUnoCard(state, activePlayer.id, card)) {
    return null;
  }

  const { nextUno, refilled } = consumeUnoCardAndRefill(uno, activePlayer.id, cardId, rng);
  const eventId = (state.lastEvent?.id ?? 0) + 1;
  const refillNote = refilled ? ' (Fresh 6 cards dealt!)' : '';
  const unfinishedCount = state.players.filter((p) => p.finishedRank === null).length;

  // 1. REVERSE
  if (card.kind === 'reverse') {
    const prevDir = state.turnDirection ?? 1;
    const nextDir: 1 | -1 = prevDir === 1 ? -1 : 1;
    const stateWithDir: GameState = { ...state, turnDirection: nextDir };

    // Official UNO 2-player rule: Reverse acts like Skip so the current player goes again!
    const nextIdx =
      unfinishedCount <= 2
        ? activeIdx
        : getNextActivePlayerIndex(stateWithDir, activeIdx);

    return {
      actionKind: 'reverse',
      refilled,
      nextState: {
        ...stateWithDir,
        activePlayerIndex: nextIdx,
        phase: 'choosing_card',
        diceValue: null,
        turnNumber: state.turnNumber + 1,
        unoState: nextUno,
        lastEvent: {
          id: eventId,
          message:
            unfinishedCount <= 2
              ? `⇄ ${activePlayer.name} played Reverse! In 2-player UNO, ${activePlayer.name} goes again!${refillNote}`
              : `⇄ ${activePlayer.name} reversed turn order (${nextDir === -1 ? '↺ CCW' : '↻ CW'})! ${state.players[nextIdx].name}'s turn.${refillNote}`,
          playerId: activePlayer.id,
          kind: 'reverse',
        },
      },
    };
  }

  // 2. SKIP
  if (card.kind === 'skip') {
    const skippedIdx = getNextActivePlayerIndex(state, activeIdx);
    const afterSkippedIdx = getNextActivePlayerIndex(state, skippedIdx);
    const skippedPlayer = state.players[skippedIdx];

    return {
      actionKind: 'skip',
      refilled,
      nextState: {
        ...state,
        activePlayerIndex: afterSkippedIdx,
        phase: 'choosing_card',
        diceValue: null,
        turnNumber: state.turnNumber + 1,
        unoState: nextUno,
        lastEvent: {
          id: eventId,
          message: `⊘ ${activePlayer.name} skipped ${skippedPlayer.name}! ${state.players[afterSkippedIdx].name}'s turn.${refillNote}`,
          playerId: activePlayer.id,
          kind: 'forfeit',
        },
      },
    };
  }

  // 3. KNOCKBACK -2 OR -4 (supports unlimited stacking!)
  if (card.kind === 'minus2' || card.kind === 'minus4') {
    const addSteps = card.kind === 'minus4' ? 4 : 2;
    const prevPending = uno.pendingKnockback;
    const totalSteps = (prevPending?.totalSteps ?? 0) + addSteps;
    const stackCount = (prevPending?.stackCount ?? 0) + 1;
    const victimIdx = getNextActivePlayerIndex(state, activeIdx);
    const victim = state.players[victimIdx];

    return {
      actionKind: card.kind,
      refilled,
      nextState: {
        ...state,
        activePlayerIndex: victimIdx,
        phase: 'choosing_card',
        diceValue: null,
        turnNumber: state.turnNumber + 1,
        unoState: {
          ...nextUno,
          pendingKnockback: {
            totalSteps,
            lastCardKind: card.kind,
            stackCount,
            chooserPlayerId: activePlayer.id,
            victimPlayerId: victim.id,
          },
        },
        lastEvent: {
          id: eventId,
          message:
            stackCount > 1
              ? `💥 ${activePlayer.name} STACKED ${card.kind === 'minus4' ? '-4' : '-2'}! Penalty is now -${totalSteps} (×${stackCount}) on ${victim.name}!${refillNote}`
              : `💥 ${activePlayer.name} threw ${card.kind === 'minus4' ? '-4' : '-2'} at ${victim.name}! Stack or take -${totalSteps}.${refillNote}`,
          playerId: activePlayer.id,
          kind: 'capture',
        },
      },
    };
  }

  // 4. WILD SWAP CARD (Bonus UNO Chaos Card!)
  const geometry = buildBoardGeometry(state.config.playerCount);
  const myTrackTokens = activePlayer.tokens
    .filter((t) => t.zone === 'track')
    .sort((a, b) => a.lapProgress - b.lapProgress); // Upgrade our furthest-behind track pawn!
  const rivalCandidates: Array<{ player: PlayerState; token: TokenState }> = [];
  for (const p of state.players) {
    if (p.id === activePlayer.id) continue;
    for (const t of p.tokens) {
      if (t.zone === 'track' && !isRingSquareSafe(state, geometry, t.ringIndex)) {
        rivalCandidates.push({ player: p, token: t });
      }
    }
  }
  rivalCandidates.sort((a, b) => b.token.lapProgress - a.token.lapProgress);

  const myTok = myTrackTokens[0];
  const rivalPick = rivalCandidates[0];
  if (!myTok || !rivalPick) return null;

  const myStart = geometry.startIndices[activePlayer.armIndex];
  const rivalStart = geometry.startIndices[rivalPick.player.armIndex];
  const { ringLength } = geometry;

  // Compute natural forward lapProgress at the swapped ring positions
  const newMyRing = rivalPick.token.ringIndex;
  const newRivalRing = myTok.ringIndex;
  const newMyProgress = (newMyRing - myStart + ringLength) % ringLength;
  const newRivalProgress = (newRivalRing - rivalStart + ringLength) % ringLength;

  const updatedPlayers = state.players.map((p) => {
    if (p.id === activePlayer.id) {
      return {
        ...p,
        tokens: p.tokens.map((t) =>
          t.id === myTok.id
            ? { ...t, ringIndex: newMyRing, lapProgress: newMyProgress }
            : t
        ),
      };
    }
    if (p.id === rivalPick.player.id) {
      return {
        ...p,
        tokens: p.tokens.map((t) =>
          t.id === rivalPick.token.id
            ? { ...t, ringIndex: newRivalRing, lapProgress: newRivalProgress }
            : t
        ),
      };
    }
    return p;
  });

  const nextIdx = getNextActivePlayerIndex({ ...state, players: updatedPlayers }, activeIdx);
  return {
    actionKind: 'swap',
    refilled,
    swappedTokens: {
      myTokenId: myTok.id,
      rivalTokenId: rivalPick.token.id,
      rivalName: rivalPick.player.name,
    },
    nextState: {
      ...state,
      players: updatedPlayers,
      activePlayerIndex: nextIdx,
      phase: 'choosing_card',
      diceValue: null,
      turnNumber: state.turnNumber + 1,
      unoState: nextUno,
      lastEvent: {
        id: eventId,
        message: `🔀 ${activePlayer.name} swapped pawns with ${rivalPick.player.name}! ${updatedPlayers[nextIdx].name}'s turn.${refillNote}`,
        playerId: activePlayer.id,
        kind: 'bonus',
      },
    },
  };
}

/**
 * Victim accepts the accumulated `-N` knockback stack -> preceding player (`chooserPlayerId`)
 * now selects WHICH of the victim's pawns moves backwards `-totalSteps`!
 */
export function acceptUnoKnockback(state: GameState): GameState {
  const pending = state.unoState?.pendingKnockback;
  if (!pending) return state;

  const chooser = state.players.find((p) => p.id === pending.chooserPlayerId);
  const victim = state.players.find((p) => p.id === pending.victimPlayerId);
  if (!chooser || !victim) return state;

  const targets = getUnoKnockbackMoves(state, victim.id, pending.totalSteps);
  if (targets.length === 0) {
    // Edge case: victim somehow has no targetable pawns -> clear stack & advance turn
    const victimIdx = state.players.findIndex((p) => p.id === victim.id);
    const nextIdx = getNextActivePlayerIndex(state, victimIdx);
    return {
      ...state,
      activePlayerIndex: nextIdx,
      phase: 'choosing_card',
      unoState: {
        ...state.unoState!,
        pendingKnockback: null,
      },
    };
  }

  return {
    ...state,
    phase: 'choosing_knockback_target',
    lastEvent: {
      id: (state.lastEvent?.id ?? 0) + 1,
      message: `🎯 ${chooser.name}: pick any ${victim.name} pawn to send -${pending.totalSteps} backward!`,
      playerId: chooser.id,
      kind: 'capture',
    },
  };
}

/**
 * Commit the chosen backward knockback move against the victim's pawn, clear the stack,
 * and pass turn to the player after the victim.
 */
export function commitUnoKnockbackMove(state: GameState, move: MoveOption): GameState {
  const pending = state.unoState?.pendingKnockback;
  if (!pending || !state.unoState) return state;

  const victimIdx = state.players.findIndex((p) => p.id === pending.victimPlayerId);
  const victim = state.players[victimIdx];
  const chooser = state.players.find((p) => p.id === pending.chooserPlayerId);
  if (!victim) return state;

  const updatedPlayers = state.players.map((p) => {
    if (p.id !== victim.id) return p;
    return {
      ...p,
      tokens: p.tokens.map((t) =>
        t.id === move.tokenId
          ? {
              ...t,
              zone: move.targetZone,
              ringIndex: move.targetRingIndex,
              lapProgress: move.targetLapProgress,
              homeIndex: move.targetHomeIndex,
            }
          : t
      ),
    };
  });

  const nextIdx = getNextActivePlayerIndex({ ...state, players: updatedPlayers }, victimIdx);

  return {
    ...state,
    players: updatedPlayers,
    activePlayerIndex: nextIdx,
    phase: 'choosing_card',
    diceValue: null,
    totalBackwardMoves: state.totalBackwardMoves + 1,
    turnNumber: state.turnNumber + 1,
    unoState: {
      ...state.unoState,
      pendingKnockback: null,
      selectedCardId: null,
    },
    lastEvent: {
      id: (state.lastEvent?.id ?? 0) + 1,
      message: `💥 ${chooser?.name ?? 'Opponent'} sent ${victim.name}'s pawn -${pending.totalSteps} backward! ${updatedPlayers[nextIdx].name}'s turn.`,
      playerId: chooser?.id ?? victim.id,
      kind: 'reverse',
    },
  };
}

/**
 * Commit a UNO number card pawn move (consumes card, refills hand to 6 if empty,
 * grants bonus card play on capture or reaching goal, returns to 'choosing_card').
 */
export function commitUnoNumberMove(
  state: GameState,
  move: MoveOption,
  rng: () => number = Math.random
): {
  nextState: GameState;
  capturedNames: string[];
  bonusTurn: boolean;
  playerJustFinished: boolean;
  matchEnded: boolean;
  refilled: boolean;
} {
  const uno = state.unoState!;
  const activePlayer = state.players[state.activePlayerIndex];
  const selectedId = uno.selectedCardId;

  const core = commitMove(state, move);
  const consumed = selectedId
    ? consumeUnoCardAndRefill(uno, activePlayer.id, selectedId, rng)
    : { nextUno: uno, playedCard: null, refilled: false };

  // In UNO mode, only capture or finishing a pawn grants a bonus play (playing a 6 card is a normal strong move)
  const didCapture = move.capturesTokenIds.length > 0;
  const didFinish = move.kind === 'finish';
  const unoBonusTurn = !core.playerJustFinished && !core.matchEnded && (didCapture || didFinish);

  const nextPlayerIndex = unoBonusTurn
    ? state.activePlayerIndex
    : getNextActivePlayerIndex(
        { ...core.nextState, turnDirection: state.turnDirection },
        state.activePlayerIndex
      );

  const refillSuffix = consumed.refilled ? ' Fresh 6 cards dealt!' : '';
  const eventMessage = core.playerJustFinished
    ? core.nextState.lastEvent?.message ?? ''
    : didCapture
      ? `${activePlayer.name} captured ${core.capturedNames.join(' & ')}! Bonus card play!${refillSuffix}`
      : didFinish
        ? `${activePlayer.name} scored a pawn home! Bonus card play!${refillSuffix}`
        : `${activePlayer.name} played ${state.diceValue}. ${core.nextState.players[nextPlayerIndex].name}'s turn.${refillSuffix}`;

  return {
    capturedNames: core.capturedNames,
    bonusTurn: unoBonusTurn,
    playerJustFinished: core.playerJustFinished,
    matchEnded: core.matchEnded,
    refilled: consumed.refilled,
    nextState: {
      ...core.nextState,
      activePlayerIndex: core.matchEnded ? state.activePlayerIndex : nextPlayerIndex,
      phase: core.matchEnded ? 'finished' : 'choosing_card',
      diceValue: null,
      consecutiveSixes: 0,
      turnNumber: unoBonusTurn ? state.turnNumber : state.turnNumber + 1,
      unoState: consumed.nextUno,
      lastEvent: core.nextState.lastEvent
        ? {
            ...core.nextState.lastEvent,
            message: eventMessage,
          }
        : null,
    },
  };
}

/**
 * Fallback if a player has zero playable cards on a normal UNO turn (e.g., all number cards overshoot Home Crown):
 * Draws 1 random card and passes turn cleanly.
 */
export function drawUnoCardAndPass(
  state: GameState,
  rng: () => number = Math.random
): GameState {
  const uno = state.unoState;
  if (!uno || uno.pendingKnockback) return state;

  const activeIdx = state.activePlayerIndex;
  const activePlayer = state.players[activeIdx];
  const newCard = generateUnoCard(uno.nextCardSeq, rng);
  const nextHand = [...(uno.hands[activePlayer.id] ?? []), newCard];
  const nextIdx = getNextActivePlayerIndex(state, activeIdx);

  return {
    ...state,
    activePlayerIndex: nextIdx,
    phase: 'choosing_card',
    diceValue: null,
    turnNumber: state.turnNumber + 1,
    unoState: {
      ...uno,
      hands: {
        ...uno.hands,
        [activePlayer.id]: nextHand,
      },
      selectedCardId: null,
      nextCardSeq: uno.nextCardSeq + 1,
    },
    lastEvent: {
      id: (state.lastEvent?.id ?? 0) + 1,
      message: `🃏 ${activePlayer.name} had no playable card — drew a card! ${state.players[nextIdx].name}'s turn.`,
      playerId: activePlayer.id,
      kind: 'info',
    },
  };
}

/**
 * Smart CPU Bot AI for UNO Ludo Mode.
 */
export function chooseBestUnoBotCard(
  state: GameState
):
  | { type: 'play_action'; cardId: string }
  | { type: 'play_number'; cardId: string; move: MoveOption }
  | { type: 'accept_knockback' }
  | { type: 'draw_pass' } {
  const uno = state.unoState;
  if (!uno) return { type: 'draw_pass' };
  const activeIdx = state.activePlayerIndex;
  const activePlayer = state.players[activeIdx];
  const hand = uno.hands[activePlayer.id] ?? [];
  const playable = hand.filter((c) => canPlayUnoCard(state, activePlayer.id, c));

  // If defending a knockback stack: prefer stacking -2 over -4 so we save -4, else accept hit
  if (uno.pendingKnockback) {
    const minus2 = playable.find((c) => c.kind === 'minus2');
    if (minus2) return { type: 'play_action', cardId: minus2.id };
    const minus4 = playable.find((c) => c.kind === 'minus4');
    if (minus4) return { type: 'play_action', cardId: minus4.id };
    return { type: 'accept_knockback' };
  }

  if (playable.length === 0) {
    return { type: 'draw_pass' };
  }

  // Score every playable card & move
  let bestChoice:
    | { type: 'play_action'; cardId: string; score: number }
    | { type: 'play_number'; cardId: string; move: MoveOption; score: number }
    | null = null;

  for (const card of playable) {
    if (card.kind === 'number') {
      const moves = getLegalMovesForDirection(state, activeIdx, card.value ?? 1, 'forward');
      for (const m of moves) {
        let score = 20 + (card.value ?? 1) * 3;
        if (m.kind === 'finish') score += 140;
        if (m.capturesTokenIds.length > 0) score += 110;
        if (m.kind === 'enter_home') score += 80;
        if (m.landsOnSafe && m.kind === 'track') score += 22;
        score += Math.max(0, m.targetLapProgress) * 0.45;
        if (!bestChoice || score > bestChoice.score) {
          bestChoice = { type: 'play_number', cardId: card.id, move: m, score };
        }
      }
    } else {
      let score = 48;
      if (card.kind === 'minus4') score = 74;
      else if (card.kind === 'minus2') score = 66;
      else if (card.kind === 'swap') score = 62;
      else if (card.kind === 'skip') score = 55;
      else if (card.kind === 'reverse') score = 52;
      if (!bestChoice || score > bestChoice.score) {
        bestChoice = { type: 'play_action', cardId: card.id, score };
      }
    }
  }

  if (!bestChoice) return { type: 'draw_pass' };
  if (bestChoice.type === 'play_action') {
    return { type: 'play_action', cardId: bestChoice.cardId };
  }
  return { type: 'play_number', cardId: bestChoice.cardId, move: bestChoice.move };
}

/**
 * Pick the victim's most advanced pawn when a CPU player chooses a knockback target.
 */
export function chooseBestUnoKnockbackTarget(state: GameState): MoveOption | null {
  const pending = state.unoState?.pendingKnockback;
  if (!pending) return null;
  const targets = getUnoKnockbackMoves(state, pending.victimPlayerId, pending.totalSteps);
  if (targets.length === 0) return null;

  const victim = state.players.find((p) => p.id === pending.victimPlayerId);
  if (!victim) return targets[0];
  const tokenById = new Map(victim.tokens.map((t) => [t.id, t]));

  return [...targets].sort((a, b) => {
    const ta = tokenById.get(a.tokenId);
    const tb = tokenById.get(b.tokenId);
    const scoreA = (ta?.zone === 'home_stretch' ? 1000 + (ta.homeIndex ?? 0) : ta?.lapProgress ?? 0);
    const scoreB = (tb?.zone === 'home_stretch' ? 1000 + (tb.homeIndex ?? 0) : tb?.lapProgress ?? 0);
    return scoreB - scoreA;
  })[0];
}
