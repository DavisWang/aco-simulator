import type { CanvasStats, Tool, ViewMode } from "./SimulationCanvas";
import {
  ALPHA_MAX,
  ALPHA_MIN,
  ANT_MAX,
  ANT_MIN,
  EVAP_MAX,
  EVAP_MIN,
  SPEED_MAX,
  SPEED_MIN,
} from "../sim/config";
import type { SimParams } from "../sim/types";
import { MAPS } from "../sim/maps";
import Sparkline from "./Sparkline";

interface Props {
  tool: Tool;
  setTool: (t: Tool) => void;
  running: boolean;
  toggleRunning: () => void;
  onReset: () => void;
  onClearPheromones: () => void;
  params: SimParams;
  setParam: <K extends keyof SimParams>(key: K, value: SimParams[K]) => void;
  stats: CanvasStats;
  foodSeries: number[];
  hasColony: boolean;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  showOptimalPath: boolean;
  setShowOptimalPath: (v: boolean) => void;
  onResetView: () => void;
  onLoadMap: (id: string) => void;
}

const TOOLS: { id: Tool; label: string; color: string }[] = [
  { id: "colony", label: "Colony", color: "#4f9dff" },
  { id: "food", label: "Food", color: "#34d399" },
  { id: "wall", label: "Wall", color: "#475569" },
  { id: "erase", label: "Erase", color: "#ffffff" },
];

