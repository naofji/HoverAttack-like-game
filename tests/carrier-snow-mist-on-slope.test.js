// 5面の坂（と平地）の上で止まっているキャリアの下で、粉雪が見えることを縛る。
// 地面は 4px 刻みで探すので、見つかった点は岩の中に最大 4px 食い込む。粒をそこから出すと、動き出した途端に
// 岩に当たって消える。main ではキャリアが着地のたびに 0.3〜0.9px 上下に揺れていて、浅く食い込んだ所から出た粒が
// 抜け出せていたので見えていた。坂の着地を作り直して揺れなくなると、毎回 4px 近く深い所から出て、ほとんど消えた
// （実機の指摘「斜面の上にキャリアが位置しているときに雪が舞い上がらない」。本物の5面で、止まっている間に
// 見えている粒は坂で平均 22、平地で 15。main は 70・48）
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as S, CARRIER_WIDTH } from '../src/js/utils/Constants.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

async function snowGame() {
  const { Map } = await import('../src/js/world/Map.js');
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const { SpawnEffects } = await import('../src/js/systems/SpawnEffects.js');
  const game = { rng: new SeededRNG(1), input: { isKeyDown: () => false }, player: null, enemies: [], projectiles: [], particles: [] };
  game.map = new Map(game, 4);
  game.env = new StageEnvironment(game, 4);
  const calls = [];
  game.spawnSnowMist = (x, y, n, s) => { calls.push({ x, y }); SpawnEffects.spawnSnowMist.call(game, x, y, n, s); };
  return { game, calls };
}

/** 上辺が坂の岩（上が空）で、上に 4 タイル×5 列の空きがある所。kind: 'slope' か 'flat' */
function spots(map, kind, max) {
  const out = [];
  for (let r = 5; r < map.rows - 2 && out.length < max; r++) {
    for (let c = 4; c < map.cols - 6 && out.length < max; c++) {
      if (map.grid[r][c] === 0 || map.grid[r - 1][c] !== 0) continue;
      let open = true;
      for (let dr = 1; dr <= 4; dr++) for (let dc = -2; dc <= 2; dc++) if (map.grid[r - dr][c + dc] !== 0) open = false;
      if (!open) continue;
      if (kind === 'flat') {
        // 下の段が 5 列とも満ちた岩で上が平ら
        let flat = true;
        for (let dc = -2; dc <= 2; dc++) {
          const top = map.terrainTopY((c + dc) * S + 8, r * S - 1, r * S + S);
          if (top !== r * S || map.floorSlopeAt((c + dc) * S + 8, top) !== 0) flat = false;
        }
        if (flat) out.push([r, c]);
      } else {
        const top = map.terrainTopY(c * S + 8, r * S - 1, r * S + S);
        if (top !== null && map.floorSlopeAt(c * S + 8, top) !== 0) out.push([r, c]);
      }
    }
  }
  return out;
}

async function restOn(kind) {
  const { Carrier } = await import('../src/js/entities/Carrier.js');
  const { game, calls } = await snowGame();
  const where = spots(game.map, kind, 8);
  assert.ok(where.length >= 2, `${kind} の場所 ${where.length}`);
  let deep = 0, alive = 0, frames = 0;
  for (const [r, c] of where) {
    game.particles = [];
    calls.length = 0;
    const car = new Carrier(game, c * S + 8 - CARRIER_WIDTH / 2, (r - 4) * S);
    for (let i = 0; i < 300; i++) {
      car.update();
      for (const q of game.particles) q.update();
      game.particles = game.particles.filter((q) => q.alive);
      if (i >= 150) { alive += game.particles.length; frames++; }
    }
    // 止まってから出した粒の出どころが、出した列の地面の上面より深くないか
    for (const k of calls.slice(-30)) {
      const top = game.map.terrainTopY(k.x, k.y - 2 * S, k.y + 1);
      if (top !== null && k.y > top + 0.5) deep++;
    }
  }
  return { deep, meanAlive: alive / frames, n: where.length };
}

for (const kind of ['slope', 'flat']) {
  test(`5面の${kind === 'slope' ? '坂' : '平地'}で止まっているキャリアの粉雪は、岩の中ではなく地面の上面から出て、消えずに見える`, async () => {
    const { deep, meanAlive, n } = await restOn(kind);
    assert.equal(deep, 0, `${n} か所で、岩の中から出た粉雪が ${deep} 回`);
    // 直す前は坂で 22、平地で 15（main は 70・48）。上面から出すと 120 前後
    assert.ok(meanAlive >= 60, `止まっている間に見えている粒 ${meanAlive.toFixed(1)}`);
  });
}
