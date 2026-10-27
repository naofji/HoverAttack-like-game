// 母艦が5面の坂を斜辺に沿って上り下りすることのテスト（段4 Task 4）。
// 母艦は段差に当たると 3px ずつ持ち上げて越える作りで、坂ではタイルの上端の高さを跳ねて進み、
// 斜辺から浮いていた。坂の地図は tests/player-slope.test.js と同じ（列 10〜19 が 45度で上る）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Carrier } from '../src/js/entities/Carrier.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { collidesWithTerrain } from '../src/js/utils/Physics.js';
import { TILE_SIZE as T, SLOPE_CLIMB_MARGIN, CARRIER_HEIGHT } from '../src/js/utils/Constants.js';

function rampRows() {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 40; c++) {
            let floor = 20;
            if (c >= 10 && c <= 19) floor = 29 - c;
            else if (c >= 20 && c <= 29) floor = 10;
            s += r >= floor ? '#' : '.';
        }
        rows.push(s);
    }
    return rows;
}

function world(x, y) {
    const game = makeGame(makeMap(rampRows(), null, { tileShape: 'snowSlope' }));
    const held = new Set();
    game.input = { isKeyDown: (k) => held.has(k) };
    game.player = { x: 0, y: 0, width: 16, height: 24, alive: true, docked: true, onGround: true };
    const carrier = new Carrier(game, x, y);
    return { game, carrier, held };
}

const inRock = (c) => collidesWithTerrain(c, c.game.map, c._slopePoints(c));

/** 足の点（下半分の点）の列で、一番近い床までの距離。床が1タイル以内に無い列は数えない */
function floorGap(c) {
    const bottom = c.y + c.height;
    let gap = Infinity;
    for (const p of c._slopePoints(c)) {
        if (p.y <= c.y + c.height / 2) continue;
        const top = c.game.map.terrainTopY(p.x, bottom - 1, bottom + T);
        if (top !== null) gap = Math.min(gap, top - bottom);
    }
    return gap;
}

/** key を押して frames だけ走らせ、1フレームの上下が横の移動量を超えた最大と、岩の中のフレーム数 */
function drive(w, key, frames, until = () => false) {
    let worst = 0, stuck = 0;
    for (let f = 0; f < frames && !until(w.carrier); f++) {
        w.held.clear();
        if (key) w.held.add(key);
        const x0 = w.carrier.x, y0 = w.carrier.y;
        w.carrier.update();
        worst = Math.max(worst, Math.abs(w.carrier.y - y0) - Math.abs(w.carrier.x - x0));
        if (inRock(w.carrier)) stuck++;
    }
    return { worst, stuck };
}

test('母艦は坂を、1フレームで横の移動量＋余裕を超えて上下せずに台地まで上る', () => {
    const w = world(3 * T, 20 * T - CARRIER_HEIGHT);
    const { worst, stuck } = drive(w, 'KeyD', 1500, (c) => c.x >= 21 * T);
    assert.ok(w.carrier.x >= 21 * T, `台地まで上れていない x=${w.carrier.x}`);
    assert.ok(worst <= SLOPE_CLIMB_MARGIN + 1e-9, `1フレームの上下が横の移動量を超えた: ${worst}`);
    assert.equal(stuck, 0);
});

test('母艦は坂を、岩に入らず斜辺に沿って坂の下まで下りる', () => {
    const w = world(24 * T, 10 * T - CARRIER_HEIGHT);
    drive(w, null, 30); // 台地に落ち着かせる
    const { worst, stuck } = drive(w, 'KeyA', 1500, (c) => c.x <= 4 * T);
    assert.ok(w.carrier.x <= 4 * T, `坂の下まで下りていない x=${w.carrier.x}`);
    assert.ok(worst <= SLOPE_CLIMB_MARGIN + 1e-9, `1フレームの上下が横の移動量を超えた: ${worst}`);
    assert.equal(stuck, 0);
});

test('母艦は坂の途中で止まっても岩に入らず、斜辺から浮かない', () => {
    const w = world(3 * T, 20 * T - CARRIER_HEIGHT);
    drive(w, 'KeyD', 1500, (c) => c.x >= 12 * T);
    const { stuck } = drive(w, null, 120);
    assert.equal(stuck, 0);
    // 足の点のどれかが斜辺から 1px 以内にある
    const gap = floorGap(w.carrier);
    assert.ok(gap <= 1, `斜辺から浮いている ${gap}px`);
});

test('坂の上に落ちた母艦は斜辺の上に止まり、タイルの上端との間で上下に跳ねない', () => {
    const w = world(13 * T, 6 * T);
    const c = w.carrier;
    drive(w, null, 120); // 落ちて落ち着くまで
    let worstGap = 0, stuck = 0;
    for (let f = 0; f < 60; f++) {
        c.update();
        worstGap = Math.max(worstGap, floorGap(c));
        if (inRock(c)) stuck++;
    }
    assert.equal(stuck, 0);
    assert.ok(worstGap <= 1, `斜辺から最大 ${worstGap}px 浮いた`);
});
