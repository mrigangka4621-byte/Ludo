import { useEffect, useRef } from 'react';
import {
  createCelebrationEngine,
  stepCelebrationEngine,
  triggerOpeningVictoryVolley,
  type CelebrationParticle,
} from '../game/celebrationParticles';

interface VictoryCelebrationCanvasProps {
  active: boolean;
  winnerColor?: string;
}

function drawFourPointSparkle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rotation: number,
  color: string,
  coreColor: string,
  alpha: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;

  // Soft outer starlight glow
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * 0.35;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.15, 0, Math.PI * 2);
  ctx.fill();

  // Sharp 4-point diamond star
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const inner = radius * 0.24;
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.lineTo(inner, -inner);
  ctx.lineTo(radius, 0);
  ctx.lineTo(inner, inner);
  ctx.lineTo(0, radius);
  ctx.lineTo(-inner, inner);
  ctx.lineTo(-radius, 0);
  ctx.lineTo(-inner, -inner);
  ctx.closePath();
  ctx.fill();

  // Bright starlight core
  ctx.fillStyle = coreColor;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.5, radius * 0.26), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, p: CelebrationParticle) {
  if (p.alpha <= 0.01) return;

  if (p.kind === 'ring') {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = Math.max(1.5, 5.5 * p.alpha);
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = p.secondaryColor;
    ctx.lineWidth = Math.max(1, 2 * p.alpha);
    ctx.globalAlpha = p.alpha * 0.7;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, p.size - 5), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (p.kind === 'sparkle') {
    drawFourPointSparkle(
      ctx,
      p.x,
      p.y,
      p.size,
      p.rotation,
      p.color,
      p.secondaryColor,
      p.alpha
    );
    return;
  }

  // Confetti Ribbon or Party Streamer with 3D-projected flip foreshortening
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  const flipScaleY = Math.cos(p.flipPhase);
  const clampedFlip = Math.abs(flipScaleY) < 0.16 ? (flipScaleY >= 0 ? 0.16 : -0.16) : flipScaleY;
  ctx.scale(1, clampedFlip);
  ctx.globalAlpha = p.alpha;

  // Show metallic specular sheen when flipped near edge-on
  const isGlinting = Math.abs(flipScaleY) < 0.34;
  ctx.fillStyle = isGlinting ? p.secondaryColor : p.color;

  if (p.kind === 'streamer') {
    const w = p.size * 1.45;
    const h = Math.max(3, p.size * p.aspect);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
  } else {
    const w = p.size;
    const h = p.size * p.aspect;
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

export function VictoryCelebrationCanvas({
  active,
  winnerColor,
}: VictoryCelebrationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener('resize', resize);

    const engine = createCelebrationEngine(winnerColor, 360);
    triggerOpeningVictoryVolley(engine, width, height);

    if (prefersReducedMotion) {
      // Advance slightly so particles spread tastefully and render one crisp static celebration frame
      for (let i = 0; i < 10; i++) {
        stepCelebrationEngine(engine, 24, width, height, false);
      }
      ctx.clearRect(0, 0, width, height);
      for (const p of engine.particles) {
        drawParticle(ctx, p);
      }
      canvas.dataset.particleCount = String(engine.particles.length);
      return () => {
        window.removeEventListener('resize', resize);
      };
    }

    let rafId = 0;
    let lastTs = performance.now();

    const frame = (now: number) => {
      const dtMs = now - lastTs;
      lastTs = now;

      stepCelebrationEngine(engine, dtMs, width, height, true);

      ctx.clearRect(0, 0, width, height);
      for (const p of engine.particles) {
        drawParticle(ctx, p);
      }
      canvas.dataset.particleCount = String(engine.particles.length);
      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      ctx.clearRect(0, 0, width, height);
    };
  }, [active, winnerColor]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="victory-celebration-canvas"
      data-active="true"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[55] w-full h-full"
    />
  );
}
