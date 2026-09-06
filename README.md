# Vehicle Energy & Range Simulator

**Live demo: [energy-range-simulator.vercel.app](https://energy-range-simulator.vercel.app)**

An interactive tool that models how far an electric vehicle can travel on a
given battery.

Tune mass, aerodynamic drag, rolling resistance, battery capacity, and
drivetrain/motor efficiency with live sliders, and see range, power draw,
and battery state-of-charge update in real time — for both an FSAE-style
autocross lap and a solar-car cruise profile.

See [PROJECT_WRITEUP.md](./PROJECT_WRITEUP.md) for the physics behind it,
design rationale, and known limitations.

## Run it locally

```bash
npm install
npm run dev
```

## Tech

React + Vite, [recharts](https://recharts.org) for charts,
[lucide-react](https://lucide.dev) for icons.
