import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBoardGeometry,
  buildCaptureReturnPath,
  getPlayerArmAssignments,
} from './boardGeometry';
import {
  applyDiceRoll,
  chooseBestBotMove,
  clampCrazyTimerMinutes,
  COMEBACK_YARD_MERCY_CHANCES,
  commitMove,
  computePlayerProgress,
  CRAZY_TIMER_DEFAULT_MINUTES,
  CRAZY_TIMER_MAX_MINUTES,
  CRAZY_TIMER_MIN_MINUTES,
  createDefaultPlayers,
  createInitialGameState,
  getAllLegalMoves,
  getAutoMoveIfForced,
  getLegalMovesForDirection,
  isRingSquareSafe,
  MAX_FIRE_STREAK_ROLLS,
  resolveCrazyStarChaos,
  resolveCrazyTimerExpiration,
  rollSmartDie,
  YARD_MERCY_CHANCES,
} from './engine';
import {
  acceptUnoKnockback,
  canPlayUnoCard,
  commitUnoKnockbackMove,
  commitUnoNumberMove,
  doesUnoCardCapture,
  getUnoKnockbackMoves,
  playUnoActionCard,
  selectUnoNumberCard,
  UNO_HAND_SIZE,
} from './unoEngine';
import { soundFx } from './sound';
import type { GameConfig, GameState, UnoCard } from './types';

function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  const playerCount = overrides.playerCount ?? 4;
  return {
    playerCount,
    mode: overrides.mode ?? 'classic',
    tokensPerPlayer: overrides.tokensPerPlayer ?? 4,
    themeId: overrides.themeId ?? 'walnut',
    players: overrides.players ?? createDefaultPlayers(playerCount),
    crazyTimerMinutes: overrides.crazyTimerMinutes,
  };
}

test('board geometry builds cleanly without NaN or overlapping cells for 2 through 10 players', () => {
  for (let n = 2; n <= 10; n++) {
    const geom = buildBoardGeometry(n);
    const expectedArms = Math.max(4, n);
    assert.equal(geom.armCount, expectedArms);
    assert.equal(geom.trackCells.length, geom.ringLength);
    assert.equal(geom.yards.length, expectedArms);
    assert.equal(geom.finishWedges.length, expectedArms);
    assert.equal(geom.startIndices.length, expectedArms);
    assert.equal(geom.safeIndices.size, expectedArms * 2);

    // Every cell center and corner is finite and inside the 1000x1000 viewBox
    for (const cell of geom.trackCells) {
      assert.ok(Number.isFinite(cell.center.x) && Number.isFinite(cell.center.y));
      assert.ok(cell.center.x > 0 && cell.center.x < 1000);
      assert.ok(cell.center.y > 0 && cell.center.y < 1000);
    }

    // No two distinct track cells share the same center (overlap check)
    for (let i = 0; i < geom.trackCells.length; i++) {
      for (let j = i + 1; j < geom.trackCells.length; j++) {
        const a = geom.trackCells[i].center;
        const b = geom.trackCells[j].center;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        assert.ok(
          dist > geom.cellSize * 0.72,
          `Cells ${i} and ${j} overlap on ${n}-player board (dist=${dist}, cellSize=${geom.cellSize})`
        );
      }
    }

    // Balanced arm assignments
    const arms = getPlayerArmAssignments(n);
    assert.equal(arms.length, n);
    assert.equal(new Set(arms).size, n);
  }
});

test('classic mode deploys token on 6 and grants a bonus roll', () => {
  const state = createInitialGameState(makeConfig({ playerCount: 4, mode: 'classic' }));
  const roll3 = applyDiceRoll(state, 3);
  assert.equal(roll3.noMoves, true);
  assert.equal(roll3.nextState.activePlayerIndex, 1);

  const roll6 = applyDiceRoll(state, 6);
  assert.equal(roll6.noMoves, false);
  assert.equal(roll6.legalForwardCount, 4);
  assert.equal(roll6.legalBackwardCount, 0);

  const moves = getLegalMovesForDirection(roll6.nextState, 0, 6, 'forward');
  assert.equal(moves.length, 4);
  assert.equal(moves[0].kind, 'deploy');

  const result = commitMove(roll6.nextState, moves[0]);
  assert.equal(result.bonusTurn, true);
  assert.equal(result.nextState.activePlayerIndex, 0);
  assert.equal(result.nextState.players[0].tokens[0].zone, 'track');
  assert.equal(result.nextState.players[0].tokens[0].lapProgress, 0);
});

test('triple consecutive 6s forfeits turn to next player', () => {
  let state = createInitialGameState(makeConfig({ playerCount: 4, mode: 'classic' }));
  state = { ...state, consecutiveSixes: 2 };
  const rolled = applyDiceRoll(state, 6);
  assert.equal(rolled.forfeited, true);
  assert.equal(rolled.nextState.activePlayerIndex, 1);
  assert.equal(rolled.nextState.consecutiveSixes, 0);
});

test('flip-track mode allows backward movement, prevents 2-step home-entry exploit, and supports backward ambush captures', () => {
  const geom = buildBoardGeometry(6);
  let state = createInitialGameState(makeConfig({ playerCount: 6, mode: 'flip' }));
  const p0Start = geom.startIndices[0];

  // Put Player 0 token 0 on its start square (lapProgress = 0)
  // Put Player 1 token 0 on a non-safe square 3 steps BEHIND Player 0's start square
  const targetBehind = (p0Start - 3 + geom.ringLength) % geom.ringLength;
  assert.equal(geom.safeIndices.has(targetBehind), false, 'targetBehind should not be a safe tile');

  state = {
    ...state,
    players: state.players.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: p0Start, lapProgress: 0 } : t
          ),
        };
      }
      if (idx === 1) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: targetBehind, lapProgress: 10 } : t
          ),
        };
      }
      return p;
    }),
  };

  // Roll 3 in Flip-Track mode: Forward goes +3, Backward goes -3 (passes homeEntry at -2 WITHOUT entering home, and captures Player 1!)
  const rolled = applyDiceRoll(state, 3);
  assert.equal(rolled.legalForwardCount, 1);
  assert.equal(rolled.legalBackwardCount, 1);

  const { forward, backward } = getAllLegalMoves(rolled.nextState, 0, 3);
  assert.equal(forward[0].targetRingIndex, (p0Start + 3) % geom.ringLength);
  assert.equal(forward[0].targetLapProgress, 3);

  const backMove = backward[0];
  assert.equal(backMove.targetZone, 'track', 'Must NOT cheese-enter home stretch on -3 from start');
  assert.equal(backMove.targetRingIndex, targetBehind);
  assert.equal(backMove.targetLapProgress, -3);
  assert.deepEqual(backMove.capturesTokenIds, ['p1-t0']);

  const commit = commitMove(rolled.nextState, backMove);
  assert.equal(commit.bonusTurn, true, 'Capture grants bonus roll');
  assert.equal(commit.nextState.players[1].tokens[0].zone, 'yard', 'Captured token returns to yard');
  assert.equal(commit.nextState.players[0].captures, 1);
  assert.equal(commit.nextState.players[0].backwardMoves, 1);
});

