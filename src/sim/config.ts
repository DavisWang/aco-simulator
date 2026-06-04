import type { SimParams } from "./types";

export const GRID_WIDTH = 150;
export const GRID_HEIGHT = 100;
export const CELL_SIZE = 6;

export const FOOD_BRUSH_RADIUS = 2;
export const WALL_BRUSH_RADIUS = 1;
export const FOOD_PER_CELL = 100;

export const DEFAULT_PARAMS: SimParams = {
  antCount: 250,
  speed: 1,
  evaporation: 0.007,
  alpha: 3,
  baseline: 0.06,
  depositMax: 8,
  depositDecay: 0.0012,
  wander: 0.16,
};

export const SPEED_MIN = 0.25;
export const SPEED_MAX = 8;
export const ANT_MIN = 10;
export const ANT_MAX = 800;
export const EVAP_MIN = 0.002;
export const EVAP_MAX = 0.06;
export const ALPHA_MIN = 1;
export const ALPHA_MAX = 6;
