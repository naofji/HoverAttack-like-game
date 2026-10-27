// 落ちてくるアイテムが5面の坂と面取りの上に、形の高さで止まることのテスト（段4 Task 3）。
// 坂の地図は tests/player-slope.test.js と同じ（列 10〜19 が 45度で上る。上面 y = 30T − x）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MissileKit } from '../src/js/entities/MissileKit.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { TILE_SIZE as T } from '../src/js/utils/Constants.js';

function rampRows() {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 40; c++) {
            let floor = 20;
            if (c >= 10 && c <= 19) floor = 29 - c;
            else if (c >= 20 && c <= 29) floor = 10;
            if (c >= 34) floor = 23; // 台地の右の崖（床の縁 (10,33) の右上は面取り）
            s += r >= floor ? '#' : '.';
        }
        rows.push(s);
    }
    return rows;
}

function drop(cx) {
    const map = makeMap(rampRows(), null, { tileShape: 'snowSlope' });
    const game = makeGame(map);
    const it = new MissileKit(game, cx, 2 * T);
    for (let f = 0; f < 400 && !it.onGround; f++) it._fall();
    return { it, map };
}

/** 足の2列（両端から 3px 内側）のどちらかで床にちょうど触れているか */
function touches(map, it) {
    const bottom = it.y + it.height;
    return [it.x + 3, it.x + it.width - 3].some((x) => {
        const top = map.terrainTopY(x, bottom - 0.5, bottom + 0.5);
        return top !== null && Math.abs(top - bottom) < 1e-9;
    });
}

test('坂の上に落ちたアイテムは、斜辺の上に止まり、岩に入らない', () => {
    const { it, map } = drop(15 * T + 5);
    assert.equal(it.onGround, true);
    assert.equal(map.rectHitsTerrain(it.x + 3, it.y, it.width - 6, it.height), false, `岩に入った y=${it.y}`);
    assert.ok(touches(map, it), `斜辺から浮いている 下端 ${it.y + it.height}`);
});

test('床の縁の面取りに落ちたアイテムは、面取りの空中に浮かずに止まる', () => {
    // 台地の右端 (10,33) の右上の象限は削れている（斜辺 v = u）。左の足（x + 3）をそこ（lx = 12）へ、
    // 右の足を崖の上へ掛ける
    const { it, map } = drop(33 * T + 9 + 8);
    assert.equal(it.x + 3, 33 * T + 12, '前提: 左の足が面取りの上');
    assert.equal(it.onGround, true);
    assert.equal(map.rectHitsTerrain(it.x + 3, it.y, it.width - 6, it.height), false, `岩に入った y=${it.y}`);
    assert.ok(touches(map, it), `浮いている 下端 ${it.y + it.height}`);
});
