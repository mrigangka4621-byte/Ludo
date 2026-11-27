import { Ban, RefreshCw, RotateCcw, RotateCw, Shuffle, Sparkles } from 'lucide-react';
import { getNextActivePlayerIndex } from '../game/engine';
import { PLAYER_PALETTES } from '../game/themes';
import type { BoardTheme, GameState, UnoCard, UnoCardColor } from '../game/types';
import { canPlayUnoCard, doesUnoCardCapture, formatUnoCardLabel } from '../game/unoEngine';
import { TeardropPinBadge } from './GameHud';

interface UnoDockProps {
  state: GameState;
  theme: BoardTheme;
  localSeatIndex?: number | null;
  onPlayCard: (card: UnoCard) => void;
  onCancelCard: () => void;
  onAcceptKnockback: () => void;
  onDrawCard: () => void;
}

const UNO_COLOR_STYLES: Record<UnoCardColor, { bg: string; dark: string; accent: string }> = {
  red: { bg: '#E52521', dark: '#991B1B', accent: '#FECACA' },
  blue: { bg: '#1D82D8', dark: '#1E3A8A', accent: '#BFDBFE' },
  green: { bg: '#22A447', dark: '#14532D', accent: '#BBF7D0' },
  yellow: { bg: '#EAB308', dark: '#A16207', accent: '#FEF08A' },
  wild: { bg: '#1E1B4B', dark: '#0F172A', accent: '#FDE047' },
};

function getCardSymbolText(card: UnoCard): string {
  switch (card.kind) {
    case 'number':
      return String(card.value ?? 1);
    case 'reverse':
      return '⇄';
    case 'skip':
      return '⊘';
    case 'minus2':
      return '-2';
    case 'minus4':
      return '-4';
    case 'swap':
      return '🔀';
  }
}

function getCardCornerBadge(card: UnoCard): string {
  switch (card.kind) {
    case 'number':
      return String(card.value ?? 1);
    case 'reverse':
      return 'REV';
    case 'skip':
      return 'SKIP';
    case 'minus2':
      return '-2';
    case 'minus4':
      return '-4';
    case 'swap':
      return 'SWP';
  }
}

/**
 * Glossy tactile UNO card button used in the active player's hand & discard preview.
 */
