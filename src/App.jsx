import { useState, useMemo } from "react";
import {
  ComposedChart, Line, Area, AreaChart, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine
} from "recharts";
import { Zap, Gauge, BatteryFull, Route } from "lucide-react";

// ---------- Physics constants ----------
const RHO_AIR = 1.225; // kg/m^3
const G = 9.81; // m/s^2

// ---------- Drive cycle waypoints: [time_s, speed_kmh] ----------
const FSAE_WAYPOINTS = [
  [0, 0], [4, 78], [7, 78], [9.5, 32], [12.5, 32],
  [17.5, 92], [20.5, 92], [23, 26], [26, 26],
  [30.5, 72], [33.5, 72], [36.5, 0], [38.5, 0],
];

const SOLAR_WAYPOINTS = [
  [0, 0], [25, 88], [90, 88], [105, 78], [140, 78],
  [155, 96], [190, 96], [205, 88], [300, 88],
];

const PRESETS = {
  fsae: {
    label: "FSAE Autocross Lap",
    waypoints: FSAE_WAYPOINTS,
    dt: 0.25,
    defaults: { mass: 260, cda: 1.0, crr: 0.015, capacity: 6, drivetrainEff: 92, motorEff: 90, regenEff: 50 },
    ranges: {
      mass: [180, 320, 5], cda: [0.5, 1.6, 0.05], crr: [0.005, 0.03, 0.001],
      capacity: [3, 8, 0.5], drivetrainEff: [80, 98, 1], motorEff: [80, 98, 1], regenEff: [0, 80, 5],
    },
    unit: "lap",
  },
  solar: {
    label: "Solar Challenge Cruise",
    waypoints: SOLAR_WAYPOINTS,
    dt: 1,
    defaults: { mass: 250, cda: 0.12, crr: 0.006, capacity: 5, drivetrainEff: 95, motorEff: 96, regenEff: 20 },
    ranges: {
      mass: [150, 350, 5], cda: [0.05, 0.5, 0.01], crr: [0.002, 0.02, 0.001],
      capacity: [2, 10, 0.5], drivetrainEff: [85, 99, 1], motorEff: [85, 99, 1], regenEff: [0, 60, 5],
    },
    unit: "cruise segment",
  },
};

// Interpolate speed (km/h) at time t from waypoints
function speedAt(waypoints, t) {
  for (let i = 0; i < waypoints.length - 1; i++) {
    const [t0, v0] = waypoints[i];
    const [t1, v1] = waypoints[i + 1];
    if (t >= t0 && t <= t1) {
      const frac = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return v0 + frac * (v1 - v0);
    }
  }
  return waypoints[waypoints.length - 1][1];
}

// Core simulation over one cycle
function simulateCycle(preset, params) {
  const { waypoints, dt } = preset;
  const cycleDuration = waypoints[waypoints.length - 1][0];
  const steps = Math.floor(cycleDuration / dt);
  const massKg = params.mass;
  const cda = params.cda;
  const crr = params.crr;
  const etaDrive = params.drivetrainEff / 100;
  const etaMotor = params.motorEff / 100;
  const etaRegen = params.regenEff / 100;

  const series = [];
  let energyWs = 0; // watt-seconds (joules) drawn from battery
  let distanceM = 0;
  let peakPowerKw = 0;
  let regenRecoveredWs = 0;
  let brakingWouldBeLossWs = 0;

  for (let i = 0; i <= steps; i++) {
    const t = i * dt;
    const vKmh = speedAt(waypoints, t);
    const vNextKmh = speedAt(waypoints, Math.min(t + dt, cycleDuration));
    const v = vKmh / 3.6;
    const vNext = vNextKmh / 3.6;
    const accel = (vNext - v) / dt;

    const fAccel = massKg * accel;
    const fRoll = crr * massKg * G;
    const fAero = 0.5 * RHO_AIR * cda * v * v;
    const fTotal = fAccel + fRoll + fAero;
    const pWheel = fTotal * v; // watts

    let pBatt;
    if (pWheel >= 0) {
      pBatt = pWheel / (etaDrive * etaMotor);
    } else {
      // braking: only recover a fraction, rest is friction-braked away
      pBatt = pWheel * etaRegen; // negative (returning energy)
      regenRecoveredWs += Math.abs(pBatt) * dt;
      brakingWouldBeLossWs += Math.abs(pWheel) * dt;
    }

    energyWs += pBatt * dt;
    distanceM += v * dt;
    if (Math.abs(pBatt) / 1000 > peakPowerKw) peakPowerKw = Math.abs(pBatt) / 1000;

    series.push({
      t: Number(t.toFixed(2)),
      speedKmh: Number(vKmh.toFixed(1)),
      powerKw: Number((pBatt / 1000).toFixed(2)),
    });
  }

  return {
    series,
    energyWh: energyWs / 3600,
    distanceKm: distanceM / 1000,
    peakPowerKw,
    regenRecoveredWh: regenRecoveredWs / 3600,
    brakingWouldBeLossWh: brakingWouldBeLossWs / 3600,
  };
}