test('safe square blocks captures in both forward and backward directions', () => {
  const geom = buildBoardGeometry(4);
  let state = createInitialGameState(makeConfig({ playerCount: 4, mode: 'flip' }));
  const p0Start = geom.startIndices[0];
  const safeStarOnArm0 = Array.from(geom.safeIndices).find(
    (idx) => !geom.startIndices.includes(idx) && geom.trackCells[idx].armIndex === 0
  )!;
  // Place Player 0 token 2 steps ahead of that safe star, Player 1 token ON the safe star
  const aheadOfStar = (safeStarOnArm0 + 2) % geom.ringLength;

  state = {
    ...state,
    players: state.players.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: aheadOfStar, lapProgress: 20 } : t
          ),
        };
      }
      if (idx === 1) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: safeStarOnArm0, lapProgress: 5 } : t
          ),
        };
      }
      return p;
    }),
  };

  assert.ok(p0Start >= 0);
  const backMoves = getLegalMovesForDirection(state, 0, 2, 'backward');
  assert.equal(backMoves.length, 1);
  assert.equal(backMoves[0].landsOnSafe, true);
  assert.equal(backMoves[0].capturesTokenIds.length, 0);
});

test('exact home finish triggers win condition and podium ranking in 10-player match', () => {
  const geom = buildBoardGeometry(10);
  let state: GameState = createInitialGameState(
    makeConfig({ playerCount: 10, mode: 'flip', tokensPerPlayer: 2 })
  );

  // Player 0 has token 0 already finished, token 1 two steps from center finish in home stretch
  state = {
    ...state,
    players: state.players.map((p, idx) => {
      if (idx !== 0) return p;
      return {
        ...p,
        tokens: [
          { ...p.tokens[0], zone: 'finished', homeIndex: geom.homeLength },
          { ...p.tokens[1], zone: 'home_stretch', homeIndex: geom.homeLength - 2 },
        ],
      };
    }),
  };

  // Rolling 3 overshoots forward, but in Flip-Track can step backward if >= 0
  const forwardOvershoot = getLegalMovesForDirection(state, 0, 3, 'forward');
  assert.equal(forwardOvershoot.length, 0);

  // Rolling 2 finishes exactly
  const rolled2 = applyDiceRoll(state, 2);
  const winMoves = getLegalMovesForDirection(rolled2.nextState, 0, 2, 'forward');
  assert.equal(winMoves.length, 1);
  assert.equal(winMoves[0].kind, 'finish');

  const commit = commitMove(rolled2.nextState, winMoves[0]);
  assert.equal(commit.playerJustFinished, true);
  assert.equal(commit.matchEnded, true);
  assert.equal(commit.nextState.finishedOrder[0], 0);
  assert.equal(commit.nextState.players[0].finishedRank, 1);
});

test('bot evaluator selects capturing backward move over ordinary forward move', () => {
  const geom = buildBoardGeometry(4);
  let state = createInitialGameState(makeConfig({ playerCount: 4, mode: 'flip' }));
  const p0Start = geom.startIndices[0];
  const behind = (p0Start - 4 + geom.ringLength) % geom.ringLength;

  state = {
    ...state,
    players: state.players.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          isBot: true,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: p0Start, lapProgress: 0 } : t
          ),
        };
      }
      if (idx === 1) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: behind, lapProgress: 12 } : t
          ),
        };
      }
      return p;
    }),
  };

  const best = chooseBestBotMove(state, 4);
  assert.ok(best);
  assert.equal(best.direction, 'backward');
  assert.deepEqual(best.capturesTokenIds, ['p1-t0']);
});

test('sound controller clamps volume within [0, 1] and tracks mute state', () => {
  soundFx.setVolume(0.45);
  assert.equal(soundFx.getVolume(), 0.45);
  soundFx.setVolume(1.5);
  assert.equal(soundFx.getVolume(), 1);
  soundFx.setVolume(-0.2);
  assert.equal(soundFx.getVolume(), 0);
  soundFx.setVolume(Number.NaN);
  assert.equal(soundFx.getVolume(), 0.8);
  soundFx.setMuted(true);
  assert.equal(soundFx.isMuted(), true);
  soundFx.setMuted(false);
  assert.equal(soundFx.isMuted(), false);
});

test('classic 4-arm board assigns exact corner seats and palettes for 2 to 4 players', () => {
  // 2-player: Bottom-Left Blue (arm 2, palette 3) vs Top-Right Green (arm 0, palette 1)
  const twoP = createInitialGameState(makeConfig({ playerCount: 2 }));
  assert.deepEqual(
    twoP.players.map((p) => ({ arm: p.armIndex, palette: p.paletteIndex })),
    [
      { arm: 2, palette: 3 },
      { arm: 0, palette: 1 },
    ]
  );

  // 4-player: Blue (arm 2) -> Red (arm 3) -> Green (arm 0) -> Yellow (arm 1)
  const fourP = createInitialGameState(makeConfig({ playerCount: 4 }));
  assert.deepEqual(
    fourP.players.map((p) => ({ arm: p.armIndex, palette: p.paletteIndex })),
    [
      { arm: 2, palette: 3 },
      { arm: 3, palette: 0 },
      { arm: 0, palette: 1 },
      { arm: 1, palette: 2 },
    ]
  );

  // 15x15 edge-to-edge geometry fills 0..1000 cleanly
  const geom4 = buildBoardGeometry(4);
  assert.equal(geom4.armCount, 4);
  assert.ok(Math.abs(geom4.cellSize - 1000 / 15) < 0.01);
});

