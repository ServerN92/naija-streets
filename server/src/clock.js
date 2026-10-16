// The Lagos game clock, the same as the game's (src/clock.js): one game day is 2 real hours, starting at 06:00.
// The server uses it so customers come at breakfast, lunch and evening, and stay home at night.
export const DAY_MINUTES = 120;
const PARTS = [[6, 12, 35], [12, 16, 35], [16, 19, 35], [19, 20, 3], [20, 29, 8], [29, 30, 4]];   // [from hour, to hour, real minutes]
export function gameHour(t = Date.now()) {
  const day = DAY_MINUTES * 60000; let m = ((((t % day) + day) % day) / day) * DAY_MINUTES;
  for (const [a, b, len] of PARTS) { if (m < len) return (a + (b - a) * m / len) % 24; m -= len; }
  return 6;
}
