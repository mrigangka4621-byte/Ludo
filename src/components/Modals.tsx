import { Check, Play, RotateCcw, Trophy, Volume1, Volume2, VolumeX, X } from 'lucide-react';
import { formatOrdinal } from '../game/engine';
import { PLAYER_PALETTES, THEME_LIST } from '../game/themes';
import type { BoardTheme, GameState, ThemeId } from '../game/types';
import { TeardropPinBadge } from './GameHud';

interface PauseModalProps {
  theme: BoardTheme;
  volume: number;
  muted: boolean;
  onChangeVolume: (volume: number) => void;
  onPreviewVolume: () => void;
  onToggleMute: () => void;
  onResume: () => void;
  onRestart: () => void;
  onBackToTitle: () => void;
  onChangeTheme: (id: ThemeId) => void;
}

export function PauseModal({
  theme,
  volume,
  muted,
  onChangeVolume,
  onPreviewVolume,
  onToggleMute,
  onResume,
  onRestart,
  onBackToTitle,
  onChangeTheme,
}: PauseModalProps) {
  const effectivePct = muted ? 0 : Math.round(volume * 100);
  const VolumeIcon = effectivePct === 0 ? VolumeX : effectivePct < 50 ? Volume1 : Volume2;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 16, 38, 0.76)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-5 shadow-2xl animate-spring-pop"
        style={{
          backgroundColor: theme.panelBg,
          border: `2px solid ${theme.accent}`,
          color: theme.textPrimary,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="pause-modal-title" className="font-display font-bold text-2xl">
            Match Paused
          </h2>
          <button
            type="button"
            onClick={onResume}
            aria-label="Close pause menu"
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: theme.panelMutedBg, color: theme.textSecondary }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold" style={{ color: theme.textMuted }}>
            Board Theme
          </div>
          <div className="grid grid-cols-5 gap-2">
            {THEME_LIST.map((t) => {
              const selected = t.id === theme.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChangeTheme(t.id)}
                  aria-label={`Switch to ${t.name} theme`}
                  aria-pressed={selected}
                  className="h-11 rounded-lg flex flex-col items-center justify-center gap-1 transition-transform active:scale-95"
                  style={{
                    backgroundColor: t.pageBg,
                    border: `2px solid ${selected ? theme.accent : theme.panelBorder}`,
                  }}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: t.accent }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Sound Effects Volume Control */}
        <div
          className="rounded-xl p-3.5 space-y-2.5"
          style={{
            backgroundColor: theme.panelMutedBg,
            border: `1.5px solid ${theme.panelBorder}`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="sfx-volume-slider"
              className="text-xs font-bold tracking-wide"
              style={{ color: theme.textPrimary }}
            >
              Sound Effects Volume
            </label>
            <span
              className="font-mono-num text-xs font-bold"
              style={{ color: effectivePct === 0 ? theme.textMuted : theme.accent }}
              data-testid="sfx-volume-value"
            >
              {effectivePct === 0 ? 'Muted' : `${effectivePct}%`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={effectivePct === 0 ? 'Unmute sound effects' : 'Mute sound effects'}
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-transform active:scale-95"
              style={{
                backgroundColor: theme.panelBg,
                color: effectivePct === 0 ? theme.textMuted : theme.accent,
                border: `1px solid ${theme.panelBorder}`,
              }}
            >
              <VolumeIcon size={17} />
            </button>

            <input
              id="sfx-volume-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={effectivePct}
              aria-label="Sound effects volume"
              aria-valuetext={effectivePct === 0 ? 'Muted' : `${effectivePct} percent`}
              data-testid="sfx-volume-slider"
              onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
              onPointerUp={() => {
                if (effectivePct > 0) onPreviewVolume();
              }}
              onKeyUp={() => {
                if (effectivePct > 0) onPreviewVolume();
              }}
              className="flex-1 h-2 rounded-lg cursor-pointer"
              style={{ accentColor: theme.accent }}
            />
          </div>
        </div>

        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={onResume}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm"
            style={{ backgroundColor: theme.accent, color: theme.accentText }}
          >
            <Play size={16} fill="currentColor" />
            <span>Resume Match</span>
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm"
            style={{
              backgroundColor: theme.panelMutedBg,
              color: theme.textPrimary,
              border: `1.5px solid ${theme.panelBorder}`,
            }}
          >
            <RotateCcw size={15} />
            <span>Restart Same Setup</span>
          </button>
          <button
            type="button"
            onClick={onBackToTitle}
            className="w-full py-2.5 rounded-xl font-bold text-sm"
            style={{ color: theme.textSecondary }}
          >
            Back to Setup
          </button>
        </div>
      </div>
    </div>
  );
}

interface ThemeModalProps {
  theme: BoardTheme;
  onSelectTheme: (id: ThemeId) => void;
  onClose: () => void;
}

export function ThemeModal({ theme, onSelectTheme, onClose }: ThemeModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 16, 38, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 space-y-4 shadow-2xl animate-spring-pop"
        style={{
          backgroundColor: theme.panelBg,
          border: `2px solid ${theme.accent}`,
          color: theme.textPrimary,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="theme-modal-title" className="font-display font-bold text-2xl">
            Board Themes
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close theme picker"
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: theme.panelMutedBg, color: theme.textSecondary }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2">
          {THEME_LIST.map((t) => {
            const selected = t.id === theme.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTheme(t.id)}
                aria-pressed={selected}
                className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left transition-transform active:scale-[0.98]"
                style={{
                  backgroundColor: selected ? theme.panelMutedBg : 'rgba(0,0,0,0.1)',
                  border: `2px solid ${selected ? theme.accent : 'rgba(255,255,255,0.15)'}`,
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex items-center -space-x-1 shrink-0" aria-hidden="true">
                    {t.swatches.map((hex, i) => (
                      <span
                        key={i}
                        className="w-5 h-5 rounded-full border border-black/30"
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate">{t.name}</div>
                    <div className="text-xs truncate" style={{ color: theme.textMuted }}>
                      {t.subtitle}
                    </div>
                  </div>
                </div>
                {selected && <Check size={18} style={{ color: theme.accent }} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface RulesModalProps {
  theme: BoardTheme;
  mode: GameState['config']['mode'];
  onClose: () => void;
}

export function RulesModal({ theme, mode, onClose }: RulesModalProps) {
  const modeTitle =
    mode === 'flip'
      ? 'Flip-Track'
      : mode === 'crazy'
        ? 'Crazy Mode ⚡'
        : mode === 'uno'
          ? 'UNO Ludo 🃏'
          : 'Mango Ludo';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(6, 16, 38, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-modal-title"
    >
      <div
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl p-6 space-y-4 shadow-2xl animate-spring-pop"
        style={{
          backgroundColor: theme.panelBg,
          border: `2px solid ${theme.accent}`,
          color: theme.textPrimary,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 id="rules-modal-title" className="font-display font-bold text-2xl">
            How to Play {modeTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rules"
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: theme.panelMutedBg, color: theme.textSecondary }}
          >
            <X size={18} />
          </button>
        </div>

        <ul className="space-y-3 text-sm leading-relaxed" style={{ color: theme.textSecondary }}>
          <li>
            <strong style={{ color: theme.textPrimary }}>Safe Stars, Stacks &amp; Captures:</strong> Start squares and Star tiles protect pawns. Stacking 2+ pawns on any track square turns it into a Safe Point until only 1 pawn remains alone. Landing on an unprotected rival knocks them back!
          </li>
          <li>
            <strong style={{ color: theme.textPrimary }}>Classic &amp; Flip-Track (↔):</strong> Roll a 6 to deploy — guaranteed opening Mercy 6 after <strong>10 misses</strong> at match start. If all your pawns get captured back to Home Yard later, <strong>Comeback Mercy 6</strong> boosts your 6 odds by <strong>+50%</strong> and guarantees a 6 in at most <strong>8 rolls</strong>! In Flip-Track, pick Forward (↻) or Backward (↺) each turn.
          </li>
          <li>
            <strong style={{ color: theme.textPrimary }}>Crazy Mode ⚡:</strong> Boosted 6 rolls (limited to <strong>Double Six</strong> — after two 6s you still get your bonus roll, guaranteed 1–5 so it never lands on a 3rd 6!), <strong>Guaranteed Snipe</strong> (if a rival is 1–6 squares ahead on a non-safe tile, your die rolls the exact capture number!), <strong>Revenge 6</strong> after getting captured, and wild <strong>Chaos Star</strong> events (+2 Turbo Boost, Swaparoo, or Free Bonus Roll)!
          </li>
          <li>
            <strong style={{ color: theme.textPrimary }}>UNO Ludo Mode 🃏:</strong> No dice! All pawns start ready on Start Squares while Home Yards hold your <strong>6 UNO cards</strong> (auto-refills 6 fresh cards when emptied). Play <strong>1–6</strong> to advance and <strong>capture</strong> unprotected rivals (kicking them back to their Start Square — or <strong>instant -6 squares punishment</strong> if already knocked behind Start — plus a bonus card play!), <strong>Reverse (⇄)</strong> to flip turn order, <strong>Skip (⊘)</strong> to skip the next player, <strong>Swap (🔀)</strong> to trade places, or stackable <strong>-2 / -4</strong> knockback cards (stack -2/-4 on -2, and -4 on -4; never -2 on -4)!
          </li>
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-2.5 rounded-xl font-bold text-sm"
          style={{ backgroundColor: theme.accent, color: theme.accentText }}
        >
          Got It
        </button>
      </div>
    </div>
  );
}

interface VictoryModalProps {
  state: GameState;
  theme: BoardTheme;
  canContinueForRanks: boolean;
  onContinueForRanks: () => void;
  onPlayAgain: () => void;
  onBackToTitle: () => void;
}

export function VictoryModal({
  state,
  theme,
  canContinueForRanks,
  onContinueForRanks,
  onPlayAgain,
  onBackToTitle,
}: VictoryModalProps) {
  const rankedPlayers = [...state.players].sort((a, b) => {
    if (a.finishedRank !== null && b.finishedRank !== null) {
      return a.finishedRank - b.finishedRank;
    }
    if (a.finishedRank !== null) return -1;
    if (b.finishedRank !== null) return 1;
    const aHome = a.tokens.filter((t) => t.zone === 'finished').length;
    const bHome = b.tokens.filter((t) => t.zone === 'finished').length;
    return bHome - aHome;
  });

  const winner = rankedPlayers[0];
  const winnerPalette = PLAYER_PALETTES[winner.paletteIndex];

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(6, 16, 38, 0.78)' }}
        aria-hidden="true"
      />
      <div
        className="fixed inset-0 z-[65] flex items-center justify-center p-4 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="victory-modal-title"
      >
        <div
          className="relative w-full max-w-lg rounded-2xl p-6 space-y-5 shadow-2xl animate-spring-pop"
          style={{
            backgroundColor: theme.panelBg,
            border: `3px solid ${theme.accent}`,
            color: theme.textPrimary,
          }}
        >
        <div className="flex items-center gap-3.5">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-md"
            style={{ backgroundColor: winnerPalette.color, color: '#FFFFFF' }}
          >
            <Trophy size={24} />
          </div>
          <div>
            <div className="text-xs font-bold" style={{ color: theme.accent }}>
              Match Complete
            </div>
            <h2 id="victory-modal-title" className="font-display font-bold text-3xl leading-tight">
              {winner.name} Wins!
            </h2>
          </div>
        </div>

        <div
          className="grid grid-cols-3 gap-2 p-3 rounded-xl text-center"
          style={{
            backgroundColor: theme.panelMutedBg,
            border: `1.5px solid ${theme.panelBorder}`,
          }}
        >
          <div>
            <div className="font-mono-num text-xl font-bold">{state.turnNumber}</div>
            <div className="text-xs" style={{ color: theme.textMuted }}>
              Turns
            </div>
          </div>
          <div>
            <div className="font-mono-num text-xl font-bold">{state.totalCaptures}</div>
            <div className="text-xs" style={{ color: theme.textMuted }}>
              Captures
            </div>
          </div>
          <div>
            <div className="font-mono-num text-xl font-bold">{state.totalBackwardMoves}</div>
            <div className="text-xs" style={{ color: theme.textMuted }}>
              Reverse Moves
            </div>
          </div>
        </div>

        <ul className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
          {rankedPlayers.map((player, idx) => {
            const palette = PLAYER_PALETTES[player.paletteIndex];
            const homeCount = player.tokens.filter((t) => t.zone === 'finished').length;
            return (
              <li
                key={player.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
                style={{ backgroundColor: idx === 0 ? theme.panelMutedBg : 'transparent' }}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="font-mono-num text-xs font-bold w-8"
                    style={{ color: idx === 0 ? theme.accent : theme.textMuted }}
                  >
                    {formatOrdinal(idx + 1)}
                  </span>
                  <TeardropPinBadge color={palette.color} darkColor={palette.dark} size={24} />
                  <span className="text-sm font-bold truncate">{player.name}</span>
                </div>
                <span className="font-mono-num text-xs" style={{ color: theme.textSecondary }}>
                  {homeCount}/{state.config.tokensPerPlayer} Home · {player.captures} cap
                </span>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="flex-1 py-3 rounded-xl font-extrabold text-sm whitespace-nowrap"
            style={{ backgroundColor: theme.accent, color: theme.accentText }}
          >
            Play Again
          </button>
          {canContinueForRanks && (
            <button
              type="button"
              onClick={onContinueForRanks}
              className="px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap"
              style={{
                backgroundColor: theme.panelMutedBg,
                color: theme.textPrimary,
                border: `1.5px solid ${theme.panelBorder}`,
              }}
            >
              Play for Ranks
            </button>
          )}
          <button
            type="button"
            onClick={onBackToTitle}
            className="px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap"
            style={{ color: theme.textSecondary }}
          >
            New Setup
          </button>
        </div>
        </div>
      </div>
    </>
  );
}
