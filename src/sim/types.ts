export enum CellType {
  Empty = 0,
  Colony = 1,
  Food = 2,
  Wall = 3,
}

export enum AntState {
  Searching = 0,
  Returning = 1,
}

export interface Ant {
  x: number;
  y: number;
  dir: number;
  state: AntState;
  /** Steps since the ant last touched its goal (home/food). Drives deposit decay. */
  stepsSinceGoal: number;
  /** Steps the ant spent searching before its current load (captured at pickup). */
  searchSteps: number;
  /** Preferred turn direction (+1/-1) when wall-following, for consistent detours. */
  turnSign: number;
}

export interface SimStats {
  foodCollected: number;
  antCount: number;
  /** Ants currently carrying food back to the colony. */
  returning: number;
  /** Exponential moving average of round-trip length, in steps. */
  avgTripLen: number;
  /** Optimal round-trip / actual average round-trip, clamped to 0..1. */
  efficiency: number;
}

export interface SimParams {
  /** Number of live ants. */
  antCount: number;
  /** Simulation steps per animation frame (speed multiplier). */
  speed: number;
  /** Fraction of pheromone removed each step. */
  evaporation: number;
  /** Exponent controlling how strongly ants follow pheromone trails. */
  alpha: number;
  /** Baseline weight so empty cells still get explored. */
  baseline: number;
  /** Maximum pheromone deposited (fresh from goal). */
  depositMax: number;
  /** How fast deposit strength decays with distance from goal. */
  depositDecay: number;
  /** Random heading jitter per step (radians scale). */
  wander: number;
}
