import { getBuildingStats } from "./creatures.js";
import type { Building, Waypoint } from "./types.js";

export type ObstacleRect = { x: number; y: number; w: number; h: number };
export type FindPathFailureMode = "fallback_direct" | "empty_on_failure";
export type FindPathStatus = "ok" | "fallback_no_path" | "start_enclosed";
export type FindPathResult = {
  waypoints: Waypoint[];
  status: FindPathStatus;
  startOpenNeighbors: number;
  goalOpenNeighbors: number;
};

const CELL_SIZE = 20;

// Grid-based A* pathfinding that avoids buildings.
// Physical sliding handles exact collision — the path just needs to route around obstacles.

function buildGrid(
  minX: number, maxX: number, minY: number, maxY: number,
  buildings: Building[],
  extraObstacles: ObstacleRect[],
  unitRadius: number,
): { cols: number; rows: number; blocked: boolean[] } {
  const cols = Math.ceil((maxX - minX) / CELL_SIZE);
  const rows = Math.ceil((maxY - minY) / CELL_SIZE);
  const blocked = new Array<boolean>(cols * rows).fill(false);

  // Block building rects
  for (const b of buildings) {
    const stats = getBuildingStats(b.buildingId);
    const bx1 = b.x - stats.hitboxWidth / 2;
    const by1 = b.y - stats.hitboxHeight / 2;
    const bx2 = b.x + stats.hitboxWidth / 2;
    const by2 = b.y + stats.hitboxHeight / 2;

    const cMinX = Math.max(0, Math.floor((bx1 - minX) / CELL_SIZE));
    const cMaxX = Math.min(cols - 1, Math.floor((bx2 - minX) / CELL_SIZE));
    const cMinY = Math.max(0, Math.floor((by1 - minY) / CELL_SIZE));
    const cMaxY = Math.min(rows - 1, Math.floor((by2 - minY) / CELL_SIZE));

    for (let cy = cMinY; cy <= cMaxY; cy++) {
      for (let cx = cMinX; cx <= cMaxX; cx++) {
        blocked[cy * cols + cx] = true;
      }
    }
  }

  // Block extra obstacle rects (castles, etc.)
  for (const ob of extraObstacles) {
    const cMinX = Math.max(0, Math.floor((ob.x - minX) / CELL_SIZE));
    const cMaxX = Math.min(cols - 1, Math.floor((ob.x + ob.w - minX) / CELL_SIZE));
    const cMinY = Math.max(0, Math.floor((ob.y - minY) / CELL_SIZE));
    const cMaxY = Math.min(rows - 1, Math.floor((ob.y + ob.h - minY) / CELL_SIZE));
    for (let cy = cMinY; cy <= cMaxY; cy++) {
      for (let cx = cMinX; cx <= cMaxX; cx++) {
        blocked[cy * cols + cx] = true;
      }
    }
  }

  return { cols, rows, blocked };
}

function worldToCell(wx: number, wy: number, minX: number, minY: number, cols: number, rows: number): { cx: number; cy: number } {
  return {
    cx: Math.min(cols - 1, Math.max(0, Math.floor((wx - minX) / CELL_SIZE))),
    cy: Math.min(rows - 1, Math.max(0, Math.floor((wy - minY) / CELL_SIZE))),
  };
}

function cellToWorld(cx: number, cy: number, minX: number, minY: number): { x: number; y: number } {
  return {
    x: minX + (cx + 0.5) * CELL_SIZE,
    y: minY + (cy + 0.5) * CELL_SIZE,
  };
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  // Octile distance (diagonal movement allowed)
  return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
}

const NEIGHBORS = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0],           [1, 0],
  [-1, 1],  [0, 1],  [1, 1],
];

function countOpenNeighbors(cx: number, cy: number, cols: number, rows: number, blocked: boolean[]): number {
  let openCount = 0;
  for (const [dx, dy] of NEIGHBORS) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
    if (!blocked[ny * cols + nx]) openCount += 1;
  }
  return openCount;
}

