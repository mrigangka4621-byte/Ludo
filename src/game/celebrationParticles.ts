/**
 * Pure decoupled multi-emitter particle engine for Mango Ludo victory celebrations.
 * Drives tumbling 3D-projected confetti ribbons, twinkling 4-point sparkles,
 * curling streamers, and expanding firework shockwave rings at 60fps.
 */

export type CelebrationParticleKind = 'ribbon' | 'sparkle' | 'streamer' | 'ring';

export interface CelebrationParticle {
  id: number;
  kind: CelebrationParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  size: number;
  aspect: number;
  color: string;
  secondaryColor: string;
  rotation: number;
  rotationSpeed: number;
  flipPhase: number;
  flipSpeed: number;
  swayPhase: number;
  swayAmp: number;
  ageMs: number;
  ttlMs: number;
  alpha: number;
}

export interface CelebrationEngineState {
  particles: CelebrationParticle[];
  nextId: number;
  elapsedMs: number;
  showerAccumulatorMs: number;
  fireworkAccumulatorMs: number;
  palette: string[];
  maxParticles: number;
}

const DEFAULT_FESTIVE_COLORS = [
  '#FDE047', // Mango Gold
  '#FACC15', // Royal Yellow
  '#FB923C', // Sunset Mango
  '#38BDF8', // Sky Cyan
  '#F43F5E', // Festive Rose
  '#22C55E', // Emerald
  '#A855F7', // Royal Violet
  '#FFFFFF', // Starlight White
];

export function buildCelebrationPalette(winnerColor?: string): string[] {
  if (!winnerColor) return [...DEFAULT_FESTIVE_COLORS];
  return [
    winnerColor,
    winnerColor,
    '#FDE047',
    '#FACC15',
    '#FB923C',
    '#FFFFFF',
    '#38BDF8',
    '#F43F5E',
    '#22C55E',
    '#A855F7',
  ];
}

