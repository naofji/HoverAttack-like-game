// 敵アタッカーも坂と面取りの形で地形に当たり、坂で滑ることのテスト（段2 Task 5）。
// 坂の地図は tests/player-slope.test.js と同じ（列 10〜19 が右へ上る坂、上面 y = 30T − x）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, makeGame, makeAttacker } from './helpers/enemy-world.js';
import { collidesWithTerrain } from '../src/js/utils/Physics.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { TILE_SIZE as T, ICE_SLIDE, SLOPE_CLIMB_MARGIN } from '../src/js/utils/Constants.js';

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };

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

function world() {
    const game = makeGame(makeMap(rampRows(), null, { tileShape: 'snowSlope' }));
    game.env = SNOW;
    game.camera = { x: 0, y: 0, shake() {} };
    game.canvas = { width: 1024, height: 768 };
    return game;
}

/** AI の乱数を種つきにして fn を走らせる（巡回そのものは乱数を使わないが、念のため） */
function seeded(fn) {
    const orig = Math.random;
    const rng = new SeededRNG(5);
    Math.random = () => rng.next();
    try { return fn(); } finally { Math.random = orig; }
}

const onRamp = (e) => e.x + 2 >= 10 * T && e.x + e.width - 2 < 20 * T;

test('巡回で坂を上るあいだ接地が途切れず、1段（16px）を跳ばずに斜辺を上る', () => seeded(() => {
    const game = world();
    const e = makeAttacker(game, 5 * T, 20 * T - 24, 'standard');
    e.patrolDir = 1;
    for (let i = 0; i < 5; i++) e.update();
    let rampFrames = 0;
    for (let i = 0; i < 1500 && e.x < 21 * T; i++) {
        const x0 = e.x, y0 = e.y, wasGrounded = e.onGround, was = onRamp(e);
        e.update();
        if (was && wasGrounded && onRamp(e)) {
            rampFrames++;
            assert.ok(e.onGround, `frame ${i}: 坂の上で空中に出た x=${e.x}`);
            assert.ok(Math.abs(e.y - y0) <= Math.abs(e.x - x0) + SLOPE_CLIMB_MARGIN + 1e-9,
                `frame ${i}: 上下 ${e.y - y0} 横 ${e.x - x0}`);
        }
    }
    assert.ok(rampFrames > 30, `坂の上にいたフレームが少ない: ${rampFrames}`);
    assert.ok(e.x >= 21 * T, `台地まで上れていない x=${e.x}`);
}));

test('坂の途中で AI が止まっても（vx 0）、下りへ滑っていく', () => seeded(() => {
    const game = world();
    const x = 15 * T;
    // 足の右の列（x + 14）の上面に立たせる
    const e = makeAttacker(game, x, rampSurface(x + 14) - 24, 'standard');
    e._updateMovement = function () { this.vx = 0; }; // AI の判断はこのテストの対象外。止まりたい、とだけ言わせる
    for (let i = 0; i < 10; i++) e.update();
    const x1 = e.x;
    let minVx = 0;
    for (let i = 0; i < 60; i++) { e.update(); minVx = Math.min(minVx, e.vx); }
    assert.ok(e.x < x1 - 8, `下り（左）へ滑っていない x ${x1} → ${e.x}`);
    // 坂のあいだ下りの速さが積み上がる（坂の下の平らな床に着けば止まる）
    assert.ok(minVx < -0.3, `下りの速さが積み上がっていない minVx=${minVx}`);
}));

test('坂を下る巡回は、前の床が下がっていても崖と見なして引き返さない', () => seeded(() => {
    const game = world();
    const e = makeAttacker(game, 22 * T, 10 * T - 24, 'standard');
    e.patrolDir = -1;
    e.facingRight = false;
    // 持ち場から離れすぎると AI が「戻る」に切り替わる。戻るかどうかはこのテストの対象外
    e._updateReturnState = function () { this.returning = false; };
    for (let i = 0; i < 5; i++) e.update();
    let minX = e.x;
    for (let i = 0; i < 1500 && e.x > 8 * T; i++) {
        e.update();
        minX = Math.min(minX, e.x);
    }
    assert.ok(minX <= 9 * T, `坂の下まで下りていない（引き返した？） minX=${minX}`);
    assert.equal(e.y + e.height, 20 * T);
}));

// 地上の上りは最高速が SLOPE_UPHILL_SCALE 倍（1px/フレーム未満）に落ちるので、足は毎フレーム
// 1px 以内しか坂にめり込まず、接地の 1px 探査が斜辺へ戻すだけで上れる。横の押し出しが要るのは
// 空中を速く動いて坂の側面に当たるとき（自機の同名のテストと同じ配置）
test('空中を速く動いて坂の側面へ当たると、止まらずに上へ逸れる', () => {
    const game = world();
    const x0 = 12 * T - 12, y0 = 18 * T - 2 - 24;
    const e = makeAttacker(game, x0, y0, 'standard');
    e.motion = SNOW.motionAt();
    e.onGround = false;
    e.vx = 2; e.vy = 0;
    assert.equal(collidesWithTerrain(e, game.map), false, '前提: 動く前は当たっていない');
    e._moveAndCollide();
    assert.equal(e.x, x0 + 2);
    assert.equal(e.vx, 2, '横の速さを失わない');
    assert.ok(e.y < y0, `上へ逸れていない y=${e.y}`);
    assert.equal(collidesWithTerrain(e, game.map), false);
});