test('stacking 2+ pieces creates a Safe Point while 2+ pieces share it and immediately reverts to normal once 1 piece remains alone', () => {
  const geom = buildBoardGeometry(4);
  // Pick a regular (non-star, non-start) track square
  let targetSq = (geom.startIndices[2] + 3) % geom.ringLength;
  while (geom.safeIndices.has(targetSq)) {
    targetSq = (targetSq + 1) % geom.ringLength;
  }
  const behindBy2 = (targetSq - 2 + geom.ringLength) % geom.ringLength;
  const aheadBy2 = (targetSq + 2) % geom.ringLength;

  let state: GameState = createInitialGameState(makeConfig({ playerCount: 4, mode: 'flip' }));
  // Place Player 0 token 0 on targetSq, token 1 two steps behind,
  // Player 1 token 0 two steps behind targetSq, Player 2 token 0 two steps ahead of targetSq.
  state = {
    ...state,
    activePlayerIndex: 0,
    players: state.players.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) => {
            if (ti === 0) return { ...t, zone: 'track', ringIndex: targetSq, lapProgress: 5 };
            if (ti === 1) return { ...t, zone: 'track', ringIndex: behindBy2, lapProgress: 3 };
            return t;
          }),
        };
      }
      if (idx === 1) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: behindBy2, lapProgress: 10 } : t
          ),
        };
      }
      if (idx === 2) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: aheadBy2, lapProgress: 15 } : t
          ),
        };
      }
      return p;
    }),
  };

  // Before stacking, square is NOT safe
  assert.equal(isRingSquareSafe(state, geom, targetSq), false);

  // Step 1: Player 0 moves token 1 forward by 2 onto targetSq -> now 2 pieces of Player 0 are on targetSq!
  const p0StackMove = getLegalMovesForDirection(state, 0, 2, 'forward').find(
    (m) => m.tokenId === 'p0-t1'
  );
  assert.ok(p0StackMove);
  assert.equal(p0StackMove.landsOnSafe, true);
  state = commitMove({ ...state, diceValue: 2 }, p0StackMove).nextState;

  // Square is now a Safe Point with 2 pieces
  assert.equal(isRingSquareSafe(state, geom, targetSq), true);

  // Step 1b (User screenshot scenario): If Player 0 moves 1 piece forward when NO other player is on targetSq,
  // only 1 lone piece remains -> MUST IMMEDIATELY revert to a normal square!
  const p0LeaveAlone = getLegalMovesForDirection(state, 0, 3, 'forward').find(
    (m) => m.tokenId === 'p0-t0'
  );
  assert.ok(p0LeaveAlone);
  const stateAlone = commitMove({ ...state, activePlayerIndex: 0, diceValue: 3 }, p0LeaveAlone).nextState;
  assert.equal(isRingSquareSafe(stateAlone, geom, targetSq), false);
  assert.equal(stateAlone.dynamicSafeRings?.[targetSq], undefined);
  // And an opponent can immediately capture that lone remaining piece!
  const p2CapturesLone = getLegalMovesForDirection(stateAlone, 2, 2, 'backward').find(
    (m) => m.tokenId === 'p2-t0'
  );
  assert.ok(p2CapturesLone);
  assert.deepEqual(p2CapturesLone.capturesTokenIds, ['p0-t1']);

  // Step 2 (Shared square scenario): From the 2-Blue-stacked state, Player 1 lands on targetSq -> NO capture!
  const p1Land = getLegalMovesForDirection(state, 1, 2, 'forward').find(
    (m) => m.tokenId === 'p1-t0'
  );
  assert.ok(p1Land);
  assert.equal(p1Land.capturesTokenIds.length, 0);
  assert.equal(p1Land.landsOnSafe, true);
  state = commitMove({ ...state, activePlayerIndex: 1, diceValue: 2 }, p1Land).nextState;

  // Step 3: Player 0 moves ONE piece (p0-t0) off targetSq, leaving p0-t1 AND p1-t0 sharing targetSq (2 pieces total)
  const p0LeaveOne = getLegalMovesForDirection(state, 0, 3, 'forward').find(
    (m) => m.tokenId === 'p0-t0'
  );
  assert.ok(p0LeaveOne);
  state = commitMove({ ...state, activePlayerIndex: 0, diceValue: 3 }, p0LeaveOne).nextState;

  // Square MUST STILL BE A SAFE POINT because 2 pieces (p0-t1 + p1-t0) share it!
  assert.equal(isRingSquareSafe(state, geom, targetSq), true);

  // Step 4: Player 2 moves BACKWARD by 2 onto targetSq while p0-t1 and p1-t0 sit there -> STILL NO CAPTURE!
  const p2BackLand = getLegalMovesForDirection(state, 2, 2, 'backward').find(
    (m) => m.tokenId === 'p2-t0'
  );
  assert.ok(p2BackLand);
  assert.equal(p2BackLand.capturesTokenIds.length, 0);
  assert.equal(p2BackLand.landsOnSafe, true);

  // Step 5: Once Player 1 leaves targetSq leaving only lone p0-t1 (1 piece total) -> IMMEDIATELY reverts to normal!
  const p1Leave = getLegalMovesForDirection(state, 1, 1, 'forward').find(
    (m) => m.tokenId === 'p1-t0'
  );
  assert.ok(p1Leave);
  const stateAfterP1Leaves = commitMove({ ...state, activePlayerIndex: 1, diceValue: 1 }, p1Leave).nextState;
  assert.equal(isRingSquareSafe(stateAfterP1Leaves, geom, targetSq), false);
  const p2VsLoneP0 = getLegalMovesForDirection(stateAfterP1Leaves, 2, 2, 'backward').find(
    (m) => m.tokenId === 'p2-t0'
  );
  assert.ok(p2VsLoneP0);
  assert.deepEqual(p2VsLoneP0.capturesTokenIds, ['p0-t1']);

  // Step 6: Or if Player 0 removes p0-t1 leaving lone p1-t0 -> IMMEDIATELY reverts to normal and Player 2 captures p1-t0!
  const p0LeaveLast = getLegalMovesForDirection(state, 0, 1, 'forward').find(
    (m) => m.tokenId === 'p0-t1'
  );
  assert.ok(p0LeaveLast);
  state = commitMove({ ...state, activePlayerIndex: 0, diceValue: 1 }, p0LeaveLast).nextState;
  assert.equal(isRingSquareSafe(state, geom, targetSq), false);
  assert.equal(state.dynamicSafeRings?.[targetSq], undefined);

  const p2CaptureNow = getLegalMovesForDirection(state, 2, 2, 'backward').find(
    (m) => m.tokenId === 'p2-t0'
  );
  assert.ok(p2CaptureNow);
  assert.deepEqual(p2CaptureNow.capturesTokenIds, ['p1-t0']);
});

test('buildCaptureReturnPath traces square-by-square around the track back to Start and Home Yard', () => {
  const geom4 = buildBoardGeometry(4);
  const arm = 2; // Bottom-Left Blue
  const startIdx = geom4.startIndices[arm];

  // Captured 10 squares clockwise past Start -> should crawl 10 track steps back to Start + 1 yard step
  const capturedForwardSq = (startIdx + 10) % geom4.ringLength;
  const fwdReturn = buildCaptureReturnPath(geom4, arm, 1, capturedForwardSq, 10);
  assert.equal(fwdReturn.length, 12); // start + 10 track steps + yard slot
  assert.deepEqual(fwdReturn[0], geom4.trackCells[capturedForwardSq].center);
  assert.deepEqual(fwdReturn[10], geom4.trackCells[startIdx].center);
  assert.deepEqual(fwdReturn[11], geom4.yards[arm].slots[1]);

  // Captured 6 squares counter-clockwise (Flip-Track backward) -> crawls clockwise 6 steps back to Start + yard
  const capturedBackwardSq = (startIdx - 6 + geom4.ringLength) % geom4.ringLength;
  const bwdReturn = buildCaptureReturnPath(geom4, arm, 0, capturedBackwardSq, -6);
  assert.equal(bwdReturn.length, 8); // start + 6 track steps + yard slot
  assert.deepEqual(bwdReturn[0], geom4.trackCells[capturedBackwardSq].center);
  assert.deepEqual(bwdReturn[6], geom4.trackCells[startIdx].center);
  assert.deepEqual(bwdReturn[7], geom4.yards[arm].slots[0]);

  // Also works cleanly on 10-player radial board
  const geom10 = buildBoardGeometry(10);
  const start10 = geom10.startIndices[4];
  const cap10 = (start10 + 15) % geom10.ringLength;
  const ret10 = buildCaptureReturnPath(geom10, 4, 2, cap10, 15);
  assert.equal(ret10.length, 17);
  assert.deepEqual(ret10[15], geom10.trackCells[start10].center);
  assert.deepEqual(ret10[16], geom10.yards[4].slots[2]);
});

test('10-roll Yard Mercy gives 10 random chances then guarantees a 6 on roll #11', () => {
  assert.equal(YARD_MERCY_CHANCES, 10);
  let state: GameState = createInitialGameState(makeConfig({ playerCount: 2, mode: 'flip' }));

  // Simulate 10 consecutive non-6 random rolls (rng returns 0.1 -> face 1)
  for (let i = 1; i <= YARD_MERCY_CHANCES; i++) {
    const res = rollSmartDie(state, () => 0.1);
    assert.equal(res.rolledValue, 1);
    assert.equal(res.reason, 'normal');
    assert.equal(res.nextDirector.yardStuckRolls[0], i);
    state = { ...state, diceDirector: res.nextDirector };
  }

  // On the very next roll after 10 misses, player is guaranteed a Mercy 6!
  const mercy = rollSmartDie(state, () => 0.1);
  assert.equal(mercy.rolledValue, 6);
  assert.equal(mercy.reason, 'mercy_six');
  assert.equal(mercy.nextDirector.yardStuckRolls[0], 0);
});

