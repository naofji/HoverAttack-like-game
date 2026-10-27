// 本物の5面の地図で反射ビームとグレネードを乱射しても、岩の中で終わらないことのテスト（段3 Task 7）。
// 段2の terrain-shape-real-map.test.js と同じく、手で作った地図では出ない形の組み合わせ（面取りの頂点、
// 浮いた板の先、坂のタイルの境目、壊れた後の地形ではない生成直後の全形）を本物の地図で踏む。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { makeGame } from './helpers/enemy-world.js';
import { Grenade } from '../src/js/entities/Grenade.js';
import { stepBeam } from '../src/js/utils/beamPath.js';
import { REFLECT_BEAM_SPEED, GRENADE_SPEED } from '../src/js/utils/Constants.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SEEDS = [1, 2, 3, 4];
const SPAWNS = 10;
const DIRS = 16;

async function maps() {
    const { Map } = await import('../src/js/world/Map.js');
    return SEEDS.map((seed) => ({ seed, map: new Map({ rng: new SeededRNG(seed) }, 4) }));
}

test('本物の5面の地図で反射ビームを乱射しても、岩の中に入らず、速さも変わらない', async () => {
    let frames = 0, inRock = 0, speedOff = 0, diagonal = 0;
    const examples = [];
    for (const { seed, map } of await maps()) {
        assert.equal(map.tileShapeRule, 'snowSlope');
        for (const sp of map.enemyAttackerSpawns.slice(0, SPAWNS)) {
            for (let d = 0; d < DIRS; d++) {
                const a = (d + 0.37) * 2 * Math.PI / DIRS; // 軸にちょうど沿う向きを避ける
                let b = { x: sp.x + 8, y: sp.y + 8, vx: Math.cos(a) * REFLECT_BEAM_SPEED, vy: Math.sin(a) * REFLECT_BEAM_SPEED };
                if (map.isSolidPoint(b.x, b.y)) continue;
                for (let f = 0; f < 300; f++) {
                    const prev = b;
                    b = stepBeam(b, map);
                    frames++;
                    // 斜辺の反射は vx と vy の大きさが入れ替わる
                    if (b.bounced && Math.abs(b.vx) === Math.abs(prev.vy) && Math.abs(b.vx) !== Math.abs(prev.vx)) diagonal++;
                    if (Math.abs(Math.hypot(b.vx, b.vy) - REFLECT_BEAM_SPEED) > 1e-9) speedOff++;
                    if (map.isSolidPoint(b.x, b.y)) {
                        inRock++;
                        if (examples.length < 5) examples.push({ seed, sp, d, f, x: b.x, y: b.y });
                    }
                }
            }
        }
    }
    assert.ok(frames > 100000, `フレームが少ない: ${frames}`);
    assert.ok(diagonal > 0, '斜辺で一度も跳ね返っていない');
    assert.equal(speedOff, 0, `速さが変わったフレーム: ${speedOff}`);
    assert.equal(inRock, 0, `岩の中のフレーム: ${inRock} ${JSON.stringify(examples)}`);
});

test('本物の5面の地図でグレネードを乱射しても、岩の中に入らず、止まったものは床の上にいる', async () => {
    let frames = 0, inRock = 0, slopeHits = 0, restingOffFloor = 0, rested = 0;
    const examples = [];
    for (const { seed, map } of await maps()) {
        const game = makeGame(map);
        // slopeHitAlong の呼び出しを包んで、斜辺に触れた回数を数える（count-events-at-source）
        const orig = map.slopeHitAlong.bind(map);
        map.slopeHitAlong = (...args) => { const h = orig(...args); if (h) slopeHits++; return h; };
        try {
            for (const sp of map.enemyAttackerSpawns.slice(0, SPAWNS)) {
                for (let d = 0; d < DIRS; d++) {
                    for (const speed of [GRENADE_SPEED, GRENADE_SPEED / 2]) {
                        const a = (d + 0.37) * 2 * Math.PI / DIRS;
                        const g = new Grenade(game, sp.x + 8, sp.y + 8, a, speed);
                        if (map.isSolidPoint(g.x, g.y)) continue;
                        for (let f = 0; f < 300; f++) {
                            g.lifetime = 1e9;
                            g.update();
                            if (!g.alive) break; // 地図の外
                            frames++;
                            if (map.isSolidPoint(g.x, g.y)) {
                                inRock++;
                                if (examples.length < 5) examples.push({ seed, sp, d, speed, f, x: g.x, y: g.y });
                            }
                        }
                        if (g.alive && Math.hypot(g.vx, g.vy) < 0.05) {
                            rested++;
                            if (!map.isSolidPoint(g.x, g.y + 2)) restingOffFloor++;
                        }
                    }
                }
            }
        } finally {
            map.slopeHitAlong = orig;
        }
    }
    assert.ok(frames > 100000, `フレームが少ない: ${frames}`);
    assert.ok(slopeHits > 0, '斜辺に一度も触れていない');
    assert.ok(rested > 100, `止まったグレネードが少ない: ${rested}`);
    assert.equal(inRock, 0, `岩の中のフレーム: ${inRock} ${JSON.stringify(examples)}`);
    assert.equal(restingOffFloor, 0, `床から浮いて止まった: ${restingOffFloor}`);
});
