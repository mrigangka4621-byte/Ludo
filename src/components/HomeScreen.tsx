import { useState, type ReactNode } from 'react';
import { ArrowLeft, Crown, KeyRound, Play } from 'lucide-react';
import { soundFx } from '../game/sound';
import { BOARD_THEMES, THEME_LIST } from '../game/themes';
import type { GameConfig, GameMode, ThemeId } from '../game/types';
import type { PlayCategory } from '../multiplayer/protocol';
import {
  LudoPatternBackdrop,
  MangoLudoHeroCrest,
  ModeArtClassic,
  ModeArtCrazy,
  ModeArtFlipTrack,
  ModeArtUno,
  TileArtComputer,
  TileArtPassAndPlay,
  TileArtPlayOnline,
  TileArtPlayWithFriends,
} from './LandingArt';

export interface HomeScreenProps {
  config: GameConfig;
  initialCategory?: PlayCategory | null;
  initialRoomCode?: string;
  hasSavedMatch: boolean;
  onlineError: string | null;
  connectingOnline: boolean;
  onClearOnlineError: () => void;
  onChangeTheme: (themeId: ThemeId) => void;
  onSelectLocalOrComputerMode: (category: 'computer' | 'local', mode: GameMode) => void;
  onCreateOnlineRoom: (params: {
    playerName: string;
    mode: GameMode;
    playerCount: number;
    tokensPerPlayer: 2 | 4;
    fillWithBots: boolean;
  }) => void;
  onJoinOnlineRoom: (roomCode: string, playerName: string) => void;
  onResumeMatch: () => void;
}

type LandingStep = 'home' | 'modes' | 'mp-room';

const PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

const MODE_TILES: Array<{
  id: GameMode;
  labelLine1: string;
  labelLine2?: string;
  shortTag: string;
  art: () => ReactNode;
}> = [
  {
    id: 'classic',
    labelLine1: 'CLASSIC',
    labelLine2: 'LUDO',
    shortTag: 'Mercy 6 & Stars',
    art: () => <ModeArtClassic />,
  },
  {
    id: 'flip',
    labelLine1: 'FLIP',
    labelLine2: 'TRACK',
    shortTag: 'Forward & Back',
    art: () => <ModeArtFlipTrack />,
  },
  {
    id: 'crazy',
    labelLine1: 'CRAZY',
    labelLine2: 'MODE',
    shortTag: 'Snipes & Double 6',
    art: () => <ModeArtCrazy />,
  },
  {
    id: 'uno',
    labelLine1: 'UNO',
    labelLine2: 'LUDO',
    shortTag: '6 Cards & -2 / -4',
    art: () => <ModeArtUno />,
  },
];

interface ArcadeTileButtonProps {
  testId: string;
  ariaLabel: string;
  labelLine1: string;
  labelLine2?: string;
  subCaption?: string;
  art: ReactNode;
  onClick: () => void;
}

