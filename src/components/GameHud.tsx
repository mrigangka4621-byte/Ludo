import {
  BookOpen,
  Palette,
  Pause,
  RotateCcw,
  RotateCw,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  COMEBACK_YARD_MERCY_CHANCES,
  formatOrdinal,
  getNextActivePlayerIndex,
  YARD_MERCY_CHANCES,
} from '../game/engine';
import { PLAYER_PALETTES } from '../game/themes';
import type {
  BoardTheme,
  GameState,
  MoveDirection,
  MoveOption,
} from '../game/types';
import type { OnlineSeat } from '../multiplayer/protocol';
import type { VoiceUiSnapshot } from '../multiplayer/voiceChat';
import { DiceControl } from './DiceControl';
import { TitleEmblem } from './TitleEmblem';
import { SeatVoiceBadge, TopBarVoiceControls } from './VoiceIndicators';

/**
 * Reusable glossy teardrop pin icon for the bottom arcade player bar & roster.
 */
export function TeardropPinBadge({
  color,
  darkColor,
  size = 38,
}: {
  color: string;
  darkColor: string;
  size?: number;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 44" aria-hidden="true" className="shrink-0">
      <path
        d="M 20 3 C 31 3 37 12 35 22 C 33 30 25 37 20 42 C 15 37 7 30 5 22 C 3 12 9 3 20 3 Z"
        fill="#FFFFFF"
        stroke="#0B1C3D"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M 20 7.5 C 28 7.5 32.5 14 31 21.5 C 29.5 27.5 23.5 33 20 36.8 C 16.5 33 10.5 27.5 9 21.5 C 7.5 14 12 7.5 20 7.5 Z"
        fill={color}
        stroke={darkColor}
        strokeWidth="1.2"
      />
      <ellipse
        cx="16"
        cy="16"
        rx="3.2"
        ry="5.2"
        transform="rotate(-18 16 16)"
        fill="#FFFFFF"
        fillOpacity="0.52"
      />
    </svg>
  );
}

interface TopArcadeBarProps {
  state: GameState;
  theme: BoardTheme;
  muted: boolean;
  onlineRoomCode?: string | null;
  voice?: VoiceUiSnapshot;
  voiceSpeakingCount?: number;
  onJoinVoice?: () => void;
  onLeaveVoice?: () => void;
  onToggleVoiceMute?: () => void;
  onToggleVoiceDeafen?: () => void;
  onToggleMute: () => void;
  onOpenPause: () => void;
  onOpenThemePicker: () => void;
  onOpenRules: () => void;
  onToggleMobileRoster?: () => void;
}

export function TopArcadeBar({
  state,
  theme,
  muted,
  onlineRoomCode = null,
  voice,
  voiceSpeakingCount = 0,
  onJoinVoice,
  onLeaveVoice,
  onToggleVoiceMute,
  onToggleVoiceDeafen,
  onToggleMute,
  onOpenPause,
  onOpenThemePicker,
  onOpenRules,
  onToggleMobileRoster,
}: TopArcadeBarProps) {
  const isArcade = theme.id === 'arcade';
  const btnBg = isArcade ? '#0C2D63' : theme.panelBg;
  const btnBorder = isArcade ? '#FACC15' : theme.panelBorder;

  return (
    <div className="w-full flex items-center justify-between gap-2 px-3 sm:px-5 pt-2.5 pb-1 shrink-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <TitleEmblem theme={theme} compact />
        {onlineRoomCode && (
          <div
            data-testid="topbar-room-code"
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono-num text-xs font-extrabold tracking-wider shadow-sm"
            style={{
              backgroundColor: 'rgba(11, 28, 61, 0.85)',
              color: '#FDE047',
              border: '1.5px solid #FACC15',
            }}
          >
            <span>ROOM {onlineRoomCode}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {onlineRoomCode &&
          voice &&
          onJoinVoice &&
          onLeaveVoice &&
          onToggleVoiceMute &&
          onToggleVoiceDeafen && (
            <TopBarVoiceControls
              theme={theme}
              voice={voice}
              speakingCount={voiceSpeakingCount}
              onJoinVoice={onJoinVoice}
              onLeaveVoice={onLeaveVoice}
              onToggleMute={onToggleVoiceMute}
              onToggleDeafen={onToggleVoiceDeafen}
            />
          )}
        {onToggleMobileRoster && (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMobileRoster();
            }}
            aria-label={`View all ${state.players.length} players`}
            className="lg:hidden h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-bold shadow-sm"
            style={{
              backgroundColor: btnBg,
              color: theme.textPrimary,
              border: `1.5px solid ${btnBorder}`,
            }}
          >
            <Users size={15} />
            <span className="font-mono-num">{state.players.length}</span>
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onOpenThemePicker();
          }}
          aria-label="Change board theme"
          title="Board Theme"
          className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm transition-transform active:scale-95"
          style={{
            backgroundColor: btnBg,
            color: theme.textPrimary,
            border: `1.5px solid ${btnBorder}`,
          }}
        >
          <Palette size={16} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onOpenRules();
          }}
          aria-label="View game rules"
          title="Rules"
          className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm transition-transform active:scale-95"
          style={{
            backgroundColor: btnBg,
            color: theme.textPrimary,
            border: `1.5px solid ${btnBorder}`,
          }}
        >
          <BookOpen size={16} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          title={muted ? 'Unmute (M)' : 'Mute (M)'}
          className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm transition-transform active:scale-95"
          style={{
            backgroundColor: btnBg,
            color: theme.textPrimary,
            border: `1.5px solid ${btnBorder}`,
          }}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            onOpenPause();
          }}
          aria-label="Pause match"
          title="Pause (P)"
          className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm transition-transform active:scale-95"
          style={{
            backgroundColor: btnBg,
            color: theme.textPrimary,
            border: `1.5px solid ${btnBorder}`,
          }}
        >
          <Pause size={16} />
        </button>
      </div>
    </div>
  );
}