export default function Sidebar({
  tool,
  setTool,
  running,
  toggleRunning,
  onReset,
  onClearPheromones,
  params,
  setParam,
  stats,
  foodSeries,
  hasColony,
  viewMode,
  setViewMode,
  showOptimalPath,
  setShowOptimalPath,
  onResetView,
  onLoadMap,
}: Props) {
  return (
    <aside className="sidebar">
      <h1>
        Ant Colony Optimization
        <span>Load a map or place your own colony and food, then run.</span>
      </h1>

      <div className="section">
        <p className="section-title">Maps</p>
        <div className="map-list">
          {MAPS.map((m) => (
            <button
              key={m.id}
              className="map-btn"
              onClick={() => onLoadMap(m.id)}
            >
              <span>{m.name}</span>
              <span className={`badge ${m.difficulty.toLowerCase()}`}>
                {m.difficulty}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <p className="section-title">Tools</p>
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={`tool-btn ${tool === t.id ? "active" : ""}`}
              onClick={() => setTool(t.id)}
            >
              <span className="tool-swatch" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
        <p className="hint">
          {tool === "colony"
            ? "Click the grid to place the colony (only one). Re-placing moves it."
            : tool === "food"
            ? "Click or drag to paint food sources."
            : tool === "wall"
            ? "Click or drag to draw walls that block ants."
            : "Click or drag to erase food, walls, and the colony."}
        </p>
      </div>

      <div className="section">
        <p className="section-title">Simulation</p>
        <div className="btn-row">
          <button
            className={`btn primary ${running ? "running" : ""}`}
            onClick={toggleRunning}
            disabled={!hasColony}
          >
            {running ? "Pause" : "Run"}
          </button>
          <button className="btn ghost-danger" onClick={onReset}>
            Reset
          </button>
        </div>
        <button className="btn" onClick={onClearPheromones}>
          Clear Pheromones
        </button>
        {!hasColony && (
          <p className="hint">Place a colony to start the simulation.</p>
        )}
      </div>

      <div className="section">
        <p className="section-title">View</p>
        <div className="seg">
          <button
            className={`seg-btn ${viewMode === "greyscale" ? "active" : ""}`}
            onClick={() => setViewMode("greyscale")}
          >
            Greyscale
          </button>
          <button
            className={`seg-btn ${viewMode === "color" ? "active" : ""}`}
            onClick={() => setViewMode("color")}
          >
            Color
          </button>
        </div>
        <button className="btn" onClick={onResetView}>
          Reset View
        </button>
        <label className="check-row">
          <input
            type="checkbox"
            checked={showOptimalPath}
            onChange={(e) => setShowOptimalPath(e.target.checked)}
          />
          <span>
            Show optimal path
            <InfoTip text="The shortest obstacle-aware route (A*) from colony to nearest food, drawn as a dashed purple line to compare against the ants' trail." />
          </span>
        </label>
        <p className="hint">
          Scroll to zoom, middle-drag or hold Space and drag to pan.
          {viewMode === "color"
            ? " Blue = trail home, amber = trail to food."
            : ""}
        </p>
      </div>

      <div className="section">
        <p className="section-title">Controls</p>

        <Slider
          label="Speed"
          info="Simulation steps computed per animation frame. Higher runs the simulation faster without changing ant behavior."
          value={params.speed}
          min={SPEED_MIN}
          max={SPEED_MAX}
          step={0.25}
          format={(v) => `${v}x`}
          onChange={(v) => setParam("speed", v)}
        />
        <Slider
          label="Ants"
          value={params.antCount}
          min={ANT_MIN}
          max={ANT_MAX}
          step={10}
          format={(v) => `${v}`}
          onChange={(v) => setParam("antCount", v)}
        />
        <Slider
          label="Evaporation"
          info="Fraction of every cell's pheromone that fades each step. Higher makes trails vanish faster, so ants keep exploring; lower makes trails persist."
          value={params.evaporation}
          min={EVAP_MIN}
          max={EVAP_MAX}
          step={0.001}
          format={(v) => `${(v * 100).toFixed(1)}%`}
          onChange={(v) => setParam("evaporation", v)}
        />
        <Slider
          label="Trail Following"
          info="How strongly ants prefer directions with more pheromone (an exponent). Higher locks ants onto existing trails; lower means more random exploration."
          value={params.alpha}
          min={ALPHA_MIN}
          max={ALPHA_MAX}
          step={0.5}
          format={(v) => `${v}`}
          onChange={(v) => setParam("alpha", v)}
        />
      </div>

      <div className="section">
        <p className="section-title">Stats</p>
        <div className="stats">
          <Stat value={stats.foodCollected} label="Food collected" />
          <Stat value={stats.antCount} label="Active ants" />
          <Stat
            value={stats.returning}
            label="Returning"
            info="Ants currently carrying food back to the colony."
          />
          <Stat
            value={stats.tripsPerSec.toFixed(1)}
            label="Trips / sec"
            info="Food items delivered to the colony per second (smoothed over time)."
          />
          <Stat
            value={stats.avgTripLen > 0 ? Math.round(stats.avgTripLen) : "-"}
            label="Avg trip (steps)"
            info="Average round trip length (colony to food and back) in simulation steps. Lower means ants found more efficient routes."
          />
          <Stat
            value={`${Math.round(stats.efficiency * 100)}%`}
            label="Efficiency"
            info="Shortest obstacle-aware round trip (A* path around walls) divided by the actual average trip. 100% means ants are taking the best achievable path."
          />
          <Stat
            value={Math.round(stats.fps)}
            label="FPS"
            info="Rendering frames per second."
          />
        </div>
        <div className="chart">
          <div className="field-label">
            <span>Food collected over time</span>
          </div>
          <Sparkline data={foodSeries} />
        </div>
      </div>

      <div className="section">
        <p className="hint">
          Red triangles are ants searching for food; green triangles are ants
          carrying food home.
        </p>
      </div>
    </aside>
  );
}

function Stat({
  value,
  label,
  info,
}: {
  value: number | string;
  label: string;
  info?: string;
}) {
  return (
    <div className="stat">
      <div className="v">{value}</div>
      <div className="k">
        {label}
        {info && <InfoTip text={info} />}
      </div>
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
  info?: string;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
  info,
}: SliderProps) {
  return (
    <div className="field">
      <div className="field-label">
        <span>
          {label}
          {info && <InfoTip text={info} />}
        </span>
        <b>{format(value)}</b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="infotip" tabIndex={0} role="note" aria-label={text}>
      i
      <span className="infotip-bubble">{text}</span>
    </span>
  );
}
