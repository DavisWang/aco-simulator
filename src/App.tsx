import { useCallback, useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import SimulationCanvas, {
  type CanvasStats,
  type Tool,
  type ViewMode,
} from "./components/SimulationCanvas";
import { Simulation } from "./sim/Simulation";
import { applyMap } from "./sim/maps";
import { DEFAULT_PARAMS } from "./sim/config";
import type { SimParams } from "./sim/types";

const SERIES_LIMIT = 150;

const EMPTY_STATS: CanvasStats = {
  foodCollected: 0,
  antCount: 0,
  returning: 0,
  avgTripLen: 0,
  efficiency: 0,
  fps: 0,
  tripsPerSec: 0,
};

export default function App() {
  const simRef = useRef<Simulation>();
  if (!simRef.current) simRef.current = new Simulation();
  const sim = simRef.current;

  const resetViewRef = useRef<(() => void) | undefined>(undefined);

  const [tool, setTool] = useState<Tool>("colony");
  const [running, setRunning] = useState(false);
  const [params, setParams] = useState<SimParams>({ ...DEFAULT_PARAMS });
  const [stats, setStats] = useState<CanvasStats>(EMPTY_STATS);
  const [foodSeries, setFoodSeries] = useState<number[]>([]);
  const [hasColony, setHasColony] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("greyscale");
  const [showOptimalPath, setShowOptimalPath] = useState(false);

  const setParam = useCallback(
    <K extends keyof SimParams>(key: K, value: SimParams[K]) => {
      setParams((prev) => {
        const next = { ...prev, [key]: value };
        sim.setParams({ [key]: value });
        return next;
      });
    },
    [sim]
  );

  const toggleRunning = useCallback(() => setRunning((r) => !r), []);

  const onReset = useCallback(() => {
    sim.reset();
    setStats(EMPTY_STATS);
    setFoodSeries([]);
    setRunning(false);
  }, [sim]);

  const onClearPheromones = useCallback(() => {
    sim.clearPheromones();
  }, [sim]);

  const onResetView = useCallback(() => resetViewRef.current?.(), []);

  const onLoadMap = useCallback(
    (id: string) => {
      applyMap(sim, id);
      setStats(EMPTY_STATS);
      setFoodSeries([]);
      setHasColony(sim.colony !== null);
      setRunning(false);
    },
    [sim]
  );

  const onStats = useCallback(
    (s: CanvasStats) => {
      setStats(s);
      setFoodSeries((prev) => {
        const next = prev.concat(s.foodCollected);
        if (next.length > SERIES_LIMIT) next.splice(0, next.length - SERIES_LIMIT);
        return next;
      });
      const colonyExists = sim.colony !== null;
      setHasColony((prev) => (prev !== colonyExists ? colonyExists : prev));
    },
    [sim]
  );

  const canvas = useMemo(
    () => (
      <SimulationCanvas
        sim={sim}
        tool={tool}
        running={running}
        speed={params.speed}
        viewMode={viewMode}
        showOptimalPath={showOptimalPath}
        onStats={onStats}
        resetViewRef={resetViewRef}
      />
    ),
    [sim, tool, running, params.speed, viewMode, showOptimalPath, onStats]
  );

  return (
    <div className="app">
      <div className="canvas-wrap">{canvas}</div>
      <Sidebar
        tool={tool}
        setTool={setTool}
        running={running}
        toggleRunning={toggleRunning}
        onReset={onReset}
        onClearPheromones={onClearPheromones}
        params={params}
        setParam={setParam}
        stats={stats}
        foodSeries={foodSeries}
        hasColony={hasColony}
        viewMode={viewMode}
        setViewMode={setViewMode}
        showOptimalPath={showOptimalPath}
        setShowOptimalPath={setShowOptimalPath}
        onResetView={onResetView}
        onLoadMap={onLoadMap}
      />
    </div>
  );
}