test('Smart Action Dice boosts capture frequency and limits On-Fire to 1 player for at most 6 rolls before returning to normal random mode', () => {
  const geom = buildBoardGeometry(4);
  let state: GameState = createInitialGameState(makeConfig({ playerCount: 4, mode: 'flip' }));
  // Place Player 0 token 0 three steps behind Player 1 token 0 on a non-safe square
  let victimSq = (geom.startIndices[2] + 6) % geom.ringLength;
  while (geom.safeIndices.has(victimSq)) {
    victimSq = (victimSq + 1) % geom.ringLength;
  }
  const hunterSq = (victimSq - 3 + geom.ringLength) % geom.ringLength;

  state = {
    ...state,
    activePlayerIndex: 0,
    diceDirector: {
      yardStuckRolls: {},
      firePlayerId: null,
      fireRemaining: 0,
      fireCooldownTurns: 99, // keep in normal mode to measure capture boost cleanly
    },
    players: state.players.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: hunterSq, lapProgress: 3 } : t
          ),
        };
      }
      if (idx === 1) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: victimSq, lapProgress: 10 } : t
          ),
        };
      }
      return p;
    }),
  };

  // Deterministic LCG PRNG across 600 samples -> face 3 (capture) should appear noticeably more often than 1/6 (~16.7%)
  let seed = 42;
  const prng = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  let captureHits = 0;
  for (let i = 0; i < 600; i++) {
    const res = rollSmartDie(state, prng);
    if (res.rolledValue === 3) captureHits++;
  }
  assert.ok(captureHits > 150, `Expected boosted capture rolls > 150/600, got ${captureHits}`);

  // Single-Player On-Fire lifecycle: ignite on Player 0 when cooldown is 0
  let fireState: GameState = {
    ...state,
    diceDirector: {
      yardStuckRolls: {},
      firePlayerId: null,
      fireRemaining: 0,
      fireCooldownTurns: 0,
    },
  };
  // First rng call (< 0.14) ignites fire, second rng call (0.99) picks MAX_FIRE_STREAK_ROLLS (6)
  const seq = [0.05, 0.99, 0.5];
  let seqIdx = 0;
  const firstFire = rollSmartDie(fireState, () => seq[seqIdx++] ?? 0.5);
  assert.equal(firstFire.fireJustIgnited, true);
  assert.equal(firstFire.ignitedPlayerId, 0);
  assert.equal(firstFire.ignitedCharges, MAX_FIRE_STREAK_ROLLS);
  assert.equal(firstFire.nextDirector.firePlayerId, 0);
  assert.equal(firstFire.nextDirector.fireRemaining, MAX_FIRE_STREAK_ROLLS - 1);

  // While Player 0 is On Fire, Player 1 rolling must NOT steal or ignite a second simultaneous fire!
  const p1Turn = rollSmartDie(
    { ...fireState, activePlayerIndex: 1, diceDirector: firstFire.nextDirector },
    () => 0.01
  );
  assert.equal(p1Turn.fireJustIgnited, false);
  assert.equal(p1Turn.nextDirector.firePlayerId, 0);
  assert.equal(p1Turn.nextDirector.fireRemaining, MAX_FIRE_STREAK_ROLLS - 1);

  // Drain Player 0's remaining 5 fire rolls -> after 6th total fire roll, returns cleanly to normal random mode!
  let curDir = firstFire.nextDirector;
  for (let r = 2; r <= MAX_FIRE_STREAK_ROLLS; r++) {
    const step = rollSmartDie({ ...fireState, diceDirector: curDir }, () => 0.5);
    assert.equal(step.reason, 'fire_streak');
    curDir = step.nextDirector;
    if (r < MAX_FIRE_STREAK_ROLLS) {
      assert.equal(step.fireJustEnded, false);
      assert.equal(curDir.firePlayerId, 0);
    } else {
      assert.equal(step.fireJustEnded, true);
      assert.equal(curDir.firePlayerId, null);
      assert.equal(curDir.fireRemaining, 0);
      assert.ok(curDir.fireCooldownTurns >= 8);
    }
  }
});

test('getAutoMoveIfForced auto-moves in Classic mode, and in Flip-Track mode ONLY auto-deploys from Home Yard', () => {
  const geom = buildBoardGeometry(4);
  const p0Start = geom.startIndices[2]; // Player 0 on 4-arm board is arm 2 (Blue)
  const stackedSq = (p0Start + 5) % geom.ringLength;

  // --- CLASSIC MODE ---
  const classicYard = createInitialGameState(makeConfig({ playerCount: 4, mode: 'classic' }));
  // 1) All 4 pieces in Home Yard + rolled 6 -> auto-deploys!
  const classicYardRoll6 = applyDiceRoll(classicYard, 6).nextState;
  const autoClassicYard = getAutoMoveIfForced(classicYardRoll6);
  assert.ok(autoClassicYard);
  assert.equal(autoClassicYard.kind, 'deploy');

  // 2) Only 1 piece out on track + rolled 3 -> auto-moves that lone piece!
  const classicOneOut: GameState = {
    ...classicYard,
    players: classicYard.players.map((p, idx) =>
      idx === 0
        ? {
            ...p,
            tokens: p.tokens.map((t, ti) =>
              ti === 0 ? { ...t, zone: 'track', ringIndex: p0Start, lapProgress: 0 } : t
            ),
          }
        : p
    ),
  };
  const classicOneOutRoll3 = applyDiceRoll(classicOneOut, 3).nextState;
  const autoClassicOne = getAutoMoveIfForced(classicOneOutRoll3);
  assert.ok(autoClassicOne);
  assert.equal(autoClassicOne.tokenId, 'p0-t0');

  // 3) 1 piece out + 3 in Yard + rolled 6 -> real choice (Deploy vs Move out) -> null!
  const classicOneOutRoll6 = applyDiceRoll(classicOneOut, 6).nextState;
  assert.equal(getAutoMoveIfForced(classicOneOutRoll6), null);

  // 4) 2 pieces stacked on the EXACT same square + rolled 4 -> auto-moves!
  const classicStacked: GameState = {
    ...classicYard,
    players: classicYard.players.map((p, idx) =>
      idx === 0
        ? {
            ...p,
            tokens: p.tokens.map((t, ti) =>
              ti <= 1 ? { ...t, zone: 'track', ringIndex: stackedSq, lapProgress: 5 } : t
            ),
          }
        : p
    ),
  };
  const classicStackedRoll4 = applyDiceRoll(classicStacked, 4).nextState;
  const autoClassicStacked = getAutoMoveIfForced(classicStackedRoll4);
  assert.ok(autoClassicStacked);
  assert.equal(autoClassicStacked.targetRingIndex, (stackedSq + 4) % geom.ringLength);

  // 5) 2 pieces on DIFFERENT squares + rolled 4 -> real choice -> null!
  const classicSplit: GameState = {
    ...classicYard,
    players: classicYard.players.map((p, idx) =>
      idx === 0
        ? {
            ...p,
            tokens: p.tokens.map((t, ti) => {
              if (ti === 0) return { ...t, zone: 'track', ringIndex: p0Start, lapProgress: 0 };
              if (ti === 1) return { ...t, zone: 'track', ringIndex: stackedSq, lapProgress: 5 };
              return t;
            }),
          }
        : p
    ),
  };
  assert.equal(getAutoMoveIfForced(applyDiceRoll(classicSplit, 4).nextState), null);

  // --- FLIP-TRACK (FORWARD/BACKWARD) MODE ---
  const flipYard = createInitialGameState(makeConfig({ playerCount: 4, mode: 'flip' }));
  // 6) All 4 pieces in Home Yard + rolled 6 -> NO backward option from yard -> auto-deploys!
  const autoFlipYard = getAutoMoveIfForced(applyDiceRoll(flipYard, 6).nextState);
  assert.ok(autoFlipYard);
  assert.equal(autoFlipYard.kind, 'deploy');

  // 7) 1 piece out on track + rolled 3 -> player can choose Forward or Backward -> MUST NOT auto-move!
  const flipOneOut: GameState = {
    ...flipYard,
    players: flipYard.players.map((p, idx) =>
      idx === 0
        ? {
            ...p,
            tokens: p.tokens.map((t, ti) =>
              ti === 0 ? { ...t, zone: 'track', ringIndex: p0Start, lapProgress: 0 } : t
            ),
          }
        : p
    ),
  };
  assert.equal(getAutoMoveIfForced(applyDiceRoll(flipOneOut, 3).nextState), null);

  // 8) 2 pieces stacked on same square in Flip-Track + rolled 4 -> player can choose Forward or Backward -> MUST NOT auto-move!
  const flipStacked: GameState = {
    ...flipYard,
    players: flipYard.players.map((p, idx) =>
      idx === 0
        ? {
            ...p,
            tokens: p.tokens.map((t, ti) =>
              ti <= 1 ? { ...t, zone: 'track', ringIndex: stackedSq, lapProgress: 5 } : t
            ),
          }
        : p
    ),
  };
  assert.equal(getAutoMoveIfForced(applyDiceRoll(flipStacked, 4).nextState), null);
});