function astar(
  startCx: number, startCy: number,
  goalCx: number, goalCy: number,
  cols: number, rows: number,
  blocked: boolean[],
): number[] | null {
  const total = cols * rows;
  const gScore = new Float64Array(total).fill(Infinity);
  const fScore = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);

  const startIdx = startCy * cols + startCx;
  const goalIdx = goalCy * cols + goalCx;
  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(startCx, startCy, goalCx, goalCy);

  // Simple open set using sorted array (grid is small)
  const open = new Set<number>();
  open.add(startIdx);

  while (open.size > 0) {
    // Pick node with lowest fScore
    let current = -1;
    let bestF = Infinity;
    for (const idx of open) {
      if (fScore[idx] < bestF) {
        bestF = fScore[idx];
        current = idx;
      }
    }
    if (current === -1) return null;
    if (current === goalIdx) break;

    open.delete(current);
    const curX = current % cols;
    const curY = (current - curX) / cols;

    for (const [dx, dy] of NEIGHBORS) {
      const nx = curX + dx;
      const ny = curY + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;

      const nIdx = ny * cols + nx;
      if (blocked[nIdx]) continue;

      // Prevent diagonal movement through blocked corners
      if (dx !== 0 && dy !== 0) {
        if (blocked[curY * cols + (curX + dx)] || blocked[(curY + dy) * cols + curX]) continue;
      }

      const moveCost = dx !== 0 && dy !== 0 ? 1.414 : 1;
      const tentativeG = gScore[current] + moveCost;

      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + heuristic(nx, ny, goalCx, goalCy);
        open.add(nIdx);
      }
    }
  }

  if (cameFrom[goalIdx] === -1 && startIdx !== goalIdx) return null;

  // Reconstruct path
  const path: number[] = [];
  let cur = goalIdx;
  while (cur !== -1) {
    path.push(cur);
    cur = cameFrom[cur];
  }
  path.reverse();
  return path;
}

// Simplify path by removing intermediate waypoints that are on a straight line
function simplifyPath(waypoints: Waypoint[]): Waypoint[] {
  if (waypoints.length <= 2) return waypoints;
  const result: Waypoint[] = [waypoints[0]];
  for (let i = 1; i < waypoints.length - 1; i++) {
    const prev = result[result.length - 1];
    const next = waypoints[i + 1];
    const cur = waypoints[i];
    // Keep waypoint if direction changes
    const dx1 = cur.x - prev.x;
    const dy1 = cur.y - prev.y;
    const dx2 = next.x - cur.x;
    const dy2 = next.y - cur.y;
    if (Math.abs(dx1 * dy2 - dy1 * dx2) > 0.001) {
      result.push(cur);
    }
  }
  result.push(waypoints[waypoints.length - 1]);
  return result;
}

