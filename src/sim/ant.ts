import type { Simulation } from "./Simulation";
import { AntState, CellType, type Ant } from "./types";

const SENSOR_DIST = 3.2;
const SENSOR_ANGLE = 0.55;
const SENSOR_RADIUS = 1;
const SPEED = 1.0;
const STEER_STRENGTH = 0.6;
const PHEROMONE_CAP = 255;
/** How strongly returning ants follow the obstacle-aware route home each step. */
const HOME_FIELD_BIAS = 0.5;
const TURN_STEP = Math.PI / 6;
const MAX_TURN_STEPS = 11;
/** Searching ants disperse away from the nest (like path-integration in real ants). */
const OUTWARD_BIAS = 0.45;
/** Range (cells) over which the outward dispersal applies, fading to zero. */
const OUTWARD_RANGE = 18;

const NEIGHBOR_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
/** Steps an ant will persist toward a goal before giving up and returning home. */
const ANT_PATIENCE = 2600;
/** Per-step chance to flip wall-following direction, to break orbits in spirals. */
const TURN_FLIP_CHANCE = 0.004;

const SENSOR_OFFSETS = [-SENSOR_ANGLE, 0, SENSOR_ANGLE];

/** Whether the cell containing a continuous point is an obstacle. */
function isWall(sim: Simulation, px: number, py: number): boolean {
  return sim.isWall(Math.floor(px), Math.floor(py));
}

/** Sum a pheromone field over a small square around a point. */
function sampleField(
  sim: Simulation,
  field: Float32Array,
  px: number,
  py: number
): number {
  const cx = Math.floor(px);
  const cy = Math.floor(py);
  let sum = 0;
  for (let dy = -SENSOR_RADIUS; dy <= SENSOR_RADIUS; dy++) {
    for (let dx = -SENSOR_RADIUS; dx <= SENSOR_RADIUS; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!sim.inBounds(x, y)) continue;
      if (sim.cellType[sim.index(x, y)] === CellType.Wall) continue;
      sum += field[sim.index(x, y)];
    }
  }
  return sum;
}