export function createCelebrationEngine(
  winnerColor?: string,
  maxParticles = 380
): CelebrationEngineState {
  return {
    particles: [],
    nextId: 1,
    elapsedMs: 0,
    showerAccumulatorMs: 0,
    fireworkAccumulatorMs: 0,
    palette: buildCelebrationPalette(winnerColor),
    maxParticles,
  };
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

function pushParticle(state: CelebrationEngineState, p: Omit<CelebrationParticle, 'id'>): void {
  if (state.particles.length >= state.maxParticles) {
    // Evict oldest non-ring particle so fresh cannons/fireworks stay crisp
    const idx = state.particles.findIndex((item) => item.kind !== 'ring');
    if (idx >= 0) {
      state.particles.splice(idx, 1);
    } else {
      state.particles.shift();
    }
  }
  state.particles.push({ ...p, id: state.nextId++ });
}

/**
 * Fires a directional confetti + sparkle cannon burst from (originX, originY).
 */
export function emitCannonBurst(
  state: CelebrationEngineState,
  originX: number,
  originY: number,
  baseAngleRad: number,
  spreadRad: number,
  count: number,
  speedScale = 1,
  rng: () => number = Math.random
): void {
  for (let i = 0; i < count; i++) {
    const angle = baseAngleRad + (rng() - 0.5) * spreadRad;
    const speed = (420 + rng() * 540) * speedScale;
    const roll = rng();
    const kind: CelebrationParticleKind =
      roll < 0.56 ? 'ribbon' : roll < 0.84 ? 'sparkle' : 'streamer';
    const color = pick(state.palette, rng);
    const secondaryColor = rng() < 0.5 ? '#FFFFFF' : '#FDE047';

    pushParticle(state, {
      kind,
      x: originX + (rng() - 0.5) * 16,
      y: originY + (rng() - 0.5) * 16,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: kind === 'sparkle' ? 240 : kind === 'streamer' ? 320 : 410,
      drag: kind === 'sparkle' ? 0.975 : 0.986,
      size: kind === 'sparkle' ? 7 + rng() * 11 : kind === 'streamer' ? 12 + rng() * 10 : 8 + rng() * 9,
      aspect: kind === 'streamer' ? 0.24 : 0.55 + rng() * 0.35,
      color,
      secondaryColor,
      rotation: rng() * Math.PI * 2,
      rotationSpeed: (rng() - 0.5) * 10,
      flipPhase: rng() * Math.PI * 2,
      flipSpeed: 4 + rng() * 9,
      swayPhase: rng() * Math.PI * 2,
      swayAmp: kind === 'sparkle' ? 18 : 48 + rng() * 52,
      ageMs: 0,
      ttlMs: 2200 + rng() * 1800,
      alpha: 1,
    });
  }
}

/**
 * Fires a 360-degree radial firework burst of sparkles, confetti, and expanding golden shockwave rings.
 */
export function emitFireworkBurst(
  state: CelebrationEngineState,
  centerX: number,
  centerY: number,
  count = 46,
  rng: () => number = Math.random
): void {
  // Two staggered shockwave rings
  pushParticle(state, {
    kind: 'ring',
    x: centerX,
    y: centerY,
    vx: 0,
    vy: 0,
    gravity: 0,
    drag: 1,
    size: 24,
    aspect: 1,
    color: state.palette[0] ?? '#FDE047',
    secondaryColor: '#FFFFFF',
    rotation: 0,
    rotationSpeed: 0,
    flipPhase: 0,
    flipSpeed: 0,
    swayPhase: 0,
    swayAmp: 0,
    ageMs: 0,
    ttlMs: 760,
    alpha: 0.95,
  });

  pushParticle(state, {
    kind: 'ring',
    x: centerX,
    y: centerY,
    vx: 0,
    vy: 0,
    gravity: 0,
    drag: 1,
    size: 14,
    aspect: 1,
    color: '#FDE047',
    secondaryColor: '#FFFFFF',
    rotation: 0,
    rotationSpeed: 0,
    flipPhase: 0,
    flipSpeed: 0,
    swayPhase: 0,
    swayAmp: 0,
    ageMs: 0,
    ttlMs: 960,
    alpha: 0.85,
  });

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.22;
    const speed = 150 + rng() * 440;
    const isSparkle = i % 2 === 0 || rng() < 0.58;
    const color = pick(state.palette, rng);

    pushParticle(state, {
      kind: isSparkle ? 'sparkle' : 'ribbon',
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      gravity: isSparkle ? 190 : 340,
      drag: 0.968,
      size: isSparkle ? 8 + rng() * 12 : 7 + rng() * 8,
      aspect: 0.62,
      color,
      secondaryColor: '#FFFFFF',
      rotation: rng() * Math.PI * 2,
      rotationSpeed: (rng() - 0.5) * 11,
      flipPhase: rng() * Math.PI * 2,
      flipSpeed: 5 + rng() * 8,
      swayPhase: rng() * Math.PI * 2,
      swayAmp: isSparkle ? 14 : 36,
      ageMs: 0,
      ttlMs: 1450 + rng() * 1550,
      alpha: 1,
    });
  }
}

/**
 * Triggers the grand opening victory volley: left & right cannons + center board supernova.
 */
export function triggerOpeningVictoryVolley(
  state: CelebrationEngineState,
  width: number,
  height: number,
  rng: () => number = Math.random
): void {
  const speedScale = Math.max(0.72, Math.min(1.22, Math.hypot(width, height) / 1280));
  // Left corner cannon aiming diagonally up-right
  emitCannonBurst(state, width * 0.04, height * 0.92, -Math.PI * 0.34, 0.58, 56, speedScale, rng);
  // Right corner cannon aiming diagonally up-left
  emitCannonBurst(state, width * 0.96, height * 0.92, -Math.PI * 0.66, 0.58, 56, speedScale, rng);
  // Center Ludo board firework supernova
  emitFireworkBurst(state, width * 0.5, height * 0.44, 60, rng);
}

/**
 * Emits gentle continuous top-of-screen confetti ribbons & floating sparkles.
 */
