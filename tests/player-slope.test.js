// 自機が坂と面取りの「形」で地形に当たることのテスト（段2 Task 4）。
// 設計: docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md の決定3・7・11
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { collidesWithTerrain } from '../src/js/utils/Physics.js';
import {
    TILE_SIZE as T, ICE_SLIDE, PLAYER_MAX_SPEED, SLOPE_UPHILL_SCALE, SLOPE_CLIMB_MARGIN,
} from '../src/js/utils/Constants.js';

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

function inputWith(held) {
    return {
        keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
        mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
        rightHoldFrames: 0, crosshairLocked: false,
        getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
    };
}

function world(rows) {
    const game = makeGame(makeMap(rows, null, { tileShape: 'snowSlope' }));
    game.env = SNOW;
    game.camera = { x: 0, y: 0, shake() {} };
    game.canvas = { width: 1024, height: 768 };
    game.input = inputWith(new Set());
    return game;
}

// 幅40・高さ24。列 0〜9 は床 row 20、列 10〜19 は右へ上る坂（列 c の床は row 29 − c）、
// 列 20〜29 は台地（床 row 10）、列 30〜 は床 row 20（台地の右端は崖）。
// 坂の上面は x ∈ [10T, 20T) で y = 30T − x
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
const rampSurface = (x) => 30 * T - x;
/** 足の列（getDefaultCheckPoints の x+2, x+8, x+14）が全部坂の上にあるか */
const feetOnRamp = (p) => p.x + 2 >= 10 * T && p.x + 14 < 20 * T;
const highestFoot = (p) => Math.min(rampSurface(p.x + 2), rampSurface(p.x + 8), rampSurface(p.x + 14));

test('坂の上り: 押し続けると接地したまま上り、1フレームの上昇は横の移動量＋余裕まで、上りの最高速は落ちる', () => {
    const game = world(rampRows());
    game.input = inputWith(new Set(['KeyD']));
    const p = new Player(game, 5 * T, 20 * T - 24);
    game.player = p;
    for (let i = 0; i < 5; i++) p.update(); // 着地を待つ
    const cap = PLAYER_MAX_SPEED * SLOPE_UPHILL_SCALE + 1e-9;
    let onRampFrames = 0;
    for (let i = 0; i < 400 && p.x < 21 * T; i++) {
        const x0 = p.x, y0 = p.y;
        p.update();
        assert.ok(p.onGround, `frame ${i}: 空中に出た x=${p.x} y=${p.y}`);
        assert.ok(Math.abs(p.y - y0) <= Math.abs(p.x - x0) + SLOPE_CLIMB_MARGIN + 1e-9,
            `frame ${i}: 上下 ${p.y - y0} 横 ${p.x - x0}`);
        if (feetOnRamp(p)) {
            onRampFrames++;
            assert.equal(p.slopeDir, 1, `frame ${i}`);
            assert.ok(Math.abs(p.vx) <= cap, `frame ${i}: vx ${p.vx}`);
            assert.ok(Math.abs(p.y + p.height - highestFoot(p)) <= 0.5, `frame ${i}: 足が斜辺に乗っていない`);
        }
    }
    assert.ok(onRampFrames > 50, `坂の上にいたフレームが少ない: ${onRampFrames}`);
    assert.ok(p.x >= 21 * T, `台地まで上れていない x=${p.x}`);
    assert.equal(p.y + p.height, 10 * T);
});

test('坂の途中で離すと、接地したまま下りへ滑り、坂の下の床まで着く', () => {
    const game = world(rampRows());
    const x = 15 * T;
    const p = new Player(game, x, rampSurface(x + 14) - 24);
    game.player = p;
    let minVx = 0;
    for (let i = 0; i < 300; i++) {
        const x0 = p.x, y0 = p.y;
        p.update();
        if (i >= 3) assert.ok(p.onGround, `frame ${i}: 空中に出た x=${p.x}`);
        assert.ok(Math.abs(p.y - y0) <= Math.abs(p.x - x0) + SLOPE_CLIMB_MARGIN + 1e-9, `frame ${i}`);
        if (feetOnRamp(p) && p.onGround) {
            assert.ok(Math.abs(p.y + p.height - highestFoot(p)) <= 0.5, `frame ${i}: 足が斜辺に乗っていない`);
        }
        minVx = Math.min(minVx, p.vx);
    }
    assert.ok(minVx < -0.5, `下り（左）へ加速していない: ${minVx}`);
    // 坂の下の床まで滑り切る（足が全部坂から出る）。平らな床では氷の摩擦で止まる
    assert.ok(p.x + p.width <= 10 * T, `坂の下まで滑っていない x=${p.x}`);
    assert.equal(p.y + p.height, 20 * T);
});

test('空中で坂の側面へ横から当たると、止まらずに上へ逸れる', () => {
    const game = world(rampRows());
    // 右へ 2px 動くと右足の点 (x+14, y+23) が坂へ 1px 入る位置。地上ではない
    const x0 = 12 * T - 12, y0 = 18 * T - 2 - 24;
    const p = new Player(game, x0, y0);
    game.player = p;
    p.motion = SNOW.motionAt();
    p.onGround = false;
    p.vx = 2; p.vy = 0;
    assert.equal(collidesWithTerrain(p, game.map), false, '前提: 動く前は当たっていない');
    p._moveAndCollide();
    assert.equal(p.x, x0 + 2);
    assert.equal(p.vx, 2, '横の速さを失わない');
    assert.ok(p.y < y0, `上へ逸れていない y=${p.y}`);
    assert.equal(collidesWithTerrain(p, game.map), false);
});

