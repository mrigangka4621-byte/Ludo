import type {
  BoardCell,
  BoardGeometry,
  FinishWedgeGeometry,
  HomeStretchCell,
  HomeYardGeometry,
  Point2D,
} from './types.ts';

export const BOARD_VIEWBOX_SIZE = 1000;
export const BOARD_CENTER = 500;

/**
 * Determine how many arms the board has for a given player count (2..10).
 * 2-4 players use the classic 4-arm cross board; 5-10 players use an N-arm radial star board.
 */
export function getArmCount(playerCount: number): number {
  const clamped = Math.max(2, Math.min(10, Math.round(playerCount)));
  return Math.max(4, clamped);
}

/**
 * Classic 4-arm board color mapping matching standard Ludo:
 * Arm 0 (North / Top-Right yard) = Green (1)
 * Arm 1 (East / Bottom-Right yard) = Yellow (2)
 * Arm 2 (South / Bottom-Left yard) = Blue (3)
 * Arm 3 (West / Top-Left yard) = Red (0)
 */
export const CLASSIC_ARM_PALETTE_INDICES = [1, 2, 3, 0] as const;

/**
 * Assign balanced arm indices for each player:
 * 2 players: Bottom-Left Blue (Arm 2) vs Top-Right Green (Arm 0) — exact classic opposite corners.
 * 3 players: Blue (2), Red (3), Green (0).
 * 4 players: Blue (2), Red (3), Green (0), Yellow (1) in clockwise order.
 */
export function getPlayerArmAssignments(playerCount: number): number[] {
  const clamped = Math.max(2, Math.min(10, Math.round(playerCount)));
  if (clamped === 2) return [2, 0];
  if (clamped === 3) return [2, 3, 0];
  if (clamped === 4) return [2, 3, 0, 1];
  return Array.from({ length: clamped }, (_, i) => i);
}

/**
 * Convert arm-local coordinates (radial distance `r` from center along arm axis,
 * tangential offset `t` perpendicular to arm axis where +t is clockwise/right
 * when looking outward from center) into SVG coordinates.
 */
function armLocalToWorld(angleRad: number, r: number, t: number): Point2D {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  // Radial unit vector: (cos, sin)
  // Clockwise perpendicular vector (looking outward in SVG Y-down): (-sin, cos)
  // Verify for North arm (angle = -PI/2): cos=0, sin=-1 -> radial=(0,-1) [Up], perp=(1,0) [Right/East]
  return {
    x: BOARD_CENTER + r * cos - t * sin,
    y: BOARD_CENTER + r * sin + t * cos,
  };
}

function makeCellRect(
  angleRad: number,
  rInner: number,
  rOuter: number,
  tLeft: number,
  tRight: number
): { center: Point2D; corners: Point2D[] } {
  const rMid = (rInner + rOuter) / 2;
  const tMid = (tLeft + tRight) / 2;
  return {
    center: armLocalToWorld(angleRad, rMid, tMid),
    corners: [
      armLocalToWorld(angleRad, rInner, tLeft),
      armLocalToWorld(angleRad, rOuter, tLeft),
      armLocalToWorld(angleRad, rOuter, tRight),
      armLocalToWorld(angleRad, rInner, tRight),
    ],
  };
}

const geometryCache = new Map<number, BoardGeometry>();

/**
 * Build exact, overlap-free radial polygonal Ludo board geometry for K = 4..10 arms.
 *
 * Track traversal order per arm (clockwise around perimeter):
 *   - Left lane (t = -cellSize): steps 0 .. stepsPerArm-1 moving OUTWARD
 *   - Tip middle cell (t = 0): step stepsPerArm-1 (also the arm's Home Entry gate!)
 *   - Right lane (t = +cellSize): steps stepsPerArm-1 .. 0 moving INWARD
 *
 * Player's Start square on arm `k`: Right lane, 1 step inward from the tip
 * (i.e. 2 steps clockwise after the arm's Tip/Home Entry cell, matching classic Ludo!).
 * Safe Star square on arm `k`: Left lane, 2 steps inward from the tip (matching classic Ludo's 8 safe squares on 4 arms!).
 */
