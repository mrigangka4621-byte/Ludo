import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BOARD_CENTER,
  buildBoardGeometry,
  buildCaptureReturnPath,
  getTokenPoint,
} from './game/boardGeometry';
import {
  applyDiceRoll,
  chooseBestBotMove,
  clampCrazyTimerMinutes,
  COMEBACK_YARD_MERCY_CHANCES,
  commitMove,
  createDefaultConfig,
  createDefaultPlayers,
  createInitialGameState,
  getAllLegalMoves,
  getAutoMoveIfForced,
  getNextActivePlayerIndex,
  resolveCrazyStarChaos,
  resolveCrazyTimerExpiration,
  rollSmartDie,
  YARD_MERCY_CHANCES,
} from './game/engine';
import {
  acceptUnoKnockback,
  cancelUnoNumberCard,
  chooseBestUnoBotCard,
  chooseBestUnoKnockbackTarget,
  commitUnoKnockbackMove,
  commitUnoNumberMove,
  drawUnoCardAndPass,
  getUnoKnockbackMoves,
  playUnoActionCard,
  selectUnoNumberCard,
} from './game/unoEngine';
import { soundFx } from './game/sound';
import { BOARD_THEMES, PLAYER_PALETTES } from './game/themes';
import type {
  AppScreen,
  GameConfig,
  GameMode,
  GameState,
  MoveDirection,
  MoveOption,
  Point2D,
  ThemeId,
  UnoCard,
} from './game/types';
import {
  BottomArcadeDock,
  PlayerStandingsPanel,
  TopArcadeBar,
} from './components/GameHud';
import {
  type ActiveTokenAnimation,
  type BoardEffect,
  type BoardEffectKind,
  type FlyingCaptureAnimation,
  type FlyingUnoCardOverlay,
  type HopTrailDot,
  LudoBoard,
} from './components/LudoBoard';
import { HomeScreen } from './components/HomeScreen';
import { PauseModal, RulesModal, ThemeModal, VictoryModal } from './components/Modals';
import { OnlineLobbyScreen } from './components/OnlineLobbyScreen';
import { SetupScreen } from './components/SetupScreen';
import { UnoDock } from './components/UnoDock';
import { VictoryCelebrationCanvas } from './components/VictoryCelebrationCanvas';
import { InMatchVoiceStrip } from './components/VoiceIndicators';
import type { OnlineGameEvent, OnlineRoomSnapshot } from './multiplayer/protocol';
import { RoomVoiceManager, type VoiceUiSnapshot } from './multiplayer/voiceChat';
import { type ConnectionStatus, MangoOnlineClient } from './multiplayer/wsClient';

const STORAGE_KEY_MATCH = 'decaludo_saved_match_v2';
const STORAGE_KEY_THEME = 'decaludo_theme_v2';
const STORAGE_KEY_VOLUME = 'decaludo_sfx_volume_v1';
const STORAGE_KEY_ONLINE_SESSION = 'mango_ludo_active_room_v1';
const STORAGE_KEY_RECENT_ONLINE_ROOM = 'mango_ludo_recent_room_v1';
const RECENT_ONLINE_ROOM_TTL_MS = 30 * 60 * 1000;

interface SavedOnlineSession {
  roomCode: string;
  playerName: string;
  savedAt?: number;
}

function loadSavedOnlineSession(): SavedOnlineSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_ONLINE_SESSION);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedOnlineSession>;
    if (
      parsed &&
      typeof parsed.roomCode === 'string' &&
      parsed.roomCode.trim().length >= 4 &&
      typeof parsed.playerName === 'string'
    ) {
      return {
        roomCode: parsed.roomCode.trim().toUpperCase(),
        playerName: parsed.playerName.trim() || 'Player',
      };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function saveOnlineSession(roomCode: string, playerName: string) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY_ONLINE_SESSION,
      JSON.stringify({
        roomCode: roomCode.trim().toUpperCase(),
        playerName: playerName.trim() || 'Player',
      })
    );
  } catch {
    // ignore storage errors
  }
}

function clearSavedOnlineSession() {
  try {
    sessionStorage.removeItem(STORAGE_KEY_ONLINE_SESSION);
  } catch {
    // ignore storage errors
  }
}

function loadRecentOnlineRoom(): SavedOnlineSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_RECENT_ONLINE_ROOM);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedOnlineSession>;
    if (
      parsed &&
      typeof parsed.roomCode === 'string' &&
      parsed.roomCode.trim().length >= 4 &&
      typeof parsed.playerName === 'string'
    ) {
      const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now();
      if (Date.now() - savedAt > RECENT_ONLINE_ROOM_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY_RECENT_ONLINE_ROOM);
        return null;
      }
      return {
        roomCode: parsed.roomCode.trim().toUpperCase(),
        playerName: parsed.playerName.trim() || 'Player',
        savedAt,
      };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function saveRecentOnlineRoom(roomCode: string, playerName: string): SavedOnlineSession {
  const entry: SavedOnlineSession = {
    roomCode: roomCode.trim().toUpperCase(),
    playerName: playerName.trim() || 'Player',
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(STORAGE_KEY_RECENT_ONLINE_ROOM, JSON.stringify(entry));
  } catch {
    // ignore storage errors
  }
  return entry;
}

function clearRecentOnlineRoom() {
  try {
    localStorage.removeItem(STORAGE_KEY_RECENT_ONLINE_ROOM);
  } catch {
    // ignore storage errors
  }
}

function loadSavedVolume(): { volume: number; muted: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VOLUME);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
        return { volume: parsed, muted: parsed === 0 };
      }
    }
  } catch {
    // ignore storage errors
  }
  return { volume: 0.8, muted: false };
}

function loadSavedTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_THEME) as ThemeId | null;
    if (raw && raw in BOARD_THEMES) return raw;
  } catch {
    // ignore storage errors
  }
  return 'arcade';
}

function loadSavedMatch(): GameState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MATCH);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (
      parsed &&
      Array.isArray(parsed.players) &&
      parsed.config &&
      parsed.config.themeId in BOARD_THEMES
    ) {
      return {
        ...parsed,
        phase:
          parsed.phase === 'animating' || parsed.phase === 'rolling'
            ? parsed.config.mode === 'uno'
              ? 'choosing_card'
              : 'awaiting_roll'
            : parsed.phase,
      };
    }
  } catch {
    // ignore corrupt save
  }
  return null;
}

function parseQueryConfig(base: GameConfig): {
  config: GameConfig;
  autostart: boolean;
  roomCode: string;
  demoVictory: boolean;
} {
  if (typeof window === 'undefined') {
    return { config: base, autostart: false, roomCode: '', demoVictory: false };
  }
  const params = new URLSearchParams(window.location.search);
  const autostart = params.get('autostart') === '1';
  const demoVictory = params.get('victory') === '1';
  const roomCode = (params.get('room') ?? '').trim().toUpperCase();
  let next = { ...base };

  const playersParam = Number(params.get('players'));
  if (Number.isInteger(playersParam) && playersParam >= 2 && playersParam <= 10) {
    next = {
      ...next,
      playerCount: playersParam,
      players: createDefaultPlayers(playersParam),
    };
  }

  const modeParam = params.get('mode');
  if (
    modeParam === 'classic' ||
    modeParam === 'flip' ||
    modeParam === 'crazy' ||
    modeParam === 'uno'
  ) {
    next = { ...next, mode: modeParam };
  }

  const themeParam = params.get('theme') as ThemeId | null;
  if (themeParam && themeParam in BOARD_THEMES) {
    next = { ...next, themeId: themeParam };
  }

  return { config: next, autostart, roomCode, demoVictory };
}

function buildPlayersForCategory(
  count: number,
  category: 'computer' | 'local',
  previous?: GameConfig['players']
): GameConfig['players'] {
  const base = createDefaultPlayers(count, previous);
  if (category === 'computer') {
    return base.map((p, idx) => ({
      ...p,
      name: idx === 0 ? (previous?.[0]?.name && !previous[0].isBot ? previous[0].name : 'You') : `CPU ${idx}`,
      isBot: idx > 0,
    }));
  }
  return base.map((p, idx) => ({
    ...p,
    name:
      previous?.[idx]?.name && !previous[idx].name.startsWith('CPU ') && previous[idx].name !== 'You'
        ? previous[idx].name
        : `Player ${idx + 1}`,
    isBot: false,
  }));
}