test('Crazy Mode guarantees exact capture roll when rival is 1-6 steps ahead, boosts 6s, disables triple-6 forfeit, and arms Revenge 6', () => {
  const geom = buildBoardGeometry(4);
  let state: GameState = createInitialGameState(makeConfig({ playerCount: 4, mode: 'crazy' }));

  // 1) Boosted 6 frequency while in Home Yard across 300 deterministic samples (>28% vs classic 16.7%)
  let seed = 7;
  const prng = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  let sixCount = 0;
  for (let i = 0; i < 300; i++) {
    const r = rollSmartDie(state, prng);
    if (r.rolledValue === 6) sixCount += 1;
  }
  assert.ok(sixCount > 85, `Expected Crazy Mode boosted 6s > 85/300, got ${sixCount}`);

  // 2) Guaranteed Capture Snipe: place P1 piece 4 squares in front of P0 piece on non-safe square
  let targetSq = (geom.startIndices[state.players[0].armIndex] + 7) % geom.ringLength;
  while (geom.safeIndices.has(targetSq)) {
    targetSq = (targetSq + 1) % geom.ringLength;
  }
  const hunterSq = (targetSq - 4 + geom.ringLength) % geom.ringLength;

  state = {
    ...state,
    activePlayerIndex: 0,
    players: state.players.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: hunterSq, lapProgress: 3 } : t
          ),
        };
      }
      if (idx === 1) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: targetSq, lapProgress: 10 } : t
          ),
        };
      }
      return p;
    }),
  };

  // Every RNG value must produce exact snipe roll 4!
  for (const rVal of [0.01, 0.25, 0.5, 0.75, 0.99]) {
    const snipe = rollSmartDie(state, () => rVal);
    assert.equal(snipe.rolledValue, 4);
    assert.equal(snipe.reason, 'crazy_snipe');
  }

  // 3) Executing that capture arms Revenge 6 for victim Player 1!
  const rolled = applyDiceRoll(state, 4).nextState;
  const captureMove = getLegalMovesForDirection(rolled, 0, 4, 'forward').find(
    (m) => m.capturesTokenIds.includes('p1-t0')
  );
  assert.ok(captureMove);
  const afterCap = commitMove(rolled, captureMove).nextState;
  assert.equal(afterCap.crazyRevengeCharges?.[1], true);

  // Victim Player 1's next roll is guaranteed 6 (Revenge 6)!
  const revengeRoll = rollSmartDie({ ...afterCap, activePlayerIndex: 1 }, () => 0.1);
  assert.equal(revengeRoll.rolledValue, 6);
  assert.equal(revengeRoll.reason, 'crazy_revenge_six');
  assert.equal(revengeRoll.consumedRevengeCharge, true);

  // 4) Strict Double Six Limit (max 2 consecutive 6s per player) in Crazy Mode!
  const crazyFresh = createInitialGameState(makeConfig({ playerCount: 4, mode: 'crazy' }));
  // 1st six -> deploys & grants bonus roll (consecutiveSixes = 1)
  const firstSixRoll = applyDiceRoll(crazyFresh, 6);
  assert.equal(firstSixRoll.forfeited, false);
  assert.equal(firstSixRoll.nextState.consecutiveSixes, 1);
  const deployMove1 = getLegalMovesForDirection(firstSixRoll.nextState, 0, 6, 'forward')[0];
  const afterFirstSix = commitMove(firstSixRoll.nextState, deployMove1);
  assert.equal(afterFirstSix.bonusTurn, true);
  assert.equal(afterFirstSix.nextState.activePlayerIndex, 0);
  assert.equal(afterFirstSix.nextState.consecutiveSixes, 1);

  // 2nd six -> legal move, STILL grants bonus roll to the same player (consecutiveSixes = 2),
  // and the follow-up roll is strictly prevented from landing on 6 (always 1..5)!
  const secondSixRoll = applyDiceRoll(afterFirstSix.nextState, 6);
  assert.equal(secondSixRoll.forfeited, false);
  assert.equal(secondSixRoll.nextState.consecutiveSixes, 2);
  const deployMove2 = getLegalMovesForDirection(secondSixRoll.nextState, 0, 6, 'forward').find(
    (m) => m.kind === 'deploy'
  );
  assert.ok(deployMove2);
  const afterSecondSix = commitMove(secondSixRoll.nextState, deployMove2);
  assert.equal(afterSecondSix.bonusTurn, true);
  assert.equal(afterSecondSix.nextState.activePlayerIndex, 0);
  assert.equal(afterSecondSix.nextState.consecutiveSixes, 2);

  // Follow-up bonus roll after Double 6: rollSmartDie must NEVER land on 6 (always 1..5),
  // even across edge rng values (0..0.9999999) or when Revenge 6 is armed!
  const withRevengeAtDoubleSix: GameState = {
    ...afterSecondSix.nextState,
    crazyRevengeCharges: { ...(afterSecondSix.nextState.crazyRevengeCharges ?? {}), 0: true },
  };
  for (const rVal of [0, 0.01, 0.2, 0.5, 0.85, 0.99, 0.9999999]) {
    const smartAtCap = rollSmartDie(withRevengeAtDoubleSix, () => rVal);
    assert.ok(
      smartAtCap.rolledValue >= 1 && smartAtCap.rolledValue <= 5,
      `Expected 1..5 after Double 6, got ${smartAtCap.rolledValue}`
    );
  }

  // Rolling that 1..5 follow-up lets Player 0 move and then cleanly finishes their turn
  const followUpSmart = rollSmartDie(afterSecondSix.nextState, () => 0.99);
  assert.ok(followUpSmart.rolledValue >= 1 && followUpSmart.rolledValue <= 5);
  const followUpRoll = applyDiceRoll(afterSecondSix.nextState, followUpSmart.rolledValue);
  assert.equal(followUpRoll.forfeited, false);
  assert.equal(followUpRoll.nextState.consecutiveSixes, 0);
  const followUpMove = getLegalMovesForDirection(
    followUpRoll.nextState,
    0,
    followUpSmart.rolledValue,
    'forward'
  )[0];
  assert.ok(followUpMove);
  const afterFollowUp = commitMove(followUpRoll.nextState, followUpMove);
  assert.equal(afterFollowUp.nextState.activePlayerIndex, 1);

  // Guard: if applyDiceRoll ever receives a forced 3rd six directly, it still forfeits cleanly
  const thirdSix = applyDiceRoll(afterSecondSix.nextState, 6);
  assert.equal(thirdSix.forfeited, true);
  assert.equal(thirdSix.nextState.activePlayerIndex, 1);

  // 5) Crazy Star Chaos event triggers on Safe Star landing (Turbo +2 / Bonus Roll)
  const starCell = geom.trackCells.find((c) => c.isSafeStar);
  assert.ok(starCell);
  const onStarState: GameState = {
    ...state,
    activePlayerIndex: 1,
    players: state.players.map((p, idx) =>
      idx === 0
        ? {
            ...p,
            tokens: p.tokens.map((t, ti) =>
              ti === 0 ? { ...t, zone: 'track', ringIndex: starCell.index, lapProgress: 8 } : t
            ),
          }
        : p
    ),
  };
  const turboChaos = resolveCrazyStarChaos(onStarState, 0, 'p0-t0', () => 0.1);
  assert.ok(turboChaos);
  assert.equal(turboChaos.kind, 'turbo_boost');
  assert.equal(
    turboChaos.nextState.players[0].tokens[0].ringIndex,
    (starCell.index + 2) % geom.ringLength
  );
});

