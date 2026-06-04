import {
  CELL_SIZE,
  DEFAULT_PARAMS,
  FOOD_BRUSH_RADIUS,
  FOOD_PER_CELL,
  GRID_HEIGHT,
  GRID_WIDTH,
  WALL_BRUSH_RADIUS,
} from "./config";
import {
  AntState,
  CellType,
  type Ant,
  type SimParams,
  type SimStats,
} from "./types";
import { stepAnt } from "./ant";

const TRIP_EMA_ALPHA = 0.05;
const SQRT2 = Math.SQRT2;

// 8-connected neighbor offsets with step costs (octile).
const NEIGHBORS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** Binary min-heap keyed by distance, storing cell indices. */
class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size(): number {
    return this.vals.length;
  }

  push(key: number, val: number): void {
    this.keys.push(key);
    this.vals.push(val);
    let i = this.vals.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): [number, number] {
    const key = this.keys[0];
    const val = this.vals[0];
    const lastKey = this.keys.pop()!;
    const lastVal = this.vals.pop()!;
    const n = this.vals.length;
    if (n > 0) {
      this.keys[0] = lastKey;
      this.vals[0] = lastVal;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let s = i;
        if (l < n && this.keys[l] < this.keys[s]) s = l;
        if (r < n && this.keys[r] < this.keys[s]) s = r;
        if (s === i) break;
        this.swap(i, s);
        i = s;
      }
    }
    return [key, val];
  }

  private swap(a: number, b: number): void {
    const tk = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = tk;
    const tv = this.vals[a];
    this.vals[a] = this.vals[b];
    this.vals[b] = tv;
  }
}

export class Simulation {
  readonly width = GRID_WIDTH;
  readonly height = GRID_HEIGHT;
  readonly cellSize = CELL_SIZE;

  homePheromone: Float32Array;
  foodPheromone: Float32Array;
  cellType: Uint8Array;
  foodQty: Float32Array;

  colony: { x: number; y: number } | null = null;
  ants: Ant[] = [];
  params: SimParams = { ...DEFAULT_PARAMS };

  foodCollected = 0;
  tick = 0;
  /** Exponential moving average of round-trip length (steps). 0 until first delivery. */
  avgTripLen = 0;

  // Cache for the obstacle-aware shortest path from colony to nearest food.
  private layoutDirty = true;
  private optimalCache: {
    dist: number;
    foodIndex: number;
    path: { x: number; y: number }[];
  } | null = null;

  // Cached distance-to-colony field (octile, around walls) for returning ants.
  private homeField: Float32Array | null = null;

