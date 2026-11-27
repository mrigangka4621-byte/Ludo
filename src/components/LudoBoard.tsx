import { useMemo, useState } from 'react';
import {
  BOARD_CENTER,
  BOARD_VIEWBOX_SIZE,
  buildBoardGeometry,
  CLASSIC_ARM_PALETTE_INDICES,
  getTokenPoint,
} from '../game/boardGeometry';
import { isRingSquareSafe } from '../game/engine';
import { PLAYER_PALETTES } from '../game/themes';
import type {
  BoardTheme,
  GameMode,
  GameState,
  MoveDirection,
  MoveOption,
  PlayerPalette,
  Point2D,
  TokenState,
} from '../game/types';
import {
  AnimatedEventSticker,
  AnimatedStickerDefs,
  CryingCrawlSticker,
} from './AnimatedEmojis';

export interface ActiveTokenAnimation {
  tokenId: string;
  point: Point2D;
  hopLift: number;
  scaleX: number;
  scaleY: number;
  tiltDeg?: number;
  trailPoint?: Point2D;
  trailHopLift?: number;
}

export interface FlyingUnoCardOverlay {
  id: number;
  card: NonNullable<GameState['unoState']>['hands'][number][number];
  playerName: string;
}

export interface FlyingCaptureAnimation {
  tokenId: string;
  playerId: number;
  point: Point2D;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
  phase: 'kicked' | 'crawling';
  crawlEmoji: string;
}

export interface HopTrailDot {
  id: number;
  point: Point2D;
  color: string;
}

export type BoardEffectKind =
  | 'deploy'
  | 'capture'
  | 'ambush'
  | 'taunt'
  | 'angry'
  | 'safe'
  | 'stack_safe'
  | 'enter_home'
  | 'finish'
  | 'bonus_six'
  | 'fire_ignite'
  | 'mercy_six'
  | 'forfeit'
  | 'skip'
  | 'victory'
  | 'crazy_snipe'
  | 'chaos_boost'
  | 'uno_reverse'
  | 'uno_skip'
  | 'uno_knockback';

export interface BoardEffect {
  id: number;
  point: Point2D;
  color: string;
  kind: BoardEffectKind;
  emoji: string;
  sprinklers?: string[];
  label?: string;
}

interface LudoBoardProps {
  state: GameState;
  theme: BoardTheme;
  legalMoves: MoveOption[];
  mode: GameMode;
  selectedDirection: MoveDirection;
  activeAnimation: ActiveTokenAnimation | null;
  flyingCaptures: FlyingCaptureAnimation[];
  hopTrails: HopTrailDot[];
  boardEffects: BoardEffect[];
  boardShakeKey?: number;
  impactFlash?: { id: number; color: string } | null;
  flyingUnoCard?: FlyingUnoCardOverlay | null;
  interactive?: boolean;
  isLiveMatch?: boolean;
  localSeatIndex?: number | null;
  onSelectMove?: (move: MoveOption) => void;
}

function pointsToString(pts: Point2D[]): string {
  return pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

function insetPolygon(pts: Point2D[], factor: number): Point2D[] {
  const cx = pts.reduce((acc, p) => acc + p.x, 0) / pts.length;
  const cy = pts.reduce((acc, p) => acc + p.y, 0) / pts.length;
  return pts.map((p) => ({
    x: cx + (p.x - cx) * factor,
    y: cy + (p.y - cy) * factor,
  }));
}

function makeStarPoints(cx: number, cy: number, outerR: number, innerR: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function getClusterOffset(indexInCell: number, countInCell: number, radius: number): Point2D {
  if (countInCell <= 1) return { x: 0, y: 0 };
  const spread = radius * (countInCell === 2 ? 0.54 : 0.66);
  const angle = -Math.PI / 2 + (indexInCell * 2 * Math.PI) / countInCell;
  return {
    x: Math.cos(angle) * spread,
    y: Math.sin(angle) * spread,
  };
}

const SPARK_VECTORS: Array<[number, number]> = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * Math.PI * 2) / 12;
  const dist = i % 2 === 0 ? 64 : 46;
  return [Math.round(Math.cos(angle) * dist), Math.round(Math.sin(angle) * dist)];
});

const UNO_MINI_COLORS: Record<string, string> = {
  red: '#E52521',
  blue: '#1D82D8',
  green: '#22A447',
  yellow: '#EAB308',
  wild: '#1E1B4B',
};

function getMiniUnoSymbol(card: NonNullable<GameState['unoState']>['hands'][number][number]): string {
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
      return 'SW';
  }
}

/**
 * Miniature fanned UNO cards rendered directly inside each player's Home Yard tray in UNO Ludo Mode!
 * On the active player's turn, the deck visibly juggles, shuffles, and glows with radiant sparkles!
 */