export function buildBoardGeometry(playerCount: number): BoardGeometry {
  const armCount = getArmCount(playerCount);
  const cached = geometryCache.get(armCount);
  if (cached) return cached;

  // Classic 4-arm uses 6 steps/arm (52 track cells, 5 home stretch).
  // 5-10 arms use 5 steps/arm (11*K track cells, 4 home stretch) so cells remain large and readable even at 10 players.
  const stepsPerArm = armCount === 4 ? 6 : 5;
  const cellsPerArm = stepsPerArm * 2 + 1;
  const ringLength = armCount * cellsPerArm;
  const homeLength = stepsPerArm - 1;

  const halfAngle = Math.PI / armCount;
  const tanHalf = Math.tan(halfAngle);
  const sinHalf = Math.sin(halfAngle);
  const cosHalf = Math.cos(halfAngle);

  // Arm width is 3 * cellSize. Apothem of inner K-gon where arm bases touch seamlessly:
  // apothem = (1.5 * cellSize) / tan(PI / K)
  const apothemFactor = 1.5 / tanHalf;
  const outerFactor = apothemFactor + stepsPerArm;
  const cornerFactor = Math.hypot(outerFactor, 1.5);

  // For the classic 4-arm board, use an exact edge-to-edge 15x15 square grid (0..1000)
  // so the 4 colored 6x6 yards sit 100% flush against the outer edges and track arms.
  const cellSize = armCount === 4 ? BOARD_VIEWBOX_SIZE / 15 : 468 / cornerFactor;
  const apothem = apothemFactor * cellSize;
  const innerRadius = apothem / cosHalf;
  const outerRadius = outerFactor * cellSize;

  const trackCells: BoardCell[] = [];
  const homeStretchCells: HomeStretchCell[][] = [];
  const yards: HomeYardGeometry[] = [];
  const finishWedges: FinishWedgeGeometry[] = [];
  const centerPolygon: Point2D[] = [];
  const startIndices: number[] = [];
  const homeEntryIndices: number[] = [];
  const safeIndices = new Set<number>();

  // Base angle starts at -PI/2 (12 o'clock) so arm 0 points straight up
  const armAngle = (armIdx: number) => -Math.PI / 2 + (armIdx * 2 * Math.PI) / armCount;

  // Inner K-gon vertices lie along bisectors between arms
  for (let k = 0; k < armCount; k++) {
    const vertexAngle = armAngle(k) - halfAngle;
    centerPolygon.push({
      x: BOARD_CENTER + innerRadius * Math.cos(vertexAngle),
      y: BOARD_CENTER + innerRadius * Math.sin(vertexAngle),
    });
  }

  for (let k = 0; k < armCount; k++) {
    const theta = armAngle(k);
    const armBaseRingIdx = k * cellsPerArm;

    const homeEntryIdx = armBaseRingIdx + stepsPerArm; // Tip middle cell
    const startIdx = armBaseRingIdx + stepsPerArm + 2; // Right lane, 1 cell inward from tip
    // Safe star on incoming Left lane, 2 steps from outer tip (matches classic Ludo's 8-step safe spacing!)
    const starStepOnLeft = Math.max(1, stepsPerArm - 3);
    const safeStarIdx = armBaseRingIdx + starStepOnLeft;

    startIndices.push(startIdx);
    homeEntryIndices.push(homeEntryIdx);
    safeIndices.add(startIdx);
    safeIndices.add(safeStarIdx);

    // 1. Left lane (outward: step 0 .. stepsPerArm-1)
    for (let s = 0; s < stepsPerArm; s++) {
      const idx = armBaseRingIdx + s;
      const r0 = apothem + s * cellSize;
      const r1 = r0 + cellSize;
      const rect = makeCellRect(theta, r0, r1, -1.5 * cellSize, -0.5 * cellSize);
      trackCells.push({
        index: idx,
        armIndex: k,
        center: rect.center,
        corners: rect.corners,
        angleRad: theta,
        isStart: false,
        startArmIndex: null,
        isSafeStar: idx === safeStarIdx,
        isHomeEntry: false,
        homeEntryArmIndex: null,
      });
    }

    // 2. Tip middle cell (index = armBaseRingIdx + stepsPerArm)
    {
      const r0 = apothem + (stepsPerArm - 1) * cellSize;
      const r1 = r0 + cellSize;
      const rect = makeCellRect(theta, r0, r1, -0.5 * cellSize, 0.5 * cellSize);
      trackCells.push({
        index: homeEntryIdx,
        armIndex: k,
        center: rect.center,
        corners: rect.corners,
        angleRad: theta,
        isStart: false,
        startArmIndex: null,
        isSafeStar: false,
        isHomeEntry: true,
        homeEntryArmIndex: k,
      });
    }

    // 3. Right lane (inward: step stepsPerArm-1 .. 0)
    for (let s = stepsPerArm - 1; s >= 0; s--) {
      const idx = armBaseRingIdx + stepsPerArm + 1 + (stepsPerArm - 1 - s);
      const r0 = apothem + s * cellSize;
      const r1 = r0 + cellSize;
      const rect = makeCellRect(theta, r0, r1, 0.5 * cellSize, 1.5 * cellSize);
      const isStart = idx === startIdx;
      trackCells.push({
        index: idx,
        armIndex: k,
        center: rect.center,
        corners: rect.corners,
        angleRad: theta,
        isStart,
        startArmIndex: isStart ? k : null,
        isSafeStar: false,
        isHomeEntry: false,
        homeEntryArmIndex: null,
      });
    }

    // 4. Home Stretch cells (middle lane moving INWARD from outer-1 down to apothem)
    const stretch: HomeStretchCell[] = [];
    for (let h = 0; h < homeLength; h++) {
      // h = 0 is outermost home stretch cell (just inside tip), h = homeLength-1 is innermost near center
      const s = stepsPerArm - 2 - h;
      const r0 = apothem + s * cellSize;
      const r1 = r0 + cellSize;
      const rect = makeCellRect(theta, r0, r1, -0.5 * cellSize, 0.5 * cellSize);
      stretch.push({
        armIndex: k,
        stepIndex: h,
        center: rect.center,
        corners: rect.corners,
        angleRad: theta,
      });
    }
    homeStretchCells.push(stretch);

    // 5. Center Finish Wedge (triangle from center to the base of arm k's inner edge)
    const vLeft = centerPolygon[k];
    const vRight = centerPolygon[(k + 1) % armCount];
    const wedgeCenter = armLocalToWorld(theta, apothem * 0.62, 0);
    const finishSlots: Point2D[] = [
      armLocalToWorld(theta, apothem * 0.72, -cellSize * 0.42),
      armLocalToWorld(theta, apothem * 0.72, cellSize * 0.42),
      armLocalToWorld(theta, apothem * 0.44, -cellSize * 0.24),
      armLocalToWorld(theta, apothem * 0.44, cellSize * 0.24),
    ];
    finishWedges.push({
      armIndex: k,
      polygon: [{ x: BOARD_CENTER, y: BOARD_CENTER }, vLeft, vRight],
      center: wedgeCenter,
      slots: finishSlots,
    });

    // 6. Home Yard placed cleanly in the wedge clockwise next to arm k's start square
    // (between arm k and arm (k+1)%armCount, bisector at theta + halfAngle)
    const bisector = theta + halfAngle;
    const gap = Math.max(7, cellSize * 0.16);
    const innerPadR = apothem + (armCount === 4 ? 1.15 : 2.15) * cellSize;
    const outerPadR = armCount === 4 ? outerRadius * 0.99 : outerRadius * 1.01;

    const halfWidthAt = (r: number) =>
      Math.max(12, r * sinHalf - 1.5 * cellSize * cosHalf - gap);

    if (armCount === 4) {
      // Exact 6x6 square yard flush with both track arms and outer board edge (zero gap!)
      const sMin = apothem;
      const sMax = outerRadius;
      // In quadrant between arm k (theta) and arm k+1 (theta + PI/2)
      const uCos = Math.cos(theta);
      const uSin = Math.sin(theta);
      const vCos = Math.cos(theta + Math.PI / 2);
      const vSin = Math.sin(theta + Math.PI / 2);
      const quadPt = (u: number, v: number): Point2D => ({
        x: BOARD_CENTER + u * uCos + v * vCos,
        y: BOARD_CENTER + u * uSin + v * vSin,
      });
      const polygon = [
        quadPt(sMin, sMin),
        quadPt(sMax, sMin),
        quadPt(sMax, sMax),
        quadPt(sMin, sMax),
      ];
      const mid = (sMin + sMax) / 2;
      const span = (sMax - sMin) * 0.175;
      const slots = [
        quadPt(mid - span, mid - span),
        quadPt(mid + span, mid - span),
        quadPt(mid - span, mid + span),
        quadPt(mid + span, mid + span),
      ];
      yards.push({
        armIndex: k,
        center: quadPt(mid, mid),
        polygon,
        slots,
        labelPos: quadPt(mid, sMin + (sMax - sMin) * 0.12),
        angleRad: bisector,
      });
    } else {
      // Radial trapezoid yard snugly fitted inside the wedge between arm k and arm k+1
      const hwInner = halfWidthAt(innerPadR);
      const hwOuter = halfWidthAt(outerPadR);

      const polygon = [
        armLocalToWorld(bisector, innerPadR, -hwInner),
        armLocalToWorld(bisector, outerPadR, -hwOuter),
        armLocalToWorld(bisector, outerPadR, hwOuter),
        armLocalToWorld(bisector, innerPadR, hwInner),
      ];

      const rInnerRow = innerPadR + (outerPadR - innerPadR) * 0.34;
      const rOuterRow = innerPadR + (outerPadR - innerPadR) * 0.74;
      const tInner = Math.min(cellSize * 0.44, halfWidthAt(rInnerRow) * 0.56);
      const tOuter = Math.min(cellSize * 0.52, halfWidthAt(rOuterRow) * 0.52);

      const slots = [
        armLocalToWorld(bisector, rInnerRow, -tInner),
        armLocalToWorld(bisector, rInnerRow, tInner),
        armLocalToWorld(bisector, rOuterRow, -tOuter),
        armLocalToWorld(bisector, rOuterRow, tOuter),
      ];

      yards.push({
        armIndex: k,
        center: armLocalToWorld(bisector, (innerPadR + outerPadR) / 2, 0),
        polygon,
        slots,
        labelPos: armLocalToWorld(bisector, outerPadR + cellSize * 0.28, 0),
        angleRad: bisector,
      });
    }
  }

  const geometry: BoardGeometry = {
    armCount,
    stepsPerArm,
    cellsPerArm,
    ringLength,
    homeLength,
    cellSize,
    innerRadius,
    outerRadius,
    trackCells,
    homeStretchCells,
    yards,
    finishWedges,
    centerPolygon,
    startIndices,
    homeEntryIndices,
    safeIndices,
  };

  geometryCache.set(armCount, geometry);
  return geometry;
}

