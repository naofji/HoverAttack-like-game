// Time bonus: proportional to map area, decays per elapsed real second.
// Base is boosted so a fast clear outweighs slow annihilation (high risk / high return).
export const TIME_BONUS_BASE_MULT = 1.5;

export function computeTimeBonus({ totalTiles, elapsedMs, decayPerSec, baseMult = TIME_BONUS_BASE_MULT }) {
  const baseBonus = Math.floor(totalTiles / 100) * 100 * baseMult;
  const seconds = Math.floor(elapsedMs / 1000);
  return Math.max(0, baseBonus - seconds * decayPerSec);
}