export function findPathDetailed(
  startX: number, startY: number,
  goalX: number, goalY: number,
  buildings: Building[],
  extraObstacles: ObstacleRect[],
  unitRadius: number,
  minX: number, maxX: number, minY: number, maxY: number,
  options?: {
    failureMode?: FindPathFailureMode;
    logFailure?: boolean;
  },
): FindPathResult {
  const failureMode = options?.failureMode ?? "fallback_direct";
  const logFailure = options?.logFailure ?? true;
  const { cols, rows, blocked } = buildGrid(minX, maxX, minY, maxY, buildings, extraObstacles, unitRadius);

  const start = worldToCell(startX, startY, minX, minY, cols, rows);
  const goal = worldToCell(goalX, goalY, minX, minY, cols, rows);

  // Unblock the spawn building's cells so the unit can exit
  // Find the building at the start position and unblock all its cells
  for (const b of buildings) {
    const stats = getBuildingStats(b.buildingId);
    const bx1 = b.x - stats.hitboxWidth / 2;
    const by1 = b.y - stats.hitboxHeight / 2;
    const bx2 = b.x + stats.hitboxWidth / 2;
    const by2 = b.y + stats.hitboxHeight / 2;

    // Check if start position is inside this building
    if (startX >= bx1 && startX <= bx2 && startY >= by1 && startY <= by2) {
      const cMinX = Math.max(0, Math.floor((bx1 - minX) / CELL_SIZE));
      const cMaxX = Math.min(cols - 1, Math.floor((bx2 - minX) / CELL_SIZE));
      const cMinY = Math.max(0, Math.floor((by1 - minY) / CELL_SIZE));
      const cMaxY = Math.min(rows - 1, Math.floor((by2 - minY) / CELL_SIZE));
      for (let cy = cMinY; cy <= cMaxY; cy++) {
        for (let cx = cMinX; cx <= cMaxX; cx++) {
          blocked[cy * cols + cx] = false;
        }
      }
    }
  }

  // Unblock start and goal cells so the path can begin and end
  blocked[start.cy * cols + start.cx] = false;
  blocked[goal.cy * cols + goal.cx] = false;

  const path = astar(start.cx, start.cy, goal.cx, goal.cy, cols, rows, blocked);
  const startOpenNeighbors = countOpenNeighbors(start.cx, start.cy, cols, rows, blocked);
  const goalOpenNeighbors = countOpenNeighbors(goal.cx, goal.cy, cols, rows, blocked);

  if (!path) {
    const status: FindPathStatus = startOpenNeighbors === 0 ? "start_enclosed" : "fallback_no_path";
    if (logFailure) {
      const blockedCount = blocked.reduce((count, cell) => count + (cell ? 1 : 0), 0);
      const prefix = failureMode === "fallback_direct" ? "PATHFIND-FALLBACK" : "PATHFIND-FAIL";
      console.log(
        `[${prefix}] start=(${startX.toFixed(1)},${startY.toFixed(1)}) cell=(${start.cx},${start.cy}) ` +
        `goal=(${goalX.toFixed(1)},${goalY.toFixed(1)}) cell=(${goal.cx},${goal.cy}) ` +
        `blocked=${blockedCount}/${cols * rows} startOpen=${startOpenNeighbors} goalOpen=${goalOpenNeighbors} ` +
        `buildings=${buildings.length} extraObstacles=${extraObstacles.length} unitRadius=${unitRadius} status=${status}`,
      );
    }

    return {
      waypoints: failureMode === "fallback_direct" ? [{ x: goalX, y: goalY }] : [],
      status,
      startOpenNeighbors,
      goalOpenNeighbors,
    };
  }

  // Find the spawn building rect to skip waypoints inside it
  let spawnRect: { x1: number; y1: number; x2: number; y2: number } | null = null;
  for (const b of buildings) {
    const stats = getBuildingStats(b.buildingId);
    const bx1 = b.x - stats.hitboxWidth / 2;
    const by1 = b.y - stats.hitboxHeight / 2;
    const bx2 = b.x + stats.hitboxWidth / 2;
    const by2 = b.y + stats.hitboxHeight / 2;
    if (startX >= bx1 && startX <= bx2 && startY >= by1 && startY <= by2) {
      spawnRect = { x1: bx1, y1: by1, x2: bx2, y2: by2 };
      break;
    }
  }

  // Convert cell indices to world coordinates, skip the start cell
  const rawWaypoints: Waypoint[] = [];
  for (let i = 1; i < path.length; i++) {
    const idx = path[i];
    const cx = idx % cols;
    const cy = (idx - cx) / cols;
    rawWaypoints.push(cellToWorld(cx, cy, minX, minY));
  }

  // Skip waypoints that are inside the spawn building
  const waypoints: Waypoint[] = [];
  let exitedSpawn = !spawnRect;
  for (const wp of rawWaypoints) {
    if (!exitedSpawn && spawnRect) {
      if (wp.x >= spawnRect.x1 && wp.x <= spawnRect.x2 && wp.y >= spawnRect.y1 && wp.y <= spawnRect.y2) {
        continue; // skip this waypoint, still inside spawn building
      }
      exitedSpawn = true;
    }
    waypoints.push(wp);
  }

  // Replace last waypoint with exact goal position
  if (waypoints.length > 0) {
    waypoints[waypoints.length - 1] = { x: goalX, y: goalY };
  } else {
    waypoints.push({ x: goalX, y: goalY });
  }

  return {
    waypoints: simplifyPath(waypoints),
    status: "ok",
    startOpenNeighbors,
    goalOpenNeighbors,
  };
}

export function findPath(
  startX: number, startY: number,
  goalX: number, goalY: number,
  buildings: Building[],
  extraObstacles: ObstacleRect[],
  unitRadius: number,
  minX: number, maxX: number, minY: number, maxY: number,
): Waypoint[] {
  return findPathDetailed(
    startX, startY,
    goalX, goalY,
    buildings,
    extraObstacles,
    unitRadius,
    minX, maxX, minY, maxY,
    { failureMode: "fallback_direct" },
  ).waypoints;
}