export function stepAnt(sim: Simulation, ant: Ant): void {
  const { alpha, baseline, wander, depositMax, depositDecay } = sim.params;
  const followField =
    ant.state === AntState.Searching ? sim.foodPheromone : sim.homePheromone;

  // Sense pheromone in a forward cone of three directions. Directions that look
  // into a wall are heavily penalized so ants steer toward open space.
  const weights = [0, 0, 0];
  let total = 0;
  for (let s = 0; s < 3; s++) {
    const a = ant.dir + SENSOR_OFFSETS[s];
    const sx = ant.x + Math.cos(a) * SENSOR_DIST;
    const sy = ant.y + Math.sin(a) * SENSOR_DIST;
    let w: number;
    if (isWall(sim, sx, sy)) {
      w = 0;
    } else {
      const value = sampleField(sim, followField, sx, sy);
      w = Math.pow(baseline + value, alpha);
    }
    weights[s] = w;
    total += w;
  }

  // Roulette-wheel selection over the three sensor directions (skip if all blocked).
  if (total > 0) {
    let chosen = 1;
    let r = Math.random() * total;
    for (let s = 0; s < 3; s++) {
      r -= weights[s];
      if (r <= 0) {
        chosen = s;
        break;
      }
    }
    ant.dir += SENSOR_OFFSETS[chosen] * STEER_STRENGTH;
  }
  ant.dir += (Math.random() * 2 - 1) * wander;
  if (Math.random() < TURN_FLIP_CHANCE) ant.turnSign = -ant.turnSign;

  // Returning ants navigate home by descending the obstacle-aware distance field
  // from the colony (a stand-in for real ants' path integration that routes
  // around walls). Because the field is loop-free and monotonic toward the nest,
  // they always make progress out of mazes and ring corridors instead of
  // circling a looping pheromone trail.
  if (ant.state === AntState.Returning && sim.colony) {
    const field = sim.getHomeField();
    if (field) {
      const fx = Math.floor(ant.x);
      const fy = Math.floor(ant.y);
      let best = field[sim.index(fx, fy)];
      let bx = 0;
      let by = 0;
      let found = false;
      for (const [dx, dy] of NEIGHBOR_DIRS) {
        const nx = fx + dx;
        const ny = fy + dy;
        if (!sim.inBounds(nx, ny) || sim.isWall(nx, ny)) continue;
        if (dx !== 0 && dy !== 0 && (sim.isWall(fx + dx, fy) || sim.isWall(fx, fy + dy))) {
          continue;
        }
        const v = field[sim.index(nx, ny)];
        if (v < best) {
          best = v;
          bx = dx;
          by = dy;
          found = true;
        }
      }
      if (found) {
        const toHome = Math.atan2(by, bx);
        let diff = toHome - ant.dir;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ant.dir += diff * HOME_FIELD_BIAS;
      }
    }
  }

  // Searching ants disperse outward from the nest, strongly near the nest and
  // fading with distance. This mirrors how real foragers leave with an outward
  // bearing rather than circling, and breaks the self-reinforcing pheromone
  // loops (the "vortex") that otherwise build up around the colony.
  if (ant.state === AntState.Searching && sim.colony) {
    const dx = ant.x - (sim.colony.x + 0.5);
    const dy = ant.y - (sim.colony.y + 0.5);
    const dist = Math.hypot(dx, dy);
    const falloff = 1 - dist / OUTWARD_RANGE;
    if (dist > 0.001 && falloff > 0) {
      const away = Math.atan2(dy, dx);
      let diff = away - ant.dir;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ant.dir += diff * OUTWARD_BIAS * falloff;
    }
  }

  // Move forward, reflecting off the grid boundary.
  let nx = ant.x + Math.cos(ant.dir) * SPEED;
  let ny = ant.y + Math.sin(ant.dir) * SPEED;
  if (nx < 0.5 || nx > sim.width - 0.5) {
    ant.dir = Math.PI - ant.dir;
    nx = Math.min(Math.max(nx, 0.5), sim.width - 0.5);
  }
  if (ny < 0.5 || ny > sim.height - 0.5) {
    ant.dir = -ant.dir;
    ny = Math.min(Math.max(ny, 0.5), sim.height - 0.5);
  }

  // Obstacle avoidance: if the step lands in a wall, turn by the SMALLEST angle
  // (checking both sides, preferring the ant's turn side on a tie) that opens
  // up. Minimal deflection keeps ants progressing along the pheromone-chosen
  // heading and following corridors instead of orbiting a fixed direction.
  // Skip if the ant is already inside a wall (just painted) so it can escape.
  if (!isWall(sim, ant.x, ant.y) && isWall(sim, nx, ny)) {
    let resolved = false;
    for (let k = 1; k <= MAX_TURN_STEPS && !resolved; k++) {
      for (const sign of [ant.turnSign, -ant.turnSign]) {
        const ang = ant.dir + sign * k * TURN_STEP;
        const cx = ant.x + Math.cos(ang) * SPEED;
        const cy = ant.y + Math.sin(ang) * SPEED;
        if (
          cx > 0.5 &&
          cx < sim.width - 0.5 &&
          cy > 0.5 &&
          cy < sim.height - 0.5 &&
          !isWall(sim, cx, cy)
        ) {
          ant.dir = ang;
          nx = cx;
          ny = cy;
          resolved = true;
          break;
        }
      }
    }
    if (!resolved) {
      ant.dir += Math.PI;
      nx = ant.x;
      ny = ant.y;
    }
  }

  ant.x = nx;
  ant.y = ny;

  ant.stepsSinceGoal++;

  // Lay the opposite pheromone, fading with distance from the last goal.
  const depositField =
    ant.state === AntState.Searching ? sim.homePheromone : sim.foodPheromone;
  const amount =
    depositMax * Math.max(0.1, Math.exp(-depositDecay * ant.stepsSinceGoal));
  const ci = sim.index(Math.floor(ant.x), Math.floor(ant.y));
  depositField[ci] = Math.min(depositField[ci] + amount, PHEROMONE_CAP);

  // State transitions.
  const cell = sim.cellType[ci];
  if (ant.state === AntState.Searching) {
    if (cell === CellType.Food && sim.foodQty[ci] > 0) {
      sim.foodQty[ci] -= 1;
      if (sim.foodQty[ci] <= 0) sim.cellType[ci] = CellType.Empty;
      ant.searchSteps = ant.stepsSinceGoal;
      ant.state = AntState.Returning;
      ant.stepsSinceGoal = 0;
      ant.dir += Math.PI;
    }
  } else {
    if (sim.colony) {
      const dx = sim.colony.x + 0.5 - ant.x;
      const dy = sim.colony.y + 0.5 - ant.y;
      if (dx * dx + dy * dy < 2.25) {
        sim.recordDelivery(ant.searchSteps + ant.stepsSinceGoal);
        ant.state = AntState.Searching;
        ant.stepsSinceGoal = 0;
        ant.dir += Math.PI;
      }
    }
  }

  // Escape hatch: an ant that has wandered far too long (e.g. trapped circling a
  // spiral) gives up and respawns at the colony to search anew. This guarantees
  // no ant stays stuck forever and keeps the colony area actively foraging.
  if (ant.stepsSinceGoal > ANT_PATIENCE && sim.colony) {
    ant.x = sim.colony.x + 0.5;
    ant.y = sim.colony.y + 0.5;
    ant.dir = Math.random() * Math.PI * 2;
    ant.state = AntState.Searching;
    ant.stepsSinceGoal = 0;
    ant.turnSign = Math.random() < 0.5 ? 1 : -1;
  }
}