function UnoCardFace({
  card,
  playable,
  selected,
  canCapture = false,
  compact = false,
  fanTiltDeg = 0,
  cardIndex = 0,
  shuffleOffsetX = 0,
  shuffleRotDeg = 0,
  onClick,
}: {
  card: UnoCard;
  playable: boolean;
  selected: boolean;
  canCapture?: boolean;
  compact?: boolean;
  fanTiltDeg?: number;
  cardIndex?: number;
  shuffleOffsetX?: number;
  shuffleRotDeg?: number;
  onClick?: () => void;
}) {
  const style = UNO_COLOR_STYLES[card.color];
  const symbol = getCardSymbolText(card);
  const corner = getCardCornerBadge(card);
  const isWild = card.color === 'wild';

  const cardBody = (
    <div
      className={`relative rounded-xl flex flex-col items-center justify-center overflow-hidden select-none transition-all duration-200 ease-out ${
        compact
          ? 'w-[36px] h-[48px] border-2'
          : 'w-[60px] h-[86px] sm:w-[68px] sm:h-[96px] border-[3px]'
      } ${
        selected
          ? '-translate-y-4 scale-115 ring-4 ring-yellow-300 shadow-2xl z-20'
          : playable
            ? canCapture
              ? 'hover:-translate-y-3.5 hover:scale-112 active:scale-95 ring-[3px] ring-red-400 shadow-xl'
              : 'hover:-translate-y-3 hover:scale-110 active:scale-95 shadow-lg'
            : 'opacity-40 grayscale-[35%]'
      }`}
      style={{
        backgroundColor: style.bg,
        borderColor: selected ? '#FDE047' : canCapture ? '#FCA5A5' : '#FFFFFF',
        transform: !compact && !selected && fanTiltDeg !== 0 ? `rotate(${fanTiltDeg.toFixed(1)}deg)` : undefined,
        boxShadow: selected
          ? '0 14px 26px rgba(250, 204, 21, 0.55)'
          : canCapture
            ? '0 8px 20px rgba(239, 68, 68, 0.52)'
            : '0 4px 10px rgba(0, 0, 0, 0.38)',
      }}
    >
      {/* Glossy Holographic Shimmer Sweep on Playable/Selected Cards */}
      {!compact && playable && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 w-1/2 animate-shimmer-sweep"
          style={{
            background:
              'linear-gradient(105deg, transparent 10%, rgba(255,255,255,0.42) 50%, transparent 90%)',
            animationDelay: `${cardIndex * 260}ms`,
          }}
        />
      )}

      {/* Wild 4-Color Quadrant Accent */}
      {isWild && (
        <div className="pointer-events-none absolute inset-1.5 rounded-lg opacity-85 overflow-hidden grid grid-cols-2 grid-rows-2">
          <span style={{ backgroundColor: '#E52521' }} />
          <span style={{ backgroundColor: '#1D82D8' }} />
          <span style={{ backgroundColor: '#EAB308' }} />
          <span style={{ backgroundColor: '#22A447' }} />
        </div>
      )}

      {/* Tilted Classic UNO White Inner Oval */}
      <div
        className={`pointer-events-none absolute rounded-[50%] -rotate-[22deg] ${
          compact ? 'inset-x-1 inset-y-1.5' : 'inset-x-1.5 inset-y-2.5'
        }`}
        style={{
          backgroundColor: isWild ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.94)',
          border: `1.5px solid ${isWild ? '#FDE047' : style.dark}`,
        }}
      />

      {/* Top-Left Corner Index */}
      {!compact && (
        <span
          className="absolute top-1 left-1.5 z-10 font-display font-extrabold leading-none text-[10px] sm:text-[11px]"
          style={{
            color: '#FFFFFF',
            textShadow: '0 1px 2px rgba(0,0,0,0.85)',
          }}
        >
          {corner}
        </span>
      )}

      {/* Center Bold Number / Action Icon */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {card.kind === 'reverse' ? (
          <RefreshCw
            size={compact ? 15 : 26}
            strokeWidth={3}
            style={{ color: style.bg }}
          />
        ) : card.kind === 'skip' ? (
          <Ban size={compact ? 15 : 26} strokeWidth={3} style={{ color: style.bg }} />
        ) : card.kind === 'swap' ? (
          <Shuffle size={compact ? 15 : 24} strokeWidth={2.8} style={{ color: '#FDE047' }} />
        ) : (
          <span
            className={`font-display font-black leading-none ${
              compact ? 'text-sm' : 'text-2xl sm:text-3xl'
            }`}
            style={{
              color: isWild ? '#FDE047' : style.bg,
              textShadow: isWild
                ? '0 2px 0 #0B1C3D'
                : '1.5px 1.5px 0 rgba(11,28,61,0.22)',
            }}
          >
            {symbol}
          </span>
        )}
      </div>

      {/* Bottom Action Micro-Label */}
      {!compact && card.kind !== 'number' && (
        <span
          className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 font-display font-extrabold text-[8.5px] tracking-wide uppercase px-1.5 py-0.5 rounded leading-none whitespace-nowrap"
          style={{
            backgroundColor: 'rgba(11, 28, 61, 0.86)',
            color: '#FFFFFF',
          }}
        >
          {formatUnoCardLabel(card)}
        </span>
      )}
    </div>
  );

  if (!onClick) {
    return cardBody;
  }

  return (
    <div
      className="animate-uno-hand-shuffle shrink-0"
      style={
        {
          animationDelay: `${cardIndex * 55}ms`,
          '--shuffle-from-x': `${shuffleOffsetX.toFixed(0)}px`,
          '--shuffle-rot': `${shuffleRotDeg.toFixed(1)}deg`,
        } as React.CSSProperties
      }
    >
      <div
        className={playable && !selected ? 'animate-uno-card-big-small' : undefined}
        style={
          playable && !selected
            ? { animationDelay: `${cardIndex * 180}ms` }
            : undefined
        }
      >
        <button
          type="button"
          disabled={!playable}
          onClick={onClick}
          aria-label={`Play UNO card ${formatUnoCardLabel(card)}${
            card.color !== 'wild' ? ` (${card.color})` : ' (wild)'
          }${canCapture ? ' — captures opponent!' : ''}`}
          aria-pressed={selected}
          data-testid={`uno-card-${card.kind}${card.value ?? ''}`}
          data-card-id={card.id}
          data-can-capture={canCapture ? 'true' : 'false'}
          className="relative focus-visible:outline-2 focus-visible:outline-yellow-300 rounded-xl shrink-0 pt-2"
        >
          {canCapture && playable && (
            <span
              className="pointer-events-none absolute -top-1 left-1/2 z-30 px-1.5 py-0.5 rounded-md font-display font-black text-[9px] tracking-wide whitespace-nowrap shadow-md animate-capture-badge-pulse"
              data-testid={`uno-capture-badge-${card.id}`}
              style={{
                backgroundColor: '#DC2626',
                color: '#FEF08A',
                border: '1.5px solid #FFFFFF',
              }}
            >
              ⚔️ HIT
            </span>
          )}
          {cardBody}
        </button>
      </div>
    </div>
  );
}

