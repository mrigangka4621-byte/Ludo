import type { BoardTheme } from '../game/types';

interface TitleEmblemProps {
  theme: BoardTheme;
  compact?: boolean;
  subtitle?: string;
}

function MangoIcon({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      aria-hidden="true"
      className="shrink-0 drop-shadow-sm"
    >
      <defs>
        <linearGradient id="mango-body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="52%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#EA580C" />
        </linearGradient>
      </defs>
      {/* Leaf */}
      <path
        d="M19 6 C23 2, 29 3, 30 7 C26 10, 22 9, 19 6 Z"
        fill="#22C55E"
        stroke="#0B1C3D"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Stem */}
      <path d="M18 8 L18 4" stroke="#78350F" strokeWidth="2.2" strokeLinecap="round" />
      {/* Plump Golden Mango Silhouette */}
      <path
        d="M18 8 C26 8, 30 14, 28 22 C26 29, 19 33, 13 31 C7 29, 6 22, 9 15 C11 10, 14 8, 18 8 Z"
        fill="url(#mango-body-grad)"
        stroke="#0B1C3D"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Crisp Specular Highlight */}
      <ellipse
        cx="14.5"
        cy="16.5"
        rx="2.3"
        ry="5"
        transform="rotate(20 14.5 16.5)"
        fill="#FFFFFF"
        fillOpacity="0.48"
      />
    </svg>
  );
}

/**
 * Bold golden-trimmed royal ribbon banner for Mango Ludo.
 * Adapts cleanly across all 5 board themes while preserving the iconic tilted ribbon silhouette.
 */
export function TitleEmblem({ theme, compact = false, subtitle }: TitleEmblemProps) {
  const isArcade = theme.id === 'arcade';
  const ribbonFill = isArcade ? '#1864C9' : theme.panelMutedBg;
  const ribbonEdge = isArcade ? '#0C3B82' : theme.panelBg;
  const trimColor = isArcade ? '#FACC15' : theme.accent;

  if (compact) {
    return (
      <div className="relative inline-flex items-center select-none">
        <div
          className="relative px-3.5 py-1.5 rounded-lg -rotate-1 shadow-md flex items-center gap-1.5"
          style={{
            background: `linear-gradient(180deg, ${ribbonFill} 0%, ${ribbonEdge} 100%)`,
            borderTop: `3px solid ${trimColor}`,
            borderBottom: `3px solid ${trimColor}`,
            borderLeft: `2px solid ${trimColor}`,
            borderRight: `2px solid ${trimColor}`,
          }}
        >
          <MangoIcon size={20} />
          <span
            className={`font-display font-bold text-lg sm:text-xl tracking-wide leading-none block whitespace-nowrap ${
              isArcade ? 'arcade-gold-text-sm' : ''
            }`}
            style={isArcade ? undefined : { color: theme.accent }}
          >
            Mango Ludo
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full select-none animate-spring-pop">
      <div
        className="relative w-full py-3.5 px-5 rounded-xl -rotate-1 shadow-lg overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${ribbonFill} 0%, ${ribbonEdge} 100%)`,
          borderTop: `4px solid ${trimColor}`,
          borderBottom: `4px solid ${trimColor}`,
          boxShadow: '0 10px 24px -8px rgba(0,0,0,0.45)',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            background:
              'linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.55) 45%, transparent 65%)',
          }}
        />
        <div className="relative text-center">
          <div className="inline-flex items-center justify-center gap-2.5">
            <MangoIcon size={34} />
            <h1
              className={`font-display font-bold text-3xl sm:text-4xl tracking-wide leading-none ${
                isArcade ? 'arcade-gold-text' : ''
              }`}
              style={isArcade ? undefined : { color: theme.accent }}
            >
              Mango Ludo
            </h1>
          </div>
          <p
            className="text-xs font-semibold mt-1.5 tracking-wide"
            style={{ color: isArcade ? '#DBEAFE' : theme.textSecondary }}
          >
            {subtitle ?? 'Online Rooms · Vs Computer · Local Pass & Play'}
          </p>
        </div>
      </div>
    </div>
  );
}