test('UNO Ludo starts all pawns on Start Squares with 6-card hands and refills automatically when hand empties', () => {
  const geom = buildBoardGeometry(4);
  const state = createInitialGameState(makeConfig({ playerCount: 4, mode: 'uno' }), () => 0.2);

  assert.equal(state.phase, 'choosing_card');
  assert.ok(state.unoState);

  for (const player of state.players) {
    const startIdx = geom.startIndices[player.armIndex];
    assert.equal(state.unoState.hands[player.id].length, UNO_HAND_SIZE);
    for (const tok of player.tokens) {
      assert.equal(tok.zone, 'track');
      assert.equal(tok.ringIndex, startIdx);
      assert.equal(tok.lapProgress, 0);
    }
  }

  // Give Player 0 exactly 1 card left (number 3) -> playing it empties hand and auto-refills 6 new cards!
  const lastCard: UnoCard = { id: 'last-3', kind: 'number', value: 3, color: 'blue' };
  const oneCardState: GameState = {
    ...state,
    unoState: {
      ...state.unoState,
      hands: {
        ...state.unoState.hands,
        0: [lastCard],
      },
    },
  };

  const selected = selectUnoNumberCard(oneCardState, 'last-3');
  assert.equal(selected.phase, 'choosing_move');
  assert.equal(selected.diceValue, 3);

  const moves = getLegalMovesForDirection(selected, 0, 3, 'forward');
  assert.ok(moves.length > 0);
  const committed = commitUnoNumberMove(selected, moves[0], () => 0.35);
  assert.equal(committed.refilled, true);
  assert.equal(committed.nextState.unoState?.hands[0].length, UNO_HAND_SIZE);
  assert.equal(committed.nextState.unoState?.discardTop?.id, 'last-3');
  assert.equal(committed.nextState.phase, 'choosing_card');
});

test('UNO Ludo Reverse flips turn order, Skip skips next player, and -2/-4 stacking rules enforce -4 on -2 but forbid -2 on -4', () => {
  const geom = buildBoardGeometry(4);
  let state = createInitialGameState(makeConfig({ playerCount: 4, mode: 'uno' }), () => 0.3);

  // Inject deterministic hands for all 4 players
  const p0Rev: UnoCard = { id: 'p0-rev', kind: 'reverse', color: 'green' };
  const p0M2: UnoCard = { id: 'p0-m2', kind: 'minus2', color: 'red' };
  const p3Skip: UnoCard = { id: 'p3-skip', kind: 'skip', color: 'blue' };
  const p1M2: UnoCard = { id: 'p1-m2', kind: 'minus2', color: 'yellow' };
  const p1M4: UnoCard = { id: 'p1-m4', kind: 'minus4', color: 'wild' };
  const p2M2: UnoCard = { id: 'p2-m2', kind: 'minus2', color: 'blue' };
  const p2M4: UnoCard = { id: 'p2-m4', kind: 'minus4', color: 'wild' };
  const p3Num: UnoCard = { id: 'p3-n2', kind: 'number', value: 2, color: 'green' };

  state = {
    ...state,
    unoState: {
      ...state.unoState!,
      hands: {
        0: [p0Rev, p0M2],
        1: [p1M2, p1M4],
        2: [p2M2, p2M4],
        3: [p3Skip, p3Num],
      },
    },
  };

  // 1) Player 0 plays Reverse -> turnDirection becomes -1, next player is Player 3!
  const afterRev = playUnoActionCard(state, 'p0-rev');
  assert.ok(afterRev);
  assert.equal(afterRev.nextState.turnDirection, -1);
  assert.equal(afterRev.nextState.activePlayerIndex, 3);

  // 2) Player 3 plays Skip (going CCW: skips Player 2 -> Player 1's turn!)
  const afterSkip = playUnoActionCard(afterRev.nextState, 'p3-skip');
  assert.ok(afterSkip);
  assert.equal(afterSkip.nextState.activePlayerIndex, 1);

  // 3) Reset direction CW and test full -2 -> -2 -> -4 stacking chain & -2 blocked on -4!
  let stackState: GameState = {
    ...state,
    turnDirection: 1,
    activePlayerIndex: 0,
  };

  // P0 plays -2 -> stack is -2 targeting P1, chooser is P0
  const s1 = playUnoActionCard(stackState, 'p0-m2')!.nextState;
  assert.equal(s1.activePlayerIndex, 1);
  assert.equal(s1.unoState?.pendingKnockback?.totalSteps, 2);
  assert.equal(s1.unoState?.pendingKnockback?.lastCardKind, 'minus2');
  assert.equal(s1.unoState?.pendingKnockback?.chooserPlayerId, 0);
  // P1 CAN stack -2 OR -4 on -2!
  assert.equal(canPlayUnoCard(s1, 1, p1M2), true);
  assert.equal(canPlayUnoCard(s1, 1, p1M4), true);

  // P1 stacks -2 on -2 -> stack is -4 targeting P2, chooser becomes P1!
  const s2 = playUnoActionCard(s1, 'p1-m2')!.nextState;
  assert.equal(s2.activePlayerIndex, 2);
  assert.equal(s2.unoState?.pendingKnockback?.totalSteps, 4);
  assert.equal(s2.unoState?.pendingKnockback?.stackCount, 2);
  assert.equal(s2.unoState?.pendingKnockback?.chooserPlayerId, 1);
  // P2 CAN stack -4 on -2!
  assert.equal(canPlayUnoCard(s2, 2, p2M4), true);

  // P2 stacks -4 on -2 -> stack is -8 targeting P3, chooser becomes P2!
  const s3 = playUnoActionCard(s2, 'p2-m4')!.nextState;
  assert.equal(s3.activePlayerIndex, 3);
  assert.equal(s3.unoState?.pendingKnockback?.totalSteps, 8);
  assert.equal(s3.unoState?.pendingKnockback?.lastCardKind, 'minus4');
  assert.equal(s3.unoState?.pendingKnockback?.chooserPlayerId, 2);

  // CRITICAL RULE: P3 CANNOT stack -2 on -4, CAN stack -4 on -4!
  const testM2: UnoCard = { id: 'p3-m2', kind: 'minus2', color: 'red' };
  const testM4: UnoCard = { id: 'p3-m4', kind: 'minus4', color: 'wild' };
  assert.equal(canPlayUnoCard(s3, 3, testM2), false);
  assert.equal(canPlayUnoCard(s3, 3, testM4), true);
  assert.equal(canPlayUnoCard(s3, 3, p3Num), false);

  // 4) P3 accepts the -8 knockback -> preceding player (P2) gets to choose ANY of P3's pawns
  //    AND even though all of P3's pawns are on P3's Start Square (lapProgress 0), they move -8 BACKWARDS!
  const choosingTarget = acceptUnoKnockback(s3);
  assert.equal(choosingTarget.phase, 'choosing_knockback_target');
  const kbMoves = getUnoKnockbackMoves(choosingTarget, 3, 8);
  assert.equal(kbMoves.length, 4);

  const p3StartIdx = geom.startIndices[choosingTarget.players[3].armIndex];
  const expectedRing = (p3StartIdx - 8 + geom.ringLength) % geom.ringLength;
  assert.equal(kbMoves[0].targetZone, 'track');
  assert.equal(kbMoves[0].targetRingIndex, expectedRing);
  assert.equal(kbMoves[0].targetLapProgress, -8);

  const afterKb = commitUnoKnockbackMove(choosingTarget, kbMoves[0]);
  assert.equal(afterKb.phase, 'choosing_card');
  assert.equal(afterKb.unoState?.pendingKnockback, null);
  assert.equal(afterKb.players[3].tokens[0].ringIndex, expectedRing);
  assert.equal(afterKb.players[3].tokens[0].lapProgress, -8);
  // Victim loses turn after taking the hit -> turn passes to P0!
  assert.equal(afterKb.activePlayerIndex, 0);
});

