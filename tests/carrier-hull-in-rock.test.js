// 母艦の船体が岩（浮いた板・面取りの先）に入り込まないことのテスト。
//
// 実機の指摘（2026-11-04、2面）: 左から走ってきた母艦が、下にすき間のある浮いた板に乗り上げず、
// 突き刺さったように重なった。原因は母艦の当たり判定の点が粗かったこと — 上の段が 2・32・62px の
// 3点だけ（30px 空き）、縦は上端と下端の2段だけで、板の面取りの先（2px ほどの細い楔）や
// 船体の高さの途中にある板を点が拾わず、段差の確かめ（1タイル持ち上げて空くか）も誤って
// 「上れる」と答えて、3px ずつ板の中へ持ち上げていた。
//
// 判定は点ではなく船体の矩形（点が囲む範囲）で見る。点で見るとテストも同じ盲点を持つ
// （tests/carrier-slope.test.js の inRock は点で見ている）。
// 坂へ落ちて着地した1フレームだけ、足の点のあいだの斜辺の山に 1px 未満入ることがある
// （次のフレームの横の確かめで外へ出る）。それは許して、2フレーム以上続けて入っているものを数える。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { TILE_SIZE as T, CARRIER_WIDTH as W, CARRIER_HEIGHT as H } from '../src/js/utils/Constants.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const hullInRock = (map, c) => map.rectHitsTerrain(c.x + 2, c.y + 2, c.width - 4, c.height - 3);

/** 面 mission の seed の地図で、床の上の位置から key を押して走らせ、2フレーム以上続けて船体が岩に入った回数 */
async function drive(mission, seed, key) {
    const { Map } = await import('../src/js/world/Map.js');
    const game = { rng: new SeededRNG(seed), camera: { x: 0, y: 0 }, canvas: { width: 960, height: 540 }, env: null };
    const map = new Map(game, mission);
    game.map = map;
    const held = new Set([key]);
    game.input = { isKeyDown: (k) => held.has(k) };
    game.player = { x: 0, y: 0, width: 16, height: 24, alive: true, docked: true };
    let runs = 0;
    const bad = [];
    for (let c = 3; c < map.cols - 6; c += 6) {
        for (let r = 3; r < map.rows - 3; r++) {
            const x = c * T, y = r * T - H - 0.01;
            if (!map.isSolid(r, c) || !map.isSolid(r, c + 3) || map.rectHitsTerrain(x, y, W, H)) continue;
            runs++;
            const car = new Carrier(game, x, y);
            let streak = 0;
            for (let f = 0; f < 300; f++) {
                car.update();
                streak = hullInRock(map, car) ? streak + 1 : 0;
                if (streak >= 2) { bad.push({ start: [x, Math.round(y)], f, at: [Math.round(car.x), Math.round(car.y)] }); break; }
            }
        }
    }
    return { runs, bad };
}

test('本物の2面で母艦を走らせても、船体が浮いた板や面取りの先に入り込まない', async () => {
    let runs = 0;
    const bad = [];
    for (const seed of [1, 2]) {
        for (const key of ['KeyD', 'KeyA']) {
            const r = await drive(1, seed, key);
            runs += r.runs;
            bad.push(...r.bad.map((b) => ({ seed, key, ...b })));
        }
    }
    assert.ok(runs > 200, `走らせた回数が少なすぎる: ${runs}`);
    assert.deepEqual(bad.slice(0, 5), [], `${bad.length}/${runs} 回で船体が岩に入ったまま`);
});

test('四角い地形（1面）でも、船体の高さの途中にある板を通り抜けない', async () => {
    const r = await drive(0, 1, 'KeyD');
    assert.ok(r.runs > 50);
    assert.deepEqual(r.bad.slice(0, 5), [], `${r.bad.length}/${r.runs} 回で船体が岩に入ったまま`);
});
