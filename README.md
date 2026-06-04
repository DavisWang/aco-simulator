# Ant Colony Optimization Visualizer

A top-down 2D visualizer of ant colony optimization (ACO). Ants leave a colony, wander to find food, lay pheromone trails, and gradually converge on efficient routes. Pheromone intensity is rendered as greyscale on a white grid (darker = more pheromone).

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL (default http://localhost:5173).

## How to use

1. With the **Colony** tool selected, click the grid to place the colony (only one; re-placing moves it).
2. Switch to the **Food** tool and click/drag to paint food sources.
3. Press **Run**. Use **Erase** to remove food/colony, **Reset** to clear ants + pheromones (keeping the layout), and **Clear Pheromones** to wipe trails only.

Red dots are ants searching for food; green dots are ants carrying food back home.

## How it works

A dual-pheromone model, rendered as a single greyscale layer:

- **Searching** ants follow the *food* pheromone and deposit *home* pheromone (a trail back to the colony).
- On reaching food they switch to **returning**, following the *home* pheromone and depositing *food* pheromone (marking the path to food).
- On reaching the colony they drop the food (score increments) and switch back to searching.

Movement is probabilistic: each step an ant senses pheromone in a forward cone of three directions and picks one via roulette-wheel selection weighted by `(baseline + pheromone)^alpha`. The `baseline` keeps exploration alive even on empty cells, while `alpha` controls how strongly ants follow trails. Pheromone evaporates every step, and deposit strength fades with distance from the last goal, so unused exploratory trails fade while reinforced routes between colony and food persist.

Tunable parameters (sidebar): **Speed** (sim steps per frame), **Ants**, **Evaporation**, and **Trail Following** (`alpha`).

## Stack

- React 18 + TypeScript + Vite
- HTML5 Canvas rendering (pheromone field drawn via `ImageData` at grid resolution, scaled up)
- A framework-agnostic simulation engine in `src/sim/` (kept out of React for performance)

## Project structure

```
src/
  App.tsx                     # layout + shared UI state
  components/
    Sidebar.tsx               # tools, controls, sliders, stats
    SimulationCanvas.tsx      # rAF loop, rendering, mouse placement
  sim/
    Simulation.ts             # grid, pheromone fields, food, ants, step()
    ant.ts                    # per-ant sensing, movement, state machine
    config.ts                 # grid size and default parameters
    types.ts                  # shared types/enums
```