interface BottomArcadeDockProps {
  state: GameState;
  theme: BoardTheme;
  diceDisplayValue: number;
  rolling: boolean;
  justLanded: boolean;
  forwardMoves: MoveOption[];
  backwardMoves: MoveOption[];
  canControlTurn?: boolean;
  onRoll: () => void;
  onSelectDirection: (dir: MoveDirection) => void;
}

/**
 * Iconic bottom arcade player & dice dock modeled directly on the user's reference image:
 * Left active player pin + bold golden nameplate | Centered beveled Dice Tray with bouncing arrow | Right next player nameplate + pin
 * Plus sleek Flip-Track Forward / Backward turn toggle strip right above when in Flip-Track mode.
 */
export function BottomArcadeDock({
  state,
  theme,
  diceDisplayValue,
  rolling,
  justLanded,
  forwardMoves,
  backwardMoves,
  canControlTurn = true,
  onRoll,
  onSelectDirection,
}: BottomArcadeDockProps) {
  const activePlayer = state.players[state.activePlayerIndex];
  const nextIndex = getNextActivePlayerIndex(state, state.activePlayerIndex);
  const nextPlayer = state.players[nextIndex] ?? activePlayer;

  const activePalette = PLAYER_PALETTES[activePlayer.paletteIndex];
  const nextPalette = PLAYER_PALETTES[nextPlayer.paletteIndex];
  const isFlipMode = state.config.mode === 'flip';
  const isArcade = theme.id === 'arcade';

  const canRoll =
    canControlTurn && state.phase === 'awaiting_roll' && !activePlayer.isBot && !rolling;
  const isChoosing =
    canControlTurn && state.phase === 'choosing_move' && !activePlayer.isBot;
  const activeMoves = state.selectedDirection === 'forward' ? forwardMoves : backwardMoves;
  const hasCapture = activeMoves.some((m) => m.capturesTokenIds.length > 0);
  const hasFinish = activeMoves.some((m) => m.kind === 'finish');

  const statusText = !canControlTurn
    ? `Waiting for ${activePlayer.name}...`
    : isChoosing
      ? hasFinish
        ? 'Exact roll — bring a pawn home!'
        : hasCapture
          ? state.selectedDirection === 'backward'
            ? 'Backward ambush capture ready!'
            : 'Capture ready — pick highlighted pawn!'
          : `Rolled ${state.diceValue} — pick a bouncing pawn`
      : state.lastEvent?.message ?? `${activePlayer.name}'s turn`;

  return (
    <div className="w-full max-w-[680px] mx-auto px-3 pb-3 pt-1 flex flex-col items-center gap-2 shrink-0">
      {/* Compact Turn Guidance + Flip-Track Direction Rocker */}
      <div className="w-full flex flex-wrap items-center justify-between gap-2">
        <p
          className="text-xs sm:text-sm font-semibold truncate flex-1 min-w-[160px]"
          style={{ color: isArcade ? '#EFF6FF' : theme.textSecondary }}
          aria-live="polite"
          data-testid="turn-status-text"
        >
          {statusText}
        </p>

        {isFlipMode && (
          <div
            className="flex items-center gap-1 p-1 rounded-xl shrink-0 shadow-md"
            style={{
              backgroundColor: isArcade ? '#0A2552' : theme.panelBg,
              border: `1.5px solid ${isArcade ? '#FACC15' : theme.panelBorder}`,
            }}
            role="group"
            aria-label="Choose movement direction for this turn"
            data-testid="direction-selector"
          >
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectDirection('forward');
              }}
              disabled={isChoosing && forwardMoves.length === 0}
              aria-pressed={state.selectedDirection === 'forward'}
              data-testid="direction-forward-btn"
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-all active:scale-95"
              style={{
                backgroundColor:
                  state.selectedDirection === 'forward' ? theme.accent : 'transparent',
                color:
                  state.selectedDirection === 'forward'
                    ? theme.accentText
                    : theme.textSecondary,
                opacity: isChoosing && forwardMoves.length === 0 ? 0.4 : 1,
              }}
            >
              <RotateCw size={14} />
              <span>Forward</span>
              {isChoosing && (
                <span className="font-mono-num text-[11px]">({forwardMoves.length})</span>
              )}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onSelectDirection('backward');
              }}
              disabled={isChoosing && backwardMoves.length === 0}
              aria-pressed={state.selectedDirection === 'backward'}
              data-testid="direction-backward-btn"
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-all active:scale-95"
              style={{
                backgroundColor:
                  state.selectedDirection === 'backward' ? theme.captureRing : 'transparent',
                color:
                  state.selectedDirection === 'backward' ? '#FFFFFF' : theme.textSecondary,
                opacity: isChoosing && backwardMoves.length === 0 ? 0.4 : 1,
              }}
            >
              <RotateCcw size={14} />
              <span>Backward</span>
              {isChoosing && (
                <span className="font-mono-num text-[11px]">({backwardMoves.length})</span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Iconic Royal Blue & Gold Bottom Player + Center Dice Bar (pt-9 keeps bouncing arrow clear of controls above) */}
      <div className="relative w-full pt-9">
        <div
          className="relative w-full h-[64px] sm:h-[68px] rounded-2xl flex items-center justify-between px-2 sm:px-3 shadow-xl"
          style={{
            background: isArcade
              ? 'linear-gradient(180deg, #1659B8 0%, #0A3170 100%)'
              : theme.panelBg,
            border: `3px solid ${isArcade ? '#FACC15' : theme.accent}`,
          }}
        >
          {/* Left Zone: Active Turn Player Pin + Bold Golden Nameplate */}
          <div
            key={`active-seat-${activePlayer.id}`}
            className="flex items-center gap-2 min-w-0 flex-1 pr-2 animate-spring-slide"
          >
            <TeardropPinBadge
              color={activePalette.color}
              darkColor={activePalette.dark}
              size={38}
            />
            <div className="min-w-0">
              <div
                className={`font-display font-bold text-lg sm:text-2xl leading-none truncate ${
                  isArcade ? 'arcade-gold-text-sm' : ''
                }`}
                style={isArcade ? undefined : { color: theme.accent }}
              >
                {activePlayer.name}
              </div>
              <div
                className="text-[11px] font-semibold leading-tight mt-0.5 whitespace-nowrap"
                style={{ color: isArcade ? '#BFDBFE' : theme.textMuted }}
              >
                {state.config.mode === 'crazy' && state.crazyRevengeCharges?.[activePlayer.id]
                  ? '⚡ Revenge 6 Armed!'
                  : state.diceDirector?.firePlayerId === activePlayer.id &&
                      (state.diceDirector?.fireRemaining ?? 0) > 0
                    ? `🔥 On Fire · ×${state.diceDirector.fireRemaining} left`
                    : `Active · ${activePlayer.tokens.filter((t) => t.zone === 'finished').length}/${state.config.tokensPerPlayer}`}
              </div>
            </div>
          </div>

          {/* Center Zone: Elevated Beveled Dice Tray overlapping top/bottom slightly like reference */}
          <div className="relative z-10 -my-3 px-1">
            <DiceControl
              value={state.diceValue}
              displayValue={diceDisplayValue}
              rolling={rolling}
              canRoll={canRoll}
              justLanded={justLanded}
              playerColor={activePalette.color}
              playerDarkColor={activePalette.dark}
              playerName={activePlayer.name}
              theme={theme}
              onRoll={onRoll}
            />
          </div>

          {/* Right Zone: Next Up Player Nameplate + Pin */}
          <div className="flex items-center justify-end gap-2 min-w-0 flex-1 pl-2">
            <div className="min-w-0 text-right">
              <div
                className={`font-display font-bold text-base sm:text-xl leading-none truncate opacity-90 ${
                  isArcade ? 'arcade-gold-text-sm' : ''
                }`}
                style={isArcade ? undefined : { color: theme.textPrimary }}
              >
                {nextPlayer.name}
              </div>
              <div
                className="text-[11px] font-semibold leading-tight mt-0.5 whitespace-nowrap"
                style={{ color: isArcade ? '#93C5FD' : theme.textMuted }}
              >
                Next up · {nextPlayer.tokens.filter((t) => t.zone === 'finished').length}/
                {state.config.tokensPerPlayer}
              </div>
            </div>
            <TeardropPinBadge
              color={nextPalette.color}
              darkColor={nextPalette.dark}
              size={36}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface PlayerStandingsPanelProps {
  state: GameState;
  theme: BoardTheme;
  localSeatIndex?: number | null;
  onlineRoomCode?: string | null;
  onlineSeats?: OnlineSeat[];
  onCloseMobile?: () => void;
}

/**
 * Clean 2–10 Player Standings Sidebar (desktop right panel; slide-over drawer on mobile).
 */
export function PlayerStandingsPanel({
  state,
  theme,
  localSeatIndex = null,
  onlineRoomCode = null,
  onlineSeats,
  onCloseMobile,
}: PlayerStandingsPanelProps) {
  const isArcade = theme.id === 'arcade';

  return (
    <aside
      aria-label="Player standings"
      className="flex flex-col w-full lg:w-[292px] xl:w-[316px] shrink-0 h-full overflow-hidden"
      style={{
        backgroundColor: isArcade ? '#0C2D63' : theme.panelBg,
        borderLeft: `2px solid ${isArcade ? '#FACC15' : theme.panelBorder}`,
        color: theme.textPrimary,
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 shrink-0"
        style={{ borderBottom: `1px solid ${isArcade ? 'rgba(250,204,21,0.35)' : theme.panelBorder}` }}
      >
        <div>
          <h2
            className={`font-display font-bold text-lg leading-tight ${
              isArcade ? 'arcade-gold-text-sm' : ''
            }`}
          >
            Players ({state.players.length})
          </h2>
          <div className="text-xs mt-0.5 tabular-nums" style={{ color: theme.textMuted }}>
            {onlineRoomCode ? `Room ${onlineRoomCode} · ` : ''}Turn {state.turnNumber} ·{' '}
            {state.config.mode === 'uno'
              ? `${state.turnDirection === -1 ? 'UNO ↺' : 'UNO ↻'} · ${state.totalCaptures} cap`
              : state.config.mode === 'crazy'
                ? `⚡ Crazy · ${state.totalCaptures} cap`
                : `${state.totalCaptures} captures`}
          </div>
        </div>

        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="lg:hidden px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{
              backgroundColor: theme.panelMutedBg,
              color: theme.textPrimary,
            }}
          >
            Done
          </button>
        )}
      </div>

      <ul
        className="flex-1 overflow-y-auto px-3 py-2.5 space-y-1.5"
        data-testid="player-roster"
      >
        {state.players.map((player, idx) => {
          const palette = PLAYER_PALETTES[player.paletteIndex];
          const isCurrent = idx === state.activePlayerIndex && state.phase !== 'finished';
          const finishedCount = player.tokens.filter((t) => t.zone === 'finished').length;
          const activeOnBoard = player.tokens.filter(
            (t) => t.zone === 'track' || t.zone === 'home_stretch'
          ).length;

          const isOnFire =
            state.diceDirector?.firePlayerId === player.id &&
            (state.diceDirector?.fireRemaining ?? 0) > 0;
          const stuckRolls = state.diceDirector?.yardStuckRolls?.[player.id] ?? 0;
          const isComebackMercy =
            Boolean(state.diceDirector?.hasDeployedBefore?.[player.id]) || finishedCount > 0;
          const mercyCap = isComebackMercy ? COMEBACK_YARD_MERCY_CHANCES : YARD_MERCY_CHANCES;
          const mercyLeft = Math.max(0, mercyCap - stuckRolls);
          const showMercyHint =
            (state.config.mode === 'classic' || state.config.mode === 'flip') &&
            player.finishedRank === null &&
            activeOnBoard === 0 &&
            (isComebackMercy ? stuckRolls >= 3 : stuckRolls >= 6);

          const hasRevengeCharge =
            state.config.mode === 'crazy' && Boolean(state.crazyRevengeCharges?.[player.id]);
          const unoCardCount = state.unoState?.hands?.[player.id]?.length ?? 0;

          const glowPrimary = isOnFire || hasRevengeCharge ? '#F97316' : palette.color;
          const onlineSeat = onlineSeats?.find((s) => s.seatIndex === idx);
          const isVoiceSpeaking = Boolean(
            onlineSeat?.connected &&
              onlineSeat?.voiceJoined &&
              !onlineSeat?.voiceMuted &&
              onlineSeat?.voiceSpeaking
          );

          return (
            <li
              key={player.id}
              data-testid={isCurrent ? `active-standing-player-${player.id}` : `standing-player-${player.id}`}
              data-active-turn={isCurrent ? 'true' : 'false'}
              data-voice-speaking={isVoiceSpeaking ? 'true' : 'false'}
              className={`transition-all duration-300 ease-out ${
                isCurrent
                  ? 'active-roster-card scale-[1.025] z-10'
                  : `rounded-xl scale-100 opacity-85 hover:opacity-100 ${
                      isVoiceSpeaking ? 'animate-voice-speak-glow opacity-100' : ''
                    }`
              }`}
              style={
                isCurrent
                  ? ({
                      '--player-glow': glowPrimary,
                      '--player-glow-soft': `${glowPrimary}88`,
                      '--player-glow-strong': `${glowPrimary}DD`,
                    } as React.CSSProperties)
                  : {
                      backgroundColor: isVoiceSpeaking
                        ? 'rgba(34, 197, 94, 0.14)'
                        : 'rgba(0,0,0,0.14)',
                      border: `1.5px solid ${
                        isVoiceSpeaking
                          ? '#4ADE80'
                          : isOnFire || hasRevengeCharge
                            ? '#F97316'
                            : 'rgba(255,255,255,0.06)'
                      }`,
                    }
              }
            >
              <div
                className="relative overflow-hidden flex items-center justify-between gap-2 px-2.5 py-2 rounded-[11px]"
                style={
                  isCurrent
                    ? {
                        background: isArcade
                          ? `linear-gradient(110deg, ${palette.dark}EE 0%, #143F8A 58%, #0E2F6B 100%)`
                          : theme.panelMutedBg,
                      }
                    : undefined
                }
              >
                {/* Silky Diagonal Light Shimmer Sweeping Across Active Player's Card */}
                {isCurrent && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer-sweep"
                  />
                )}

                <div className="relative z-10 flex items-center gap-2.5 min-w-0">
                  {/* Dynamic Glowing Border Wrapper Around Active Player's Avatar */}
                  <div
                    className={`relative rounded-full p-0.5 flex items-center justify-center shrink-0 transition-transform duration-300 ${
                      isCurrent ? 'animate-avatar-glow bg-white/95' : ''
                    }`}
                    style={
                      isCurrent
                        ? ({
                            '--player-glow': glowPrimary,
                            '--player-glow-soft': `${glowPrimary}99`,
                            '--player-glow-strong': `${glowPrimary}EE`,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    <TeardropPinBadge
                      color={palette.color}
                      darkColor={palette.dark}
                      size={isCurrent ? 30 : 26}
                    />
                  </div>

                  {/* Active Player Nameplate & Glowing Name Accent */}
                  <div className="min-w-0">
                    <div
                      className={`text-sm font-extrabold leading-tight truncate flex items-center gap-1.5 ${
                        isCurrent ? 'text-white' : ''
                      }`}
                      style={
                        isCurrent
                          ? { textShadow: `0 0 10px ${glowPrimary}AA, 0 1px 2px rgba(0,0,0,0.65)` }
                          : undefined
                      }
                    >
                      <span className="truncate">{player.name}</span>
                      {isOnFire && (
                        <span
                          className="text-[11px] font-extrabold text-amber-300 shrink-0"
                          title="On Fire Hot Streak"
                          data-testid={`fire-badge-p${player.id}`}
                        >
                          🔥×{state.diceDirector?.fireRemaining}
                        </span>
                      )}
                      {hasRevengeCharge && (
                        <span
                          className="text-[11px] font-extrabold text-orange-300 shrink-0"
                          title="Revenge 6 ready on next roll!"
                          data-testid={`revenge-badge-p${player.id}`}
                        >
                          ⚡6
                        </span>
                      )}
                      {state.config.mode === 'uno' && player.finishedRank === null && !isCurrent && (
                        <span
                          className="text-[11px] font-extrabold text-yellow-300 shrink-0"
                          data-testid={`uno-hand-count-p${player.id}`}
                        >
                          🃏{unoCardCount}
                        </span>
                      )}
                      {localSeatIndex === idx && (
                        <span className="text-[10px] font-extrabold text-yellow-300 shrink-0">
                          (You)
                        </span>
                      )}
                      {player.isBot && (
                        <span className="text-[11px] font-medium opacity-75">CPU</span>
                      )}
                    </div>
                    <div
                      className="text-[11px] font-semibold leading-tight mt-0.5 flex items-center gap-1 flex-wrap"
                      style={{ color: isCurrent ? '#FEF9C3' : theme.textMuted }}
                    >
                      {isCurrent && (
                        <span
                          className="px-1.5 py-0.5 rounded-full font-display font-black text-[9px] uppercase tracking-wider shrink-0 shadow-sm"
                          data-testid={`active-turn-pill-p${player.id}`}
                          style={{
                            backgroundColor: '#FDE047',
                            color: '#0B1C3D',
                            boxShadow: '0 0 8px rgba(253, 224, 71, 0.75)',
                          }}
                        >
                          ▶ TURN
                        </span>
                      )}
                      {player.finishedRank !== null ? (
                        `${formatOrdinal(player.finishedRank)} place`
                      ) : state.config.mode === 'uno' ? (
                        isCurrent ? (
                          <>
                            <span
                              className="font-extrabold text-yellow-300"
                              data-testid={`uno-hand-count-p${player.id}`}
                            >
                              🃏{unoCardCount}
                            </span>
                            <span>· Playing · {player.captures} cap</span>
                          </>
                        ) : (
                          `${unoCardCount} cards · ${player.captures} cap`
                        )
                      ) : showMercyHint ? (
                        mercyLeft === 0 ? (
                          isComebackMercy ? (
                            '🍀 Next roll: Comeback 6!'
                          ) : (
                            '🍀 Next roll: Mercy 6!'
                          )
                        ) : isComebackMercy ? (
                          `🍀 Comeback 6 in ${mercyLeft} (+50%)`
                        ) : (
                          `🍀 Mercy 6 in ${mercyLeft}`
                        )
                      ) : isCurrent ? (
                        'Rolling now'
                      ) : (
                        `${activeOnBoard} on board`
                      )}
                    </div>
                  </div>
                </div>

                <div className="relative z-10 flex items-center gap-1.5 shrink-0">
                  {onlineSeat && (
                    <SeatVoiceBadge
                      voiceJoined={onlineSeat.voiceJoined}
                      voiceMuted={onlineSeat.voiceMuted}
                      voiceSpeaking={onlineSeat.voiceSpeaking}
                      testIdPrefix={`standings-voice-p${player.id}`}
                    />
                  )}
                  <div className="flex items-center gap-1" aria-hidden="true">
                    {player.tokens.map((tok) => (
                      <span
                        key={tok.id}
                        className="w-2.5 h-2.5 rounded-full transition-all duration-300"
                        style={{
                          backgroundColor:
                            tok.zone === 'finished'
                              ? palette.color
                              : tok.zone === 'track' || tok.zone === 'home_stretch'
                                ? `${palette.color}88`
                                : 'transparent',
                          border: `1.5px solid ${isCurrent ? '#FEF08A' : palette.color}`,
                          boxShadow:
                            tok.zone === 'finished' ? `0 0 6px ${palette.color}` : undefined,
                        }}
                      />
                    ))}
                  </div>
                  <span className="font-mono-num text-xs font-bold w-6 text-right">
                    {finishedCount}/{state.config.tokensPerPlayer}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