export function getTokenPoint(
  geometry: BoardGeometry,
  armIndex: number,
  slotIndex: number,
  zone: 'yard' | 'track' | 'home_stretch' | 'finished',
  ringIndex: number,
  homeIndex: number
): Point2D {
  if (zone === 'yard') {
    const slots = geometry.yards[armIndex].slots;
    return slots[slotIndex % slots.length];
  }
  if (zone === 'track') {
    const wrapped = ((ringIndex % geometry.ringLength) + geometry.ringLength) % geometry.ringLength;
    return geometry.trackCells[wrapped].center;
  }
  if (zone === 'home_stretch') {
    const stretch = geometry.homeStretchCells[armIndex];
    const clamped = Math.max(0, Math.min(stretch.length - 1, homeIndex));
    return stretch[clamped].center;
  }
  const finishSlots = geometry.finishWedges[armIndex].slots;
  return finishSlots[slotIndex % finishSlots.length];
}

/**
 * Build the full square-by-square track path for a captured token to crawl back
 * around the board from the square where it was captured to its Start square,
 * and finally into its Home Yard slot.
 */
export function buildCaptureReturnPath(
  geometry: BoardGeometry,
  armIndex: number,
  slotIndex: number,
  capturedRingIndex: number,
  lapProgress: number,
  stopAtStart = false
): Point2D[] {
  const { ringLength, trackCells, startIndices, yards } = geometry;
  const startIdx = startIndices[armIndex];
  const normalizedStart = ((capturedRingIndex % ringLength) + ringLength) % ringLength;
  const waypoints: Point2D[] = [trackCells[normalizedStart].center];

  // In UNO mode (stopAtStart), a pawn already knocked behind its Start Square (lapProgress < 0)
  // suffers an instant -6 squares backwards punishment instead of advancing forward to Start!
  if (stopAtStart && lapProgress < 0) {
    let cur = normalizedStart;
    for (let step = 0; step < 6; step++) {
      cur = (cur - 1 + ringLength) % ringLength;
      waypoints.push(trackCells[cur].center);
    }
    return waypoints;
  }

  // Walk opposite the direction the token traveled to reach this square:
  // forward progress (> 0) crawls counter-clockwise (-1) back to Start;
  // backward progress (< 0) crawls clockwise (+1) back to Start.
  const stepDelta = lapProgress < 0 ? 1 : -1;
  let cur = normalizedStart;
  let safetySteps = 0;

  while (cur !== startIdx && safetySteps < ringLength) {
    cur = (cur + stepDelta + ringLength) % ringLength;
    waypoints.push(trackCells[cur].center);
    safetySteps += 1;
  }

  // Final crawl step from Start square back inside the Home Yard socket (skipped in UNO mode!)
  if (!stopAtStart) {
    const yardSlots = yards[armIndex].slots;
    waypoints.push(yardSlots[slotIndex % yardSlots.length]);
  }

  return waypoints;
}

