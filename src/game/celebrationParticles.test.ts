import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCelebrationPalette,
  createCelebrationEngine,
  emitCannonBurst,
  emitFireworkBurst,
  stepCelebrationEngine,
  triggerOpeningVictoryVolley,
} from './celebrationParticles';

function seededRng(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

test('opening victory volley launches corner cannons and center firework burst with winner color', () => {
  const rng = seededRng(7);
  const engine = createCelebrationEngine('#2563EB', 300);
  triggerOpeningVictoryVolley(engine, 1440, 900, rng);

  assert.ok(engine.particles.length >= 120, 'expected abundant opening celebration particles');
  assert.ok(
    engine.particles.some((p) => p.kind === 'ribbon'),
    'expected confetti ribbon particles'
  );
  assert.ok(
    engine.particles.some((p) => p.kind === 'sparkle'),
    'expected twinkling sparkle particles'
  );
  assert.ok(
    engine.particles.some((p) => p.kind === 'ring'),
    'expected expanding firework shockwave rings'
  );
  assert.ok(
    engine.particles.some((p) => p.color === '#2563EB'),
    'expected winner signature color mixed into celebratory particles'
  );
});

test('particle physics advances positions, expands rings, respects maxParticles cap, and cleans up expired particles', () => {
  const rng = seededRng(99);
  const engine = createCelebrationEngine('#DC2626', 80);
  emitCannonBurst(engine, 60, 820, -1.1, 0.5, 60, 1, rng);
  emitFireworkBurst(engine, 720, 400, 45, rng);

  assert.ok(engine.particles.length <= 80, 'particle count must never exceed maxParticles cap');

  const sampleRing = engine.particles.find((p) => p.kind === 'ring');
  assert.ok(sampleRing, 'expected ring particle');
  const initialRingSize = sampleRing.size;

  // Advance 10 frames (160ms)
  for (let i = 0; i < 10; i++) {
    stepCelebrationEngine(engine, 16, 1440, 900, true, rng);
  }
  assert.ok(sampleRing.size > initialRingSize, 'shockwave ring must expand over time');
  assert.ok(engine.particles.length <= 80, 'particle cap holds under continuous emitters');

  // Turn off continuous emitters and advance far enough for all particles to expire
  for (let i = 0; i < 160; i++) {
    stepCelebrationEngine(engine, 50, 1440, 900, false, rng);
  }
  assert.equal(engine.particles.length, 0, 'all finite-TTL particles must clean up cleanly');
});

test('buildCelebrationPalette includes Mango Gold accents and optional winner color', () => {
  const withWinner = buildCelebrationPalette('#16A34A');
  assert.equal(withWinner[0], '#16A34A');
  assert.ok(withWinner.includes('#FDE047'));
});