  constructor() {
    const n = this.width * this.height;
    this.homePheromone = new Float32Array(n);
    this.foodPheromone = new Float32Array(n);
    this.cellType = new Uint8Array(n);
    this.foodQty = new Float32Array(n);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  isWall(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return false;
    return this.cellType[this.index(cx, cy)] === CellType.Wall;
  }

  setParams(p: Partial<SimParams>): void {
    this.params = { ...this.params, ...p };
    if (p.antCount !== undefined) this.syncAntCount();
  }

  placeColony(cx: number, cy: number): void {
    if (!this.inBounds(cx, cy)) return;
    // No-op if the colony is already on this cell.
    if (this.colony && this.colony.x === cx && this.colony.y === cy) return;
    // Clear any previous colony marker.
    if (this.colony) {
      this.cellType[this.index(this.colony.x, this.colony.y)] = CellType.Empty;
    }
    this.colony = { x: cx, y: cy };
    this.cellType[this.index(cx, cy)] = CellType.Colony;
    this.layoutDirty = true;
    this.homeField = null;
    // Respawn ants at the new colony so none are left stranded at the old spot.
    this.ants = [];
    this.syncAntCount();
  }

  placeFood(cx: number, cy: number): void {
    this.brush(cx, cy, FOOD_BRUSH_RADIUS, (x, y) => {
      const i = this.index(x, y);
      if (this.cellType[i] === CellType.Colony) return;
      this.cellType[i] = CellType.Food;
      this.foodQty[i] = FOOD_PER_CELL;
    });
    this.layoutDirty = true;
  }

  placeWall(cx: number, cy: number): void {
    this.brush(cx, cy, WALL_BRUSH_RADIUS, (x, y) => {
      const i = this.index(x, y);
      if (this.cellType[i] === CellType.Colony) return;
      this.cellType[i] = CellType.Wall;
      this.foodQty[i] = 0;
      this.homePheromone[i] = 0;
      this.foodPheromone[i] = 0;
    });
    this.layoutDirty = true;
    this.homeField = null;
  }

  erase(cx: number, cy: number): void {
    this.brush(cx, cy, FOOD_BRUSH_RADIUS, (x, y) => {
      const i = this.index(x, y);
      if (this.cellType[i] === CellType.Colony) {
        this.colony = null;
      }
      this.cellType[i] = CellType.Empty;
      this.foodQty[i] = 0;
    });
    this.layoutDirty = true;
    this.homeField = null;
  }

  private brush(
    cx: number,
    cy: number,
    r: number,
    fn: (x: number, y: number) => void
  ): void {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (this.inBounds(x, y)) fn(x, y);
      }
    }
  }

  clearPheromones(): void {
    this.homePheromone.fill(0);
    this.foodPheromone.fill(0);
  }

  /** Wipes the entire grid: walls, food, colony, pheromones, and ants. */
  clearAll(): void {
    this.cellType.fill(0);
    this.foodQty.fill(0);
    this.homePheromone.fill(0);
    this.foodPheromone.fill(0);
    this.colony = null;
    this.ants = [];
    this.foodCollected = 0;
    this.tick = 0;
    this.avgTripLen = 0;
    this.layoutDirty = true;
    this.optimalCache = null;
    this.homeField = null;
  }

  /** Clears ants + pheromones but keeps colony/food layout. */
  reset(): void {
    this.clearPheromones();
    this.ants = [];
    this.foodCollected = 0;
    this.tick = 0;
    this.avgTripLen = 0;
    this.syncAntCount();
  }

  private spawnAnt(): Ant {
    const c = this.colony!;
    return {
      x: c.x + 0.5,
      y: c.y + 0.5,
      dir: Math.random() * Math.PI * 2,
      state: AntState.Searching,
      stepsSinceGoal: 0,
      searchSteps: 0,
      turnSign: Math.random() < 0.5 ? 1 : -1,
    };
  }

  /** Called by an ant when it delivers food back to the colony. */
  recordDelivery(roundTripSteps: number): void {
    this.foodCollected++;
    this.avgTripLen =
      this.avgTripLen === 0
        ? roundTripSteps
        : this.avgTripLen * (1 - TRIP_EMA_ALPHA) + roundTripSteps * TRIP_EMA_ALPHA;
  }

  /**
   * Computes (and caches) the obstacle-aware shortest walkable route from the
   * colony to the nearest reachable food, via 8-connected Dijkstra with
   * corner-cutting prevention. Recomputed only when the layout changes or the
   * cached nearest-food patch is depleted.
   */
  private ensureOptimal(): void {
    if (!this.colony) {
      this.optimalCache = null;
      return;
    }
    if (!this.layoutDirty && this.optimalCache) {
      const fi = this.optimalCache.foodIndex;
      if (fi < 0) return; // no reachable food; nothing changed
      if (this.cellType[fi] === CellType.Food && this.foodQty[fi] > 0) return;
    }

    const W = this.width;
    const H = this.height;
    const n = W * H;
    const dist = new Float32Array(n).fill(Infinity);
    const visited = new Uint8Array(n);
    const parent = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    const start = this.index(this.colony.x, this.colony.y);
    dist[start] = 0;
    heap.push(0, start);

    let resultDist = 0;
    let resultIndex = -1;
    while (heap.size > 0) {
      const [d, i] = heap.pop();
      if (visited[i]) continue;
      visited[i] = 1;
      if (this.cellType[i] === CellType.Food && this.foodQty[i] > 0) {
        resultDist = d;
        resultIndex = i;
        break;
      }
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy, w] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (this.cellType[j] === CellType.Wall) continue;
        // Prevent diagonal moves from squeezing through a wall corner.
        if (
          dx !== 0 &&
          dy !== 0 &&
          (this.cellType[this.index(x + dx, y)] === CellType.Wall ||
            this.cellType[this.index(x, y + dy)] === CellType.Wall)
        ) {
          continue;
        }
        const nd = d + w;
        if (nd < dist[j]) {
          dist[j] = nd;
          parent[j] = i;
          heap.push(nd, j);
        }
      }
    }

    const path: { x: number; y: number }[] = [];
    if (resultIndex >= 0) {
      let cur = resultIndex;
      while (cur !== -1) {
        const x = cur % W;
        path.push({ x, y: (cur - x) / W });
        if (cur === start) break;
        cur = parent[cur];
      }
      path.reverse();
    }

    this.optimalCache = { dist: resultDist, foodIndex: resultIndex, path };
    this.layoutDirty = false;
  }

  /** Shortest obstacle-aware path length (cell units) to the nearest food, or 0. */
  optimalPathToFood(): number {
    this.ensureOptimal();
    return this.optimalCache ? this.optimalCache.dist : 0;
  }

  /** Cells of the shortest obstacle-aware route from colony to nearest food. */
  optimalPath(): { x: number; y: number }[] {
    this.ensureOptimal();
    return this.optimalCache ? this.optimalCache.path : [];
  }

  /**
   * Distance-to-colony field (octile, routing around walls) over every walkable
   * cell, computed once via Dijkstra from the colony and cached until the walls
   * or colony change. Returning ants descend this to navigate home without
   * line-of-sight, which avoids the looping that pure pheromone-following causes
   * in ring-shaped corridors. Unreachable/wall cells hold Infinity.
   */
  getHomeField(): Float32Array | null {
    if (!this.colony) return null;
    if (this.homeField) return this.homeField;

    const W = this.width;
    const H = this.height;
    const dist = new Float32Array(W * H).fill(Infinity);
    const visited = new Uint8Array(W * H);
    const heap = new MinHeap();
    const start = this.index(this.colony.x, this.colony.y);
    dist[start] = 0;
    heap.push(0, start);

    while (heap.size > 0) {
      const [d, i] = heap.pop();
      if (visited[i]) continue;
      visited[i] = 1;
      const x = i % W;
      const y = (i - x) / W;
      for (const [dx, dy, w] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (this.cellType[j] === CellType.Wall) continue;
        if (
          dx !== 0 &&
          dy !== 0 &&
          (this.cellType[this.index(x + dx, y)] === CellType.Wall ||
            this.cellType[this.index(x, y + dy)] === CellType.Wall)
        ) {
          continue;
        }
        const nd = d + w;
        if (nd < dist[j]) {
          dist[j] = nd;
          heap.push(nd, j);
        }
      }
    }

    this.homeField = dist;
    return dist;
  }

  getStats(): SimStats {
    let returning = 0;
    for (let i = 0; i < this.ants.length; i++) {
      if (this.ants[i].state === AntState.Returning) returning++;
    }
    const ideal = 2 * this.optimalPathToFood();
    const efficiency =
      ideal > 0 && this.avgTripLen > 0
        ? Math.min(1, ideal / this.avgTripLen)
        : 0;
    return {
      foodCollected: this.foodCollected,
      antCount: this.ants.length,
      returning,
      avgTripLen: this.avgTripLen,
      efficiency,
    };
  }

  private syncAntCount(): void {
    if (!this.colony) {
      this.ants = [];
      return;
    }
    const target = this.params.antCount;
    while (this.ants.length < target) this.ants.push(this.spawnAnt());
    if (this.ants.length > target) this.ants.length = target;
  }

  step(): void {
    if (!this.colony) return;

    this.tick++;
    for (let i = 0; i < this.ants.length; i++) {
      stepAnt(this, this.ants[i]);
    }

    // Evaporation.
    const keep = 1 - this.params.evaporation;
    const home = this.homePheromone;
    const food = this.foodPheromone;
    for (let i = 0; i < home.length; i++) {
      home[i] *= keep;
      food[i] *= keep;
    }
  }
}
