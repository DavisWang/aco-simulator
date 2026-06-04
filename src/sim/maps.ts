import type { Simulation } from "./Simulation";
import { CellType } from "./types";
import { FOOD_PER_CELL } from "./config";

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface MapPreset {
  id: string;
  name: string;
  difficulty: Difficulty;
  build: (sim: Simulation) => void;
}

const FOOD_AMOUNT = FOOD_PER_CELL * 4;

function setWall(sim: Simulation, x: number, y: number): void {
  if (sim.inBounds(x, y)) sim.cellType[sim.index(x, y)] = CellType.Wall;
}

/** Solid filled rectangle of walls (inclusive bounds). */
function wallBox(
  sim: Simulation,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) setWall(sim, x, y);
  }
}

function foodDisk(sim: Simulation, cx: number, cy: number, r: number): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && sim.inBounds(x, y)) {
        const i = sim.index(x, y);
        sim.cellType[i] = CellType.Food;
        sim.foodQty[i] = FOOD_AMOUNT;
      }
    }
  }
}

type Side = "L" | "R" | "T" | "B";

/** A square ring wall (2 cells thick) with a doorway on one side. */
function ring(
  sim: Simulation,
  cx: number,
  cy: number,
  h: number,
  gap: Side,
  gapHalf = 2,
  thick = 2
): void {
  for (let y = cy - h; y <= cy + h; y++) {
    for (let x = cx - h; x <= cx + h; x++) {
      const ax = Math.abs(x - cx);
      const ay = Math.abs(y - cy);
      const onBorder = ax >= h - (thick - 1) || ay >= h - (thick - 1);
      if (!onBorder) continue;
      if (gap === "L" && x <= cx - h + (thick - 1) && ay <= gapHalf) continue;
      if (gap === "R" && x >= cx + h - (thick - 1) && ay <= gapHalf) continue;
      if (gap === "T" && y <= cy - h + (thick - 1) && ax <= gapHalf) continue;
      if (gap === "B" && y >= cy + h - (thick - 1) && ax <= gapHalf) continue;
      setWall(sim, x, y);
    }
  }
}

export const MAPS: MapPreset[] = [
  {
    id: "open",
    name: "Open Field",
    difficulty: "Easy",
    build: (sim) => {
      sim.placeColony(22, 50);
      foodDisk(sim, 128, 50, 5);
    },
  },
  {
    id: "doorway",
    name: "Doorway",
    difficulty: "Easy",
    build: (sim) => {
      wallBox(sim, 72, 0, 75, 42);
      wallBox(sim, 72, 58, 75, 99);
      sim.placeColony(20, 50);
      foodDisk(sim, 130, 50, 5);
    },
  },
  {
    id: "rooms",
    name: "Four Rooms",
    difficulty: "Medium",
    build: (sim) => {
      // Vertical divider with doorways at the top (TL-TR) and bottom (BL-BR).
      wallBox(sim, 73, 0, 76, 17);
      wallBox(sim, 73, 27, 76, 73);
      wallBox(sim, 73, 83, 76, 99);
      // Horizontal divider with a single doorway on the right (TR-BR).
      wallBox(sim, 0, 47, 121, 50);
      wallBox(sim, 131, 47, 149, 50);
      // Colony top-left, food bottom-left: the only route winds TL -> TR -> BR -> BL.
      sim.placeColony(22, 22);
      foodDisk(sim, 22, 78, 5);
    },
  },
  {
    id: "serpentine",
    name: "Serpentine",
    difficulty: "Medium",
    build: (sim) => {
      wallBox(sim, 43, 0, 46, 70); // gap along the bottom
      wallBox(sim, 73, 30, 76, 99); // gap along the top
      wallBox(sim, 103, 0, 106, 70); // gap along the bottom
      sim.placeColony(15, 50);
      foodDisk(sim, 140, 50, 4);
    },
  },
  {
    id: "spiral",
    name: "Spiral",
    difficulty: "Hard",
    build: (sim) => {
      ring(sim, 108, 50, 24, "L");
      ring(sim, 108, 50, 17, "R");
      ring(sim, 108, 50, 10, "B");
      foodDisk(sim, 108, 50, 2);
      sim.placeColony(20, 50);
    },
  },
];

/** Clears the grid and builds the named preset. Returns whether it was found. */
export function applyMap(sim: Simulation, id: string): boolean {
  const preset = MAPS.find((m) => m.id === id);
  if (!preset) return false;
  sim.clearAll();
  preset.build(sim);
  return true;
}