export default function App() {
  const initialBoot = useMemo(() => {
    const base = createDefaultConfig();
    base.themeId = loadSavedTheme();
    return parseQueryConfig(base);
  }, []);

  const [config, setConfig] = useState<GameConfig>(initialBoot.config);
  const [playCategory, setPlayCategory] = useState<'computer' | 'local'>('local');
  const [screen, setScreen] = useState<AppScreen>(initialBoot.autostart ? 'playing' : 'home');
  const [matchEnded, setMatchEnded] = useState<boolean>(initialBoot.demoVictory);
  const [celebrationWinner, setCelebrationWinner] = useState<{ name: string; color: string } | null>(
    () =>
      initialBoot.demoVictory
        ? {
            name: initialBoot.config.players[0]?.name ?? 'Player 1',
            color:
              PLAYER_PALETTES[initialBoot.config.players[0]?.paletteIndex ?? 0]?.color ?? '#FACC15',
          }
        : null
  );
  const [gameState, setGameState] = useState<GameState>(() => {
    const initial = createInitialGameState(initialBoot.config);
    if (!initialBoot.demoVictory) return initial;
    return {
      ...initial,
      phase: 'finished',
      finishedOrder: [0],
      players: initial.players.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              finishedRank: 1,
              tokens: p.tokens.map((t) => ({ ...t, zone: 'finished', homeStep: 5 })),
            }
          : p
      ),
      lastEvent: {
        id: 1,
        message: `${initial.players[0]?.name ?? 'Player 1'} wins the match!`,
        playerId: 0,
        kind: 'finish',
      },
    };
  });
  const gameStateRef = useRef<GameState>(gameState);
  gameStateRef.current = gameState;
  const [savedMatch, setSavedMatch] = useState<GameState | null>(() => loadSavedMatch());

  // Online Room-Code Multiplayer state (in-memory WebSocket server, no database)
  const onlineClientRef = useRef<MangoOnlineClient | null>(null);
  const voiceManagerRef = useRef<RoomVoiceManager | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomSnapshot | null>(null);
  const [mySeatIndex, setMySeatIndex] = useState<number | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [connectingOnline, setConnectingOnline] = useState(false);
  const [recentOnlineRoom, setRecentOnlineRoom] = useState<SavedOnlineSession | null>(() =>
    loadRecentOnlineRoom()
  );
  const onlineBackGuardPushedRef = useRef(false);
  const [voiceUi, setVoiceUi] = useState<VoiceUiSnapshot>({
    joined: false,
    joining: false,
    muted: false,
    deafened: false,
    localSpeaking: false,
    error: null,
    activePeerCount: 0,
    transportMode: 'idle',
  });
  const [remoteSpeakingLocal, setRemoteSpeakingLocal] = useState<Record<string, boolean>>({});

  const isOnlineMatch = Boolean(onlineRoom && mySeatIndex !== null);
  const isOnlineMatchRef = useRef(isOnlineMatch);
  isOnlineMatchRef.current = isOnlineMatch;
  const mySeatIndexRef = useRef(mySeatIndex);
  mySeatIndexRef.current = mySeatIndex;
  const onlineRoomRef = useRef(onlineRoom);
  onlineRoomRef.current = onlineRoom;

  const canControlTurn = useMemo(() => {
    if (!isOnlineMatch || mySeatIndex === null) return true;
    if (
      gameState.config.mode === 'uno' &&
      gameState.phase === 'choosing_knockback_target' &&
      gameState.unoState?.pendingKnockback
    ) {
      return gameState.unoState.pendingKnockback.chooserPlayerId === mySeatIndex;
    }
    return gameState.activePlayerIndex === mySeatIndex;
  }, [gameState, isOnlineMatch, mySeatIndex]);

  const initialAudio = useMemo(() => loadSavedVolume(), []);

  const [diceDisplayValue, setDiceDisplayValue] = useState<number>(3);
  const [rolling, setRolling] = useState(false);
  const [diceJustLanded, setDiceJustLanded] = useState(false);
  const [volume, setVolume] = useState<number>(initialAudio.volume);
  const [muted, setMuted] = useState<boolean>(initialAudio.muted);
  const lastNonZeroVolumeRef = useRef<number>(initialAudio.volume > 0 ? initialAudio.volume : 0.8);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showMobileRoster, setShowMobileRoster] = useState(false);
  const [directionToast, setDirectionToast] = useState<MoveDirection | null>(null);
  const [crazyTimerRemainingMs, setCrazyTimerRemainingMs] = useState<number | null>(null);
  const pausedCrazyRemainingRef = useRef<number | null>(null);

  const [activeAnimation, setActiveAnimation] = useState<ActiveTokenAnimation | null>(null);
  const [flyingCaptures, setFlyingCaptures] = useState<FlyingCaptureAnimation[]>([]);
  const [hopTrails, setHopTrails] = useState<HopTrailDot[]>([]);
  const [boardEffects, setBoardEffects] = useState<BoardEffect[]>([]);
  const [boardShakeKey, setBoardShakeKey] = useState(0);
  const [impactFlash, setImpactFlash] = useState<{ id: number; color: string } | null>(null);
  const [flyingUnoCard, setFlyingUnoCard] = useState<FlyingUnoCardOverlay | null>(null);

  const rafRef = useRef<number | null>(null);
  const captureRafRef = useRef<number | null>(null);
  const rollIntervalRef = useRef<number | null>(null);
  const rollTimeoutRef = useRef<number | null>(null);
  const botTimeoutRef = useRef<number | null>(null);
  const autoMoveTimeoutRef = useRef<number | null>(null);
  const victoryModalTimeoutRef = useRef<number | null>(null);
  const effectCounterRef = useRef(0);

  const activeThemeId =
    screen === 'home' || screen === 'setup' || screen === 'lobby'
      ? config.themeId
      : gameState.config.themeId;
  const theme = BOARD_THEMES[activeThemeId];
  const isArcade = theme.id === 'arcade';

  useEffect(() => {
    document.body.dataset.state = screen;
    document.body.dataset.matchEnded = matchEnded ? 'true' : 'false';
  }, [screen, matchEnded]);

  // If booted in ?autostart=1&victory=1 preview, open VictoryModal after the full-screen board celebration shines
  useEffect(() => {
    if (!initialBoot.demoVictory) return;
    victoryModalTimeoutRef.current = window.setTimeout(() => {
      setScreen('gameover');
    }, 1500);
    return () => {
      if (victoryModalTimeoutRef.current !== null) {
        window.clearTimeout(victoryModalTimeoutRef.current);
        victoryModalTimeoutRef.current = null;
      }
    };
  }, [initialBoot.demoVictory]);

  useEffect(() => {
    soundFx.setVolume(volume);
    soundFx.setMuted(muted);
    try {
      localStorage.setItem(STORAGE_KEY_VOLUME, String(muted ? 0 : volume));
    } catch {
      // ignore
    }
  }, [volume, muted]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_THEME, activeThemeId);
    } catch {
      // ignore
    }
  }, [activeThemeId]);

  useEffect(() => {
    if (!isOnlineMatch && (screen === 'playing' || screen === 'paused')) {
      try {
        const snapshot: GameState = {
          ...gameState,
          phase:
            gameState.phase === 'animating' || gameState.phase === 'rolling'
              ? gameState.config.mode === 'uno'
                ? 'choosing_card'
                : 'awaiting_roll'
              : gameState.phase,
        };
        localStorage.setItem(STORAGE_KEY_MATCH, JSON.stringify(snapshot));
        setSavedMatch(snapshot);
      } catch {
        // ignore
      }
    }
  }, [gameState, isOnlineMatch, screen]);

  const clearPendingTimers = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (captureRafRef.current !== null) {
      cancelAnimationFrame(captureRafRef.current);
      captureRafRef.current = null;
    }
    if (rollIntervalRef.current !== null) {
      window.clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = null;
    }
    if (rollTimeoutRef.current !== null) {
      window.clearTimeout(rollTimeoutRef.current);
      rollTimeoutRef.current = null;
    }
    if (botTimeoutRef.current !== null) {
      window.clearTimeout(botTimeoutRef.current);
      botTimeoutRef.current = null;
    }
    if (autoMoveTimeoutRef.current !== null) {
      window.clearTimeout(autoMoveTimeoutRef.current);
      autoMoveTimeoutRef.current = null;
    }
    if (victoryModalTimeoutRef.current !== null) {
      window.clearTimeout(victoryModalTimeoutRef.current);
      victoryModalTimeoutRef.current = null;
    }
    setRolling(false);
    setActiveAnimation(null);
    setFlyingCaptures([]);
  }, []);

  useEffect(() => {
    return () => clearPendingTimers();
  }, [clearPendingTimers]);

  const { forwardMoves, backwardMoves } = useMemo(() => {
    if (gameState.phase !== 'choosing_move' || gameState.diceValue === null) {
      return { forwardMoves: [] as MoveOption[], backwardMoves: [] as MoveOption[] };
    }
    const { forward, backward } = getAllLegalMoves(
      gameState,
      gameState.activePlayerIndex,
      gameState.diceValue
    );
    return { forwardMoves: forward, backwardMoves: backward };
  }, [gameState]);

  const knockbackMoves = useMemo(() => {
    if (
      gameState.config.mode !== 'uno' ||
      gameState.phase !== 'choosing_knockback_target' ||
      !gameState.unoState?.pendingKnockback
    ) {
      return [] as MoveOption[];
    }
    const pending = gameState.unoState.pendingKnockback;
    return getUnoKnockbackMoves(gameState, pending.victimPlayerId, pending.totalSteps);
  }, [gameState]);

  const activeLegalMoves =
    gameState.phase === 'choosing_knockback_target'
      ? knockbackMoves
      : gameState.selectedDirection === 'forward'
        ? forwardMoves
        : backwardMoves;

  const triggerBoardImpact = useCallback((color: string) => {
    const id = ++effectCounterRef.current;
    setBoardShakeKey((k) => k + 1);
    setImpactFlash({ id, color });
    window.setTimeout(() => {
      setImpactFlash((prev) => (prev?.id === id ? null : prev));
    }, 560);
  }, []);

  const triggerFlyingUnoCard = useCallback((card: UnoCard, playerName: string) => {
    const id = ++effectCounterRef.current;
    setFlyingUnoCard({ id, card, playerName });
    window.setTimeout(() => {
      setFlyingUnoCard((prev) => (prev?.id === id ? null : prev));
    }, 940);
  }, []);

  const spawnHopTrail = useCallback((point: Point2D, color: string) => {
    const id = ++effectCounterRef.current;
    setHopTrails((prev) => [...prev, { id, point, color }]);
    window.setTimeout(() => {
      setHopTrails((prev) => prev.filter((d) => d.id !== id));
    }, 720);
  }, []);

  const spawnBoardEffect = useCallback(
    (
      point: Point2D,
      color: string,
      kind: BoardEffectKind,
      emoji: string,
      options?: {
        label?: string;
        sprinklers?: string[];
        durationMs?: number;
      }
    ) => {
      const id = ++effectCounterRef.current;
      const durationMs = options?.durationMs ?? 1550;
      setBoardEffects((prev) => [
        ...prev,
        {
          id,
          point,
          color,
          kind,
          emoji,
          label: options?.label,
          sprinklers: options?.sprinklers,
        },
      ]);
      window.setTimeout(() => {
        setBoardEffects((prev) => prev.filter((fx) => fx.id !== id));
      }, durationMs);
    },
    []
  );

  /**
   * Animate captured opponent pawn(s) getting kicked at the capture square,
   * then crawling square-by-square back around the board to their Home Yard
   * with a crying animated emoji & falling teardrops!
   */
  const animateCapturedCrawlBack = useCallback(
    (stateSnapshot: GameState, capturedIds: string[]) => {
      if (captureRafRef.current !== null) {
        cancelAnimationFrame(captureRafRef.current);
        captureRafRef.current = null;
      }

      const geometry = buildBoardGeometry(stateSnapshot.config.playerCount);
      const crawlers: Array<{
        tokenId: string;
        playerId: number;
        path: Point2D[];
        crawlDurationMs: number;
      }> = [];

      for (const p of stateSnapshot.players) {
        for (const t of p.tokens) {
          if (capturedIds.includes(t.id) && t.zone === 'track') {
            const path = buildCaptureReturnPath(
              geometry,
              p.armIndex,
              t.slotIndex,
              t.ringIndex,
              t.lapProgress,
              stateSnapshot.config.mode === 'uno'
            );
            const segments = Math.max(1, path.length - 1);
            // Smooth, clearly readable square-by-square crawl around the entire board
            const crawlDurationMs = Math.min(3100, Math.max(1250, segments * 82));
            crawlers.push({
              tokenId: t.id,
              playerId: p.id,
              path,
              crawlDurationMs,
            });
          }
        }
      }

      if (crawlers.length === 0) return;

      const kickPauseMs = 400;
      const startTime = performance.now();
      let lastCrawlSoundSeg = -1;

      const stepCrawl = (now: number) => {
        const elapsed = now - startTime;
        let anyActive = false;

        const nextFrames: FlyingCaptureAnimation[] = [];

        for (let ci = 0; ci < crawlers.length; ci++) {
          const crawler = crawlers[ci];
          const totalMs = kickPauseMs + crawler.crawlDurationMs;
          if (elapsed < totalMs) {
            anyActive = true;
          }

          if (elapsed < kickPauseMs) {
            // Phase 1: Smooth damped spring recoil & squish at capture square when kicked!
            const kt = elapsed / kickPauseMs;
            const damping = Math.pow(1 - kt, 1.35);
            const shakeX = Math.sin(kt * Math.PI * 6) * 10 * damping;
            const bounceY = Math.sin(kt * Math.PI) * 10;
            const squish = Math.sin(kt * Math.PI) * 0.24;
            const origin = crawler.path[0];
            nextFrames.push({
              tokenId: crawler.tokenId,
              playerId: crawler.playerId,
              point: { x: origin.x + shakeX, y: origin.y - bounceY },
              rotationDeg: Math.sin(kt * Math.PI * 5) * 24 * damping,
              scaleX: 1 + squish,
              scaleY: 1 - squish * 0.9,
              phase: 'kicked',
              crawlEmoji: '😵',
            });
          } else {
            // Phase 2: Silky square-by-square inchworm crawl back around the track to Home Yard (or Start Square in UNO mode)!
            const ct = Math.min(1, (elapsed - kickPauseMs) / crawler.crawlDurationMs);
            const segments = Math.max(1, crawler.path.length - 1);
            const exactSeg = ct * segments;
            const segIdx = Math.min(segments - 1, Math.floor(exactSeg));
            const localT = exactSeg - segIdx;
            const p0 = crawler.path[segIdx];
            const p1 = crawler.path[segIdx + 1];

            if (ci === 0 && segIdx > lastCrawlSoundSeg && segIdx % 3 === 0) {
              lastCrawlSoundSeg = segIdx;
              soundFx.playCrawlStep(segIdx);
            }

            // Smooth cosine-blended inchworm scoot on every square
            const scootEase = 0.5 - 0.5 * Math.cos(localT * Math.PI);
            const arcLift = 4 * localT * (1 - localT) * 6.5;
            const x = p0.x + (p1.x - p0.x) * scootEase;
            const y = p0.y + (p1.y - p0.y) * scootEase - arcLift;
            const wobble = Math.sin(exactSeg * Math.PI * 2) * 13;
            const inchworm = Math.sin(localT * Math.PI);

            nextFrames.push({
              tokenId: crawler.tokenId,
              playerId: crawler.playerId,
              point: { x, y },
              rotationDeg: wobble,
              scaleX: 1.0 + inchworm * 0.14,
              scaleY: 1.0 - inchworm * 0.12,
              phase: 'crawling',
              crawlEmoji: '😭',
            });
          }
        }

        if (anyActive) {
          setFlyingCaptures(nextFrames);
          captureRafRef.current = requestAnimationFrame(stepCrawl);
        } else {
          captureRafRef.current = null;
          setFlyingCaptures([]);
        }
      };

      captureRafRef.current = requestAnimationFrame(stepCrawl);
    },
    []
  );

  const playMoveVisualSequence = useCallback(
    (
      snapshotState: GameState,
      move: MoveOption,
      options: {
        isUnoKnockback: boolean;
        playedCard?: UnoCard | null;
        precomputedNextState?: GameState;
        precomputedMatchEnded?: boolean;
        precomputedStarChaosLabel?: string | null;
      }
    ) => {
      const { isUnoKnockback } = options;
      const geometry = buildBoardGeometry(snapshotState.config.playerCount);
      const owner = isUnoKnockback
        ? snapshotState.players.find((p) => p.tokens.some((t) => t.id === move.tokenId))
        : snapshotState.players[snapshotState.activePlayerIndex];
      if (!owner) {
        if (options.precomputedNextState) setGameState(options.precomputedNextState);
        return;
      }
      const ownerPalette = PLAYER_PALETTES[owner.paletteIndex];
      const token = owner.tokens.find((t) => t.id === move.tokenId);
      if (!token) {
        if (options.precomputedNextState) setGameState(options.precomputedNextState);
        return;
      }

      const startPt = getTokenPoint(
        geometry,
        owner.armIndex,
        token.slotIndex,
        token.zone,
        token.ringIndex,
        token.homeIndex
      );

      const points: Point2D[] = [startPt, ...move.waypoints.map((w) => w.point)];
      const segments = Math.max(1, points.length - 1);
      const msPerStep = move.kind === 'deploy' ? 300 : isUnoKnockback ? 175 : 220;
      const isBackward = move.direction === 'backward' && move.kind !== 'deploy';

      // Launch flying UNO card visual over board if committing a UNO number card
      const cardToFly =
        options.playedCard ??
        (snapshotState.config.mode === 'uno' && !isUnoKnockback && snapshotState.unoState?.selectedCardId
          ? (snapshotState.unoState.hands[owner.id] ?? []).find(
              (c) => c.id === snapshotState.unoState?.selectedCardId
            ) ?? null
          : null);
      if (cardToFly) {
        triggerFlyingUnoCard(cardToFly, owner.name);
      }

      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      setGameState((prev) => ({ ...prev, phase: 'animating' }));

      let currentSegment = 0;
      let segmentStartTime = performance.now();
      soundFx.playStepHop(0, isBackward);
      spawnHopTrail(points[0], ownerPalette.color);

      const maxLift = move.kind === 'deploy' ? 40 : 28;

      const easeHoriz = (u: number) => {
        const sCurve = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        const cubicOut = 1 - Math.pow(1 - u, 2.4);
        return sCurve * 0.65 + cubicOut * 0.35;
      };

      const tick = (now: number) => {
        const elapsed = now - segmentStartTime;
        const t = Math.min(1, elapsed / msPerStep);
        const p0 = points[currentSegment];
        const p1 = points[currentSegment + 1];

        const ease = easeHoriz(t);
        const x = p0.x + (p1.x - p0.x) * ease;
        const y = p0.y + (p1.y - p0.y) * ease;

        // Pure parabolic gravity jump arc (smooth velocity, silky apex hang-time)
        const hopLift = 4 * t * (1 - t) * maxLift;

        // Lagged trail point for soft motion-ribbon & translucent afterimage
        const tTrail = Math.max(0, t - 0.16);
        const trailEase = easeHoriz(tTrail);
        const trailPoint: Point2D = {
          x: p0.x + (p1.x - p0.x) * trailEase,
          y: p0.y + (p1.y - p0.y) * trailEase,
        };
        const trailHopLift = 4 * tTrail * (1 - tTrail) * maxLift;

        const dirSign = p1.x >= p0.x ? 1 : -1;
        const tiltDeg = Math.sin(t * Math.PI) * 12 * dirSign * Math.cos((t - 0.35) * Math.PI * 0.55);

        // 100% continuous zero-discontinuity squash-and-stretch spring curve
        const airborneStretch = Math.sin(t * Math.PI) * 0.16;
        const landingCushion = t > 0.55 ? Math.sin(((t - 0.55) / 0.45) * Math.PI) * 0.18 : 0;
        const stretchNet = airborneStretch - landingCushion;
        const scaleX = 1 - stretchNet;
        const scaleY = 1 + stretchNet;

        setActiveAnimation({
          tokenId: move.tokenId,
          point: { x, y },
          hopLift,
          scaleX,
          scaleY,
          tiltDeg,
          trailPoint,
          trailHopLift,
        });

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        // Leave a fading hop trail dot + expanding concentric ripple ring on each landed square
        spawnHopTrail(p1, ownerPalette.color);

        currentSegment += 1;
        if (currentSegment < segments) {
          segmentStartTime = now;
          soundFx.playStepHop(currentSegment, isBackward);
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        rafRef.current = null;
        setActiveAnimation(null);

        const lastPt = points[points.length - 1];

        // UNO Knockback backward blast completion!
        if (isUnoKnockback) {
          const steps = snapshotState.unoState?.pendingKnockback?.totalSteps ?? 2;
          triggerBoardImpact('#EF4444');
          spawnBoardEffect(lastPt, '#EF4444', 'uno_knockback', '💥', {
            label: `-${steps} BACK!`,
            durationMs: 1850,
          });
          soundFx.playUnoKnockback();
          const nextState = options.precomputedNextState ?? commitUnoKnockbackMove(snapshotState, move);
          setGameState(nextState);
          return;
        }

        const attackerYardPt = geometry.yards[owner.armIndex].center;

        if (move.capturesTokenIds.length > 0) {
          triggerBoardImpact('#EF4444');
          spawnBoardEffect(
            lastPt,
            ownerPalette.color,
            isBackward ? 'ambush' : 'capture',
            isBackward ? '🥷🦵' : '🦵💥',
            {
              label: isBackward ? 'AMBUSH!' : 'KICKED!',
              sprinklers: ['💥', '💢', '💫', '⚡'],
              durationMs: 1950,
            }
          );

          spawnBoardEffect(attackerYardPt, ownerPalette.color, 'taunt', '😜🤣', {
            label: 'HAHA!',
            sprinklers: ['🤣', '✨', '😜'],
            durationMs: 2050,
          });

          const victimPlayerIds = new Set<number>();
          for (const p of snapshotState.players) {
            if (p.tokens.some((t) => move.capturesTokenIds.includes(t.id))) {
              victimPlayerIds.add(p.id);
            }
          }
          for (const vid of victimPlayerIds) {
            const victim = snapshotState.players[vid];
            if (victim) {
              const victimYardPt = geometry.yards[victim.armIndex].center;
              const victimPalette = PLAYER_PALETTES[victim.paletteIndex];
              spawnBoardEffect(victimYardPt, victimPalette.color, 'angry', '😡💢', {
                label: 'GRRR!',
                sprinklers: ['💢', '🔥', '🤬'],
                durationMs: 2050,
              });
            }
          }

          animateCapturedCrawlBack(snapshotState, move.capturesTokenIds);
          soundFx.playCapture();
        } else if (move.kind === 'finish') {
          triggerBoardImpact('#FACC15');
          spawnBoardEffect(lastPt, ownerPalette.color, 'finish', '🏆👑', {
            label: 'GOAL!',
            sprinklers: ['🎆', '🎉', '🎊', '✨', '🥳', '⭐'],
            durationMs: 2100,
          });
          soundFx.playTokenHome();
        } else if (move.kind === 'deploy') {
          soundFx.playDeploy();
          spawnBoardEffect(lastPt, ownerPalette.color, 'deploy', '🥳', {
            label: 'DEPLOY!',
            sprinklers: ['🎉', '🎊', '✨', '🎈', '🎊', '✨'],
            durationMs: 1950,
          });
        } else if (move.kind === 'enter_home') {
          soundFx.playHomeStretch();
          spawnBoardEffect(lastPt, ownerPalette.color, 'enter_home', '🚀🔥', {
            label: 'HOME RUN!',
            sprinklers: ['🔥', '✨', '⚡', '✨'],
            durationMs: 1850,
          });
        } else if (move.landsOnSafe && move.kind === 'track') {
          const isBuiltInSafe = geometry.safeIndices.has(move.targetRingIndex);
          soundFx.playSafeLanding(!isBuiltInSafe);
          if (isBuiltInSafe) {
            spawnBoardEffect(lastPt, '#FACC15', 'safe', '😎⭐', {
              label: 'SAFE ★',
              sprinklers: ['⭐', '✨', '🛡️', '✨'],
              durationMs: 1850,
            });
          } else {
            spawnBoardEffect(lastPt, '#F59E0B', 'stack_safe', '🛡️💪', {
              label: 'SAFE STACK!',
              sprinklers: ['🛡️', '✨', '⭐', '✨'],
              durationMs: 1850,
            });
          }
        }

        let finalNextState: GameState;
        let moveMatchEnded = false;

        if (options.precomputedNextState) {
          finalNextState = options.precomputedNextState;
          moveMatchEnded = Boolean(options.precomputedMatchEnded);
          if (options.precomputedStarChaosLabel) {
            triggerBoardImpact('#A855F7');
            soundFx.playChaosZap();
            spawnBoardEffect(lastPt, '#A855F7', 'chaos_boost', '⚡', {
              label: options.precomputedStarChaosLabel,
              durationMs: 2050,
            });
          }
        } else {
          const result =
            snapshotState.config.mode === 'uno'
              ? commitUnoNumberMove(snapshotState, move)
              : commitMove(gameStateRef.current, move);

          finalNextState = result.nextState;
          moveMatchEnded = result.matchEnded;

          // Crazy Mode extra funny chaos: landing on a Safe Star triggers Turbo +2, Swaparoo, or Bonus Roll!
          if (
            snapshotState.config.mode === 'crazy' &&
            !result.matchEnded &&
            move.targetZone === 'track' &&
            geometry.trackCells[move.targetRingIndex]?.isSafeStar
          ) {
            const chaos = resolveCrazyStarChaos(finalNextState, owner.id, move.tokenId);
            if (chaos) {
              finalNextState = chaos.nextState;
              triggerBoardImpact('#A855F7');
              soundFx.playChaosZap();
              spawnBoardEffect(lastPt, '#A855F7', 'chaos_boost', '⚡', {
                label: chaos.label,
                durationMs: 2050,
              });
            }
          }
        }

        setGameState(finalNextState);
        if (moveMatchEnded || finalNextState.phase === 'finished') {
          setCelebrationWinner({ name: owner.name, color: ownerPalette.color });
          setMatchEnded(true);
          triggerBoardImpact('#FACC15');
          spawnBoardEffect(
            { x: BOARD_CENTER, y: BOARD_CENTER },
            ownerPalette.color,
            'victory',
            '👑🥳',
            {
              label: `${owner.name.toUpperCase()} WINS!`,
              sprinklers: ['🎆', '🎉', '🎊', '🏆', '✨', '🥳'],
              durationMs: 2600,
            }
          );
          soundFx.playVictoryFanfare();
          if (victoryModalTimeoutRef.current !== null) {
            window.clearTimeout(victoryModalTimeoutRef.current);
          }
          victoryModalTimeoutRef.current = window.setTimeout(() => {
            victoryModalTimeoutRef.current = null;
            setScreen('gameover');
          }, 1250);
          if (!isOnlineMatchRef.current) {
            try {
              localStorage.removeItem(STORAGE_KEY_MATCH);
              setSavedMatch(null);
            } catch {
              // ignore
            }
          }
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [
      animateCapturedCrawlBack,
      spawnBoardEffect,
      spawnHopTrail,
      triggerBoardImpact,
      triggerFlyingUnoCard,
    ]
  );

  const handleSelectMove = useCallback(
    (move: MoveOption) => {
      const snapshotState = gameStateRef.current;
      const isUnoKnockback =
        snapshotState.config.mode === 'uno' &&
        snapshotState.phase === 'choosing_knockback_target';

      if (snapshotState.phase !== 'choosing_move' && !isUnoKnockback) return;

      if (isOnlineMatchRef.current) {
        if (!canControlTurn) return;
        onlineClientRef.current?.sendAction({
          type: 'select_move',
          tokenId: move.tokenId,
          direction: move.direction,
        });
        return;
      }

      playMoveVisualSequence(snapshotState, move, { isUnoKnockback });
    },
    [canControlTurn, playMoveVisualSequence]
  );

  const handleRollDice = useCallback(() => {
    if (screen !== 'playing' || gameState.phase !== 'awaiting_roll' || rolling) return;

    if (isOnlineMatchRef.current) {
      if (!canControlTurn) return;
      onlineClientRef.current?.sendAction({ type: 'roll_dice' });
      return;
    }

    setRolling(true);
    setDiceJustLanded(false);
    setGameState((prev) => ({ ...prev, phase: 'rolling' }));
    soundFx.playDiceRattle();

    const rollResult = rollSmartDie(gameStateRef.current);
    const finalRoll = rollResult.rolledValue;

    rollIntervalRef.current = window.setInterval(() => {
      setDiceDisplayValue(Math.floor(Math.random() * 6) + 1);
    }, 62);

    rollTimeoutRef.current = window.setTimeout(() => {
      if (rollIntervalRef.current !== null) {
        window.clearInterval(rollIntervalRef.current);
        rollIntervalRef.current = null;
      }
      rollTimeoutRef.current = null;
      setDiceDisplayValue(finalRoll);
      setRolling(false);
      setDiceJustLanded(true);
      soundFx.playDiceLand(finalRoll);
      window.setTimeout(() => setDiceJustLanded(false), 520);

      const current = gameStateRef.current;
      const outcome = applyDiceRoll(current, finalRoll);
      const roller = current.players[current.activePlayerIndex];

      const nextRevenge = { ...(outcome.nextState.crazyRevengeCharges ?? {}) };
      if (rollResult.consumedRevengeCharge && roller) {
        nextRevenge[roller.id] = false;
      }

      let nextStateWithDirector: GameState = {
        ...outcome.nextState,
        diceDirector: rollResult.nextDirector,
        crazyRevengeCharges: nextRevenge,
      };

      const isCrazyDoubleSix =
        current.config.mode === 'crazy' &&
        finalRoll === 6 &&
        !outcome.forfeited &&
        outcome.nextState.consecutiveSixes === 2;

      if (roller && nextStateWithDirector.lastEvent) {
        if (rollResult.reason === 'crazy_snipe') {
          nextStateWithDirector = {
            ...nextStateWithDirector,
            lastEvent: {
              ...nextStateWithDirector.lastEvent,
              message: `🎯 CRAZY SNIPE! ${roller.name} locked on and rolled ${finalRoll} to capture the pawn ahead!`,
              kind: 'capture',
            },
          };
        } else if (rollResult.reason === 'crazy_revenge_six') {
          nextStateWithDirector = {
            ...nextStateWithDirector,
            lastEvent: {
              ...nextStateWithDirector.lastEvent,
              message: `⚡ REVENGE 6! ${roller.name} stormed right back with a guaranteed 6!`,
              kind: 'bonus',
            },
          };
        } else if (isCrazyDoubleSix) {
          nextStateWithDirector = {
            ...nextStateWithDirector,
            lastEvent: {
              ...nextStateWithDirector.lastEvent,
              message: `⚡ DOUBLE SIX (2×6)! Pick your move, then roll your bonus turn (1–5 only)!`,
              kind: 'bonus',
            },
          };
        } else if (rollResult.reason === 'comeback_mercy_six') {
          nextStateWithDirector = {
            ...nextStateWithDirector,
            lastEvent: {
              ...nextStateWithDirector.lastEvent,
              message: `🍀 COMEBACK 6! ${roller.name} bounced right back into action within ${COMEBACK_YARD_MERCY_CHANCES} yard rolls!`,
              kind: 'bonus',
            },
          };
        } else if (rollResult.reason === 'mercy_six') {
          nextStateWithDirector = {
            ...nextStateWithDirector,
            lastEvent: {
              ...nextStateWithDirector.lastEvent,
              message: `🍀 ${roller.name} unlocked a Mercy 6 after ${YARD_MERCY_CHANCES} yard rolls — time to play!`,
              kind: 'bonus',
            },
          };
        } else if (rollResult.fireJustIgnited) {
          nextStateWithDirector = {
            ...nextStateWithDirector,
            lastEvent: {
              ...nextStateWithDirector.lastEvent,
              message: `🔥 ${roller.name} is ON FIRE (${rollResult.ignitedCharges} hot rolls)! Rolled ${finalRoll}.`,
              kind: 'bonus',
            },
          };
        }
      }

      setGameState(nextStateWithDirector);

      if (roller) {
        const geom = buildBoardGeometry(current.config.playerCount);
        const rollerYard = geom.yards[roller.armIndex].center;
        const rollerColor = PLAYER_PALETTES[roller.paletteIndex].color;

        if (rollResult.reason === 'crazy_snipe') {
          triggerBoardImpact('#EF4444');
          soundFx.playChaosZap();
          spawnBoardEffect(rollerYard, '#EF4444', 'crazy_snipe', '🎯', {
            label: `SNIPE ${finalRoll}!`,
            durationMs: 1850,
          });
        } else if (rollResult.reason === 'crazy_revenge_six') {
          triggerBoardImpact('#F97316');
          soundFx.playChaosZap();
          spawnBoardEffect(rollerYard, '#F97316', 'fire_ignite', '⚡', {
            label: 'REVENGE 6!',
            durationMs: 1850,
          });
        } else if (isCrazyDoubleSix) {
          soundFx.playLuckySix();
          spawnBoardEffect(rollerYard, '#F97316', 'bonus_six', '🎲⚡', {
            label: 'DOUBLE 6 (MAX)!',
            sprinklers: ['⚡', '🔥', '🎲'],
            durationMs: 1850,
          });
        } else if (rollResult.fireJustIgnited) {
          soundFx.playOnFireIgnite();
          spawnBoardEffect(rollerYard, '#F97316', 'fire_ignite', '🔥⚡', {
            label: `ON FIRE ×${rollResult.ignitedCharges}!`,
            sprinklers: ['🔥', '⚡', '✨', '🎲'],
            durationMs: 1950,
          });
        } else if (rollResult.reason === 'comeback_mercy_six') {
          soundFx.playMercySix();
          spawnBoardEffect(rollerYard, '#22C55E', 'mercy_six', '🍀🎲', {
            label: 'COMEBACK 6!',
            sprinklers: ['🍀', '🎉', '✨', '🎊'],
            durationMs: 1950,
          });
        } else if (rollResult.reason === 'mercy_six') {
          soundFx.playMercySix();
          spawnBoardEffect(rollerYard, '#22C55E', 'mercy_six', '🍀🎲', {
            label: 'MERCY 6!',
            sprinklers: ['🍀', '🎉', '✨', '🎊'],
            durationMs: 1950,
          });
        } else if (outcome.forfeited) {
          soundFx.playForfeit();
          spawnBoardEffect(rollerYard, rollerColor, 'forfeit', '😵‍💫🤦', {
            label: current.config.mode === 'crazy' ? '2×6 CAP!' : '3× SIXES!',
            sprinklers: ['💨', '💢', '💫'],
            durationMs: 1850,
          });
        } else if (outcome.noMoves) {
          soundFx.playSkipTurn();
          spawnBoardEffect(rollerYard, rollerColor, 'skip', '😅💤', {
            label: 'NO MOVES',
            sprinklers: ['💤', '💨'],
            durationMs: 1650,
          });
        } else if (finalRoll === 6) {
          soundFx.playLuckySix();
          spawnBoardEffect(rollerYard, '#FACC15', 'bonus_six', '🎲🔥', {
            label: 'LUCKY 6!',
            sprinklers: ['✨', '🔥', '🎉'],
            durationMs: 1650,
          });
        }
      }
    }, 420);
  }, [canControlTurn, gameState.phase, rolling, screen, spawnBoardEffect, triggerBoardImpact]);

  const handleSelectDirection = useCallback(
    (dir: MoveDirection) => {
      if (gameState.config.mode !== 'flip') return;
      if (gameState.selectedDirection === dir) return;
      if (isOnlineMatchRef.current) {
        if (!canControlTurn) return;
        onlineClientRef.current?.sendAction({ type: 'select_direction', direction: dir });
        return;
      }
      soundFx.playDirectionFlip(dir === 'backward');
      setDirectionToast(dir);
      window.setTimeout(() => setDirectionToast(null), 950);
      setGameState((prev) => ({ ...prev, selectedDirection: dir }));
    },
    [canControlTurn, gameState.config.mode, gameState.selectedDirection]
  );

  // === UNO LUDO CARD HANDLERS ===
  const handlePlayUnoCard = useCallback(
    (card: UnoCard) => {
      const current = gameStateRef.current;
      if (current.config.mode !== 'uno') return;
      if (current.phase !== 'choosing_card' && current.phase !== 'choosing_move') return;

      if (isOnlineMatchRef.current) {
        if (!canControlTurn) return;
        onlineClientRef.current?.sendAction({ type: 'uno_select_card', cardId: card.id });
        return;
      }

      if (card.kind === 'number') {
        soundFx.playCardSnap();
        const next = selectUnoNumberCard(current, card.id);
        setGameState(next);
        return;
      }

      const result = playUnoActionCard(current, card.id);
      if (!result) return;

      const geom = buildBoardGeometry(current.config.playerCount);
      const actor = current.players[current.activePlayerIndex];
      const actorYard = geom.yards[actor.armIndex].center;
      triggerFlyingUnoCard(card, actor.name);

      if (result.actionKind === 'reverse') {
        triggerBoardImpact('#22C55E');
        soundFx.playUnoReverse();
        spawnBoardEffect({ x: BOARD_CENTER, y: BOARD_CENTER }, '#22C55E', 'uno_reverse', '⇄', {
          label: 'REVERSE!',
          durationMs: 1850,
        });
      } else if (result.actionKind === 'skip') {
        soundFx.playUnoSkip();
        const skippedIdx = getNextActivePlayerIndex(current, current.activePlayerIndex);
        const skippedPlayer = current.players[skippedIdx];
        const skippedYard = skippedPlayer ? geom.yards[skippedPlayer.armIndex].center : actorYard;
        spawnBoardEffect(skippedYard, '#EF4444', 'uno_skip', '⊘', {
          label: 'SKIPPED!',
          durationMs: 1850,
        });
      } else if (result.actionKind === 'minus2' || result.actionKind === 'minus4') {
        triggerBoardImpact('#EF4444');
        soundFx.playUnoKnockback();
        const totalSteps = result.nextState.unoState?.pendingKnockback?.totalSteps ?? 2;
        const victimIdx = result.nextState.activePlayerIndex;
        const victim = result.nextState.players[victimIdx];
        const victimYard = victim ? geom.yards[victim.armIndex].center : actorYard;
        spawnBoardEffect(victimYard, '#EF4444', 'uno_knockback', '💥', {
          label: `STACK -${totalSteps}!`,
          durationMs: 1850,
        });
      } else if (result.actionKind === 'swap') {
        triggerBoardImpact('#A855F7');
        soundFx.playChaosZap();
        spawnBoardEffect({ x: BOARD_CENTER, y: BOARD_CENTER }, '#A855F7', 'chaos_boost', '🔀', {
          label: 'SWAP!',
          durationMs: 1850,
        });
      }

      setGameState(result.nextState);
    },
    [canControlTurn, spawnBoardEffect, triggerBoardImpact, triggerFlyingUnoCard]
  );

  const handleCancelUnoCard = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (!canControlTurn) return;
      onlineClientRef.current?.sendAction({ type: 'uno_cancel_card' });
      return;
    }
    setGameState((prev) => cancelUnoNumberCard(prev));
  }, [canControlTurn]);

  const handleAcceptUnoKnockback = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (!canControlTurn) return;
      onlineClientRef.current?.sendAction({ type: 'uno_accept_knockback' });
      return;
    }
    soundFx.playUnoSkip();
    setGameState((prev) => acceptUnoKnockback(prev));
  }, [canControlTurn]);

  const handleDrawUnoCard = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (!canControlTurn) return;
      onlineClientRef.current?.sendAction({ type: 'uno_draw_card' });
      return;
    }
    soundFx.playCardSnap();
    setGameState((prev) => drawUnoCardAndPass(prev));
  }, [canControlTurn]);

  // === REAL-TIME ONLINE WEBSOCKET EVENT PLAYBACK ===
  const handleOnlineGameEvent = useCallback(
    (event: OnlineGameEvent) => {
      if (event.kind === 'dice_rolled') {
        if (rollIntervalRef.current !== null) {
          window.clearInterval(rollIntervalRef.current);
          rollIntervalRef.current = null;
        }
        if (rollTimeoutRef.current !== null) {
          window.clearTimeout(rollTimeoutRef.current);
          rollTimeoutRef.current = null;
        }
        setRolling(true);
        setDiceJustLanded(false);
        setGameState((prev) => ({ ...prev, phase: 'rolling' }));
        soundFx.playDiceRattle();

        rollIntervalRef.current = window.setInterval(() => {
          setDiceDisplayValue(Math.floor(Math.random() * 6) + 1);
        }, 62);

        rollTimeoutRef.current = window.setTimeout(() => {
          if (rollIntervalRef.current !== null) {
            window.clearInterval(rollIntervalRef.current);
            rollIntervalRef.current = null;
          }
          rollTimeoutRef.current = null;
          setDiceDisplayValue(event.diceValue);
          setRolling(false);
          setDiceJustLanded(true);
          soundFx.playDiceLand(event.diceValue);
          window.setTimeout(() => setDiceJustLanded(false), 520);

          setGameState(event.nextState);

          const roller = event.nextState.players[event.rollerSeatIndex];
          if (roller) {
            const geom = buildBoardGeometry(event.nextState.config.playerCount);
            const rollerYard = geom.yards[roller.armIndex].center;
            const rollerColor = PLAYER_PALETTES[roller.paletteIndex].color;

            if (event.rollReason === 'crazy_snipe') {
              triggerBoardImpact('#EF4444');
              soundFx.playChaosZap();
              spawnBoardEffect(rollerYard, '#EF4444', 'crazy_snipe', '🎯', {
                label: `SNIPE ${event.diceValue}!`,
                durationMs: 1850,
              });
            } else if (event.rollReason === 'crazy_revenge_six') {
              triggerBoardImpact('#F97316');
              soundFx.playChaosZap();
              spawnBoardEffect(rollerYard, '#F97316', 'fire_ignite', '⚡', {
                label: 'REVENGE 6!',
                durationMs: 1850,
              });
            } else if (event.isCrazyDoubleSix) {
              soundFx.playLuckySix();
              spawnBoardEffect(rollerYard, '#F97316', 'bonus_six', '🎲⚡', {
                label: 'DOUBLE 6 (MAX)!',
                sprinklers: ['⚡', '🔥', '🎲'],
                durationMs: 1850,
              });
            } else if (event.fireJustIgnited) {
              soundFx.playOnFireIgnite();
              spawnBoardEffect(rollerYard, '#F97316', 'fire_ignite', '🔥⚡', {
                label: `ON FIRE ×${event.ignitedCharges}!`,
                sprinklers: ['🔥', '⚡', '✨', '🎲'],
                durationMs: 1950,
              });
            } else if (event.rollReason === 'comeback_mercy_six') {
              soundFx.playMercySix();
              spawnBoardEffect(rollerYard, '#22C55E', 'mercy_six', '🍀🎲', {
                label: 'COMEBACK 6!',
                sprinklers: ['🍀', '🎉', '✨', '🎊'],
                durationMs: 1950,
              });
            } else if (event.rollReason === 'mercy_six') {
              soundFx.playMercySix();
              spawnBoardEffect(rollerYard, '#22C55E', 'mercy_six', '🍀🎲', {
                label: 'MERCY 6!',
                sprinklers: ['🍀', '🎉', '✨', '🎊'],
                durationMs: 1950,
              });
            } else if (event.forfeited) {
              soundFx.playForfeit();
              spawnBoardEffect(rollerYard, rollerColor, 'forfeit', '😵‍💫🤦', {
                label: event.nextState.config.mode === 'crazy' ? '2×6 CAP!' : '3× SIXES!',
                sprinklers: ['💨', '💢', '💫'],
                durationMs: 1850,
              });
            } else if (event.noMoves) {
              soundFx.playSkipTurn();
              spawnBoardEffect(rollerYard, rollerColor, 'skip', '😅💤', {
                label: 'NO MOVES',
                sprinklers: ['💤', '💨'],
                durationMs: 1650,
              });
            } else if (event.diceValue === 6) {
              soundFx.playLuckySix();
              spawnBoardEffect(rollerYard, '#FACC15', 'bonus_six', '🎲🔥', {
                label: 'LUCKY 6!',
                sprinklers: ['✨', '🔥', '🎉'],
                durationMs: 1650,
              });
            }
          }
        }, 420);
        return;
      }

      if (event.kind === 'move_committed') {
        if (rollIntervalRef.current !== null) {
          window.clearInterval(rollIntervalRef.current);
          rollIntervalRef.current = null;
        }
        if (rollTimeoutRef.current !== null) {
          window.clearTimeout(rollTimeoutRef.current);
          rollTimeoutRef.current = null;
        }
        setRolling(false);
        playMoveVisualSequence(event.prevState, event.move, {
          isUnoKnockback: event.isUnoKnockback,
          playedCard: event.playedCard,
          precomputedNextState: event.nextState,
          precomputedMatchEnded: event.matchEnded,
          precomputedStarChaosLabel: event.starChaosLabel,
        });
        return;
      }

      if (event.kind === 'uno_action_played') {
        if (rollIntervalRef.current !== null) {
          window.clearInterval(rollIntervalRef.current);
          rollIntervalRef.current = null;
        }
        if (rollTimeoutRef.current !== null) {
          window.clearTimeout(rollTimeoutRef.current);
          rollTimeoutRef.current = null;
        }
        setRolling(false);
        const geom = buildBoardGeometry(event.prevState.config.playerCount);
        const actor = event.prevState.players[event.actorSeatIndex];
        const actorYard = actor ? geom.yards[actor.armIndex].center : { x: BOARD_CENTER, y: BOARD_CENTER };
        if (actor) {
          triggerFlyingUnoCard(event.card, actor.name);
        }

        if (event.actionKind === 'reverse') {
          triggerBoardImpact('#22C55E');
          soundFx.playUnoReverse();
          spawnBoardEffect({ x: BOARD_CENTER, y: BOARD_CENTER }, '#22C55E', 'uno_reverse', '⇄', {
            label: 'REVERSE!',
            durationMs: 1850,
          });
        } else if (event.actionKind === 'skip') {
          soundFx.playUnoSkip();
          const skippedIdx = getNextActivePlayerIndex(event.prevState, event.prevState.activePlayerIndex);
          const skippedPlayer = event.prevState.players[skippedIdx];
          const skippedYard = skippedPlayer ? geom.yards[skippedPlayer.armIndex].center : actorYard;
          spawnBoardEffect(skippedYard, '#EF4444', 'uno_skip', '⊘', {
            label: 'SKIPPED!',
            durationMs: 1850,
          });
        } else if (event.actionKind === 'minus2' || event.actionKind === 'minus4') {
          triggerBoardImpact('#EF4444');
          soundFx.playUnoKnockback();
          const totalSteps = event.nextState.unoState?.pendingKnockback?.totalSteps ?? 2;
          const victimIdx = event.nextState.activePlayerIndex;
          const victim = event.nextState.players[victimIdx];
          const victimYard = victim ? geom.yards[victim.armIndex].center : actorYard;
          spawnBoardEffect(victimYard, '#EF4444', 'uno_knockback', '💥', {
            label: `STACK -${totalSteps}!`,
            durationMs: 1850,
          });
        } else if (event.actionKind === 'swap') {
          triggerBoardImpact('#A855F7');
          soundFx.playChaosZap();
          spawnBoardEffect({ x: BOARD_CENTER, y: BOARD_CENTER }, '#A855F7', 'chaos_boost', '🔀', {
            label: 'SWAP!',
            durationMs: 1850,
          });
        }

        setGameState(event.nextState);
        return;
      }

      if (event.kind === 'state_sync') {
        if (rollIntervalRef.current !== null) {
          window.clearInterval(rollIntervalRef.current);
          rollIntervalRef.current = null;
        }
        if (rollTimeoutRef.current !== null) {
          window.clearTimeout(rollTimeoutRef.current);
          rollTimeoutRef.current = null;
        }
        setRolling(false);
        if (event.sound === 'card_snap') soundFx.playCardSnap();
        else if (event.sound === 'skip') soundFx.playUnoSkip();
        else if (event.sound === 'direction_fwd' || event.sound === 'direction_bwd') {
          const dir: MoveDirection = event.sound === 'direction_bwd' ? 'backward' : 'forward';
          soundFx.playDirectionFlip(dir === 'backward');
          setDirectionToast(dir);
          window.setTimeout(() => setDirectionToast(null), 950);
        }
        setGameState(event.nextState);
        if (event.nextState.phase !== 'finished') {
          setMatchEnded(false);
          setCelebrationWinner(null);
          setScreen((prev) => (prev === 'gameover' ? 'playing' : prev));
        } else {
          const winnerId = event.nextState.finishedOrder[0] ?? 0;
          const winnerPlayer = event.nextState.players[winnerId];
          const winnerPal = PLAYER_PALETTES[winnerPlayer?.paletteIndex ?? 0];
          setCelebrationWinner({
            name: winnerPlayer?.name ?? 'Champion',
            color: winnerPal?.color ?? '#FACC15',
          });
          setMatchEnded(true);
          setScreen('gameover');
        }
      }
    },
    [playMoveVisualSequence, spawnBoardEffect, triggerBoardImpact, triggerFlyingUnoCard]
  );

  // Initialize WebSocket client once and keep handlers fresh
  const onlineEventRef = useRef(handleOnlineGameEvent);
  onlineEventRef.current = handleOnlineGameEvent;

  useEffect(() => {
    const client = new MangoOnlineClient();
    onlineClientRef.current = client;

    const voiceMgr = new RoomVoiceManager(client.clientId, {
      sendVoiceState: (joined, isMuted, speaking) => {
        client.sendVoiceState(joined, isMuted, speaking);
      },
      sendVoiceSignal: (targetClientId, signal) => {
        client.sendVoiceSignal(targetClientId, signal);
      },
      sendVoiceAudio: (targetClientIds, sampleRate, data) => {
        client.sendVoiceAudio(targetClientIds, sampleRate, data);
      },
      onSnapshot: (snap) => {
        setVoiceUi(snap);
      },
      onPeerSpeakingLocalDetect: (peerClientId, speaking) => {
        setRemoteSpeakingLocal((prev) =>
          prev[peerClientId] === speaking ? prev : { ...prev, [peerClientId]: speaking }
        );
      },
    });
    voiceManagerRef.current = voiceMgr;

    client.setHandlers({
      onConnectionChange: (status) => {
        setConnectionStatus(status);
      },
      onRoomJoined: ({ room, mySeatIndex: seatIdx, gameState: syncedState }) => {
        setConnectingOnline(false);
        setOnlineError(null);
        setOnlineRoom(room);
        setMySeatIndex(seatIdx);
        const mySeat = room.seats.find((s) => s.seatIndex === seatIdx);
        const resolvedName = mySeat?.name ?? 'Player';
        saveOnlineSession(room.roomCode, resolvedName);
        setRecentOnlineRoom(saveRecentOnlineRoom(room.roomCode, resolvedName));

        if (voiceMgr.isJoined()) {
          voiceMgr.reannounceState(room.seats);
        } else {
          voiceMgr.syncPeers(room.seats);
        }

        if (room.status === 'playing' && syncedState) {
          setGameState(syncedState);
          const ended = syncedState.phase === 'finished';
          setMatchEnded(ended);
          setScreen(ended ? 'gameover' : 'playing');
        } else {
          setMatchEnded(false);
          setCelebrationWinner(null);
          setScreen('lobby');
        }
      },
      onRoomUpdate: (room) => {
        setOnlineRoom(room);
        voiceMgr.syncPeers(room.seats);
      },
      onRoomStarted: ({ room, gameState: freshState }) => {
        clearPendingTimers();
        setOnlineRoom(room);
        voiceMgr.clearError();
        if (voiceMgr.isJoined()) {
          voiceMgr.reannounceState(room.seats);
        } else {
          voiceMgr.syncPeers(room.seats);
        }
        setGameState(freshState);
        setMatchEnded(false);
        setCelebrationWinner(null);
        setDiceDisplayValue(3);
        setShowThemeModal(false);
        setShowRulesModal(false);
        setShowMobileRoster(false);
        setScreen('playing');
      },
      onGameEvent: (event) => {
        onlineEventRef.current(event);
      },
      onVoiceSignal: ({ fromClientId, signal }) => {
        void voiceMgr.handleSignal(fromClientId, signal);
      },
      onVoiceAudio: ({ fromClientId, sampleRate, data }) => {
        voiceMgr.handleVoiceAudio(fromClientId, sampleRate, data);
      },
      onVoiceSpeaking: ({ clientId, speaking }) => {
        setOnlineRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            seats: prev.seats.map((seat) =>
              seat.clientId === clientId ? { ...seat, voiceSpeaking: speaking } : seat
            ),
          };
        });
      },
      onError: ({ code, message }) => {
        setConnectingOnline(false);
        if (code === 'ROOM_NOT_FOUND' || code === 'MATCH_IN_PROGRESS' || code === 'ROOM_FULL') {
          clearSavedOnlineSession();
        }
        if (code === 'ROOM_NOT_FOUND') {
          clearRecentOnlineRoom();
          setRecentOnlineRoom(null);
        }
        setOnlineError(message);
      },
    });

    // Auto-rejoin an active online room after accidental tab refresh or mobile mic-permission reload
    if (!initialBoot.autostart && !initialBoot.demoVictory && !initialBoot.roomCode) {
      const savedSession = loadSavedOnlineSession();
      if (savedSession) {
        setConnectingOnline(true);
        client.joinRoom(savedSession.roomCode, savedSession.playerName);
      }
    }

    return () => {
      voiceMgr.leaveVoice(false);
      voiceManagerRef.current = null;
      // Do NOT send room:leave on unmount/refresh so the player can seamlessly rejoin
      client.disconnect();
    };
  }, [clearPendingTimers, initialBoot.autostart, initialBoot.demoVictory, initialBoot.roomCode]);

  // Optional CPU seat auto-play for offline Local & Computer matches (in Online rooms, server drives CPU seats)
  useEffect(() => {
    if (screen !== 'playing' || isOnlineMatch) return;

    // In UNO knockback target selection, the PRECEDING player (`chooserPlayerId`) chooses the victim pawn!
    if (
      gameState.config.mode === 'uno' &&
      gameState.phase === 'choosing_knockback_target' &&
      gameState.unoState?.pendingKnockback
    ) {
      const chooser = gameState.players.find(
        (p) => p.id === gameState.unoState!.pendingKnockback!.chooserPlayerId
      );
      if (chooser?.isBot) {
        botTimeoutRef.current = window.setTimeout(() => {
          const targetMove = chooseBestUnoKnockbackTarget(gameStateRef.current);
          if (targetMove) {
            handleSelectMove(targetMove);
          }
        }, 620);
        return () => {
          if (botTimeoutRef.current !== null) window.clearTimeout(botTimeoutRef.current);
        };
      }
      return;
    }

    const activePlayer = gameState.players[gameState.activePlayerIndex];
    if (!activePlayer || !activePlayer.isBot) return;

    if (gameState.config.mode === 'uno' && gameState.phase === 'choosing_card') {
      botTimeoutRef.current = window.setTimeout(() => {
        const decision = chooseBestUnoBotCard(gameStateRef.current);
        if (decision.type === 'accept_knockback') {
          handleAcceptUnoKnockback();
        } else if (decision.type === 'draw_pass') {
          handleDrawUnoCard();
        } else if (decision.type === 'play_action') {
          const hand = gameStateRef.current.unoState?.hands[activePlayer.id] ?? [];
          const card = hand.find((c) => c.id === decision.cardId);
          if (card) handlePlayUnoCard(card);
        } else if (decision.type === 'play_number') {
          const hand = gameStateRef.current.unoState?.hands[activePlayer.id] ?? [];
          const card = hand.find((c) => c.id === decision.cardId);
          if (card) {
            const selectedState = selectUnoNumberCard(gameStateRef.current, card.id);
            gameStateRef.current = selectedState;
            setGameState(selectedState);
            window.setTimeout(() => {
              handleSelectMove(decision.move);
            }, 220);
          }
        }
      }, 650);
      return () => {
        if (botTimeoutRef.current !== null) window.clearTimeout(botTimeoutRef.current);
      };
    }

    if (gameState.phase === 'awaiting_roll' && !rolling) {
      botTimeoutRef.current = window.setTimeout(() => {
        handleRollDice();
      }, 540);
      return () => {
        if (botTimeoutRef.current !== null) window.clearTimeout(botTimeoutRef.current);
      };
    }

    if (gameState.phase === 'choosing_move' && gameState.diceValue !== null) {
      botTimeoutRef.current = window.setTimeout(() => {
        const best = chooseBestBotMove(gameState, gameState.diceValue!);
        if (best) {
          if (best.direction !== gameState.selectedDirection) {
            setGameState((prev) => ({ ...prev, selectedDirection: best.direction }));
          }
          handleSelectMove(best);
        }
      }, 560);
      return () => {
        if (botTimeoutRef.current !== null) window.clearTimeout(botTimeoutRef.current);
      };
    }
  }, [
    gameState,
    handleAcceptUnoKnockback,
    handleDrawUnoCard,
    handlePlayUnoCard,
    handleRollDice,
    handleSelectMove,
    isOnlineMatch,
    rolling,
    screen,
  ]);

  // Smart Auto-Move: when a human player has no real choice (only 1 movable piece,
  // all pieces in yard on a 6, or all movable pieces stacked on the exact same square),
  // automatically move without forcing an unnecessary click.
  useEffect(() => {
    if (screen !== 'playing' || gameState.phase !== 'choosing_move' || !canControlTurn) return;
    const activePlayer = gameState.players[gameState.activePlayerIndex];
    if (!activePlayer || activePlayer.isBot) return;

    const forcedMove = getAutoMoveIfForced(gameState);
    if (!forcedMove) return;

    autoMoveTimeoutRef.current = window.setTimeout(() => {
      autoMoveTimeoutRef.current = null;
      handleSelectMove(forcedMove);
    }, 260);

    return () => {
      if (autoMoveTimeoutRef.current !== null) {
        window.clearTimeout(autoMoveTimeoutRef.current);
        autoMoveTimeoutRef.current = null;
      }
    };
  }, [canControlTurn, gameState, handleSelectMove, screen]);

  const handleJoinVoice = useCallback(() => {
    soundFx.playButtonClick();
    void voiceManagerRef.current?.joinVoice(onlineRoomRef.current?.seats ?? []);
  }, []);

  const handleLeaveVoice = useCallback(() => {
    soundFx.playButtonClick();
    voiceManagerRef.current?.leaveVoice(true);
    setRemoteSpeakingLocal({});
  }, []);

  const handleToggleVoiceMute = useCallback(() => {
    soundFx.playButtonClick();
    voiceManagerRef.current?.toggleMute();
  }, []);

  const handleToggleVoiceDeafen = useCallback(() => {
    soundFx.playButtonClick();
    voiceManagerRef.current?.toggleDeafen();
  }, []);

  const handleLeaveToHome = useCallback(() => {
    clearPendingTimers();
    clearSavedOnlineSession();
    setMatchEnded(false);
    setCelebrationWinner(null);
    voiceManagerRef.current?.leaveVoice(true);
    setRemoteSpeakingLocal({});
    if (isOnlineMatchRef.current || onlineRoom) {
      onlineClientRef.current?.leaveRoom();
      setOnlineRoom(null);
      setMySeatIndex(null);
      setOnlineError(null);
      setConnectingOnline(false);
    }
    setScreen('home');
  }, [clearPendingTimers, onlineRoom]);

  const handleSelectLocalOrComputerMode = useCallback(
    (category: 'computer' | 'local', mode: GameMode) => {
      setPlayCategory(category);
      setConfig((prev) => ({
        ...prev,
        mode,
        players: buildPlayersForCategory(prev.playerCount, category, prev.players),
      }));
      setScreen('setup');
    },
    []
  );

  const handleCreateOnlineRoom = useCallback(
    (params: {
      playerName: string;
      mode: GameMode;
      playerCount: number;
      tokensPerPlayer: 2 | 4;
      fillWithBots: boolean;
      crazyTimerMinutes: number;
    }) => {
      setOnlineError(null);
      setConnectingOnline(true);
      onlineClientRef.current?.createRoom({
        ...params,
        themeId: config.themeId,
      });
    },
    [config.themeId]
  );

  const handleJoinOnlineRoom = useCallback((roomCode: string, playerName: string) => {
    setOnlineError(null);
    setConnectingOnline(true);
    onlineClientRef.current?.joinRoom(roomCode, playerName);
  }, []);

  const handleRejoinRecentRoom = useCallback(() => {
    if (!recentOnlineRoom) return;
    handleJoinOnlineRoom(recentOnlineRoom.roomCode, recentOnlineRoom.playerName);
  }, [handleJoinOnlineRoom, recentOnlineRoom]);

  // Accidental Back-Button & Tab-Close Guard while inside an active online match:
  // Pressing browser/mobile Back opens PauseModal instead of kicking the player out!
  const isOnlineMatchActive = isOnlineMatch && (screen === 'playing' || screen === 'paused');
  useEffect(() => {
    if (!isOnlineMatchActive) {
      onlineBackGuardPushedRef.current = false;
      return;
    }

    if (!onlineBackGuardPushedRef.current) {
      try {
        window.history.pushState({ mangoOnlineGuard: true }, '');
        onlineBackGuardPushedRef.current = true;
      } catch {
        // ignore history errors in restricted sandboxes
      }
    }

    const onPopState = () => {
      try {
        window.history.pushState({ mangoOnlineGuard: true }, '');
      } catch {
        // ignore
      }
      setScreen('paused');
    };

    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isOnlineMatchActive]);

  // Live Crazy Mode 10-30 min Countdown Timer:
  // - In Online matches: shows live synced countdown; server enforces expiration authoritatively.
  // - In Local / Vs Computer matches: pauses cleanly in PauseModal and ranks 1st/2nd/3rd... by progress at 00:00!
  useEffect(() => {
    const isCrazyActive =
      (screen === 'playing' || screen === 'paused') &&
      gameState.config.mode === 'crazy' &&
      gameState.phase !== 'finished' &&
      typeof gameState.crazyTimerEndsAt === 'number';

    if (!isCrazyActive) {
      pausedCrazyRemainingRef.current = null;
      setCrazyTimerRemainingMs(null);
      return;
    }

    // Freeze local timer while paused; resume seamlessly with remaining ms when returning to playing
    if (!isOnlineMatch && screen === 'paused') {
      if (pausedCrazyRemainingRef.current === null) {
        const rem = Math.max(0, (gameState.crazyTimerEndsAt ?? Date.now()) - Date.now());
        pausedCrazyRemainingRef.current = rem;
        setCrazyTimerRemainingMs(rem);
      }
      return;
    }

    if (!isOnlineMatch && screen === 'playing' && pausedCrazyRemainingRef.current !== null) {
      const resumedEndsAt = Date.now() + pausedCrazyRemainingRef.current;
      pausedCrazyRemainingRef.current = null;
      setGameState((prev) => ({ ...prev, crazyTimerEndsAt: resumedEndsAt }));
      setCrazyTimerRemainingMs(Math.max(0, resumedEndsAt - Date.now()));
      return;
    }

    const tickTimer = () => {
      const endsAt = gameStateRef.current.crazyTimerEndsAt;
      if (typeof endsAt !== 'number' || gameStateRef.current.phase === 'finished') {
        setCrazyTimerRemainingMs(null);
        return;
      }
      const rem = Math.max(0, endsAt - Date.now());
      setCrazyTimerRemainingMs(rem);

      if (rem === 0 && !isOnlineMatchRef.current && screen === 'playing') {
        clearPendingTimers();
        const expired = resolveCrazyTimerExpiration(gameStateRef.current);
        setGameState(expired);
        const winnerId = expired.finishedOrder[0] ?? 0;
        const winnerPlayer = expired.players[winnerId];
        const winnerPal = PLAYER_PALETTES[winnerPlayer?.paletteIndex ?? 0];
        setCelebrationWinner({
          name: winnerPlayer?.name ?? 'Champion',
          color: winnerPal?.color ?? '#FACC15',
        });
        setMatchEnded(true);
        soundFx.playVictoryFanfare();
        try {
          localStorage.removeItem(STORAGE_KEY_MATCH);
          setSavedMatch(null);
        } catch {
          // ignore
        }
        setScreen('gameover');
      }
    };

    tickTimer();
    const id = window.setInterval(tickTimer, 500);
    return () => window.clearInterval(id);
  }, [
    clearPendingTimers,
    gameState.config.mode,
    gameState.crazyTimerEndsAt,
    gameState.phase,
    isOnlineMatch,
    screen,
  ]);

  const handleStartMatch = useCallback(() => {
    clearPendingTimers();
    setMatchEnded(false);
    setCelebrationWinner(null);
    const fresh = createInitialGameState(config);
    setGameState(fresh);
    setDiceDisplayValue(3);
    setShowThemeModal(false);
    setShowRulesModal(false);
    setShowMobileRoster(false);
    setScreen('playing');
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [clearPendingTimers, config]);

  const handleResumeSavedMatch = useCallback(() => {
    if (!savedMatch) return;
    clearPendingTimers();
    setMatchEnded(false);
    setCelebrationWinner(null);
    setGameState(savedMatch);
    setConfig(savedMatch.config);
    setScreen('playing');
  }, [clearPendingTimers, savedMatch]);

  const handleRestartMatch = useCallback(() => {
    setMatchEnded(false);
    setCelebrationWinner(null);
    if (isOnlineMatchRef.current) {
      onlineClientRef.current?.sendAction({ type: 'restart_match' });
      setScreen('playing');
      return;
    }
    clearPendingTimers();
    const fresh = createInitialGameState(gameState.config);
    setGameState(fresh);
    setDiceDisplayValue(3);
    setScreen('playing');
  }, [clearPendingTimers, gameState.config]);

  const handleContinueForRanks = useCallback(() => {
    setMatchEnded(false);
    setCelebrationWinner(null);
    if (isOnlineMatchRef.current) {
      onlineClientRef.current?.sendAction({ type: 'continue_ranks' });
      setScreen('playing');
      return;
    }
    setGameState((prev) => {
      const nextIdx = getNextActivePlayerIndex(prev, prev.activePlayerIndex);
      return {
        ...prev,
        continueAfterFirstWin: true,
        activePlayerIndex: nextIdx,
        phase: prev.config.mode === 'uno' ? 'choosing_card' : 'awaiting_roll',
        diceValue: null,
        consecutiveSixes: 0,
        lastEvent: {
          id: (prev.lastEvent?.id ?? 0) + 1,
          message: `Continuing for podium ranks — ${prev.players[nextIdx].name}'s turn.`,
          playerId: nextIdx,
          kind: 'info',
        },
      };
    });
    setScreen('playing');
  }, []);

  const handleChangeTheme = useCallback((themeId: ThemeId) => {
    setConfig((prev) => ({ ...prev, themeId }));
    setGameState((prev) => ({
      ...prev,
      config: { ...prev.config, themeId },
    }));
  }, []);

  const handleChangeVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setVolume(clamped);
    if (clamped > 0) {
      lastNonZeroVolumeRef.current = clamped;
      setMuted(false);
    } else {
      setMuted(true);
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prevMuted) => {
      if (prevMuted) {
        if (volume <= 0) {
          setVolume(lastNonZeroVolumeRef.current);
        }
        return false;
      }
      return true;
    });
  }, [volume]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (screen === 'setup') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleStartMatch();
        }
        return;
      }
      if (screen === 'home' || screen === 'lobby') {
        return;
      }

      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (showThemeModal) {
          setShowThemeModal(false);
          return;
        }
        if (showRulesModal) {
          setShowRulesModal(false);
          return;
        }
        if (showMobileRoster) {
          setShowMobileRoster(false);
          return;
        }
        if (screen === 'playing') {
          e.preventDefault();
          setScreen('paused');
        } else if (screen === 'paused') {
          e.preventDefault();
          setScreen('playing');
        }
        return;
      }

      if (screen !== 'playing' || showThemeModal || showRulesModal) return;

      if (e.key === ' ') {
        e.preventDefault();
        handleRollDice();
      } else if ((e.key === 'f' || e.key === 'F') && gameState.config.mode === 'flip') {
        e.preventDefault();
        if (gameState.phase !== 'choosing_move' || forwardMoves.length > 0) {
          handleSelectDirection('forward');
        }
      } else if ((e.key === 'b' || e.key === 'B') && gameState.config.mode === 'flip') {
        e.preventDefault();
        if (gameState.phase !== 'choosing_move' || backwardMoves.length > 0) {
          handleSelectDirection('backward');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    backwardMoves.length,
    forwardMoves.length,
    gameState.config.mode,
    gameState.phase,
    handleRollDice,
    handleSelectDirection,
    handleStartMatch,
    handleToggleMute,
    screen,
    showMobileRoster,
    showRulesModal,
    showThemeModal,
  ]);

  const myClientId = onlineClientRef.current?.clientId ?? '';

  const effectiveOnlineRoom = useMemo(() => {
    if (!onlineRoom) return null;
    return {
      ...onlineRoom,
      seats: onlineRoom.seats.map((seat) => {
        if (seat.clientId === myClientId) {
          return {
            ...seat,
            voiceJoined: voiceUi.joined,
            voiceMuted: voiceUi.muted,
            voiceSpeaking: voiceUi.joined && !voiceUi.muted && voiceUi.localSpeaking,
          };
        }
        const localDetectSpeaking = Boolean(remoteSpeakingLocal[seat.clientId]);
        return {
          ...seat,
          voiceSpeaking:
            Boolean(seat.voiceJoined) &&
            !seat.voiceMuted &&
            (Boolean(seat.voiceSpeaking) || localDetectSpeaking),
        };
      }),
    };
  }, [myClientId, onlineRoom, remoteSpeakingLocal, voiceUi.joined, voiceUi.localSpeaking, voiceUi.muted]);

  if (screen === 'home') {
    return (
      <HomeScreen
        config={config}
        initialCategory={initialBoot.roomCode ? 'multiplayer' : null}
        initialRoomCode={initialBoot.roomCode}
        hasSavedMatch={Boolean(savedMatch)}
        onlineError={onlineError}
        connectingOnline={connectingOnline}
        onClearOnlineError={() => setOnlineError(null)}
        onChangeTheme={handleChangeTheme}
        onSelectLocalOrComputerMode={handleSelectLocalOrComputerMode}
        onCreateOnlineRoom={handleCreateOnlineRoom}
        onJoinOnlineRoom={handleJoinOnlineRoom}
        onResumeMatch={handleResumeSavedMatch}
        recentOnlineRoom={recentOnlineRoom}
        onRejoinRecentRoom={handleRejoinRecentRoom}
      />
    );
  }

  if (screen === 'lobby' && effectiveOnlineRoom && mySeatIndex !== null) {
    return (
      <OnlineLobbyScreen
        room={effectiveOnlineRoom}
        mySeatIndex={mySeatIndex}
        myClientId={myClientId}
        themeId={config.themeId}
        connectionStatus={connectionStatus}
        error={onlineError}
        voice={voiceUi}
        onJoinVoice={handleJoinVoice}
        onLeaveVoice={handleLeaveVoice}
        onToggleVoiceMute={handleToggleVoiceMute}
        onToggleVoiceDeafen={handleToggleVoiceDeafen}
        onUpdateSettings={(patch) => onlineClientRef.current?.updateSettings(patch)}
        onStartMatch={() => onlineClientRef.current?.startMatch()}
        onLeaveRoom={handleLeaveToHome}
      />
    );
  }

  if (screen === 'setup') {
    return (
      <SetupScreen
        config={config}
        playCategory={playCategory}
        hasSavedMatch={Boolean(savedMatch)}
        onBackToHome={handleLeaveToHome}
        onChangePlayerCount={(count) =>
          setConfig((prev) => ({
            ...prev,
            playerCount: count,
            players: buildPlayersForCategory(count, playCategory, prev.players),
          }))
        }
        onChangeMode={(mode: GameMode) => setConfig((prev) => ({ ...prev, mode }))}
        onChangeCrazyTimerMinutes={(minutes) =>
          setConfig((prev) => ({ ...prev, crazyTimerMinutes: clampCrazyTimerMinutes(minutes) }))
        }
        onChangeTokensPerPlayer={(tokensPerPlayer) =>
          setConfig((prev) => ({ ...prev, tokensPerPlayer }))
        }
        onChangeTheme={handleChangeTheme}
        onUpdatePlayer={(index, patch) =>
          setConfig((prev) => ({
            ...prev,
            players: prev.players.map((p, i) => (i === index ? { ...p, ...patch } : p)),
          }))
        }
        onStartMatch={handleStartMatch}
        onResumeMatch={handleResumeSavedMatch}
      />
    );
  }

  const remainingUnfinished = gameState.players.filter((p) => p.finishedRank === null).length;

  return (
    <div
      className={`min-h-screen lg:h-screen w-full flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden ${
        isArcade ? 'ludo-arcade-wallpaper' : ''
      }`}
      style={{ backgroundColor: theme.pageBg, color: theme.textPrimary }}
    >
      {/* Left/Center Main Arcade Tabletop Stage: Ribbon Header + Crisp Board + Iconic Bottom Dice Dock */}
      <div className="flex-1 flex flex-col min-h-screen lg:min-h-0 lg:h-full overflow-hidden">
        <TopArcadeBar
          state={gameState}
          theme={theme}
          muted={muted}
          onlineRoomCode={effectiveOnlineRoom?.roomCode ?? null}
          crazyTimerRemainingMs={crazyTimerRemainingMs}
          onToggleMute={handleToggleMute}
          onOpenPause={() => setScreen('paused')}
          onOpenThemePicker={() => setShowThemeModal(true)}
          onOpenRules={() => setShowRulesModal(true)}
          onToggleMobileRoster={() => setShowMobileRoster(true)}
        />

        {isOnlineMatch && effectiveOnlineRoom && (
          <InMatchVoiceStrip
            theme={theme}
            roomCode={effectiveOnlineRoom.roomCode}
            voice={voiceUi}
            seats={effectiveOnlineRoom.seats}
            onJoinVoice={handleJoinVoice}
            onLeaveVoice={handleLeaveVoice}
            onToggleMute={handleToggleVoiceMute}
            onToggleDeafen={handleToggleVoiceDeafen}
            onDismissError={() => voiceManagerRef.current?.clearError()}
          />
        )}

        {isOnlineMatch && (connectionStatus !== 'connected' || onlineError) && (
          <div className="px-3 sm:px-5 pt-1 shrink-0">
            <div
              role="status"
              data-testid="match-connection-banner"
              className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm"
              style={{
                backgroundColor:
                  onlineError ? 'rgba(153, 27, 27, 0.92)' : 'rgba(180, 83, 9, 0.92)',
                border: `1px solid ${onlineError ? 'rgba(248, 113, 113, 0.7)' : 'rgba(253, 224, 71, 0.7)'}`,
                color: '#FEF9C3',
              }}
            >
              <span>
                {onlineError ??
                  (connectionStatus === 'connecting'
                    ? 'Reconnecting to room...'
                    : 'Connection interrupted — automatically reconnecting...')}
              </span>
              {onlineError && (
                <button
                  type="button"
                  onClick={() => setOnlineError(null)}
                  className="px-2 py-0.5 rounded text-[11px] font-extrabold bg-black/25 hover:bg-black/40 shrink-0"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        )}

        {/* Board Viewport with Direction Flip Toast Overlay */}
        <main className="relative flex-1 flex items-center justify-center px-1 sm:px-5 py-1.5 min-h-0 overflow-hidden">
          <div
            className={`aspect-square flex items-center justify-center max-w-full max-h-full ${
              gameState.config.mode === 'uno'
                ? 'h-full w-auto max-w-[min(96vw,58vh,620px)]'
                : 'w-full max-w-[min(100vw,64vh,660px)] sm:max-w-[min(68vh,700px)]'
            }`}
          >
            <LudoBoard
              state={gameState}
              theme={theme}
              legalMoves={canControlTurn ? activeLegalMoves : []}
              mode={gameState.config.mode}
              selectedDirection={gameState.selectedDirection}
              activeAnimation={activeAnimation}
              flyingCaptures={flyingCaptures}
              hopTrails={hopTrails}
              boardEffects={boardEffects}
              boardShakeKey={boardShakeKey}
              impactFlash={impactFlash}
              flyingUnoCard={flyingUnoCard}
              isLiveMatch={true}
              localSeatIndex={isOnlineMatch ? mySeatIndex : null}
              interactive={
                screen === 'playing' &&
                canControlTurn &&
                (gameState.phase === 'choosing_move' ||
                  gameState.phase === 'choosing_knockback_target')
              }
              onSelectMove={handleSelectMove}
            />
          </div>

          {/* Animated Flip-Track Direction Flip Banner */}
          {directionToast && (
            <div
              key={directionToast}
              className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-xl font-display font-bold text-base shadow-xl animate-spring-pop"
              style={{
                backgroundColor:
                  directionToast === 'backward' ? theme.captureRing : theme.accent,
                color: directionToast === 'backward' ? '#FFFFFF' : theme.accentText,
                border: '2px solid #0B1C3D',
              }}
            >
              {directionToast === 'backward' ? '🔄⚡ Backward Turn' : '⏩✨ Forward Turn'}
            </div>
          )}
        </main>

        {gameState.config.mode === 'uno' ? (
          <UnoDock
            state={gameState}
            theme={theme}
            localSeatIndex={isOnlineMatch ? mySeatIndex : null}
            onPlayCard={handlePlayUnoCard}
            onCancelCard={handleCancelUnoCard}
            onAcceptKnockback={handleAcceptUnoKnockback}
            onDrawCard={handleDrawUnoCard}
          />
        ) : (
          <BottomArcadeDock
            state={gameState}
            theme={theme}
            diceDisplayValue={diceDisplayValue}
            rolling={rolling}
            justLanded={diceJustLanded}
            forwardMoves={forwardMoves}
            backwardMoves={backwardMoves}
            canControlTurn={canControlTurn}
            onRoll={handleRollDice}
            onSelectDirection={handleSelectDirection}
          />
        )}
      </div>

      {/* Desktop Right Standings Sidebar (shows all 2-10 players live) */}
      <div className="hidden lg:block h-full shrink-0">
        <PlayerStandingsPanel
          state={gameState}
          theme={theme}
          localSeatIndex={isOnlineMatch ? mySeatIndex : null}
          onlineRoomCode={effectiveOnlineRoom?.roomCode ?? null}
          onlineSeats={effectiveOnlineRoom?.seats}
        />
      </div>

      {/* Mobile Slide-Over Standings Drawer for 2-10 players */}
      {showMobileRoster && (
        <div
          className="fixed inset-0 z-40 lg:hidden flex justify-end"
          style={{ backgroundColor: 'rgba(6, 16, 38, 0.7)' }}
          onClick={() => setShowMobileRoster(false)}
        >
          <div className="w-[82vw] max-w-[320px] h-full" onClick={(e) => e.stopPropagation()}>
            <PlayerStandingsPanel
              state={gameState}
              theme={theme}
              localSeatIndex={isOnlineMatch ? mySeatIndex : null}
              onlineRoomCode={effectiveOnlineRoom?.roomCode ?? null}
              onlineSeats={effectiveOnlineRoom?.seats}
              onCloseMobile={() => setShowMobileRoster(false)}
            />
          </div>
        </div>
      )}

      {/* Modals */}
      {screen === 'paused' && (
        <PauseModal
          theme={theme}
          volume={volume}
          muted={muted}
          onlineRoomCode={effectiveOnlineRoom?.roomCode ?? null}
          onChangeVolume={handleChangeVolume}
          onPreviewVolume={() => soundFx.playVolumePreview()}
          onToggleMute={handleToggleMute}
          onResume={() => setScreen('playing')}
          onRestart={handleRestartMatch}
          onBackToTitle={handleLeaveToHome}
          onChangeTheme={handleChangeTheme}
        />
      )}

      {showThemeModal && screen === 'playing' && (
        <ThemeModal
          theme={theme}
          onSelectTheme={handleChangeTheme}
          onClose={() => setShowThemeModal(false)}
        />
      )}

      {showRulesModal && screen === 'playing' && (
        <RulesModal
          theme={theme}
          mode={gameState.config.mode}
          onClose={() => setShowRulesModal(false)}
        />
      )}

      {screen === 'gameover' && (
        <VictoryModal
          state={gameState}
          theme={theme}
          canContinueForRanks={!gameState.endedByTimer && remainingUnfinished >= 2}
          onContinueForRanks={handleContinueForRanks}
          onPlayAgain={handleRestartMatch}
          onBackToTitle={handleLeaveToHome}
        />
      )}

      {/* Full-Screen Multi-Emitter Confetti & Sparkle Celebration Triggered by matchEnded */}
      <VictoryCelebrationCanvas
        active={matchEnded}
        winnerColor={celebrationWinner?.color}
      />
    </div>
  );
}