function computeStats(preset, params) {
  const cycle = simulateCycle(preset, params);
  const capacityWh = params.capacity * 1000;
  const cyclesToEmpty = cycle.energyWh > 0 ? capacityWh / cycle.energyWh : Infinity;
  const rangeKm = cyclesToEmpty * cycle.distanceKm;
  const whPerKm = cycle.distanceKm > 0 ? cycle.energyWh / cycle.distanceKm : 0;

  const socPoints = [];
  const nPoints = 24;
  for (let i = 0; i <= nPoints; i++) {
    const frac = i / nPoints;
    const dist = rangeKm * frac;
    const soc = Math.max(0, 100 - frac * 100);
    socPoints.push({ distanceKm: Number(dist.toFixed(1)), soc: Number(soc.toFixed(1)) });
  }

  const regenPct = cycle.brakingWouldBeLossWh > 0
    ? (cycle.regenRecoveredWh / cycle.brakingWouldBeLossWh) * 100
    : 0;

  return { cycle, rangeKm, whPerKm, socPoints, cyclesToEmpty, regenPct };
}

const SENSITIVITY_PARAMS = [
  { key: "mass", label: "Mass", improveDir: -1, step: 0.15 },
  { key: "cda", label: "Aero Drag (CdA)", improveDir: -1, step: 0.15 },
  { key: "crr", label: "Rolling Resistance", improveDir: -1, step: 0.15 },
  { key: "capacity", label: "Battery Capacity", improveDir: 1, step: 0.15 },
  { key: "drivetrainEff", label: "Drivetrain Efficiency", improveDir: 1, step: 0.1 },
];

function computeSensitivity(preset, params, baseRangeKm) {
  return SENSITIVITY_PARAMS.map((p) => {
    const delta = params[p.key] * p.step * p.improveDir;
    const testParams = { ...params, [p.key]: params[p.key] + delta };
    const { rangeKm } = computeStats(preset, testParams);
    const pctChange = ((rangeKm - baseRangeKm) / baseRangeKm) * 100;
    return { label: p.label, pctChange: Number(pctChange.toFixed(1)) };
  }).sort((a, b) => b.pctChange - a.pctChange);
}

