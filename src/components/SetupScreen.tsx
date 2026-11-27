import { useMemo, useState } from 'react';
import { ArrowLeft, Bot, ChevronDown, ChevronUp, Play, RotateCcw, RotateCw, User } from 'lucide-react';
import { createInitialGameState } from '../game/engine';
import { soundFx } from '../game/sound';
import { BOARD_THEMES, PLAYER_PALETTES, THEME_LIST } from '../game/themes';
import type { GameConfig, GameMode, MoveDirection, ThemeId } from '../game/types';
import { TeardropPinBadge } from './GameHud';
import { LudoBoard } from './LudoBoard';
import { TitleEmblem } from './TitleEmblem';

interface SetupScreenProps {
  config: GameConfig;
  playCategory: 'computer' | 'local';
  hasSavedMatch: boolean;
  onBackToHome: () => void;
  onChangePlayerCount: (count: number) => void;
  onChangeMode: (mode: GameMode) => void;
  onChangeTokensPerPlayer: (count: 2 | 4) => void;
  onChangeTheme: (themeId: ThemeId) => void;
  onUpdatePlayer: (index: number, patch: { name?: string; isBot?: boolean }) => void;
  onStartMatch: () => void;
  onResumeMatch: () => void;
}

const PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

export function SetupScreen({
  config,
  playCategory,
  hasSavedMatch,
  onBackToHome,
  onChangePlayerCount,
  onChangeMode,
  onChangeTokensPerPlayer,
  onChangeTheme,
  onUpdatePlayer,
  onStartMatch,
  onResumeMatch,
}: SetupScreenProps) {
  const [rosterOpen, setRosterOpen] = useState(false);
  const [previewDirection, setPreviewDirection] = useState<MoveDirection>('forward');
  const theme = BOARD_THEMES[config.themeId];
  const isArcade = theme.id === 'arcade';

  const previewState = useMemo(() => createInitialGameState(config), [config]);

  return (
    <div
      className={`min-h-screen lg:h-screen w-full flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden ${
        isArcade ? 'ludo-arcade-wallpaper' : ''
      }`}
      style={{ backgroundColor: theme.pageBg, color: theme.textPrimary }}
    >
      {/* Left/Center Live Interactive N-Arm Board Showcase */}
      <section
        aria-label="Live board preview"
        className="relative flex-1 flex flex-col items-center justify-center p-5 sm:p-8 lg:p-10 min-h-[360px] lg:min-h-0"
      >
        <div
          key={`${config.playerCount}-${config.themeId}`}
          className="relative w-full max-w-[650px] aspect-square flex items-center justify-center animate-spring-pop"
        >
          <LudoBoard
            state={previewState}
            theme={theme}
            legalMoves={[]}
            mode={config.mode}
            selectedDirection={previewDirection}
            activeAnimation={null}
            flyingCaptures={[]}
            hopTrails={[]}
            boardEffects={[]}
            interactive={false}
            isLiveMatch={false}
          />

          {/* Bold Arcade Start Game CTA Centered Right Over the Middle of the Board */}
          <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center p-4">
            <div className="pointer-events-auto flex flex-col items-center gap-2.5">
              <button
                type="button"
                data-start="true"
                data-testid="board-center-start-btn"
                onClick={() => {
                  soundFx.playDeploy();
                  onStartMatch();
                }}
                className="group flex items-center justify-center gap-2.5 px-7 sm:px-9 py-3.5 sm:py-4 rounded-2xl font-display text-lg sm:text-2xl font-black tracking-wide whitespace-nowrap transition-transform duration-150 hover:scale-105 active:scale-95 animate-start-cta-pulse"
                style={{
                  background: isArcade
                    ? 'linear-gradient(180deg, #FDE047 0%, #FACC15 55%, #EAB308 100%)'
                    : theme.accent,
                  color: isArcade ? '#0B1C3D' : theme.accentText,
                  border: '3.5px solid #FFFFFF',
                }}
              >
                <Play size={22} fill="currentColor" className="transition-transform group-hover:translate-x-0.5" />
                <span>Start Game</span>
              </button>

              {hasSavedMatch && (
                <button
                  type="button"
                  data-testid="board-center-resume-btn"
                  onClick={() => {
                    soundFx.playButtonClick();
                    onResumeMatch();
                  }}
                  className="px-5 py-2 rounded-xl text-xs sm:text-sm font-extrabold whitespace-nowrap shadow-xl transition-transform hover:scale-105 active:scale-95"
                  style={{
                    backgroundColor: 'rgba(11, 28, 61, 0.92)',
                    color: '#FDE047',
                    border: '2px solid #FACC15',
                  }}
                >
                  Resume Saved Match
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-medium"
          style={{ color: theme.textSecondary }}
        >
          <span>
            {config.playerCount} Players ·{' '}
            {config.mode === 'flip'
              ? 'Flip-Track Mode'
              : config.mode === 'crazy'
                ? 'Crazy Mode ⚡'
                : config.mode === 'uno'
                  ? 'UNO Ludo 🃏'
                  : 'Classic Mode'}{' '}
            · {theme.name}
          </span>
          {config.mode === 'flip' && (
            <button
              type="button"
              onClick={() =>
                setPreviewDirection((d) => (d === 'forward' ? 'backward' : 'forward'))
              }
              className="inline-flex items-center gap-1.5 font-bold underline underline-offset-4 transition-opacity hover:opacity-85 whitespace-nowrap"
              style={{ color: theme.accent }}
            >
              {previewDirection === 'forward' ? <RotateCw size={13} /> : <RotateCcw size={13} />}
              Preview {previewDirection === 'forward' ? 'Backward' : 'Forward'} Flow
            </button>
          )}
        </div>
      </section>

      {/* Right Tabletop Match Setup Panel */}
      <section
        aria-label="Match setup"
        className="w-full lg:w-[460px] xl:w-[500px] shrink-0 flex flex-col lg:h-full overflow-y-auto border-t-2 lg:border-t-0 lg:border-l-2"
        style={{
          backgroundColor: theme.panelBg,
          borderColor: isArcade ? '#FACC15' : theme.panelBorder,
        }}
      >
        <div className="flex-1 px-6 sm:px-8 py-6 space-y-5">
          {/* Bold Golden-Trimmed Mango Ludo Ribbon Header */}
          <TitleEmblem
            theme={theme}
            subtitle={
              playCategory === 'computer'
                ? 'Vs Computer · Solo Match Setup'
                : 'Local Pass & Play · Match Setup'
            }
          />

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              data-testid="setup-back-home-btn"
              onClick={() => {
                soundFx.playButtonClick();
                onBackToHome();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-transform active:scale-95"
              style={{
                backgroundColor: theme.panelMutedBg,
                color: theme.textPrimary,
                border: `1.5px solid ${isArcade ? 'rgba(250,204,21,0.45)' : theme.panelBorder}`,
              }}
            >
              <ArrowLeft size={14} />
              <span>Home</span>
            </button>
            <span className="text-xs font-bold" style={{ color: theme.accent }}>
              {playCategory === 'computer'
                ? `You vs ${Math.max(1, config.playerCount - 1)} CPU`
                : 'Pass & Play'}
            </span>
          </div>

          {/* 1. Game Mode Selector */}
          <div className="space-y-2">
            <label
              className="block text-xs font-bold tracking-wide"
              style={{ color: theme.textMuted }}
            >
              Game Mode
            </label>
            <div
              className="grid grid-cols-2 gap-2 p-1.5 rounded-xl"
              style={{
                backgroundColor: theme.panelMutedBg,
                border: `1.5px solid ${isArcade ? 'rgba(250,204,21,0.45)' : theme.panelBorder}`,
              }}
              role="group"
              aria-label="Game mode"
            >
              <button
                type="button"
                onClick={() => {
                  soundFx.playButtonClick();
                  onChangeMode('classic');
                }}
                aria-pressed={config.mode === 'classic'}
                data-testid="mode-classic-btn"
                className="px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap active:scale-95"
                style={{
                  backgroundColor: config.mode === 'classic' ? theme.accent : 'transparent',
                  color: config.mode === 'classic' ? theme.accentText : theme.textSecondary,
                }}
              >
                Classic Ludo
              </button>
              <button
                type="button"
                onClick={() => {
                  soundFx.playButtonClick();
                  onChangeMode('flip');
                }}
                aria-pressed={config.mode === 'flip'}
                data-testid="mode-flip-btn"
                className="px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap active:scale-95"
                style={{
                  backgroundColor: config.mode === 'flip' ? theme.accent : 'transparent',
                  color: config.mode === 'flip' ? theme.accentText : theme.textSecondary,
                }}
              >
                Flip-Track (↔)
              </button>
              <button
                type="button"
                onClick={() => {
                  soundFx.playButtonClick();
                  onChangeMode('crazy');
                }}
                aria-pressed={config.mode === 'crazy'}
                data-testid="mode-crazy-btn"
                className="px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap active:scale-95"
                style={{
                  backgroundColor: config.mode === 'crazy' ? '#F97316' : 'transparent',
                  color: config.mode === 'crazy' ? '#FFFFFF' : theme.textSecondary,
                }}
              >
                Crazy Mode ⚡
              </button>
              <button
                type="button"
                onClick={() => {
                  soundFx.playButtonClick();
                  onChangeMode('uno');
                }}
                aria-pressed={config.mode === 'uno'}
                data-testid="mode-uno-btn"
                className="px-3 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all whitespace-nowrap active:scale-95"
                style={{
                  backgroundColor: config.mode === 'uno' ? '#E52521' : 'transparent',
                  color: config.mode === 'uno' ? '#FFFFFF' : theme.textSecondary,
                }}
              >
                UNO Ludo 🃏
              </button>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: theme.textSecondary }}>
              {config.mode === 'flip'
                ? 'Choose Forward or Backward each turn to ambush rivals or complete a reverse lap. Opening Mercy 6 after 10 misses; Comeback Mercy 6 in max 8 rolls (+50% 6 chance) if captured back to Home Yard!'
                : config.mode === 'crazy'
                  ? 'Pure chaos! Boosted 6s (capped at Double Six — after two 6s your bonus roll is guaranteed 1–5!), guaranteed capture snipe whenever a rival is 1–6 steps ahead, Revenge 6s after getting kicked, and wild Chaos Star events (+2 Turbo, Swaparoo, Bonus Roll)!'
                  : config.mode === 'uno'
                    ? 'No dice — play from 6 UNO cards in your Home Yard! All pawns start ready on Start Squares. Capture rivals back to Start for bonus plays, or drop Reverse, Skip, Swap, and stackable -2 / -4 knockbacks!'
                    : 'Traditional clockwise race with safe stars, bonus rolls on 6s, opponent captures, 10-roll opening Mercy 6, and 8-roll (+50% boosted) Comeback Mercy 6 if captured back to Home Yard!'}
            </p>
          </div>

          {/* 2. Player Count (2 to 10) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span
                className="text-xs font-bold tracking-wide"
                style={{ color: theme.textMuted }}
              >
                {playCategory === 'computer'
                  ? 'Total Players (You + CPU Bots)'
                  : 'Players (Single Device)'}
              </span>
              <span
                className="font-mono-num text-xs font-bold"
                style={{ color: theme.accent }}
              >
                {config.playerCount} Seats
              </span>
            </div>

            <div
              className="grid grid-cols-9 gap-1.5"
              role="group"
              aria-label="Number of players"
            >
              {PLAYER_COUNTS.map((count) => {
                const selected = config.playerCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    onClick={() => {
                      soundFx.playButtonClick();
                      onChangePlayerCount(count);
                    }}
                    aria-pressed={selected}
                    aria-label={`${count} players`}
                    data-testid={`player-count-${count}`}
                    className="h-10 rounded-lg font-mono-num text-sm font-bold transition-transform active:scale-95 focus-visible:outline-2"
                    style={{
                      backgroundColor: selected ? theme.accent : theme.panelMutedBg,
                      color: selected ? theme.accentText : theme.textPrimary,
                      border: `1.5px solid ${
                        selected
                          ? theme.accent
                          : isArcade
                            ? 'rgba(250,204,21,0.35)'
                            : theme.panelBorder
                      }`,
                    }}
                  >
                    {count}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onChangeTokensPerPlayer(4)}
                  aria-pressed={config.tokensPerPlayer === 4}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors"
                  style={{
                    backgroundColor:
                      config.tokensPerPlayer === 4 ? theme.panelMutedBg : 'transparent',
                    color:
                      config.tokensPerPlayer === 4 ? theme.textPrimary : theme.textMuted,
                    border: `1.5px solid ${
                      config.tokensPerPlayer === 4 ? theme.accent : 'rgba(255,255,255,0.2)'
                    }`,
                  }}
                >
                  4 Tokens
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTokensPerPlayer(2)}
                  aria-pressed={config.tokensPerPlayer === 2}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors"
                  style={{
                    backgroundColor:
                      config.tokensPerPlayer === 2 ? theme.panelMutedBg : 'transparent',
                    color:
                      config.tokensPerPlayer === 2 ? theme.textPrimary : theme.textMuted,
                    border: `1.5px solid ${
                      config.tokensPerPlayer === 2 ? theme.accent : 'rgba(255,255,255,0.2)'
                    }`,
                  }}
                >
                  2 Tokens (Quick)
                </button>
              </div>

              <button
                type="button"
                onClick={() => setRosterOpen((v) => !v)}
                aria-expanded={rosterOpen}
                className="inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap transition-opacity hover:opacity-85"
                style={{ color: theme.accent }}
              >
                <span>Customize Seats</span>
                {rosterOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {rosterOpen && (
              <div
                className="max-h-48 overflow-y-auto pr-1 pt-2 space-y-2"
                style={{ borderTop: `1px solid ${isArcade ? 'rgba(250,204,21,0.3)' : theme.panelBorder}` }}
              >
                {config.players.slice(0, config.playerCount).map((player, idx) => {
                  const palette = PLAYER_PALETTES[player.paletteIndex];
                  return (
                    <div key={player.id} className="flex items-center gap-2">
                      <TeardropPinBadge color={palette.color} darkColor={palette.dark} size={26} />
                      <input
                        type="text"
                        value={player.name}
                        maxLength={18}
                        aria-label={`Player ${idx + 1} name`}
                        onChange={(e) => onUpdatePlayer(idx, { name: e.target.value })}
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg text-sm font-medium outline-none focus-visible:ring-2"
                        style={{
                          backgroundColor: theme.panelMutedBg,
                          border: `1px solid ${isArcade ? 'rgba(250,204,21,0.35)' : theme.panelBorder}`,
                          color: theme.textPrimary,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => onUpdatePlayer(idx, { isBot: !player.isBot })}
                        aria-label={`Toggle ${player.name} between Human and CPU`}
                        className="h-8 px-2.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
                        style={{
                          backgroundColor: theme.panelMutedBg,
                          border: `1px solid ${isArcade ? 'rgba(250,204,21,0.35)' : theme.panelBorder}`,
                          color: player.isBot ? theme.accent : theme.textSecondary,
                        }}
                      >
                        {player.isBot ? <Bot size={13} /> : <User size={13} />}
                        <span>{player.isBot ? 'CPU' : 'Human'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Customizable Board Themes */}
          <div className="space-y-2">
            <span
              className="block text-xs font-bold tracking-wide"
              style={{ color: theme.textMuted }}
            >
              Board Theme
            </span>

            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
              role="group"
              aria-label="Board theme"
            >
              {THEME_LIST.map((t) => {
                const selected = t.id === config.themeId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      soundFx.playButtonClick();
                      onChangeTheme(t.id);
                    }}
                    aria-pressed={selected}
                    data-testid={`theme-${t.id}`}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-transform active:scale-[0.98] focus-visible:outline-2"
                    style={{
                      backgroundColor: selected ? theme.panelMutedBg : 'rgba(0,0,0,0.12)',
                      border: `2px solid ${
                        selected
                          ? theme.accent
                          : isArcade
                            ? 'rgba(255,255,255,0.16)'
                            : theme.panelBorder
                      }`,
                    }}
                  >
                    <div className="flex items-center -space-x-1 shrink-0" aria-hidden="true">
                      {t.swatches.map((hex, sIdx) => (
                        <span
                          key={sIdx}
                          className="w-4 h-4 rounded-full border border-black/30"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold leading-tight truncate">{t.name}</div>
                      <div
                        className="text-[11px] leading-tight mt-0.5 truncate"
                        style={{ color: theme.textMuted }}
                      >
                        {t.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Compact Footer Control Hint (Start Game CTA is centered over the middle of the board!) */}
        <div
          className="px-6 sm:px-8 py-3.5 shrink-0"
          style={{ borderTop: `1.5px solid ${isArcade ? 'rgba(250,204,21,0.35)' : theme.panelBorder}` }}
        >
          <p className="text-[11px] text-center font-medium" style={{ color: theme.textMuted }}>
            Tap <strong>Start Game</strong> on the board or press Space · F Forward · B Backward · P Pause · M Mute
          </p>
        </div>
      </section>
    </div>
  );
}