test('Classic & Flip-Track Comeback Mercy 6: max 5 rolls and +50% boosted 6 chance (25%) after getting captured back to Home Yard', () => {
  for (const mode of ['classic', 'flip'] as const) {
    const state = createInitialGameState(makeConfig({ playerCount: 4, mode }));

    // 1) Simulate Player 0 rolling 6 and deploying their first token via commitMove
    const rolledSix = applyDiceRoll(state, 6).nextState;
    const deployMove = getLegalMovesForDirection(rolledSix, 0, 6, 'forward')[0];
    assert.ok(deployMove && deployMove.kind === 'deploy');
    const afterDeploy = commitMove(rolledSix, deployMove).nextState;
    assert.equal(afterDeploy.diceDirector?.hasDeployedBefore?.[0], true);

    // 2) Now simulate Player 0 getting captured so ALL pieces are back in Home Yard again!
    const comebackState: GameState = {
      ...afterDeploy,
      activePlayerIndex: 0,
      phase: 'awaiting_roll',
      diceValue: null,
      players: afterDeploy.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              tokens: p.tokens.map((t) => ({
                ...t,
                zone: 'yard' as const,
                ringIndex: -1,
                lapProgress: 0,
                homeIndex: -1,
              })),
            }
          : p
      ),
    };

    // 3) Measure 6 probability over 400 independent Comeback Yard rolls -> should be ~25% (+50% over 16.67%)
    let seed = 1337;
    const prng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let comebackSixes = 0;
    for (let i = 0; i < 400; i++) {
      const sample = rollSmartDie(comebackState, prng);
      if (sample.rolledValue === 6) comebackSixes++;
    }
    assert.ok(
      comebackSixes >= 82 && comebackSixes <= 125,
      `Expected ~100/400 (25%) Comeback 6 rolls in ${mode}, got ${comebackSixes}`
    );

    // 4) Force 5 consecutive misses (rng=0.9 -> non-6 because 0.9 >= 0.25) -> roll #6 MUST be Comeback Mercy 6!
    assert.equal(COMEBACK_YARD_MERCY_CHANCES, 5);
    let stuckState = comebackState;
    for (let attempt = 1; attempt <= COMEBACK_YARD_MERCY_CHANCES; attempt++) {
      const res = rollSmartDie(stuckState, () => 0.9);
      assert.notEqual(res.rolledValue, 6);
      assert.equal(res.reason, 'normal');
      assert.equal(res.nextDirector.yardStuckRolls[0], attempt);
      stuckState = { ...stuckState, diceDirector: res.nextDirector };
    }

    const guaranteedComeback = rollSmartDie(stuckState, () => 0.9);
    assert.equal(guaranteedComeback.rolledValue, 6);
    assert.equal(guaranteedComeback.reason, 'comeback_mercy_six');
    assert.equal(guaranteedComeback.nextDirector.yardStuckRolls[0], 0);
  }
});

test('UNO Mode captures detect capturing cards, kick rival back to Start Square, track captures, and grant bonus card play', () => {
  const geom = buildBoardGeometry(4);
  let state = createInitialGameState(makeConfig({ playerCount: 4, mode: 'uno' }));

  const p0Start = geom.startIndices[state.players[0].armIndex];
  const p1Start = geom.startIndices[state.players[1].armIndex];

  // Find a non-safe square 4 steps ahead of P0's start square
  let targetRing = (p0Start + 4) % geom.ringLength;
  let hunterRing = p0Start;
  while (geom.safeIndices.has(targetRing)) {
    hunterRing = (hunterRing + 1) % geom.ringLength;
    targetRing = (hunterRing + 4) % geom.ringLength;
  }

  const card4: UnoCard = { id: 'uno-cap-4', kind: 'number', value: 4, color: 'red' };
  const card2: UnoCard = { id: 'uno-safe-2', kind: 'number', value: 2, color: 'blue' };
  const extraCard: UnoCard = { id: 'uno-extra', kind: 'number', value: 3, color: 'green' };

  state = {
    ...state,
    activePlayerIndex: 0,
    phase: 'choosing_card',
    players: state.players.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: hunterRing, lapProgress: 2 } : t
          ),
        };
      }
      if (idx === 1) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: targetRing, lapProgress: 12 } : t
          ),
        };
      }
      return p;
    }),
    unoState: {
      ...state.unoState!,
      hands: {
        ...state.unoState!.hands,
        0: [card4, card2, extraCard],
      },
    },
  };

  // doesUnoCardCapture must flag card4 (lands on unprotected rival) and NOT card2
  assert.equal(doesUnoCardCapture(state, 0, card4), true);
  assert.equal(doesUnoCardCapture(state, 0, card2), false);

  // Select card 4 and execute the capturing move!
  const selected = selectUnoNumberCard(state, card4.id);
  const moves = getLegalMovesForDirection(selected, 0, 4, 'forward');
  const captureMove = moves.find((m) => m.tokenId === 'p0-t0');
  assert.ok(captureMove);
  assert.deepEqual(captureMove.capturesTokenIds, ['p1-t0']);

  const committed = commitUnoNumberMove(selected, captureMove);
  assert.equal(committed.capturedNames.length, 1);
  assert.equal(committed.bonusTurn, true);
  // Active player stays Player 0 for bonus card play!
  assert.equal(committed.nextState.activePlayerIndex, 0);
  assert.equal(committed.nextState.phase, 'choosing_card');
  // Capture counters increment!
  assert.equal(committed.nextState.players[0].captures, 1);
  assert.equal(committed.nextState.totalCaptures, 1);
  // Captured rival pawn returns to its colored Start Square (zone: 'track', lapProgress: 0) in UNO mode!
  const victimPawn = committed.nextState.players[1].tokens[0];
  assert.equal(victimPawn.zone, 'track');
  assert.equal(victimPawn.ringIndex, p1Start);
  assert.equal(victimPawn.lapProgress, 0);
});

