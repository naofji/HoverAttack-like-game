// Fixed-timestep accumulator. Physics runs in discrete SIM_STEP ticks; the
// caller scales the incoming delta by gameSpeed before calling. maxTicks caps
// catch-up work so a long stall can't spiral.
export const SIM_STEP = 1000 / 60;
export const MAX_TICKS = 5;

export function advanceAccumulator(accumulator, scaledDeltaMs, step, maxTicks) {
  let acc = accumulator + scaledDeltaMs;
  let ticks = 0;
  while (acc >= step && ticks < maxTicks) {
    acc -= step;
    ticks++;
  }
  // If we hit the cap, drop the backlog so it doesn't keep growing.
  if (ticks >= maxTicks && acc >= step) acc = acc % step;
  return { ticks, remainder: acc, alpha: acc / step };
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}