function emitTopShower(
  state: CelebrationEngineState,
  width: number,
  count: number,
  rng: () => number
): void {
  for (let i = 0; i < count; i++) {
    const roll = rng();
    const kind: CelebrationParticleKind =
      roll < 0.62 ? 'ribbon' : roll < 0.86 ? 'sparkle' : 'streamer';
    pushParticle(state, {
      kind,
      x: width * (0.03 + rng() * 0.94),
      y: -14 - rng() * 26,
      vx: (rng() - 0.5) * 75,
      vy: 90 + rng() * 145,
      gravity: kind === 'sparkle' ? 45 : 95,
      drag: 0.994,
      size: kind === 'sparkle' ? 6 + rng() * 9 : kind === 'streamer' ? 12 + rng() * 8 : 8 + rng() * 8,
      aspect: kind === 'streamer' ? 0.25 : 0.58,
      color: pick(state.palette, rng),
      secondaryColor: '#FFFFFF',
      rotation: rng() * Math.PI * 2,
      rotationSpeed: (rng() - 0.5) * 6,
      flipPhase: rng() * Math.PI * 2,
      flipSpeed: 3.5 + rng() * 7,
      swayPhase: rng() * Math.PI * 2,
      swayAmp: 36 + rng() * 44,
      ageMs: 0,
      ttlMs: 3600 + rng() * 2000,
      alpha: 1,
    });
  }
}

/**
 * Advances all particles and continuous emitters by dtMs (clamped for tab-switch safety).
 */
export function stepCelebrationEngine(
  state: CelebrationEngineState,
  dtMs: number,
  width: number,
  height: number,
  continuousEmitters = true,
  rng: () => number = Math.random
): void {
  const clampedDt = Math.max(0, Math.min(50, dtMs));
  const dtSec = clampedDt / 1000;
  state.elapsedMs += clampedDt;

  if (continuousEmitters && width > 0 && height > 0) {
    // Top festive confetti + sparkle shower every 95ms
    state.showerAccumulatorMs += clampedDt;
    while (state.showerAccumulatorMs >= 95) {
      state.showerAccumulatorMs -= 95;
      emitTopShower(state, width, 4, rng);
    }

    // Periodic mini firework pops over the Ludo board every 1350ms
    state.fireworkAccumulatorMs += clampedDt;
    if (state.fireworkAccumulatorMs >= 1350) {
      state.fireworkAccumulatorMs -= 1350;
      const fx = width * (0.2 + rng() * 0.6);
      const fy = height * (0.18 + rng() * 0.38);
      emitFireworkBurst(state, fx, fy, 30, rng);
    }
  }

  const nextParticles: CelebrationParticle[] = [];
  const frameDragPow = dtSec * 60;

  for (const p of state.particles) {
    p.ageMs += clampedDt;
    if (p.ageMs >= p.ttlMs) continue;

    const lifeRatio = p.ageMs / p.ttlMs;

    if (p.kind === 'ring') {
      // Smooth ease-out radial expansion
      p.size += (260 * (1 - lifeRatio * 0.55)) * dtSec;
      p.alpha = Math.max(0, 1 - lifeRatio);
      nextParticles.push(p);
      continue;
    }

    const dragFactor = Math.pow(p.drag, frameDragPow);
    p.vx *= dragFactor;
    p.vy = p.vy * dragFactor + p.gravity * dtSec;

    p.swayPhase += dtSec * 3.8;
    const swayOffsetVx = Math.sin(p.swayPhase) * p.swayAmp;

    p.x += (p.vx + swayOffsetVx) * dtSec;
    p.y += p.vy * dtSec;
    p.rotation += p.rotationSpeed * dtSec;
    p.flipPhase += p.flipSpeed * dtSec;

    // Fade out cleanly during final 26% of lifetime
    const baseFade = lifeRatio > 0.74 ? Math.max(0, (1 - lifeRatio) / 0.26) : 1;
    if (p.kind === 'sparkle') {
      const twinkle = 0.55 + 0.45 * Math.sin(p.flipPhase * 2.2);
      p.alpha = baseFade * twinkle;
    } else {
      p.alpha = baseFade;
    }

    // Cull particles that fell well past the bottom viewport
    if (p.y > height + 80) continue;
    nextParticles.push(p);
  }

  state.particles = nextParticles;
}
