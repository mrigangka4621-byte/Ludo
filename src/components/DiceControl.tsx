import type { BoardTheme } from '../game/types';

interface DiceControlProps {
  value: number | null;
  displayValue: number;
  rolling: boolean;
  canRoll: boolean;
  justLanded: boolean;
  playerColor: string;
  playerDarkColor: string;
  playerName: string;
  theme: BoardTheme;
  onRoll: () => void;
}

const PIP_POSITIONS: Record<number, Array<[number, number]>> = {
  1: [[32, 32]],
  2: [
    [19, 19],
    [45, 45],
  ],
  3: [
    [19, 19],
    [32, 32],
    [45, 45],
  ],
  4: [
    [19, 19],
    [45, 19],
    [19, 45],
    [45, 45],
  ],
  5: [
    [19, 19],
    [45, 19],
    [32, 32],
    [19, 45],
    [45, 45],
  ],
  6: [
    [19, 17],
    [45, 17],
    [19, 32],
    [45, 32],
    [19, 47],
    [45, 47],
  ],
};

/**
 * Iconic centered arcade Dice Tray with glossy 3D colored die, bouncing golden-orange
 * turn arrow above when awaiting roll, tumble animation, and landing pop!
 */
export function DiceControl({
  value,
  displayValue,
  rolling,
  canRoll,
  justLanded,
  playerColor,
  playerDarkColor,
  playerName,
  theme,
  onRoll,
}: DiceControlProps) {
  const pips = PIP_POSITIONS[displayValue] ?? PIP_POSITIONS[3];
  const isArcade = theme.id === 'arcade';
  const dieFaceColor = isArcade ? playerColor : theme.dieBg;
  const dieBorderColor = isArcade ? playerDarkColor : theme.dieStroke;
  const pipFill = isArcade ? '#FFFFFF' : displayValue === 6 || displayValue === 1 ? playerColor : theme.diePip;

  return (
    <div className="relative flex flex-col items-center justify-center shrink-0">
      {/* Animated Bouncing Golden-Orange Downward Pointer Arrow when ready to roll */}
      {canRoll && !rolling && (
        <div
          className="pointer-events-none absolute -top-9 z-20 animate-arrow-bob"
          aria-hidden="true"
        >
          <svg width="36" height="34" viewBox="0 0 40 36" fill="none">
            <defs>
              <linearGradient id="turn-arrow-grad" x1="20" y1="2" x2="20" y2="33" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#FDE047" />
                <stop offset="58%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#EA580C" />
              </linearGradient>
            </defs>
            <path
              d="M14 4 H26 V16 H35 L20 32 L5 16 H14 Z"
              fill="url(#turn-arrow-grad)"
              stroke="#0B1C3D"
              strokeWidth="2.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* Celebratory Twin-Ring Starburst on Rolling a 6 */}
      {justLanded && value === 6 && !rolling && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center z-10"
          aria-hidden="true"
        >
          <span className="absolute w-20 h-20 rounded-full border-4 border-yellow-300 animate-burst-pop" />
          <span
            className="absolute w-16 h-16 rounded-full border-[3px] border-white animate-burst-pop"
            style={{ animationDelay: '90ms' }}
          />
        </div>
      )}

      {/* Beveled Square Dice Tray Button */}
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          onRoll();
        }}
        disabled={!canRoll}
        aria-label={canRoll ? `Roll die for ${playerName}` : `Die showing ${value ?? displayValue}`}
        data-testid="roll-dice-btn"
        className={`group relative flex items-center justify-center w-[76px] h-[76px] sm:w-[82px] sm:h-[82px] rounded-2xl transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 ${
          canRoll && !rolling ? 'animate-dice-ready-glow hover:scale-105' : ''
        }`}
        style={{
          background: isArcade
            ? 'linear-gradient(180deg, #FFF3F2 0%, #F4CECE 100%)'
            : theme.panelMutedBg,
          border: `3px solid ${canRoll ? '#FACC15' : isArcade ? '#CBD5E1' : theme.panelBorder}`,
          boxShadow: canRoll
            ? undefined
            : '0 4px 10px -4px rgba(0,0,0,0.4)',
        }}
      >
        <div
          className={
            rolling
              ? 'animate-dice-tumble'
              : justLanded
                ? 'animate-dice-land'
                : canRoll
                  ? 'transition-transform duration-200 group-hover:scale-108'
                  : ''
          }
        >
          <svg width="56" height="56" viewBox="0 0 64 64" aria-hidden="true">
            {/* Soft contact shadow */}
            <rect x="7" y="10" width="52" height="52" rx="13" fill="rgba(0,0,0,0.24)" />
            {/* 3D Die body */}
            <rect
              x="5"
              y="5"
              width="52"
              height="52"
              rx="12"
              fill={dieFaceColor}
              stroke={dieBorderColor}
              strokeWidth="2.5"
            />
            {/* Glossy top sheen */}
            <path
              d="M14 9 H48 C51 9 53 11 53 14 V20 C41 15 24 15 9 21 V14 C9 11 11 9 14 9 Z"
              fill="rgba(255,255,255,0.34)"
            />
            {/* Pips */}
            {pips.map(([cx, cy], idx) => (
              <g key={idx}>
                <circle
                  cx={cx - 1}
                  cy={cy}
                  r={displayValue === 1 ? 6.4 : 5}
                  fill="rgba(0,0,0,0.18)"
                />
                <circle
                  cx={cx - 1}
                  cy={cy - 1}
                  r={displayValue === 1 ? 6.2 : 4.8}
                  fill={pipFill}
                />
              </g>
            ))}
          </svg>
        </div>
      </button>
    </div>
  );
}
