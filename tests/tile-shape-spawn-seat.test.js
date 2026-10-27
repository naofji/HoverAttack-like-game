// 5面の湧き位置を、坂と面取りの高さへ置き直すことのテスト（段4 Task 2）。
// 湧き位置は形を焼く前にタイルの上端で決まるので、坂の上では最大 16px、面取りでは 8px 浮いていた。
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    TILE_SIZE as T, LANDMINE_WIDTH, LANDMINE_HEIGHT, ENEMY_TANK_WIDTH, ENEMY_TANK_HEIGHT,
    PLAYER_WIDTH, PLAYER_HEIGHT, ENEMY_TURRET_WIDTH, ENEMY_TURRET_HEIGHT,
} from '../src/js/utils/Constants.js';

before(() => {
    const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

const SEEDS = [1, 2, 3, 4, 5, 6];
const EPS = 1e-9;

async function snowMaps() {
    const { Map } = await import('../src/js/world/Map.js');
    return SEEDS.map((seed) => new Map({ rng: new SeededRNG(seed) }, 4));
}

/** 基地の部屋の守り（磨き仕上げの台の上。計画の範囲外）は除く */
function outsideBase(map, p) {
    const b = map.enemyBaseCenter;
    if (!b) return true;
    const c = Math.floor(p.x / T), r = Math.floor(p.y / T);
    return !(Math.abs(c - b.c) <= 9 && r >= b.r - 11 && r <= b.floorR);
}

function floorSpawns(map) {
    const out = [];
    for (const p of map.landmineSpawns) out.push({ kind: 'mine', p, w: LANDMINE_WIDTH, h: LANDMINE_HEIGHT });
    for (const p of map.enemyTankSpawns) out.push({ kind: 'tank', p, w: ENEMY_TANK_WIDTH, h: ENEMY_TANK_HEIGHT });
    for (const p of map.enemyAttackerSpawns) out.push({ kind: 'attacker', p, w: PLAYER_WIDTH, h: PLAYER_HEIGHT });
    for (const p of map.enemyTurretSpawns) if (!p.isCeiling) out.push({ kind: 'turret', p, w: ENEMY_TURRET_WIDTH, h: ENEMY_TURRET_HEIGHT });
    return out.filter((s) => outsideBase(map, s.p));
}

const cols = (x, w) => [x + 2, x + w / 2, x + w - 2];

test('5面の本物の地図で、床に乗る湧き位置はすべて岩に重ならず、足の列のどれかが床にちょうど触れている', async () => {
    let n = 0;
    const bad = [];
    for (const map of await snowMaps()) {
        assert.equal(map.tileShapeRule, 'snowSlope');
        for (const { kind, p, w, h } of floorSpawns(map)) {
            n++;
            // 重なりは足元の半タイルだけ、両端 2px 内側で見る。背の高い砲台が狭い隙間に置かれて頭が
            // 岩に掛かるのは四角い地形でも前からある置き方で、この段の範囲外。両端 2px は機体の
            // 当たり判定（点も矩形も 2px 内側）と同じ余白で、坂ではそこが最大 2px 斜辺に掛かる
            const overlap = map.rectHitsTerrain(p.x + 2, Math.max(p.y, p.y + h - T / 2), w - 4, Math.min(h, T / 2));
            const bottom = p.y + h;
            const touch = cols(p.x, w).some((x) => {
                const top = map.terrainTopY(x, bottom - 0.5, bottom + 0.5);
                return top !== null && Math.abs(top - bottom) < EPS;
            });
            if (overlap || !touch) bad.push({ kind, x: p.x, y: p.y, overlap, touch });
        }
    }
    assert.ok(n > 200, `湧き位置が少ない: ${n}`);
    assert.deepEqual(bad.slice(0, 5), [], `床に乗っていない湧き位置 ${bad.length}/${n}`);
});

test('5面の本物の地図で、天井の砲台はすべて岩に重ならず、天井にちょうど触れている', async () => {
    let n = 0;
    const bad = [];
    for (const map of await snowMaps()) {
        for (const p of map.enemyTurretSpawns) {
            if (!p.isCeiling || !outsideBase(map, p)) continue;
            n++;
            const overlap = map.rectHitsTerrain(p.x + 2, p.y, ENEMY_TURRET_WIDTH - 4, T / 2); // 付け根の半タイル（床と同じ理由）
            const touch = cols(p.x, ENEMY_TURRET_WIDTH).some((x) => {
                const bot = map.terrainBottomY(x, p.y + 0.5, p.y - 0.5);
                return bot !== null && Math.abs(bot - p.y) < EPS;
            });
            if (overlap || !touch) bad.push({ x: p.x, y: p.y, overlap, touch });
        }
    }
    assert.ok(n > 10, `天井の砲台が少ない: ${n}`);
    assert.deepEqual(bad.slice(0, 5), [], `天井に付いていない砲台 ${bad.length}/${n}`);
});

test('5面の湧き位置のうち、坂か面取りの上で置き直されたものがある', async () => {
    let moved = 0;
    for (const map of await snowMaps()) {
        for (const { p, h } of floorSpawns(map)) if (Math.abs((p.y + h) / T - Math.round((p.y + h) / T)) > EPS) moved++;
    }
    assert.ok(moved > 0, 'タイルの上端から動いた湧き位置が1つも無い');
});

test('置き直しは乱数を使わない（5面の地図を作った後の game.rng が、置き直しを消した場合と同じ）', async () => {
    const { Map } = await import('../src/js/world/Map.js');
    const orig = Map.prototype._seatSpawnsOnShapes;
    const states = [];
    for (const noop of [false, true]) {
        if (noop) Map.prototype._seatSpawnsOnShapes = () => {};
        try {
            const game = { rng: new SeededRNG(11) };
            new Map(game, 4);
            states.push(game.rng.state);
        } finally {
            Map.prototype._seatSpawnsOnShapes = orig;
        }
    }
    assert.equal(states[0], states[1]);
});