// ---------- UI atoms ----------
function SliderRow({ label, value, unit, min, max, step, onChange, precision = 2 }) {
  return (
    <div className="ctrl-row">
      <div className="ctrl-label-row">
        <span className="ctrl-label">{label}</span>
        <span className="ctrl-value">{value.toFixed(precision)} {unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider"
      />
    </div>
  );
}

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-icon">{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

export default function EnergyRangeSimulator() {
  const [presetKey, setPresetKey] = useState("fsae");
  const preset = PRESETS[presetKey];
  const [params, setParams] = useState(preset.defaults);

  const setPreset = (key) => {
    setPresetKey(key);
    setParams(PRESETS[key].defaults);
  };

  const updateParam = (key, value) => setParams((p) => ({ ...p, [key]: value }));

  const stats = useMemo(() => computeStats(preset, params), [preset, params]);
  const sensitivity = useMemo(
    () => computeSensitivity(preset, params, stats.rangeKm),
    [preset, params, stats.rangeKm]
  );

  const r = preset.ranges;

  return (
    <div className="sim-root">
      <style>{`
        .sim-root {
          --bg: #12151A;
          --panel: #1A1F26;
          --panel-2: #1F252D;
          --line: #2A3038;
          --text: #E8ECEF;
          --muted: #8B9299;
          --power: #FF7A45;
          --energy: #4FD1C5;
          --good: #6FCF97;
          --bad: #FF7A7A;
          background: var(--bg);
          color: var(--text);
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .mono { font-family: ui-monospace, "SF Mono", "JetBrains Mono", Consolas, monospace; }
        .sim-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          flex-wrap: wrap;
          gap: 12px;
          border-bottom: 1px solid var(--line);
          padding-bottom: 14px;
        }
        .sim-title { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
        .sim-subtitle { color: var(--muted); font-size: 12.5px; margin-top: 3px; }
        .tabs { display: flex; gap: 6px; }
        .tab {
          font-family: inherit; font-size: 12.5px; padding: 7px 12px; border-radius: 7px;
          border: 1px solid var(--line); background: var(--panel); color: var(--muted);
          cursor: pointer; transition: color .15s, border-color .15s;
        }
        .tab.active { color: var(--text); border-color: var(--power); background: var(--panel-2); }
        .sim-body { display: grid; grid-template-columns: 240px 1fr; gap: 16px; }
        @media (max-width: 720px) { .sim-body { grid-template-columns: 1fr; } }
        .controls {
          background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
          padding: 16px; display: flex; flex-direction: column; gap: 14px; align-self: start;
        }
        .controls-title { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-bottom: 2px; }
        .ctrl-row { display: flex; flex-direction: column; gap: 6px; }
        .ctrl-label-row { display: flex; justify-content: space-between; font-size: 12.5px; }
        .ctrl-label { color: var(--text); }
        .ctrl-value { color: var(--energy); font-family: ui-monospace, monospace; font-size: 12px; }
        input[type=range].slider {
          -webkit-appearance: none; width: 100%; height: 3px; background: var(--line);
          border-radius: 2px; outline: none;
        }
        input[type=range].slider::-webkit-slider-thumb {
          -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%;
          background: var(--energy); cursor: pointer; border: 2px solid var(--bg);
        }
        input[type=range].slider::-moz-range-thumb {
          width: 13px; height: 13px; border-radius: 50%; background: var(--energy);
          cursor: pointer; border: 2px solid var(--bg);
        }
        .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        @media (max-width: 560px) { .stats-grid { grid-template-columns: repeat(2, 1fr); } }
        .stat-card {
          background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
          padding: 12px 14px; display: flex; gap: 10px; align-items: flex-start;
        }
        .stat-icon { color: var(--power); margin-top: 2px; }
        .stat-value { font-family: ui-monospace, monospace; font-size: 19px; font-weight: 600; line-height: 1.1; }
        .stat-label { color: var(--muted); font-size: 11px; margin-top: 3px; }
        .stat-sub { color: var(--muted); font-size: 10.5px; margin-top: 2px; }
        .chart-panel {
          background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
          padding: 14px 14px 6px 4px;
        }
        .chart-title { font-size: 12.5px; color: var(--muted); margin: 0 0 8px 14px; }
        .legend-row { display: flex; gap: 16px; margin: 0 0 4px 14px; font-size: 11px; color: var(--muted); }
        .legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 5px; }
        .charts-col { display: flex; flex-direction: column; gap: 12px; }
        .foot-note { color: var(--muted); font-size: 11px; line-height: 1.5; padding: 2px 4px; }
      `}</style>

      <div className="sim-header">
        <div>
          <p className="sim-title">Vehicle Energy &amp; Range Simulator</p>
          <p className="sim-subtitle">Force balance → power draw → battery depletion, per drive cycle</p>
        </div>
        <div className="tabs">
          {Object.entries(PRESETS).map(([key, p]) => (
            <button
              key={key}
              className={"tab" + (presetKey === key ? " active" : "")}
              onClick={() => setPreset(key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sim-body">
        <div className="controls">
          <div className="controls-title">Vehicle Parameters</div>
          <SliderRow label="Mass" value={params.mass} unit="kg" min={r.mass[0]} max={r.mass[1]} step={r.mass[2]}
            precision={0} onChange={(v) => updateParam("mass", v)} />
          <SliderRow label="Aero Drag (Cd·A)" value={params.cda} unit="m²" min={r.cda[0]} max={r.cda[1]} step={r.cda[2]}
            onChange={(v) => updateParam("cda", v)} />
          <SliderRow label="Rolling Resistance (Crr)" value={params.crr} unit="" min={r.crr[0]} max={r.crr[1]} step={r.crr[2]}
            precision={3} onChange={(v) => updateParam("crr", v)} />
          <SliderRow label="Battery Capacity" value={params.capacity} unit="kWh" min={r.capacity[0]} max={r.capacity[1]} step={r.capacity[2]}
            precision={1} onChange={(v) => updateParam("capacity", v)} />
          <SliderRow label="Drivetrain Efficiency" value={params.drivetrainEff} unit="%" min={r.drivetrainEff[0]} max={r.drivetrainEff[1]} step={r.drivetrainEff[2]}
            precision={0} onChange={(v) => updateParam("drivetrainEff", v)} />
          <SliderRow label="Motor Efficiency" value={params.motorEff} unit="%" min={r.motorEff[0]} max={r.motorEff[1]} step={r.motorEff[2]}
            precision={0} onChange={(v) => updateParam("motorEff", v)} />
          <SliderRow label="Regen Recovery" value={params.regenEff} unit="%" min={r.regenEff[0]} max={r.regenEff[1]} step={r.regenEff[2]}
            precision={0} onChange={(v) => updateParam("regenEff", v)} />
        </div>

        <div className="charts-col">
          <div className="stats-grid">
            <StatCard icon={<Route size={18} />} label="Estimated Range"
              value={stats.rangeKm > 500 ? "500+ km" : `${stats.rangeKm.toFixed(1)} km`}
              sub={preset.unit === "lap" ? `≈ ${stats.cyclesToEmpty.toFixed(0)} laps` : "at steady cruise"} />
            <StatCard icon={<Zap size={18} />} label="Consumption" value={`${stats.whPerKm.toFixed(0)} Wh/km`} />
            <StatCard icon={<Gauge size={18} />} label="Peak Battery Power" value={`${stats.cycle.peakPowerKw.toFixed(1)} kW`} />
            <StatCard icon={<BatteryFull size={18} />} label="Regen Recovery" value={`${stats.regenPct.toFixed(0)}%`}
              sub="of braking energy" />
          </div>

          <div className="chart-panel">
            <p className="chart-title">Speed &amp; battery power — one {presetKey === "fsae" ? "lap" : "cruise segment"}</p>
            <div className="legend-row">
              <span><span className="legend-dot" style={{ background: "var(--energy)" }} />Speed (km/h)</span>
              <span><span className="legend-dot" style={{ background: "var(--power)" }} />Battery power (kW)</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={stats.cycle.series} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#2A3038" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="t" tick={{ fill: "#8B9299", fontSize: 10 }} axisLine={{ stroke: "#2A3038" }}
                  tickLine={false} label={{ value: "time (s)", position: "insideBottom", offset: -2, fill: "#8B9299", fontSize: 10 }} />
                <YAxis yAxisId="left" tick={{ fill: "#8B9299", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: "#8B9299", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1F252D", border: "1px solid #2A3038", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#8B9299" }} />
                <ReferenceLine yAxisId="right" y={0} stroke="#2A3038" />
                <Line yAxisId="left" type="monotone" dataKey="speedKmh" stroke="#4FD1C5" dot={false} strokeWidth={2} name="Speed (km/h)" />
                <Line yAxisId="right" type="monotone" dataKey="powerKw" stroke="#FF7A45" dot={false} strokeWidth={1.5} name="Power (kW)" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-panel">
            <p className="chart-title">Battery state of charge vs. distance</p>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={stats.socPoints} margin={{ top: 4, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="socFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4FD1C5" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#4FD1C5" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#2A3038" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="distanceKm" tick={{ fill: "#8B9299", fontSize: 10 }} axisLine={{ stroke: "#2A3038" }} tickLine={false}
                  label={{ value: "distance (km)", position: "insideBottom", offset: -2, fill: "#8B9299", fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fill: "#8B9299", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1F252D", border: "1px solid #2A3038", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#8B9299" }} formatter={(v) => [`${v}%`, "SOC"]} />
                <Area type="monotone" dataKey="soc" stroke="#4FD1C5" fill="url(#socFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-panel">
            <p className="chart-title">Range sensitivity — impact of a 15% improvement per parameter</p>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={sensitivity} layout="vertical" margin={{ top: 4, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid stroke="#2A3038" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fill: "#8B9299", fontSize: 10 }} axisLine={{ stroke: "#2A3038" }} tickLine={false}
                  label={{ value: "% range change", position: "insideBottom", offset: -2, fill: "#8B9299", fontSize: 10 }} />
                <YAxis type="category" dataKey="label" width={140} tick={{ fill: "#E8ECEF", fontSize: 11.5 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#1F252D", border: "1px solid #2A3038", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [`${v > 0 ? "+" : ""}${v}%`, "Range change"]} />
                <Bar dataKey="pctChange" radius={[3, 3, 3, 3]}>
                  {sensitivity.map((entry, i) => (
                    <Cell key={i} fill={entry.pctChange >= 0 ? "#6FCF97" : "#FF7A7A"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="foot-note">
            Model: F = ma + Crr·mg + ½ρCdA·v² per timestep, converted to battery power through drivetrain
            and motor efficiency, integrated for energy and distance. Braking recovers energy at the regen
            efficiency shown; the rest is dissipated as friction braking. Solar array charging is not modeled —
            noted as a natural next step.
          </p>
        </div>
      </div>
    </div>
  );
}