/**
 * Complete UNO Ludo Bottom Arcade Dock (replaces Dice Dock in UNO Mode):
 * - Direction Order Pill (↻ CW / ↺ CCW) + Live Knockback Stack Counter Banner
 * - Active Player's Interactive 6-Card UNO Hand + Discard Pile + Draw Fallback
 * - Knockback Target Selection Banner when preceding player chooses victim's pawn
 */
export function UnoDock({
  state,
  theme,
  localSeatIndex = null,
  onPlayCard,
  onCancelCard,
  onAcceptKnockback,
  onDrawCard,
}: UnoDockProps) {
  const uno = state.unoState;
  if (!uno) return null;

  const activePlayer = state.players[state.activePlayerIndex];
  const nextIdx = getNextActivePlayerIndex(state, state.activePlayerIndex);
  const nextPlayer = state.players[nextIdx] ?? activePlayer;
  const activePalette = PLAYER_PALETTES[activePlayer.paletteIndex];
  const nextPalette = PLAYER_PALETTES[nextPlayer.paletteIndex];
  const isArcade = theme.id === 'arcade';

  const isOnline = localSeatIndex !== null;
  const viewingPlayer =
    isOnline && state.players[localSeatIndex] ? state.players[localSeatIndex] : activePlayer;
  const isMyTurn = !isOnline || state.activePlayerIndex === localSeatIndex;

  const hand = uno.hands[viewingPlayer.id] ?? [];
  const pending = uno.pendingKnockback;
  const isChoosingTarget = state.phase === 'choosing_knockback_target' && Boolean(pending);
  const isChoosingPawn = state.phase === 'choosing_move' && isMyTurn;
  const isHumanTurn =
    isMyTurn && !activePlayer.isBot && state.phase !== 'animating' && state.phase !== 'finished';

  const playableCards = isHumanTurn
    ? hand.filter((c) => canPlayUnoCard(state, viewingPlayer.id, c))
    : [];
  const hasAnyPlayable = playableCards.length > 0;
  const isReversed = state.turnDirection === -1;

  const chooserPlayer = pending
    ? state.players.find((p) => p.id === pending.chooserPlayerId)
    : null;
  const victimPlayer = pending
    ? state.players.find((p) => p.id === pending.victimPlayerId)
    : null;

  return (
    <div
      className="w-full max-w-[740px] mx-auto px-3 pb-3 pt-1 flex flex-col items-center gap-2 shrink-0"
      data-testid="uno-dock"
    >
      {/* Top Status Strip: Live Status Message + Turn Order Direction Badge */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-xs sm:text-sm font-semibold truncate flex-1 min-w-[180px]"
          style={{ color: isArcade ? '#EFF6FF' : theme.textSecondary }}
          aria-live="polite"
          data-testid="turn-status-text"
        >
          {state.lastEvent?.message ?? `${activePlayer.name}'s turn — play a UNO card`}
        </p>

        <div className="flex items-center gap-2 shrink-0">
          {isChoosingPawn && (
            <button
              type="button"
              onClick={onCancelCard}
              className="px-2.5 py-1 rounded-lg text-xs font-bold transition-transform active:scale-95"
              style={{
                backgroundColor: theme.panelMutedBg,
                color: theme.textPrimary,
                border: `1.5px solid ${theme.accent}`,
              }}
            >
              Change Card
            </button>
          )}

          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold shadow-sm"
            data-testid="uno-direction-indicator"
            style={{
              backgroundColor: isReversed ? '#DC2626' : isArcade ? '#0A2552' : theme.panelBg,
              color: '#FFFFFF',
              border: `1.5px solid ${isReversed ? '#FDE047' : theme.accent}`,
            }}
          >
            {isReversed ? <RotateCcw size={13} /> : <RotateCw size={13} />}
            <span>{isReversed ? 'Reversed (↺)' : 'Clockwise (↻)'}</span>
          </div>
        </div>
      </div>

      {/* ACTIVE KNOCKBACK STACK COUNTER BANNER (when defending -2 / -4 stack OR choosing victim pawn) */}
      {pending && (
        <div
          className="w-full rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 shadow-lg animate-spring-pop"
          data-testid="uno-knockback-banner"
          style={{
            background: 'linear-gradient(90deg, #991B1B 0%, #DC2626 55%, #B45309 100%)',
            border: '2px solid #FDE047',
            color: '#FFFFFF',
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="font-display font-black text-lg sm:text-xl px-2.5 py-0.5 rounded-lg shrink-0"
              data-testid="uno-knockback-counter"
              style={{
                backgroundColor: '#0B1C3D',
                color: '#FDE047',
                border: '1.5px solid #FDE047',
              }}
            >
              -{pending.totalSteps}
            </span>
            <div className="min-w-0">
              <div className="text-xs sm:text-sm font-extrabold leading-tight">
                {isChoosingTarget
                  ? `🎯 ${chooserPlayer?.name}: Tap ANY ${victimPlayer?.name} pawn to push -${pending.totalSteps} back!`
                  : `⚔️ STACK ×${pending.stackCount} on ${victimPlayer?.name}! ${
                      pending.lastCardKind === 'minus4'
                        ? 'Stack another -4 (no -2 on -4) or take hit!'
                        : 'Stack -2 or -4, or take the hit!'
                    }`}
              </div>
            </div>
          </div>

          {!isChoosingTarget && isHumanTurn && (
            <button
              type="button"
              onClick={onAcceptKnockback}
              data-testid="uno-accept-knockback-btn"
              className="px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-extrabold whitespace-nowrap shadow-md transition-transform active:scale-95"
              style={{
                backgroundColor: '#FDE047',
                color: '#0B1C3D',
              }}
            >
              Take -{pending.totalSteps} Hit
            </button>
          )}
        </div>
      )}

      {/* Main UNO Player Tray & Interactive 6-Card Hand — Color-Coded to Active Player */}
      <div
        className="w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        data-testid="uno-active-turn-tray"
        data-active-player-id={activePlayer.id}
        style={{
          background: isArcade
            ? `linear-gradient(180deg, ${activePalette.dark} 0%, #091E46 42%, #0A2552 100%)`
            : theme.panelBg,
          border: `3.5px solid ${activePalette.color}`,
          boxShadow: `0 0 24px ${activePalette.color}66, 0 10px 26px rgba(0, 0, 0, 0.45)`,
        }}
      >
        {/* Unmistakable Active Player Color-Coded Turn Spotlight Strip */}
        <div
          className="relative overflow-hidden w-full px-3.5 py-2 flex items-center justify-between gap-2 animate-turn-spotlight"
          data-testid="uno-turn-banner"
          style={
            {
              background: `linear-gradient(90deg, ${activePalette.color} 0%, ${activePalette.dark} 100%)`,
              borderBottom: '2px solid rgba(255,255,255,0.45)',
              '--turn-glow': `${activePalette.color}AA`,
            } as React.CSSProperties
          }
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 w-1/3 animate-shimmer-sweep"
            style={{
              background:
                'linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.28) 50%, transparent 100%)',
            }}
          />
          <div className="relative z-10 flex items-center gap-2.5 min-w-0">
            <div className="bg-white/95 rounded-full p-0.5 shadow-md shrink-0">
              <TeardropPinBadge
                color={activePalette.color}
                darkColor={activePalette.dark}
                size={28}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="font-display font-black text-base sm:text-lg leading-none truncate"
                  style={{
                    color: '#FFFFFF',
                    textShadow: '0 2px 3px rgba(11,28,61,0.75)',
                  }}
                >
                  ▶ {activePlayer.name.toUpperCase()}&apos;S TURN
                </span>
                <span
                  className="px-2 py-0.5 rounded-full font-display font-extrabold text-[10px] sm:text-[11px] uppercase tracking-wide shrink-0 shadow-sm"
                  style={{
                    backgroundColor: '#FDE047',
                    color: '#0B1C3D',
                  }}
                >
                  {hand.length} {hand.length === 1 ? 'Card' : 'Cards'}
                </span>
              </div>
              <div
                className="text-[11px] font-bold leading-tight mt-0.5 truncate"
                style={{ color: '#FEF9C3', textShadow: '0 1px 2px rgba(0,0,0,0.55)' }}
              >
                {isChoosingTarget
                  ? `${chooserPlayer?.name} choosing target pawn`
                  : !isMyTurn
                    ? `Waiting for ${activePlayer.name} — your ${hand.length} cards are ready below`
                    : isChoosingPawn
                      ? `Tap a bouncing ${activePlayer.name} pawn to move ${state.diceValue}`
                      : activePlayer.isBot
                        ? `${activePlayer.name} (CPU) is picking a card...`
                        : 'Tap a glowing UNO card below to play!'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Discard Pile Preview */}
            {uno.discardTop && (
              <div className="hidden sm:flex items-center gap-1.5" data-testid="uno-discard-top">
                <span className="text-[10px] font-extrabold uppercase text-white/90">Last</span>
                <UnoCardFace card={uno.discardTop} playable={true} selected={false} compact />
              </div>
            )}

            {/* Next Player Indicator */}
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded-xl"
              style={{ backgroundColor: 'rgba(11, 28, 61, 0.55)', border: '1px solid rgba(255,255,255,0.28)' }}
            >
              <div className="text-right">
                <div className="text-[9px] font-bold uppercase text-white/75 leading-none">Next</div>
                <div className="text-xs font-extrabold text-white truncate max-w-[78px]">
                  {nextPlayer.name}
                </div>
              </div>
              <TeardropPinBadge
                color={nextPalette.color}
                darkColor={nextPalette.dark}
                size={24}
              />
            </div>
          </div>
        </div>

        {/* Interactive Fanned UNO Card Hand (Shuffles In on Turn Change / Refill & Animates Big-Small) */}
        <div
          key={`uno-hand-turn-${activePlayer.id}-${state.turnNumber}-${hand.length === 6 ? hand[0]?.id ?? 'full' : 'play'}`}
          className="flex items-center justify-center gap-1.5 sm:gap-2.5 overflow-x-auto pt-4 pb-3 px-3"
          data-testid="uno-hand-cards"
        >
          {hand.map((card, idx) => {
            const isSelected = isMyTurn && uno.selectedCardId === card.id;
            const playable =
              !isChoosingTarget &&
              isHumanTurn &&
              canPlayUnoCard(state, viewingPlayer.id, card);
            const canCapture = playable && doesUnoCardCapture(state, viewingPlayer.id, card);
            const mid = (hand.length - 1) / 2;
            const fanTiltDeg = hand.length > 1 ? (idx - mid) * 2.8 : 0;
            const shuffleOffsetX = (mid - idx) * 34;
            const shuffleRotDeg = (idx - mid) * 9;

            return (
              <UnoCardFace
                key={card.id}
                card={card}
                playable={playable}
                selected={isSelected}
                canCapture={canCapture}
                fanTiltDeg={fanTiltDeg}
                cardIndex={idx}
                shuffleOffsetX={shuffleOffsetX}
                shuffleRotDeg={shuffleRotDeg}
                onClick={() => {
                  if (isSelected) {
                    onCancelCard();
                  } else {
                    onPlayCard(card);
                  }
                }}
              />
            );
          })}

          {/* Draw Fallback Button if stuck with zero playable cards on a normal turn */}
          {!pending && !isChoosingTarget && isHumanTurn && !hasAnyPlayable && (
            <button
              type="button"
              onClick={onDrawCard}
              data-testid="uno-draw-pass-btn"
              className="h-[86px] sm:h-[96px] px-3 rounded-xl font-display font-extrabold text-xs flex flex-col items-center justify-center gap-1 shadow-lg transition-transform active:scale-95 shrink-0"
              style={{
                backgroundColor: '#FDE047',
                color: '#0B1C3D',
                border: '3px solid #FFFFFF',
              }}
            >
              <Sparkles size={18} />
              <span>Draw Card</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
