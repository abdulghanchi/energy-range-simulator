# Vehicle Energy & Range Simulator
### A project for Formula Electric / McMaster Solar Car applications

## What it is

An interactive simulator that predicts how far an electric vehicle can go on
a given battery, using nothing but physics: mass, aerodynamic drag, rolling
resistance, and drivetrain/motor efficiency. You pick a drive cycle (an FSAE
autocross lap, or a solar-car highway cruise), tune the vehicle parameters
with sliders, and watch range, power draw, and battery drain update live.

This is the same category of tool that a powertrain or energy-management
subteam builds early in a season, before any hardware exists, to answer
questions like *"if we cut 20 kg, how much extra range do we get?"* or
*"is our battery pack big enough for endurance?"*

## Why this project (not something flashier)

You don't have days to learn a whole new CAD suite or build hardware from
scratch. What you *can* show convincingly in a few days is that you
understand the core energy problem every one of these vehicles has to
solve — and that you can turn that understanding into a working tool.
That's arguably more useful to a team than a half-finished physical build.

## The physics, in plain terms

At every instant, the motor has to overcome three things:

1. **Inertia** — force needed to accelerate the car (`F = m·a`)
2. **Rolling resistance** — friction between tires and road (`F = Crr·m·g`)
3. **Aerodynamic drag** — pushing air out of the way (`F = ½·ρ·Cd·A·v²`, which
   grows with the *square* of speed — this is why solar cars obsess over
   drag and FSAE cars don't worry about it nearly as much at their speeds)

Multiply total force by velocity to get power at the wheels, then divide by
drivetrain and motor efficiency to get the power actually drawn from the
battery. Integrate that over time and you get energy consumed and,
eventually, range. Braking is the reverse case: some of that energy can be
recovered (regenerative braking) instead of wasted as heat.

## What the sensitivity chart is really for

The bar chart isn't decoration — it answers the question every real design
review asks: **where should engineering effort actually go?** A 15%
improvement in mass might buy you 4% more range, while the same effort spent
on aerodynamics buys you 12%. That's a genuine design trade-off, and being
able to reason about it is exactly what these subteams look for.

## What's deliberately left out (and why that's worth mentioning)

- **Solar array charging isn't modeled.** For the Solar Car cruise scenario,
  this means real range would be *better* than shown, since the array feeds
  energy back in continuously. Good next step: add an irradiance model and
  MPPT efficiency.
- **Thermal effects on battery capacity** (capacity drops in cold weather /
  under high discharge) aren't modeled.
- **The drive cycles are synthetic**, not pulled from real telemetry. A
  natural next step is asking the team for a real logged lap or race file
  and validating the model against it.

Naming these limitations yourself, unprompted, in an interview is a strong
signal — it shows you know the difference between "this works" and
"this is complete," which is most of what separates a first-year applicant
from someone who's been on a team for two years.

## Talking points for your interview

- Walk through the force balance out loud — you should be able to derive it
  on a whiteboard, not just point at code.
- Be ready to explain *why* aero drag matters so much more for the solar
  car than the FSAE car (steady high-speed cruise vs. short accel/brake
  bursts — drag scales with v², so it dominates at cruise speed).
- Have an opinion on the sensitivity result for whichever team you're
  interviewing with, and be ready to defend it.
- If asked "what would you add with more time," lead with the solar array
  model or real telemetry validation — it shows foresight, not just
  execution.

## Files in this project

- `energy_simulator.jsx` — the interactive simulator (open as a Claude
  artifact, or drop into any React project with `recharts` and
  `lucide-react` installed)
- `project_writeup.md` — this document