test('UNO Mode capture on a rival knocked backwards behind Start Square applies instant -6 squares punishment instead of returning forward to Start', () => {
  const geom = buildBoardGeometry(4);
  let state = createInitialGameState(makeConfig({ playerCount: 4, mode: 'uno' }));

  const p1Start = geom.startIndices[state.players[1].armIndex];
  // P1 pawn was pushed -4 squares behind P1's Start Square (ensure non-safe square)
  let backSteps = 4;
  let victimRing = ((p1Start - backSteps) % geom.ringLength + geom.ringLength) % geom.ringLength;
  while (geom.safeIndices.has(victimRing)) {
    backSteps += 1;
    victimRing = ((p1Start - backSteps) % geom.ringLength + geom.ringLength) % geom.ringLength;
  }
  const hunterRing = ((victimRing - 3) % geom.ringLength + geom.ringLength) % geom.ringLength;
  const expectedPenalizedRing = ((victimRing - 6) % geom.ringLength + geom.ringLength) % geom.ringLength;

  const card3: UnoCard = { id: 'uno-back-cap-3', kind: 'number', value: 3, color: 'red' };
  const extraCard: UnoCard = { id: 'uno-back-extra', kind: 'number', value: 2, color: 'green' };

  state = {
    ...state,
    activePlayerIndex: 0,
    phase: 'choosing_card',
    players: state.players.map((p, idx) => {
      if (idx === 0) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: hunterRing, lapProgress: 10 } : t
          ),
        };
      }
      if (idx === 1) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track', ringIndex: victimRing, lapProgress: -backSteps } : t
          ),
        };
      }
      return p;
    }),
    unoState: {
      ...state.unoState!,
      hands: {
        ...state.unoState!.hands,
        0: [card3, extraCard],
      },
    },
  };

  assert.equal(doesUnoCardCapture(state, 0, card3), true);
  const selected = selectUnoNumberCard(state, card3.id);
  const captureMove = getLegalMovesForDirection(selected, 0, 3, 'forward').find((m) =>
    m.capturesTokenIds.includes('p1-t0')
  );
  assert.ok(captureMove);

  const committed = commitUnoNumberMove(selected, captureMove);
  const victimPawn = committed.nextState.players[1].tokens[0];
  // Must move -6 MORE squares backwards instead of advancing forward to Start (lapProgress 0)!
  assert.equal(victimPawn.zone, 'track');
  assert.equal(victimPawn.ringIndex, expectedPenalizedRing);
  assert.equal(victimPawn.lapProgress, -(backSteps + 6));
  assert.equal(committed.bonusTurn, true);
  assert.equal(committed.nextState.activePlayerIndex, 0);
  assert.equal(committed.nextState.players[0].captures, 1);
  assert.match(committed.nextState.lastEvent?.message ?? '', /-6 squares punishment/i);

  // Capture crawl animation path must trace 6 squares counter-clockwise backwards to expectedPenalizedRing
  const animPath = buildCaptureReturnPath(
    geom,
    state.players[1].armIndex,
    0,
    victimRing,
    -backSteps,
    true
  );
  assert.equal(animPath.length, 7);
  assert.deepEqual(animPath[0], geom.trackCells[victimRing].center);
  assert.deepEqual(animPath[animPath.length - 1], geom.trackCells[expectedPenalizedRing].center);
});

test('Crazy Mode timer clamps to 10-30 min and ranks 1st, 2nd, 3rd, 4th by board progress when timer runs out', () => {
  // Clamping checks
  assert.equal(clampCrazyTimerMinutes(undefined), CRAZY_TIMER_DEFAULT_MINUTES);
  assert.equal(clampCrazyTimerMinutes(5), CRAZY_TIMER_MIN_MINUTES);
  assert.equal(clampCrazyTimerMinutes(99), CRAZY_TIMER_MAX_MINUTES);
  assert.equal(clampCrazyTimerMinutes(18.6), 19);

  // Classic mode does NOT get a Crazy timer
  const classicState = createInitialGameState(makeConfig({ mode: 'classic', crazyTimerMinutes: 20 }), Math.random, 10_000);
  assert.equal(classicState.crazyTimerEndsAt, null);

  // Crazy mode stamps crazyTimerEndsAt accurately
  const startMs = 1_000_000;
  const crazyState = createInitialGameState(
    makeConfig({ playerCount: 4, mode: 'crazy', crazyTimerMinutes: 12 }),
    Math.random,
    startMs
  );
  assert.equal(crazyState.crazyTimerEndsAt, startMs + 12 * 60_000);
  assert.equal(crazyState.endedByTimer, false);

  // Configure distinct progress levels across 4 players:
  // - P2: 1 finished token + 1 token in home stretch -> MUST be 1st!
  // - P0: 0 finished, 1 token at lapProgress 35 -> MUST be 2nd!
  // - P3: 0 finished, 1 token at lapProgress 20, 2 captures -> MUST beat P1 (same progress, 0 captures) -> 3rd!
  // - P1: 0 finished, 1 token at lapProgress 20, 0 captures -> MUST be 4th!
  const geom = buildBoardGeometry(4);
  const customState: GameState = {
    ...crazyState,
    players: crazyState.players.map((p, idx) => {
      if (idx === 2) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0
              ? { ...t, zone: 'finished' as const, ringIndex: -1, homeIndex: -1, lapProgress: geom.ringLength }
              : ti === 1
                ? { ...t, zone: 'home_stretch' as const, ringIndex: -1, homeIndex: 2, lapProgress: geom.ringLength }
                : t
          ),
        };
      }
      if (idx === 0) {
        return {
          ...p,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track' as const, ringIndex: 35, lapProgress: 35 } : t
          ),
        };
      }
      if (idx === 3) {
        return {
          ...p,
          captures: 2,
          tokens: p.tokens.map((t, ti) =>
            ti === 0 ? { ...t, zone: 'track' as const, ringIndex: 20, lapProgress: 20 } : t
          ),
        };
      }
      return {
        ...p,
        captures: 0,
        tokens: p.tokens.map((t, ti) =>
          ti === 0 ? { ...t, zone: 'track' as const, ringIndex: 20, lapProgress: 20 } : t
        ),
      };
    }),
  };

  // Sanity-check computePlayerProgress ordering
  const p2Prog = computePlayerProgress(customState, customState.players[2]);
  const p0Prog = computePlayerProgress(customState, customState.players[0]);
  const p3Prog = computePlayerProgress(customState, customState.players[3]);
  const p1Prog = computePlayerProgress(customState, customState.players[1]);
  assert.equal(p2Prog.finishedCount, 1);
  assert.ok(p2Prog.totalProgressSteps > p0Prog.totalProgressSteps);
  assert.ok(p0Prog.totalProgressSteps > p3Prog.totalProgressSteps);
  assert.equal(p3Prog.totalProgressSteps, p1Prog.totalProgressSteps);
  assert.ok(p2Prog.progressPct > p0Prog.progressPct && p0Prog.progressPct > p1Prog.progressPct);

  const expired = resolveCrazyTimerExpiration(customState);
  assert.equal(expired.phase, 'finished');
  assert.equal(expired.endedByTimer, true);
  assert.deepEqual(expired.finishedOrder, [2, 0, 3, 1]);
  assert.equal(expired.players[2].finishedRank, 1);
  assert.equal(expired.players[0].finishedRank, 2);
  assert.equal(expired.players[3].finishedRank, 3);
  assert.equal(expired.players[1].finishedRank, 4);
  assert.match(expired.lastEvent?.message ?? '', /Time's up/i);

  // Calling resolveCrazyTimerExpiration again is idempotent
  const secondCall = resolveCrazyTimerExpiration(expired);
  assert.deepEqual(secondCall.finishedOrder, [2, 0, 3, 1]);
});