function UnoYardCardFan({
  cx,
  cy,
  cards,
  isFaceUp,
  isActiveTurn,
  playerColor,
  isFourArm,
}: {
  cx: number;
  cy: number;
  cards: NonNullable<GameState['unoState']>['hands'][number];
  isFaceUp: boolean;
  isActiveTurn: boolean;
  playerColor: string;
  isFourArm: boolean;
}) {
  const shown = cards.slice(0, 6);
  const count = shown.length;
  const scale = isFourArm ? 1 : 0.44;
  const cardW = 48;
  const cardH = 70;
  const spreadAngle = count > 1 ? Math.min(13, 56 / (count - 1)) : 0;
  const mid = (count - 1) / 2;

  return (
    <g
      transform={`translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) scale(${scale})`}
      pointerEvents="none"
      data-testid={isActiveTurn ? 'active-uno-yard-deck' : 'inactive-uno-yard-deck'}
    >
      {/* Radiant Glow -> Dim -> Glow Aura Behind the Active Player's UNO Deck */}
      {isActiveTurn && (
        <g className="animate-yard-deck-glow">
          <ellipse
            cx="0"
            cy="-2"
            rx="94"
            ry="70"
            fill={playerColor}
            fillOpacity="0.22"
          />
          <ellipse
            cx="0"
            cy="-2"
            rx="78"
            ry="56"
            fill="#FDE047"
            fillOpacity="0.34"
          />
        </g>
      )}

      {/* Shuffling & Juggling Fanned Deck */}
      <g className={isActiveTurn ? 'animate-yard-deck-shuffle' : undefined}>
        {shown.map((card, i) => {
          const offsetIdx = i - mid;
          const rot = offsetIdx * spreadAngle;
          const tx = offsetIdx * 20;
          const ty = Math.abs(offsetIdx) * 3.5 - 6;
          const fill = isFaceUp ? UNO_MINI_COLORS[card.color] ?? '#1E1B4B' : '#0F172A';
          const symbol = getMiniUnoSymbol(card);
          const juggleX = (i % 2 === 0 ? 1 : -1) * (4 + Math.abs(offsetIdx) * 1.4);
          const juggleRot = (i % 2 === 0 ? 1 : -1) * (6 + Math.abs(offsetIdx) * 1.6);

          return (
            <g
              key={card.id}
              transform={`translate(${tx.toFixed(1)}, ${ty.toFixed(1)}) rotate(${rot.toFixed(1)})`}
            >
              <g
                className={isActiveTurn ? 'animate-yard-card-juggle' : undefined}
                style={
                  isActiveTurn
                    ? ({
                        animationDelay: `${i * 150}ms`,
                        '--juggle-x': `${juggleX.toFixed(1)}px`,
                        '--juggle-rot': `${juggleRot.toFixed(1)}deg`,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                <rect
                  x={-cardW / 2}
                  y={-cardH / 2}
                  width={cardW}
                  height={cardH}
                  rx="7"
                  fill={fill}
                  stroke={isActiveTurn ? '#FEF08A' : '#FFFFFF'}
                  strokeWidth={isActiveTurn ? '3.2' : '2.6'}
                />
                {isFaceUp ? (
                  <>
                    <ellipse
                      cx="0"
                      cy="0"
                      rx="16"
                      ry="24"
                      transform="rotate(-22)"
                      fill={card.color === 'wild' ? '#0F172A' : '#FFFFFF'}
                      stroke={card.color === 'wild' ? '#FDE047' : '#0B1C3D'}
                      strokeWidth="1.4"
                    />
                    <text
                      x="0"
                      y="2"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={card.color === 'wild' ? '#FDE047' : fill}
                      fontSize={symbol.length > 1 ? 18 : 24}
                      fontWeight="900"
                      className="font-display"
                    >
                      {symbol}
                    </text>
                  </>
                ) : (
                  <>
                    <ellipse
                      cx="0"
                      cy="0"
                      rx="16"
                      ry="25"
                      transform="rotate(-22)"
                      fill="#E52521"
                      stroke="#FDE047"
                      strokeWidth="2"
                    />
                    <text
                      x="0"
                      y="1"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="#FDE047"
                      stroke="#0B1C3D"
                      strokeWidth="2"
                      paintOrder="stroke fill"
                      fontSize="13"
                      fontWeight="900"
                      transform="rotate(-16)"
                      className="font-display"
                    >
                      UNO
                    </text>
                  </>
                )}
              </g>
            </g>
          );
        })}
      </g>

      {/* Twinkling Sparkles Around Active Player's Juggling Deck */}
      {isActiveTurn && (
        <>
          <polygon
            points={makeStarPoints(-76, -46, 11, 4.5)}
            fill="#FDE047"
            stroke="#0B1C3D"
            strokeWidth="1.6"
            className="animate-starburst-pulse"
          />
          <polygon
            points={makeStarPoints(78, -42, 10, 4)}
            fill="#FFFFFF"
            stroke={playerColor}
            strokeWidth="1.6"
            className="animate-starburst-pulse"
            style={{ animationDelay: '220ms' }}
          />
        </>
      )}

      {/* Crisp Card Count & Active Turn Pill under the Fanned Deck */}
      <g transform="translate(0, 56)">
        <rect
          x={isActiveTurn ? -70 : -46}
          y="-15"
          width={isActiveTurn ? 140 : 92}
          height="28"
          rx="14"
          fill={isActiveTurn ? '#FACC15' : '#0B1C3D'}
          stroke={isActiveTurn ? '#0B1C3D' : '#FACC15'}
          strokeWidth={isActiveTurn ? '2.8' : '2'}
        />
        <text
          x="0"
          y="-1"
          textAnchor="middle"
          dominantBaseline="central"
          fill={isActiveTurn ? '#0B1C3D' : '#FDE047'}
          fontSize={isActiveTurn ? '13.5' : '14'}
          fontWeight="900"
          className="font-display"
        >
          {isActiveTurn
            ? `★ TURN · ${cards.length} ${cards.length === 1 ? 'CARD' : 'CARDS'}`
            : `${cards.length} ${cards.length === 1 ? 'CARD' : 'CARDS'}`}
        </text>
      </g>
    </g>
  );
}

/**
 * Exact glossy 3D teardrop pin Ludo pawn matching the reference board:
 * colored circular socket ring + subtle dark crimson inner contact ring +
 * sleek metallic-white inverted teardrop pin shell + glossy colored upper bead!
 */
function TeardropPinGraphic({
  color,
  darkColor,
  size,
  highlighted,
}: {
  color: string;
  darkColor: string;
  size: number;
  highlighted: boolean;
}) {
  const scale = size / 20;
  return (
    <g transform={`translate(0, 3) scale(${scale.toFixed(3)})`}>
      {/* Base ring sitting flush on socket */}
      <circle
        cx="0"
        cy="2"
        r="14.2"
        fill={color}
        stroke="#475569"
        strokeWidth="1.2"
      />
      {/* Inner contact shadow bullseye ring */}
      <circle
        cx="0"
        cy="2"
        r="9.8"
        fill="#7F1D1D"
        fillOpacity="0.82"
        stroke={darkColor}
        strokeWidth="0.9"
      />
      <circle cx="0" cy="2" r="6.4" fill={color} fillOpacity="0.9" />

      {/* Ground contact shadow behind pin tip */}
      <ellipse cx="1.8" cy="3.5" rx="7" ry="3.4" fill="rgba(0,0,0,0.28)" />

      {/* Crisp silver-white teardrop shell */}
      <path
        d="M 0 -33 C 11.8 -33 17.5 -23 15.2 -12 C 13.2 -3.4 5.2 3.2 0 7.6 C -5.2 3.2 -13.2 -3.4 -15.2 -12 C -17.5 -23 -11.8 -33 0 -33 Z"
        fill="#F8FAFC"
        stroke={highlighted ? '#FACC15' : '#1F2937'}
        strokeWidth={highlighted ? 2.8 : 1.7}
        strokeLinejoin="round"
      />
      {/* Subtle lower-right inner silver shading on shell */}
      <path
        d="M 11.5 -24 C 15 -18 14 -10 10 -4 C 6.5 1 2.4 4.2 0 6.2 C 3.8 1.5 9.2 -4.8 10.6 -12.6 C 11.6 -17.5 11.8 -21 11.5 -24 Z"
        fill="#CBD5E1"
        fillOpacity="0.65"
      />

      {/* Glossy colored oval/teardrop inner gem */}
      <ellipse
        cx="0"
        cy="-17.2"
        rx="8.5"
        ry="10.4"
        fill={color}
        stroke={darkColor}
        strokeWidth="1.2"
      />
      {/* Top specular highlight */}
      <ellipse
        cx="-2.6"
        cy="-21.4"
        rx="3.2"
        ry="4.2"
        transform="rotate(-16 -2.6 -21.4)"
        fill="#FFFFFF"
        fillOpacity="0.58"
      />
    </g>
  );
}

export function LudoBoard({
  state,
  theme,
  legalMoves,
  mode,
  selectedDirection,
  activeAnimation,
  flyingCaptures,
  hopTrails,
  boardEffects,
  boardShakeKey = 0,
  impactFlash = null,
  flyingUnoCard = null,
  interactive = true,
  isLiveMatch = true,
  localSeatIndex = null,
  onSelectMove,
}: LudoBoardProps) {
  const [hoveredTokenId, setHoveredTokenId] = useState<string | null>(null);

  const geometry = useMemo(
    () => buildBoardGeometry(state.config.playerCount),
    [state.config.playerCount]
  );

  const isFourArm = geometry.armCount === 4;
  const isArcade = theme.id === 'arcade';

  const armToPlayer = useMemo(() => {
    const map = new Map<number, GameState['players'][number]>();
    for (const p of state.players) {
      map.set(p.armIndex, p);
    }
    return map;
  }, [state.players]);

  // For the classic 4-arm board, every arm ALWAYS gets its canonical vibrant color
  // (Green top-right, Yellow bottom-right, Blue bottom-left, Red top-left) even in 2p or 3p games!
  const getArmPalette = (armIndex: number): PlayerPalette | null => {
    const occupant = armToPlayer.get(armIndex);
    if (occupant) return PLAYER_PALETTES[occupant.paletteIndex];
    if (isFourArm) {
      const classicIdx = CLASSIC_ARM_PALETTE_INDICES[armIndex];
      return PLAYER_PALETTES[classicIdx] ?? null;
    }
    return null;
  };

  const moveByTokenId = useMemo(() => {
    const map = new Map<string, MoveOption>();
    for (const m of legalMoves) {
      map.set(m.tokenId, m);
    }
    return map;
  }, [legalMoves]);

  const flyingIds = useMemo(() => new Set(flyingCaptures.map((f) => f.tokenId)), [flyingCaptures]);

  const cellStacks = useMemo(() => {
    const stacks = new Map<string, TokenState[]>();
    for (const player of state.players) {
      for (const token of player.tokens) {
        if (activeAnimation && activeAnimation.tokenId === token.id) continue;
        if (flyingIds.has(token.id)) continue;
        if (token.zone === 'track') {
          const key = `track:${token.ringIndex}`;
          const arr = stacks.get(key) ?? [];
          arr.push(token);
          stacks.set(key, arr);
        } else if (token.zone === 'home_stretch') {
          const key = `home:${player.armIndex}:${token.homeIndex}`;
          const arr = stacks.get(key) ?? [];
          arr.push(token);
          stacks.set(key, arr);
        }
      }
    }
    return stacks;
  }, [state.players, activeAnimation, flyingIds]);

  // Slightly larger iconic pawns on the 4-arm 15x15 grid; neatly scaled for 5-10 arm boards
  const baseTokenRadius = isFourArm
    ? geometry.cellSize * 0.44
    : Math.max(13, Math.min(20, geometry.cellSize * 0.37));
  const activePlayer = state.players[state.activePlayerIndex];

  const previewMove = useMemo(() => {
    if (!interactive || legalMoves.length === 0) return null;
    if (hoveredTokenId && moveByTokenId.has(hoveredTokenId)) {
      return moveByTokenId.get(hoveredTokenId)!;
    }
    if (legalMoves.length === 1) {
      return legalMoves[0];
    }
    return null;
  }, [interactive, legalMoves, hoveredTokenId, moveByTokenId]);

  const flowRingRadius = 486;

  const shakeClass =
    boardShakeKey > 0
      ? boardShakeKey % 2 === 1
        ? 'animate-board-shake-a'
        : 'animate-board-shake-b'
      : '';

  return (
    <div
      className={`relative flex items-center justify-center w-full h-full select-none ${shakeClass}`}
      data-testid="ludo-board-container"
      data-shake-count={boardShakeKey}
    >
      {/* Radial Impact Flash Overlay on Captures, Ambushes, Crazy Snipes & UNO Knockbacks */}
      {impactFlash && (
        <div
          key={impactFlash.id}
          className="pointer-events-none absolute inset-0 z-30 rounded-xl animate-impact-flash"
          style={{
            background: `radial-gradient(circle at 50% 50%, ${impactFlash.color}66 0%, ${impactFlash.color}22 45%, transparent 78%)`,
          }}
        />
      )}

      {/* Dramatic 3D Swooping UNO Card Throw Overlay */}
      {flyingUnoCard && (
        <div
          key={flyingUnoCard.id}
          data-testid="flying-uno-card-overlay"
          className="pointer-events-none absolute top-1/2 left-1/2 z-40 animate-uno-card-throw flex flex-col items-center gap-1.5"
        >
          <div
            className="relative w-[96px] h-[138px] rounded-2xl border-4 border-white flex flex-col items-center justify-center shadow-2xl overflow-hidden"
            style={{
              backgroundColor: UNO_MINI_COLORS[flyingUnoCard.card.color] ?? '#1E1B4B',
              boxShadow: '0 18px 40px rgba(0,0,0,0.6), 0 0 28px rgba(250,204,21,0.65)',
            }}
          >
            {flyingUnoCard.card.color === 'wild' && (
              <div className="absolute inset-1.5 rounded-xl opacity-85 overflow-hidden grid grid-cols-2 grid-rows-2">
                <span style={{ backgroundColor: '#E52521' }} />
                <span style={{ backgroundColor: '#1D82D8' }} />
                <span style={{ backgroundColor: '#EAB308' }} />
                <span style={{ backgroundColor: '#22A447' }} />
              </div>
            )}
            <div
              className="absolute inset-x-2 inset-y-3.5 rounded-[50%] -rotate-[22deg]"
              style={{
                backgroundColor:
                  flyingUnoCard.card.color === 'wild' ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.95)',
                border: `2px solid ${flyingUnoCard.card.color === 'wild' ? '#FDE047' : '#0B1C3D'}`,
              }}
            />
            <span
              className="relative z-10 font-display font-black text-4xl leading-none"
              style={{
                color:
                  flyingUnoCard.card.color === 'wild'
                    ? '#FDE047'
                    : UNO_MINI_COLORS[flyingUnoCard.card.color] ?? '#1E1B4B',
                textShadow: '0 2px 0 rgba(11,28,61,0.3)',
              }}
            >
              {getMiniUnoSymbol(flyingUnoCard.card)}
            </span>
          </div>
          <span
            className="px-3 py-0.5 rounded-full font-display font-extrabold text-xs whitespace-nowrap shadow-lg"
            style={{
              backgroundColor: '#0B1C3D',
              color: '#FDE047',
              border: '2px solid #FACC15',
            }}
          >
            {flyingUnoCard.playerName}
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${BOARD_VIEWBOX_SIZE} ${BOARD_VIEWBOX_SIZE}`}
        className="w-full h-full max-w-full max-h-full"
        role="img"
        aria-label={`${state.config.playerCount}-player ${
          mode === 'flip'
            ? 'Flip-Track'
            : mode === 'crazy'
              ? 'Crazy Mode'
              : mode === 'uno'
                ? 'UNO Ludo'
                : 'Classic'
        } Ludo board`}
      >
        <AnimatedStickerDefs />
        {/* Board Base */}
        {isFourArm ? (
          <rect
            x="0"
            y="0"
            width={BOARD_VIEWBOX_SIZE}
            height={BOARD_VIEWBOX_SIZE}
            fill={theme.tileBg}
          />
        ) : (
          <circle
            cx={BOARD_CENTER}
            cy={BOARD_CENTER}
            r="486"
            fill={theme.boardFrameBg}
            stroke={theme.boardFrameStroke}
            strokeWidth={isArcade ? '5' : '4'}
          />
        )}

        {/* Radial Flip-Track Perimeter Flow Ring (for 5-10 player circular boards only; 4-arm stays 100% pure classic edge-to-edge) */}
        {!isFourArm && mode === 'flip' && (
          <g opacity={state.phase === 'choosing_move' ? 0.92 : 0.65} pointerEvents="none">
            <circle
              cx={BOARD_CENTER}
              cy={BOARD_CENTER}
              r={flowRingRadius + 6}
              fill="none"
              stroke={selectedDirection === 'backward' ? theme.captureRing : theme.accent}
              strokeWidth="2.8"
              strokeDasharray="12 14"
            />
          </g>
        )}

        {/* Home Yards: Edge-to-Edge 6x6 Classic Colored Corner Blocks with White Inner Socket Trays */}
        {geometry.yards.map((yard) => {
          const occupant = armToPlayer.get(yard.armIndex);
          const palette = getArmPalette(yard.armIndex);
          const yardFill = palette ? (palette.yardColor ?? palette.color) : theme.yardBg;
          const dotColor = palette ? palette.color : theme.yardStroke;
          const isActiveArm = Boolean(occupant && activePlayer && occupant.id === activePlayer.id && isLiveMatch);

          // Match exact white inner tray proportions from reference (approx 68% of the 6x6 yard)
          const innerTray = insetPolygon(yard.polygon, isFourArm ? 0.68 : 0.74);

          // Match exact yard player label position ("Computer" centered in top green margin, "You" centered in bottom blue margin)
          const yardMinY = Math.min(...yard.polygon.map((p) => p.y));
          const yardMaxY = Math.max(...yard.polygon.map((p) => p.y));
          const isTopHalf = yard.center.y < BOARD_CENTER;
          const labelY = isFourArm
            ? isTopHalf
              ? yardMinY + 24
              : yardMaxY - 25
            : yard.center.y;

          const socketSlots = isFourArm
            ? yard.slots
            : yard.slots.slice(0, state.config.tokensPerPlayer);
          const socketRadius = isFourArm ? geometry.cellSize * 0.62 : baseTokenRadius * 1.12;
          const fourArmGridStroke = isFourArm && isArcade ? '#4B5563' : theme.tileStroke;

          const isInactiveUnoYard = mode === 'uno' && isLiveMatch && Boolean(occupant) && !isActiveArm;

          return (
            <g
              key={`yard-${yard.armIndex}`}
              data-testid={
                isActiveArm && occupant ? `active-home-yard-${occupant.id}` : `home-yard-${yard.armIndex}`
              }
              opacity={isInactiveUnoYard ? 0.68 : 1}
              style={{ transition: 'opacity 260ms ease' }}
            >
              {/* Outer Vibrant Colored Yard Square/Trapezoid with Glow -> Dim -> Glow on Active Turn */}
              <polygon
                points={pointsToString(yard.polygon)}
                fill={yardFill}
                fillOpacity={palette ? (isArcade || !theme.isDark ? 1 : 0.88) : 0.35}
                stroke={isActiveArm ? '#FEF08A' : fourArmGridStroke}
                strokeWidth={isActiveArm ? '3.5' : '1.5'}
                className={isActiveArm ? 'animate-yard-glow-dim' : undefined}
              />

              {/* Pulsing Golden Active-Turn Halo Ring Around Active Player's Home Yard */}
              {isActiveArm && (
                <polygon
                  points={pointsToString(insetPolygon(yard.polygon, 0.965))}
                  fill="none"
                  stroke="#FDE047"
                  strokeWidth="6"
                  strokeLinejoin="round"
                  pointerEvents="none"
                  className="animate-yard-aura-pulse"
                />
              )}

              {/* Crisp White Inner Square Tray */}
              <polygon
                points={pointsToString(innerTray)}
                fill={
                  mode === 'uno' && isActiveArm
                    ? '#FFFBEB'
                    : mode === 'uno' && occupant
                      ? '#F1F5F9'
                      : theme.tileBg
                }
                stroke={
                  isActiveArm
                    ? '#FACC15'
                    : fourArmGridStroke
                }
                strokeWidth={isActiveArm ? (mode === 'uno' ? '5.5' : '4') : isFourArm ? '1.8' : '1.2'}
                className={isActiveArm ? 'animate-yard-aura-pulse' : undefined}
              />

              {/* In UNO Ludo Mode: render juggling, shuffling, glowing fanned UNO cards inside Home Yard! */}
              {mode === 'uno' && occupant && state.unoState ? (
                <UnoYardCardFan
                  cx={yard.center.x}
                  cy={yard.center.y}
                  cards={state.unoState.hands[occupant.id] ?? []}
                  isFaceUp={
                    localSeatIndex !== null
                      ? occupant.id === localSeatIndex
                      : activePlayer?.id === occupant.id && !occupant.isBot
                  }
                  isActiveTurn={Boolean(isActiveArm)}
                  playerColor={palette?.color ?? '#FACC15'}
                  isFourArm={isFourArm}
                />
              ) : (
                /* Bold Colored Circular Token Sockets (Classic / Flip / Crazy modes) */
                palette &&
                socketSlots.map((slot, sIdx) => (
                  <circle
                    key={`slot-${yard.armIndex}-${sIdx}`}
                    cx={slot.x}
                    cy={slot.y}
                    r={socketRadius}
                    fill={dotColor}
                    stroke={isFourArm ? '#4B5563' : palette.dark}
                    strokeOpacity={isFourArm ? '0.85' : '0.65'}
                    strokeWidth={isFourArm ? '1.6' : '1.4'}
                  />
                ))
              )}

              {/* Crisp Outlined Yard Player Label (with Active Turn Star Indicator) */}
              {occupant && (
                <text
                  x={yard.center.x}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isActiveArm ? '#FDE047' : '#FFFFFF'}
                  stroke="#0B1C3D"
                  strokeWidth={isFourArm ? 4.4 : 2.8}
                  paintOrder="stroke fill"
                  fontSize={isFourArm ? (isActiveArm ? 30 : 28) : 12}
                  fontWeight="900"
                  pointerEvents="none"
                >
                  {isFourArm
                    ? isActiveArm
                      ? `▶ ${occupant.name.slice(0, 11)}`
                      : occupant.name.slice(0, 12)
                    : isActiveArm
                      ? `★P${occupant.id + 1}`
                      : `P${occupant.id + 1}`}
                </text>
              )}
            </g>
          );
        })}

        {/* Main Perimeter Track Cells */}
        {geometry.trackCells.map((cell) => {
          const startPalette =
            cell.startArmIndex !== null ? getArmPalette(cell.startArmIndex) : null;
          const homeEntryPalette =
            cell.homeEntryArmIndex !== null ? getArmPalette(cell.homeEntryArmIndex) : null;

          let fill = cell.index % 2 === 0 ? theme.tileBg : theme.tileAltBg;
          if (startPalette) {
            fill = startPalette.color;
          }

          const isDynamicSafe =
            !geometry.safeIndices.has(cell.index) &&
            isRingSquareSafe(state, geometry, cell.index);

          return (
            <g key={`track-${cell.index}`}>
              <polygon
                points={pointsToString(cell.corners)}
                fill={fill}
                stroke={theme.tileStroke}
                strokeWidth="1.35"
              />

              {/* Subtle Golden Shield Inset on Active Stacked-Piece Safe Points */}
              {isDynamicSafe && (
                <polygon
                  points={pointsToString(insetPolygon(cell.corners, 0.86))}
                  fill="#FDE047"
                  fillOpacity="0.28"
                  stroke="#D97706"
                  strokeWidth="2.4"
                  pointerEvents="none"
                />
              )}

              {/* Crisp Outlined 5-Point Safe Star Tile */}
              {cell.isSafeStar && (
                <polygon
                  points={makeStarPoints(
                    cell.center.x,
                    cell.center.y,
                    geometry.cellSize * 0.42,
                    geometry.cellSize * 0.175
                  )}
                  fill={theme.safeStarFill}
                  stroke={theme.safeStarStroke}
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
              )}

              {/* Thin Colored Home Entry Arrow pointing inward into Home Stretch */}
              {homeEntryPalette && (
                <g
                  transform={`translate(${cell.center.x}, ${cell.center.y}) rotate(${
                    (cell.angleRad * 180) / Math.PI + 180
                  })`}
                  pointerEvents="none"
                >
                  <path
                    d={`M ${-geometry.cellSize * 0.24} 0 H ${geometry.cellSize * 0.24} M ${geometry.cellSize * 0.05} ${-geometry.cellSize * 0.2} L ${geometry.cellSize * 0.25} 0 L ${geometry.cellSize * 0.05} ${geometry.cellSize * 0.2}`}
                    fill="none"
                    stroke={homeEntryPalette.color}
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              )}
            </g>
          );
        })}

        {/* Colored Home Stretch Lanes */}
        {geometry.homeStretchCells.map((lane, armIdx) => {
          const palette = getArmPalette(armIdx);
          return lane.map((cell) => (
            <polygon
              key={`home-${armIdx}-${cell.stepIndex}`}
              points={pointsToString(cell.corners)}
              fill={palette ? palette.color : theme.tileAltBg}
              stroke={isFourArm && isArcade ? '#4B5563' : theme.tileStroke}
              strokeWidth="1.45"
            />
          ));
        })}

        {/* Solid Vibrant Center Finish Triangles */}
        <g>
          <polygon
            points={pointsToString(geometry.centerPolygon)}
            fill={theme.centerBg}
            stroke={isFourArm && isArcade ? '#4B5563' : theme.centerStroke}
            strokeWidth="1.6"
          />
          {geometry.finishWedges.map((wedge) => {
            const palette = getArmPalette(wedge.armIndex);
            return (
              <polygon
                key={`wedge-${wedge.armIndex}`}
                points={pointsToString(wedge.polygon)}
                fill={palette ? palette.color : theme.yardBg}
                stroke={isFourArm && isArcade ? '#4B5563' : theme.centerStroke}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            );
          })}
          {!isFourArm && (
            <circle
              cx={BOARD_CENTER}
              cy={BOARD_CENTER}
              r={Math.max(16, geometry.innerRadius * 0.2)}
              fill={theme.centerBg}
              stroke={theme.accent}
              strokeWidth="2.2"
            />
          )}
        </g>

        {/* Fading Hop Trail Dots + Dual Concentric Expanding Landing Ripple Rings */}
        {hopTrails.map((dot) => (
          <g key={dot.id} pointerEvents="none">
            <circle
              cx={dot.point.x}
              cy={dot.point.y}
              r={baseTokenRadius * 0.64}
              fill="none"
              stroke={dot.color}
              strokeWidth="3.4"
              className="animate-landing-ripple"
            />
            <circle
              cx={dot.point.x}
              cy={dot.point.y}
              r={baseTokenRadius * 0.46}
              fill="none"
              stroke="#FEF08A"
              strokeWidth="2.2"
              className="animate-landing-ripple"
              style={{ animationDelay: '75ms' }}
            />
            <circle
              cx={dot.point.x}
              cy={dot.point.y}
              r={baseTokenRadius * 0.38}
              fill={dot.color}
              className="animate-trail-fade"
            />
          </g>
        ))}

        {/* Destination Preview Trail & Clickable Landing Rings */}
        {interactive &&
          legalMoves.map((move) => {
            const isPreviewed = previewMove?.tokenId === move.tokenId;
            const lastWp = move.waypoints[move.waypoints.length - 1];
            const isKnockbackSelect = state.phase === 'choosing_knockback_target';
            const isCapture = move.capturesTokenIds.length > 0 || isKnockbackSelect;
            const ringColor = isCapture ? theme.captureRing : theme.previewRing;

            const owner =
              state.players.find((p) => p.tokens.some((t) => t.id === move.tokenId)) ??
              state.players[state.activePlayerIndex];
            const tok = owner?.tokens.find((t) => t.id === move.tokenId);
            const startPt = tok
              ? getTokenPoint(
                  geometry,
                  owner.armIndex,
                  tok.slotIndex,
                  tok.zone,
                  tok.ringIndex,
                  tok.homeIndex
                )
              : null;

            return (
              <g key={`preview-${move.tokenId}`}>
                {isPreviewed && startPt && (
                  <polyline
                    points={[startPt, ...move.waypoints.map((w) => w.point)]
                      .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                      .join(' ')}
                    fill="none"
                    stroke={ringColor}
                    strokeWidth="5.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="7 9"
                    opacity="0.96"
                    className="animate-path-flow"
                    pointerEvents="none"
                  />
                )}

                {lastWp && (
                  <g
                    onClick={() => onSelectMove?.(move)}
                    style={{ cursor: 'pointer' }}
                    opacity={isPreviewed ? 1 : 0.72}
                  >
                    <circle
                      cx={lastWp.point.x}
                      cy={lastWp.point.y}
                      r={baseTokenRadius * (isPreviewed ? 1.15 : 0.92)}
                      fill={ringColor}
                      fillOpacity={isPreviewed ? 0.25 : 0.14}
                      stroke={ringColor}
                      strokeWidth={isPreviewed ? 3.5 : 2.2}
                      strokeDasharray={isCapture ? '5 3' : undefined}
                      className={isPreviewed ? 'animate-pulse-ring' : undefined}
                    />
                  </g>
                )}
              </g>
            );
          })}

        {/* Stationary & Hopping Player Teardrop Pawns */}
        {state.players
          .flatMap((player) =>
            player.tokens
              .filter((token) => !flyingIds.has(token.id))
              .map((token) => ({
                player,
                token,
                isMoving: activeAnimation?.tokenId === token.id,
                moveOption: interactive ? moveByTokenId.get(token.id) ?? null : null,
              }))
          )
          .sort((a, b) => {
            if (a.isMoving !== b.isMoving) return a.isMoving ? 1 : -1;
            if (Boolean(a.moveOption) !== Boolean(b.moveOption)) {
              return a.moveOption ? 1 : -1;
            }
            return a.token.slotIndex - b.token.slotIndex;
          })
          .map(({ player, token, isMoving, moveOption }) => {
            const palette = PLAYER_PALETTES[player.paletteIndex];
            let pt: Point2D;
            let pawnSize =
              token.zone === 'yard' && isFourArm
                ? geometry.cellSize * 0.72
                : baseTokenRadius * 1.04;
            let hopLift = 0;
            let scaleX = 1;
            let scaleY = 1;
            let tiltDeg = 0;

            if (isMoving && activeAnimation) {
              pt = activeAnimation.point;
              hopLift = activeAnimation.hopLift;
              scaleX = activeAnimation.scaleX;
              scaleY = activeAnimation.scaleY;
              tiltDeg = activeAnimation.tiltDeg ?? 0;
              pawnSize = baseTokenRadius * 1.16;
            } else {
              pt = getTokenPoint(
                geometry,
                player.armIndex,
                token.slotIndex,
                token.zone,
                token.ringIndex,
                token.homeIndex
              );

              if (token.zone === 'track') {
                const stack = cellStacks.get(`track:${token.ringIndex}`) ?? [];
                if (stack.length > 1) {
                  const idxInStack = stack.findIndex((t) => t.id === token.id);
                  const offset = getClusterOffset(idxInStack, stack.length, baseTokenRadius);
                  pt = { x: pt.x + offset.x, y: pt.y + offset.y };
                  pawnSize = baseTokenRadius * (stack.length === 2 ? 0.84 : 0.72);
                }
              } else if (token.zone === 'home_stretch') {
                const stack = cellStacks.get(`home:${player.armIndex}:${token.homeIndex}`) ?? [];
                if (stack.length > 1) {
                  const idxInStack = stack.findIndex((t) => t.id === token.id);
                  const offset = getClusterOffset(idxInStack, stack.length, baseTokenRadius);
                  pt = { x: pt.x + offset.x, y: pt.y + offset.y };
                  pawnSize = baseTokenRadius * 0.82;
                }
              } else if (token.zone === 'finished') {
                pawnSize = baseTokenRadius * 0.68;
              }
            }

            const isMovable = Boolean(moveOption);
            const isHovered = hoveredTokenId === token.id;

            const isKnockbackTarget = state.phase === 'choosing_knockback_target' && isMovable;
            const isCaptureChoice = isKnockbackTarget || Boolean(moveOption && moveOption.capturesTokenIds.length > 0);
            const actionLabel = moveOption
              ? isKnockbackTarget
                ? `Send ${player.name} token ${token.slotIndex + 1} backward ${state.unoState?.pendingKnockback?.totalSteps ?? 2} squares`
                : `Move ${player.name} token ${token.slotIndex + 1} ${moveOption.direction}${
                    moveOption.capturesTokenIds.length > 0 ? ' to capture opponent' : ''
                  }`
              : undefined;

            const shadowFactor = Math.max(0.42, 1 - hopLift / 64);

            return (
              <g
                key={token.id}
                role={isMovable ? 'button' : undefined}
                tabIndex={isMovable ? 0 : undefined}
                aria-label={actionLabel}
                data-testid={isMovable ? `movable-token-${token.id}` : `token-${token.id}`}
                onClick={isMovable ? () => onSelectMove?.(moveOption!) : undefined}
                onKeyDown={
                  isMovable
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectMove?.(moveOption!);
                        }
                      }
                    : undefined
                }
                onMouseEnter={isMovable ? () => setHoveredTokenId(token.id) : undefined}
                onMouseLeave={isMovable ? () => setHoveredTokenId(null) : undefined}
                style={{ cursor: isMovable ? 'pointer' : 'default', outline: 'none' }}
              >
                {/* Dynamic Ground Contact Shadow beneath Hopping Pawns */}
                {isMoving && (
                  <ellipse
                    cx={pt.x}
                    cy={pt.y + 5}
                    rx={pawnSize * 0.92 * shadowFactor}
                    ry={pawnSize * 0.4 * shadowFactor}
                    fill="rgba(11, 28, 61, 0.36)"
                    pointerEvents="none"
                  />
                )}

                {/* Pulsing Ground Target Ring under Movable / Knockback-Target Pawns */}
                {isMovable && (
                  <circle
                    cx={pt.x}
                    cy={pt.y + 2}
                    r={pawnSize * 1.18}
                    fill={isCaptureChoice ? theme.captureRing : '#FACC15'}
                    fillOpacity="0.26"
                    stroke={isCaptureChoice ? theme.captureRing : '#FACC15'}
                    strokeWidth={isHovered ? 4 : 2.8}
                    className="animate-pulse-ring"
                  />
                )}

                {/* Silky Motion Streak + Translucent Afterimage behind Hopping Pawns */}
                {isMoving && activeAnimation?.trailPoint && (
                  <g pointerEvents="none">
                    <line
                      x1={activeAnimation.trailPoint.x}
                      y1={activeAnimation.trailPoint.y - (activeAnimation.trailHopLift ?? 0) - pawnSize * 0.45}
                      x2={pt.x}
                      y2={pt.y - hopLift - pawnSize * 0.45}
                      stroke={palette.color}
                      strokeWidth={pawnSize * 0.72}
                      strokeLinecap="round"
                      opacity="0.24"
                    />
                    <g
                      transform={`translate(${activeAnimation.trailPoint.x}, ${activeAnimation.trailPoint.y - (activeAnimation.trailHopLift ?? 0)}) scale(0.86)`}
                      opacity="0.32"
                    >
                      <TeardropPinGraphic
                        color={palette.color}
                        darkColor={palette.dark}
                        size={pawnSize}
                        highlighted={false}
                      />
                    </g>
                  </g>
                )}

                {/* Glossy 3D Teardrop Pawn with Hop Lift + Tilt + Squash/Stretch + Ready Bounce */}
                <g
                  transform={`translate(${pt.x}, ${pt.y - hopLift - (isHovered ? 6 : 0)}) rotate(${tiltDeg.toFixed(1)}) scale(${scaleX.toFixed(3)}, ${scaleY.toFixed(3)})`}
                >
                  <g
                    className={isMovable && !isMoving ? 'animate-pawn-bob' : undefined}
                    style={
                      isMovable && !isMoving
                        ? { animationDelay: `${token.slotIndex * 110}ms` }
                        : undefined
                    }
                  >
                    <TeardropPinGraphic
                      color={palette.color}
                      darkColor={palette.dark}
                      size={pawnSize}
                      highlighted={isMovable || isMoving}
                    />
                  </g>
                </g>

                {/* Bouncing Arcade Pointer Chevron Floating Above Playable / Targetable Pawns */}
                {isMovable && !isMoving && (
                  <g
                    transform={`translate(${pt.x}, ${pt.y - pawnSize * 2.15})`}
                    pointerEvents="none"
                  >
                    <g className="animate-chevron-bob">
                      <polygon
                        points="-9,-10 9,-10 0,2"
                        fill={isCaptureChoice ? '#EF4444' : '#FDE047'}
                        stroke="#0B1C3D"
                        strokeWidth="2.4"
                        strokeLinejoin="round"
                      />
                    </g>
                  </g>
                )}
              </g>
            );
          })}

        {/* Captured Pawns Crawling Back Around the Board to Home Yard with Animated Crying Sticker */}
        {flyingCaptures.map((fly) => {
          const owner = state.players[fly.playerId];
          const palette = PLAYER_PALETTES[owner?.paletteIndex ?? 0];
          const stickerScale = isFourArm ? 1.05 : 0.82;
          return (
            <g
              key={`fly-${fly.tokenId}`}
              data-testid={`crawling-capture-${fly.tokenId}`}
              pointerEvents="none"
            >
              {/* Waddling / crawling pawn */}
              <g
                transform={`translate(${fly.point.x}, ${fly.point.y}) rotate(${fly.rotationDeg.toFixed(1)}) scale(${fly.scaleX.toFixed(2)}, ${fly.scaleY.toFixed(2)})`}
              >
                <TeardropPinGraphic
                  color={palette.color}
                  darkColor={palette.dark}
                  size={baseTokenRadius * 1.02}
                  highlighted
                />
              </g>

              {/* Custom Animated Crying Face with Gushing Cyan Tear Waterfalls */}
              <g
                transform={`translate(${fly.point.x}, ${Math.max(52, fly.point.y - 46)}) scale(${stickerScale})`}
              >
                <CryingCrawlSticker phase={fly.phase} />
              </g>
            </g>
          );
        })}

        {/* Custom Multi-Part Animated Cartoon Stickers, Impact Shockwaves & Arcade Callouts */}
        {boardEffects.map((fx) => {
          const fxX = Math.max(106, Math.min(BOARD_VIEWBOX_SIZE - 106, fx.point.x));
          const fxY = Math.max(112, Math.min(BOARD_VIEWBOX_SIZE - 72, fx.point.y));
          const isHostile =
            fx.kind === 'capture' ||
            fx.kind === 'ambush' ||
            fx.kind === 'angry' ||
            fx.kind === 'crazy_snipe' ||
            fx.kind === 'uno_skip' ||
            fx.kind === 'uno_knockback';
          const showShockwave =
            fx.kind !== 'skip' && fx.kind !== 'bonus_six' && fx.kind !== 'taunt';
          const stickerScale =
            fx.kind === 'victory' || fx.kind === 'finish'
              ? 1.24
              : fx.kind === 'deploy' ||
                  fx.kind === 'capture' ||
                  fx.kind === 'ambush' ||
                  fx.kind === 'fire_ignite' ||
                  fx.kind === 'crazy_snipe' ||
                  fx.kind === 'chaos_boost' ||
                  fx.kind === 'uno_knockback'
                ? 1.12
                : 1.04;

          return (
            <g
              key={fx.id}
              data-testid={`board-effect-${fx.kind}`}
              pointerEvents="none"
            >
              {showShockwave && (
                <>
                  <circle
                    cx={fx.point.x}
                    cy={fx.point.y}
                    r={baseTokenRadius * 1.3}
                    fill="none"
                    stroke={isHostile ? '#EF4444' : '#FACC15'}
                    strokeWidth="5"
                    className="animate-burst-pop"
                  />
                  <circle
                    cx={fx.point.x}
                    cy={fx.point.y}
                    r={baseTokenRadius * 0.85}
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3.2"
                    className="animate-burst-pop"
                    style={{ animationDelay: '90ms' }}
                  />
                </>
              )}

              {/* Color Sparks */}
              {showShockwave &&
                SPARK_VECTORS.map(([tx, ty], i) => (
                  <circle
                    key={`sp-${i}`}
                    cx={fx.point.x}
                    cy={fx.point.y}
                    r={i % 2 === 0 ? 5.5 : 4}
                    fill={i % 2 === 0 ? '#FACC15' : fx.color}
                    className="animate-spark-fly"
                    style={
                      {
                        '--tx': `${tx}px`,
                        '--ty': `${ty}px`,
                      } as React.CSSProperties
                    }
                  />
                ))}

              {/* Custom Animated Cartoon Character Sticker */}
              <g transform={`translate(${fxX}, ${fxY - 28}) scale(${stickerScale})`}>
                <AnimatedEventSticker kind={fx.kind} />
              </g>

              {/* Bold Arcade Event Label */}
              {fx.label && (
                <text
                  x={fxX}
                  y={fxY + 30}
                  textAnchor="middle"
                  fill={isHostile ? '#FCA5A5' : '#FDE047'}
                  stroke="#0B1C3D"
                  strokeWidth="4.4"
                  paintOrder="stroke fill"
                  fontSize="24"
                  fontWeight="800"
                  className="font-display animate-float-callout"
                >
                  {fx.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