// 列 10〜19 の天井は右ほど低い（列 c の天井は row 0〜c−10 が岩）。下面は x ∈ [10T, 20T) で y = x − 10T
function ceilingRows() {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 40; c++) {
            let solid = r >= 22;
            if (c >= 10 && c <= 19 && r <= c - 10) solid = true;
            if (c >= 20 && r <= 9) solid = true;
            s += solid ? '#' : '.';
        }
        rows.push(s);
    }
    return rows;
}

test('上昇して天井の斜面に当たると、斜辺の外へ押し出されて開いた側（天井の高い左）へ流れる', () => {
    const game = world(ceilingRows());
    game.input = inputWith(new Set(['KeyW']));
    const p = new Player(game, 14 * T, 4 * T + 16);
    game.player = p;
    p.motion = SNOW.motionAt();
    p.onGround = false;
    p.vx = 0; p.vy = -4;
    p._moveAndCollide();
    assert.equal(p.vy, 0);
    assert.ok(p.vx < 0, `左へ流れていない vx=${p.vx}`);
    assert.equal(collidesWithTerrain(p, game.map), false);
    const xStart = p.x;
    for (let i = 0; i < 10; i++) {
        p.update();
        assert.equal(collidesWithTerrain(p, game.map), false, `frame ${i}: 頭が岩に入った`);
    }
    assert.ok(p.x < xStart, `斜面に沿って左へ流れていない x=${p.x}`);
});

test('空中で横へ動いて天井の斜面に頭が当たると、止まらずに下へ逸れる', () => {
    const game = world(ceilingRows());
    // 右へ 2px 動くと頭の右の点 (x+14, y+2) が天井の斜面（下面 y = x − 10T）へ入る位置
    const x0 = 14 * T, y0 = 4 * T + 13.5;
    const p = new Player(game, x0, y0);
    game.player = p;
    p.motion = SNOW.motionAt();
    p.onGround = false;
    p.vx = 2; p.vy = 0;
    assert.equal(collidesWithTerrain(p, game.map), false, '前提: 動く前は当たっていない');
    p._moveAndCollide();
    assert.equal(p.x, x0 + 2);
    assert.equal(p.vx, 2, '横の速さを失わない');
    assert.ok(p.y > y0, `下へ逸れていない y=${p.y}`);
    assert.equal(collidesWithTerrain(p, game.map), false);
});

test('落ちて坂に着くと、足は斜辺に乗り、縦の速さの一部が下り向きの横の速さになる', () => {
    const game = world(rampRows());
    const x = 15 * T;
    const surface = rampSurface(x + 14); // 足の列で一番高い面
    const p = new Player(game, x, surface - 2 - 24);
    game.player = p;
    p.motion = SNOW.motionAt();
    p.onGround = false;
    p.vx = 0; p.vy = 4;
    p._moveAndCollide();
    assert.equal(p.onGround, true);
    assert.equal(p.y + p.height, surface);
    // 右へ上る坂なので下りは左。vy 4 の SLOPE_DEFLECT（0.5）倍
    assert.ok(Math.abs(p.vx - (-2)) < 1e-9, `vx=${p.vx}`);
});

test('浮いた板の左の面取りの上に立つと、左へ滑って落ちる', () => {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 24; c++) s += (r === 14 && (c === 10 || c === 11)) || r >= 22 ? '#' : '.';
        rows.push(s);
    }
    const game = world(rows);
    // 足の列 x+10 が面取りの上端（14T）、中心 x+8 は面取りの上
    const p = new Player(game, 10 * T - 4, 14 * T - 24);
    game.player = p;
    for (let i = 0; i < 150; i++) p.update();
    // 面取りを左へ滑り、足が全部板の外に出たところで落ちる（下の床に着く）
    assert.ok(p.x < 10 * T, `左へ滑っていない x=${p.x}`);
    assert.equal(p.y + p.height, 22 * T, `板から落ちて下の床に着いていない y=${p.y}`);
});

test('5面でも、坂の隣の四角い高さ3の壁では今までどおり止まる', () => {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 30; c++) s += r >= 20 || ((c === 15 || c === 16) && r >= 17) ? '#' : '.';
        rows.push(s);
    }
    const game = world(rows);
    game.input = inputWith(new Set(['KeyD']));
    const p = new Player(game, 8 * T, 20 * T - 24);
    game.player = p;
    for (let i = 0; i < 150; i++) p.update();
    assert.ok(p.x + p.width <= 15 * T, `壁を越えた x=${p.x}`);
    assert.equal(p.y + p.height, 20 * T);
});

test('5面の平らな床では、入力なしで滑り出さない', () => {
    const game = world(rampRows());
    const p = new Player(game, 4 * T, 20 * T - 24);
    game.player = p;
    for (let i = 0; i < 60; i++) {
        p.update();
        assert.equal(p.vx, 0, `frame ${i}`);
    }
    assert.equal(p.slopeDir, 0);
});

test('坂の上で死んで復活すると slopeDir が 0 に戻る', () => {
    const game = world(rampRows());
    const x = 15 * T;
    const p = new Player(game, x, rampSurface(x + 14) - 24);
    game.player = p;
    for (let i = 0; i < 5; i++) p.update();
    assert.notEqual(p.slopeDir, 0, '前提: 坂の上で slopeDir が立つ');
    p.respawn(3 * T, 5 * T);
    assert.equal(p.slopeDir, 0);
});