function ArcadeTileButton({
  testId,
  ariaLabel,
  labelLine1,
  labelLine2,
  subCaption,
  art,
  onClick,
}: ArcadeTileButtonProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={ariaLabel}
      onClick={onClick}
      className="arcade-gold-tile group relative w-full rounded-[20px] p-[4px] sm:p-[5px] text-center transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-200 select-none"
    >
      <div className="flex flex-col overflow-hidden rounded-[15px] h-full">
        {/* Top Glossy Royal Blue Art Chamber */}
        <div
          className="relative flex items-center justify-center px-3 py-2.5 sm:py-3.5 h-[76px] sm:h-[94px]"
          style={{
            background:
              'linear-gradient(180deg, #1E70E8 0%, #0E47B5 52%, #092B7A 100%)',
            boxShadow: 'inset 0 2px 6px rgba(147, 197, 253, 0.45)',
          }}
        >
          {/* Glossy top sheen */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 top-1 h-5 rounded-full opacity-30"
            style={{
              background: 'linear-gradient(180deg, #FFFFFF 0%, rgba(255,255,255,0) 100%)',
            }}
          />
          <div className="relative z-10 w-full flex items-center justify-center transition-transform duration-150 group-hover:scale-105">
            {art}
          </div>
        </div>

        {/* Bottom Sunny Golden Label Plate */}
        <div
          className="flex flex-col items-center justify-center px-2 py-2 sm:py-2.5 min-h-[54px] sm:min-h-[62px]"
          style={{
            background:
              'linear-gradient(180deg, #FDE047 0%, #FACC15 65%, #EAB308 100%)',
            borderTop: '2px solid rgba(120, 53, 15, 0.25)',
          }}
        >
          <span className="arcade-white-text font-display font-bold text-[16px] sm:text-[20px] leading-[1.06] tracking-wide uppercase">
            {labelLine1}
            {labelLine2 ? (
              <>
                <br />
                {labelLine2}
              </>
            ) : null}
          </span>
          {subCaption && (
            <span className="mt-0.5 text-[10px] sm:text-[11px] font-extrabold text-[#1E3A8A] leading-tight">
              {subCaption}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function HomeScreen({
  config,
  initialCategory = null,
  initialRoomCode = '',
  hasSavedMatch,
  onlineError,
  connectingOnline,
  onClearOnlineError,
  onChangeTheme,
  onSelectLocalOrComputerMode,
  onCreateOnlineRoom,
  onJoinOnlineRoom,
  onResumeMatch,
}: HomeScreenProps) {
  const [step, setStep] = useState<LandingStep>(() => {
    if (initialRoomCode) return 'mp-room';
    if (initialCategory) return 'modes';
    return 'home';
  });
  const [selectedCategory, setSelectedCategory] = useState<PlayCategory | null>(
    initialRoomCode ? 'multiplayer' : initialCategory
  );
  const [mpTab, setMpTab] = useState<'create' | 'join'>(initialRoomCode ? 'join' : 'create');
  const [mpMode, setMpMode] = useState<GameMode>(config.mode);
  const [mpPlayerCount, setMpPlayerCount] = useState<number>(
    Math.min(4, Math.max(2, config.playerCount))
  );
  const [mpTokens, setMpTokens] = useState<2 | 4>(config.tokensPerPlayer);
  const [mpFillBots, setMpFillBots] = useState<boolean>(true);
  const [playerName, setPlayerName] = useState<string>('Player 1');
  const [roomCodeInput, setRoomCodeInput] = useState<string>(initialRoomCode.toUpperCase());

  const theme = BOARD_THEMES[config.themeId];
  const isArcade = theme.id === 'arcade';

  const handleOpenCategory = (cat: PlayCategory) => {
    soundFx.playButtonClick();
    onClearOnlineError();
    setSelectedCategory(cat);
    setStep('modes');
  };

  const handleOpenJoinDirectly = () => {
    soundFx.playButtonClick();
    onClearOnlineError();
    setSelectedCategory('multiplayer');
    setMpTab('join');
    setStep('mp-room');
  };

  const handlePickMode = (mode: GameMode) => {
    soundFx.playButtonClick();
    onClearOnlineError();
    if (selectedCategory === 'computer' || selectedCategory === 'local') {
      onSelectLocalOrComputerMode(selectedCategory, mode);
    } else {
      setMpMode(mode);
      setMpTab('create');
      setStep('mp-room');
    }
  };

  const handleBackFromModes = () => {
    soundFx.playButtonClick();
    onClearOnlineError();
    setSelectedCategory(null);
    setStep('home');
  };

  const handleBackFromMpRoom = () => {
    soundFx.playButtonClick();
    onClearOnlineError();
    if (mpTab === 'create') {
      setStep('modes');
    } else {
      setSelectedCategory(null);
      setStep('home');
    }
  };

  const categoryHeading =
    selectedCategory === 'multiplayer'
      ? 'Play Online · Pick a Mode'
      : selectedCategory === 'computer'
        ? 'Vs Computer · Pick a Mode'
        : 'Pass & Play · Pick a Mode';

  const modeLabel =
    mpMode === 'flip'
      ? 'Flip-Track'
      : mpMode === 'crazy'
        ? 'Crazy Mode'
        : mpMode === 'uno'
          ? 'UNO Ludo'
          : 'Classic Ludo';

  return (
    <div
      className="relative min-h-[100dvh] h-[100dvh] w-full overflow-y-auto flex flex-col items-center justify-center px-4 py-3 sm:py-5"
      style={{
        background: isArcade
          ? 'radial-gradient(ellipse at 50% 24%, #2574E8 0%, #1049B8 46%, #09266E 100%)'
          : `radial-gradient(ellipse at 50% 24%, ${theme.panelBg} 0%, ${theme.pageBg} 100%)`,
        color: '#FFFFFF',
      }}
    >
      {/* Subtle diagonal Ludo board pattern backdrop */}
      <LudoPatternBackdrop />

      {/* Main Centered Zero-Scroll Arcade Lobby Container */}
      <main
        aria-label="Mango Ludo home menu"
        className="relative z-10 w-full max-w-[440px] sm:max-w-[540px] flex flex-col items-center justify-center gap-3 sm:gap-4 my-auto"
      >
        {/* STEP 1: LANDING SCREEN (LUDO KING LAYOUT — MULTIPLAYER, JOIN FRIENDS, COMPUTER, LOCAL) */}
        {step === 'home' && (
          <div
            data-testid="home-options-view"
            className="w-full flex flex-col items-center gap-3.5 sm:gap-5 animate-spring-pop"
          >
            <MangoLudoHeroCrest />

            <h1 className="sr-only">Mango Ludo</h1>

            {/* 2x2 Glossy Golden-Framed Arcade Tile Grid */}
            <div className="w-full grid grid-cols-2 gap-3.5 sm:gap-5">
              <ArcadeTileButton
                testId="home-option-multiplayer"
                ariaLabel="Play Online Multiplayer"
                labelLine1="PLAY"
                labelLine2="ONLINE"
                art={<TileArtPlayOnline />}
                onClick={() => handleOpenCategory('multiplayer')}
              />

              <ArcadeTileButton
                testId="home-option-join"
                ariaLabel="Play With Friends using Room Code"
                labelLine1="PLAY WITH"
                labelLine2="FRIENDS"
                art={<TileArtPlayWithFriends />}
                onClick={handleOpenJoinDirectly}
              />

              <ArcadeTileButton
                testId="home-option-computer"
                ariaLabel="Play against Computer bots"
                labelLine1="COMPUTER"
                art={<TileArtComputer />}
                onClick={() => handleOpenCategory('computer')}
              />

              <ArcadeTileButton
                testId="home-option-local"
                ariaLabel="Local Pass and Play"
                labelLine1="PASS N PLAY"
                art={<TileArtPassAndPlay />}
                onClick={() => handleOpenCategory('local')}
              />
            </div>

            {/* Optional Resume Saved Match + Compact Theme Selector */}
            <div className="w-full flex flex-col items-center gap-2.5 pt-1">
              {hasSavedMatch && (
                <button
                  type="button"
                  data-testid="home-resume-btn"
                  onClick={() => {
                    soundFx.playButtonClick();
                    onResumeMatch();
                  }}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-full text-xs sm:text-sm font-extrabold shadow-lg transition-transform hover:scale-[1.03] active:scale-95"
                  style={{
                    backgroundColor: 'rgba(9, 32, 86, 0.82)',
                    color: '#FDE047',
                    border: '2px solid #FACC15',
                  }}
                >
                  <Play size={14} fill="currentColor" />
                  <span>Resume Saved Match</span>
                </button>
              )}

              <div className="flex items-center justify-center gap-2.5">
                <span className="text-[11px] font-bold text-blue-100/80">Theme</span>
                <div className="flex items-center gap-2">
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
                        aria-label={`Use ${t.name} theme`}
                        aria-pressed={selected}
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95 shadow-md"
                        style={{
                          backgroundColor: t.pageBg,
                          border: `2.5px solid ${selected ? '#FDE047' : 'rgba(255,255,255,0.42)'}`,
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: t.swatches[0] }}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: SELECT GAME MODE (ALL 4 MODES VISIBLE AT ONCE — ZERO SCROLLING!) */}
        {step === 'modes' && selectedCategory && (
          <div
            data-testid={`mode-select-${selectedCategory}`}
            className="w-full flex flex-col items-center gap-3.5 sm:gap-5 animate-spring-pop"
          >
            {/* Compact Top Navigation + Mini Crest */}
            <div className="w-full flex items-center justify-between gap-2">
              <button
                type="button"
                data-testid="home-back-btn"
                onClick={handleBackFromModes}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold shadow-md transition-transform hover:scale-[1.03] active:scale-95"
                style={{
                  backgroundColor: 'rgba(9, 32, 86, 0.82)',
                  color: '#FFFFFF',
                  border: '2px solid rgba(250, 204, 21, 0.78)',
                }}
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>

              <span className="arcade-gold-text-sm font-display font-bold text-lg sm:text-xl tracking-wide">
                Mango Ludo
              </span>
            </div>

            <div className="text-center space-y-0.5">
              <h2 className="arcade-white-text font-display font-bold text-2xl sm:text-3xl tracking-wide uppercase">
                Select Mode
              </h2>
              <p className="text-xs sm:text-sm font-semibold text-blue-100/90">
                {categoryHeading}
              </p>
            </div>

            {/* 2x2 Glossy Arcade Game Mode Tiles (All 4 Modes Fit Above the Fold!) */}
            <div className="w-full grid grid-cols-2 gap-3.5 sm:gap-5">
              {MODE_TILES.map((mode) => (
                <ArcadeTileButton
                  key={mode.id}
                  testId={`pick-mode-${mode.id}`}
                  ariaLabel={`Select ${mode.labelLine1} ${mode.labelLine2 ?? ''}`}
                  labelLine1={mode.labelLine1}
                  labelLine2={mode.labelLine2}
                  subCaption={mode.shortTag}
                  art={mode.art()}
                  onClick={() => handlePickMode(mode.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* STEP 2B: MULTIPLAYER CREATE OR JOIN ROOM (COMPACT ZERO-SCROLL PANEL) */}
        {step === 'mp-room' && (
          <div
            data-testid="mode-select-multiplayer"
            className="w-full flex flex-col gap-3.5 animate-spring-pop"
          >
            {/* Compact Header */}
            <div className="w-full flex items-center justify-between gap-2">
              <button
                type="button"
                data-testid="home-back-btn"
                onClick={handleBackFromMpRoom}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold shadow-md transition-transform hover:scale-[1.03] active:scale-95"
                style={{
                  backgroundColor: 'rgba(9, 32, 86, 0.82)',
                  color: '#FFFFFF',
                  border: '2px solid rgba(250, 204, 21, 0.78)',
                }}
              >
                <ArrowLeft size={16} />
                <span>{mpTab === 'create' ? 'Modes' : 'Back'}</span>
              </button>

              <span className="arcade-gold-text-sm font-display font-bold text-lg sm:text-xl tracking-wide">
                Mango Ludo
              </span>
            </div>

            {/* Glossy Royal Blue & Gold Card */}
            <div
              className="w-full rounded-[22px] p-4 sm:p-5 space-y-4 shadow-2xl"
              style={{
                background: 'linear-gradient(180deg, rgba(14, 52, 134, 0.96) 0%, rgba(8, 28, 78, 0.98) 100%)',
                border: '3px solid #FACC15',
              }}
            >
              {/* Dedicated Single-Purpose Heading (Play Online = Create only; Play With Friends = Join only) */}
              <div
                className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl"
                style={{
                  backgroundColor: 'rgba(5, 16, 46, 0.65)',
                  border: '1.5px solid rgba(250, 204, 21, 0.45)',
                }}
              >
                {mpTab === 'create' ? (
                  <>
                    <Crown size={16} className="text-yellow-300 shrink-0" />
                    <h2
                      data-testid="mp-create-heading"
                      className="font-display font-bold text-base sm:text-lg tracking-wide text-yellow-300 uppercase"
                    >
                      Play Online · Create Room
                    </h2>
                  </>
                ) : (
                  <>
                    <KeyRound size={16} className="text-yellow-300 shrink-0" />
                    <h2
                      data-testid="mp-join-heading"
                      className="font-display font-bold text-base sm:text-lg tracking-wide text-yellow-300 uppercase"
                    >
                      Play With Friends · Join Room
                    </h2>
                  </>
                )}
              </div>

              {/* Display Name */}
              <div className="space-y-1">
                <label
                  htmlFor="mp-player-name"
                  className="block text-xs font-bold text-blue-100"
                >
                  Your Display Name
                </label>
                <input
                  id="mp-player-name"
                  type="text"
                  maxLength={18}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  data-testid="mp-player-name-input"
                  className="w-full h-11 px-3.5 rounded-xl text-sm font-bold text-white placeholder:text-blue-200/50 outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
                  style={{
                    backgroundColor: 'rgba(6, 20, 56, 0.72)',
                    border: '1.5px solid rgba(250, 204, 21, 0.5)',
                  }}
                />
              </div>

              {onlineError && (
                <div
                  role="alert"
                  data-testid="mp-error-banner"
                  className="px-3.5 py-2 rounded-xl text-xs font-bold"
                  style={{
                    backgroundColor: 'rgba(220, 38, 38, 0.25)',
                    border: '1.5px solid #EF4444',
                    color: '#FECACA',
                  }}
                >
                  {onlineError}
                </div>
              )}

              {mpTab === 'create' ? (
                <div className="space-y-3.5">
                  {/* Selected Mode Summary + Quick Switcher */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-blue-100">Game Mode</span>
                      <span className="text-yellow-300">{modeLabel}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {MODE_TILES.map((m) => {
                        const active = mpMode === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            data-testid={`pick-mode-${m.id}`}
                            aria-pressed={active}
                            onClick={() => {
                              soundFx.playButtonClick();
                              setMpMode(m.id);
                            }}
                            className="py-2 px-1 rounded-lg text-[11px] font-extrabold whitespace-nowrap transition-transform active:scale-95"
                            style={{
                              backgroundColor: active ? '#FACC15' : 'rgba(6, 20, 56, 0.65)',
                              color: active ? '#0B1C3D' : '#E2E8F0',
                              border: `1.5px solid ${active ? '#FEF08A' : 'rgba(255,255,255,0.2)'}`,
                            }}
                          >
                            {m.id === 'classic'
                              ? 'Classic'
                              : m.id === 'flip'
                                ? 'Flip'
                                : m.id === 'crazy'
                                  ? 'Crazy'
                                  : 'UNO'}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Room Size 2–10 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-blue-100">Room Size</span>
                      <span className="font-mono-num text-yellow-300">{mpPlayerCount} Players</span>
                    </div>
                    <div className="grid grid-cols-9 gap-1">
                      {PLAYER_COUNTS.map((cnt) => {
                        const selected = mpPlayerCount === cnt;
                        return (
                          <button
                            key={cnt}
                            type="button"
                            onClick={() => {
                              soundFx.playButtonClick();
                              setMpPlayerCount(cnt);
                            }}
                            aria-pressed={selected}
                            className="h-9 rounded-lg font-mono-num text-xs font-extrabold transition-transform active:scale-95"
                            style={{
                              backgroundColor: selected ? '#FACC15' : 'rgba(6, 20, 56, 0.65)',
                              color: selected ? '#0B1C3D' : '#FFFFFF',
                              border: `1.5px solid ${selected ? '#FEF08A' : 'rgba(255,255,255,0.2)'}`,
                            }}
                          >
                            {cnt}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tokens & Fill Bots */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      {([4, 2] as const).map((tk) => (
                        <button
                          key={tk}
                          type="button"
                          onClick={() => {
                            soundFx.playButtonClick();
                            setMpTokens(tk);
                          }}
                          aria-pressed={mpTokens === tk}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap"
                          style={{
                            backgroundColor: mpTokens === tk ? 'rgba(250, 204, 21, 0.2)' : 'transparent',
                            color: mpTokens === tk ? '#FEF08A' : '#CBD5E1',
                            border: `1.5px solid ${mpTokens === tk ? '#FACC15' : 'rgba(255,255,255,0.2)'}`,
                          }}
                        >
                          {tk === 4 ? '4 Tokens' : '2 Tokens'}
                        </button>
                      ))}
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs font-bold text-blue-100 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={mpFillBots}
                        onChange={(e) => setMpFillBots(e.target.checked)}
                        className="w-4 h-4 rounded accent-yellow-400"
                      />
                      <span>Fill empty with CPU</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    disabled={connectingOnline}
                    data-testid="mp-create-room-btn"
                    onClick={() => {
                      soundFx.playDeploy();
                      onCreateOnlineRoom({
                        playerName: playerName.trim() || 'Player 1',
                        mode: mpMode,
                        playerCount: mpPlayerCount,
                        tokensPerPlayer: mpTokens,
                        fillWithBots: mpFillBots,
                      });
                    }}
                    className="w-full py-3.5 px-5 rounded-2xl font-display font-black text-base sm:text-lg flex items-center justify-center gap-2 shadow-xl transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-60"
                    style={{
                      background: 'linear-gradient(180deg, #FDE047 0%, #FACC15 55%, #EAB308 100%)',
                      color: '#0B1C3D',
                      border: '2.5px solid #FFFFFF',
                    }}
                  >
                    <Crown size={18} />
                    <span>{connectingOnline ? 'Creating Room...' : 'Create Online Room'}</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="mp-room-code"
                      className="block text-xs font-bold text-blue-100"
                    >
                      6-Character Room Code
                    </label>
                    <input
                      id="mp-room-code"
                      type="text"
                      maxLength={8}
                      value={roomCodeInput}
                      onChange={(e) =>
                        setRoomCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                      }
                      placeholder="E.G. M7K9PQ"
                      data-testid="mp-room-code-input"
                      className="w-full h-14 px-4 rounded-xl font-mono-num text-2xl font-extrabold tracking-[0.28em] text-center uppercase text-yellow-300 placeholder:text-blue-200/35 outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
                      style={{
                        backgroundColor: 'rgba(6, 20, 56, 0.78)',
                        border: '2px solid rgba(250, 204, 21, 0.65)',
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={connectingOnline || roomCodeInput.trim().length < 4}
                    data-testid="mp-join-room-btn"
                    onClick={() => {
                      soundFx.playDeploy();
                      onJoinOnlineRoom(roomCodeInput.trim(), playerName.trim() || 'Player');
                    }}
                    className="w-full py-3.5 px-5 rounded-2xl font-display font-black text-base sm:text-lg flex items-center justify-center gap-2 shadow-xl transition-transform hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(180deg, #FDE047 0%, #FACC15 55%, #EAB308 100%)',
                      color: '#0B1C3D',
                      border: '2.5px solid #FFFFFF',
                    }}
                  >
                    <KeyRound size={18} />
                    <span>{connectingOnline ? 'Joining Room...' : 'Join Room'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
