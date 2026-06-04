import { useEffect, useRef, type MutableRefObject } from "react";
import type { Simulation } from "../sim/Simulation";
import { AntState, CellType, type SimStats } from "../sim/types";

export type Tool = "colony" | "food" | "wall" | "erase";
export type ViewMode = "greyscale" | "color";

export interface CanvasStats extends SimStats {
  fps: number;
  tripsPerSec: number;
}

interface Props {
  sim: Simulation;
  tool: Tool;
  running: boolean;
  speed: number;
  viewMode: ViewMode;
  showOptimalPath: boolean;
  onStats: (stats: CanvasStats) => void;
  resetViewRef: MutableRefObject<(() => void) | undefined>;
}

const PHEROMONE_NORM = 80;
const MAX_STEPS_PER_FRAME = 40;
const BACKDROP = "#0a0c10";
const MAX_DPR = 2;

export default function SimulationCanvas({
  sim,
  tool,
  running,
  speed,
  viewMode,
  showOptimalPath,
  onStats,
  resetViewRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Latest props kept in refs so the rAF loop never needs to restart.
  const toolRef = useRef(tool);
  const runningRef = useRef(running);
  const speedRef = useRef(speed);
  const viewModeRef = useRef(viewMode);
  const showPathRef = useRef(showOptimalPath);
  const onStatsRef = useRef(onStats);
  toolRef.current = tool;
  runningRef.current = running;
  speedRef.current = speed;
  viewModeRef.current = viewMode;
  showPathRef.current = showOptimalPath;
  onStatsRef.current = onStats;

  // Camera (in CSS pixels relative to the canvas top-left).
  const view = useRef({ scale: 1, tx: 0, ty: 0, fitScale: 1 });
  const dprRef = useRef(1);
  const spaceHeld = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const { width: gw, height: gh, cellSize } = sim;
    const worldW = gw * cellSize;
    const worldH = gh * cellSize;

    // Offscreen grid-resolution buffer for the pheromone layer.
    const grid = document.createElement("canvas");
    grid.width = gw;
    grid.height = gh;
    const gctx = grid.getContext("2d")!;
    const image = gctx.createImageData(gw, gh);
    const data = image.data;

    const fitView = () => {
      const cw = canvas.clientWidth || 1;
      const ch = canvas.clientHeight || 1;
      const scale = Math.min(cw / worldW, ch / worldH) * 0.98;
      view.current.fitScale = scale;
      view.current.scale = scale;
      view.current.tx = (cw - worldW * scale) / 2;
      view.current.ty = (ch - worldH * scale) / 2;
    };
    resetViewRef.current = fitView;

    let sized = false;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      dprRef.current = dpr;
      const cw = canvas.clientWidth || 1;
      const ch = canvas.clientHeight || 1;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      if (!sized) {
        fitView();
        sized = true;
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let raf = 0;
    let accumulator = 0;
    let lastStats = 0;
    let prevFood = 0;
    let tripsPerSec = 0;
    let fps = 60;
    let lastFrameT = performance.now();

    const drawScene = () => {
      const home = sim.homePheromone;
      const food = sim.foodPheromone;
      const cellType = sim.cellType;
      const foodQty = sim.foodQty;
      const color = viewModeRef.current === "color";

      for (let i = 0; i < home.length; i++) {
        const o = i * 4;
        if (cellType[i] === CellType.Wall) {
          data[o] = 71;
          data[o + 1] = 85;
          data[o + 2] = 105;
          data[o + 3] = 255;
        } else if (cellType[i] === CellType.Food) {
          const q = Math.min(1, foodQty[i] / 100);
          data[o] = 40;
          data[o + 1] = 160 + Math.floor(60 * q);
          data[o + 2] = 70;
          data[o + 3] = 255;
        } else if (color) {
          const hn = Math.min(1, home[i] / PHEROMONE_NORM);
          const fn = Math.min(1, food[i] / PHEROMONE_NORM);
          let r = 255 * (1 - hn) + 60 * hn;
          let g = 255 * (1 - hn) + 120 * hn;
          let b = 255 * (1 - hn) + 255 * hn;
          r = r * (1 - fn) + 255 * fn;
          g = g * (1 - fn) + 170 * fn;
          b = b * (1 - fn) + 40 * fn;
          data[o] = r;
          data[o + 1] = g;
          data[o + 2] = b;
          data[o + 3] = 255;
        } else {
          const intensity = Math.min(1, (home[i] + food[i]) / PHEROMONE_NORM);
          const g = Math.round(255 * (1 - intensity));
          data[o] = g;
          data[o + 1] = g;
          data[o + 2] = g;
          data[o + 3] = 255;
        }
      }
      gctx.putImageData(image, 0, 0);

      const dpr = dprRef.current;
      const v = view.current;

      // Clear backdrop in device space.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // World-space camera transform.
      const s = dpr * v.scale;
      ctx.setTransform(s, 0, 0, s, dpr * v.tx, dpr * v.ty);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(grid, 0, 0, worldW, worldH);

      // Optimal (A*) path overlay: a discreet dashed line, screen-constant width.
      if (showPathRef.current) {
        const path = sim.optimalPath();
        if (path.length > 1) {
          const cs0 = cellSize;
          ctx.save();
          ctx.lineWidth = 2 / v.scale;
          ctx.setLineDash([7 / v.scale, 6 / v.scale]);
          ctx.strokeStyle = "rgba(168, 85, 247, 0.85)";
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          ctx.beginPath();
          for (let k = 0; k < path.length; k++) {
            const px = (path[k].x + 0.5) * cs0;
            const py = (path[k].y + 0.5) * cs0;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }
      }

      // Ants as direction-oriented triangles, batched by state.
      const cs = cellSize;
      const size = Math.max(1.4, cs * 0.95);
      const back = 2.5;
      for (let pass = 0; pass < 2; pass++) {
        const state = pass === 0 ? AntState.Searching : AntState.Returning;
        ctx.fillStyle = pass === 0 ? "#c0392b" : "#34d399";
        ctx.beginPath();
        for (let a = 0; a < sim.ants.length; a++) {
          const ant = sim.ants[a];
          if (ant.state !== state) continue;
          const wx = ant.x * cs;
          const wy = ant.y * cs;
          const d = ant.dir;
          ctx.moveTo(wx + Math.cos(d) * size, wy + Math.sin(d) * size);
          ctx.lineTo(
            wx + Math.cos(d + back) * size * 0.7,
            wy + Math.sin(d + back) * size * 0.7
          );
          ctx.lineTo(
            wx + Math.cos(d - back) * size * 0.7,
            wy + Math.sin(d - back) * size * 0.7
          );
          ctx.closePath();
        }
        ctx.fill();
      }

      // Colony marker.
      if (sim.colony) {
        const cx = (sim.colony.x + 0.5) * cs;
        const cy = (sim.colony.y + 0.5) * cs;
        ctx.beginPath();
        ctx.arc(cx, cy, cs * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = "#4f9dff";
        ctx.fill();
        ctx.lineWidth = 2 / v.scale;
        ctx.strokeStyle = "#0a3a6b";
        ctx.stroke();
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    };

    const frame = (t: number) => {
      const dtFrame = t - lastFrameT;
      lastFrameT = t;
      if (dtFrame > 0) fps = fps * 0.9 + (1000 / dtFrame) * 0.1;

      if (runningRef.current && sim.colony) {
        accumulator += speedRef.current;
        let steps = Math.floor(accumulator);
        accumulator -= steps;
        if (steps > MAX_STEPS_PER_FRAME) steps = MAX_STEPS_PER_FRAME;
        for (let st = 0; st < steps; st++) sim.step();
      }

      drawScene();

      if (t - lastStats > 200) {
        const dt = (t - lastStats) / 1000;
        const instTps = dt > 0 ? (sim.foodCollected - prevFood) / dt : 0;
        tripsPerSec = tripsPerSec * 0.7 + instTps * 0.3;
        prevFood = sim.foodCollected;
        lastStats = t;
        onStatsRef.current({
          ...sim.getStats(),
          fps,
          tripsPerSec: Math.max(0, tripsPerSec),
        });
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      resetViewRef.current = undefined;
    };
  }, [sim, resetViewRef]);

  // Wheel zoom (native, non-passive so we can preventDefault).
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const cssX = e.clientX - rect.left;
      const cssY = e.clientY - rect.top;
      const v = view.current;
      const worldX = (cssX - v.tx) / v.scale;
      const worldY = (cssY - v.ty) / v.scale;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const ns = Math.min(16, Math.max(v.fitScale * 0.5, v.scale * factor));
      v.tx = cssX - worldX * ns;
      v.ty = cssY - worldY * ns;
      v.scale = ns;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  // Track Space for pan-drag.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const painting = useRef(false);
  const panning = useRef(false);
  const lastPan = useRef({ x: 0, y: 0 });

  const cellFromEvent = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const v = view.current;
    const worldX = (e.clientX - rect.left - v.tx) / v.scale;
    const worldY = (e.clientY - rect.top - v.ty) / v.scale;
    return {
      x: Math.floor(worldX / sim.cellSize),
      y: Math.floor(worldY / sim.cellSize),
    };
  };

  const apply = (e: React.PointerEvent) => {
    const { x, y } = cellFromEvent(e);
    if (!sim.inBounds(x, y)) return;
    const t = toolRef.current;
    if (t === "colony") sim.placeColony(x, y);
    else if (t === "food") sim.placeFood(x, y);
    else if (t === "wall") sim.placeWall(x, y);
    else sim.erase(x, y);
  };

  return (
    <canvas
      ref={canvasRef}
      className="sim-canvas"
      onPointerDown={(e) => {
        canvasRef.current!.setPointerCapture(e.pointerId);
        if (e.button === 1 || spaceHeld.current) {
          panning.current = true;
          lastPan.current = { x: e.clientX, y: e.clientY };
        } else if (e.button === 0) {
          painting.current = true;
          apply(e);
        }
      }}
      onPointerMove={(e) => {
        if (panning.current) {
          const v = view.current;
          v.tx += e.clientX - lastPan.current.x;
          v.ty += e.clientY - lastPan.current.y;
          lastPan.current = { x: e.clientX, y: e.clientY };
        } else if (painting.current) {
          apply(e);
        }
      }}
      onPointerUp={(e) => {
        painting.current = false;
        panning.current = false;
        canvasRef.current!.releasePointerCapture(e.pointerId);
      }}
    />
  );
}
