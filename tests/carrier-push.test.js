// 自機で母艦を横から押せることのテスト（2026-10-31、ユーザーの要望）。
// 母艦が敵の射線に入っているのに、ドッキングする間が無いとき、押して横へずらしたい。
// 決めたこと: 自機の左右の入力で母艦の側面へ進んでいるときだけ押す（被弾で飛ばされてぶつかっても押さない）。
// 速さは自機の半分（ユーザー指定。下から持ち上げるときと同じ「母艦は重い」扱い）。離すと摩擦で滑って止まる。
// 本物の自機と母艦を、main.js と同じ順（母艦 → 自機）で更新する
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { Carrier } from '../src/js/entities/Carrier.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { collidesWithTerrain } from '../src/js/utils/Physics.js';
import { applyKnockback } from '../src/js/utils/Knockback.js';
import {
    TILE_SIZE as T, PLAYER_MAX_SPEED, CARRIER_PUSH_SPEED_SCALE, MISSILE_HIT_KNOCKBACK_VX, MISSILE_HIT_KNOCKBACK_VY,
} from '../src/js/utils/Constants.js';

/** 幅 40・高さ 24。床は row 20。wallFrom を渡すとその列から右が壁 */
function rows(wallFrom = 99) {
    const out = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 40; c++) s += (r >= 20 || c >= wallFrom || c === 0) ? '#' : '.';
        out.push(s);
    }
    return out;
}

function world(wallFrom) {
    const game = makeGame(makeMap(rows(wallFrom)));
    game.camera = { x: 0, y: 0, shake() {} };
    game.canvas = { width: 1024, height: 768 };
    const held = new Set();
    game.held = held;
    game.input = {
        keys: {}, isKeyDown: (c) => held.has(c), isKeyPressed: () => false, isCharPressed: () => false,
        mouse: { left: false, right: false }, isLeftClickPressed: () => false, isRightClickPressed: () => false,
        rightHoldFrames: 0, crosshairLocked: false, getMouseWorld: () => ({ x: 0, y: 0 }), getTargetWorld: () => ({ x: 0, y: 0 }),
    };
    return game;
}

/** 床の上に母艦、その左（dir=1）か右（dir=-1）に自機を接して置く */
function setUp(dir, wallFrom) {
    const game = world(wallFrom);
    const c = new Carrier(game, 15 * T, 20 * T - 32);
    game.carrier = c;
    const p = new Player(game, 0, 0);
    game.player = p;
    p.x = dir > 0 ? c.x - p.width : c.x + c.width;
    p.y = 20 * T - p.height;
    // 1フレーム回して床に落ち着かせる
    step(game);
    return { game, c, p };
}

function step(game) {
    game.carrier.update();
    game.player.update();
}

for (const dir of [1, -1]) {
    const key = dir > 0 ? 'KeyD' : 'KeyA';
    const side = dir > 0 ? '右' : '左';

    test(`${side}へ押すと、母艦は自機の半分の速さで${side}へ動き、自機は母艦の縁で一緒に進む`, () => {
        const { game, c, p } = setUp(dir);
        game.held.add(key);
        for (let f = 0; f < 20; f++) step(game);   // 押し始めの立ち上がりを過ぎるまで
        const c0 = c.x;
        const frames = 60;
        for (let f = 0; f < frames; f++) step(game);
        const speed = (c.x - c0) / frames;
        assert.ok(Math.abs(speed - dir * PLAYER_MAX_SPEED * CARRIER_PUSH_SPEED_SCALE) < 0.01,
            `母艦の速さ ${speed}（期待 ${dir * PLAYER_MAX_SPEED * CARRIER_PUSH_SPEED_SCALE}）`);
        // 自機は母艦の押している側の縁に接したまま（すり抜けない・離れない）
        const gap = dir > 0 ? c.x - (p.x + p.width) : p.x - (c.x + c.width);
        assert.ok(gap >= -0.01 && gap < 2, `自機と母艦のすき間 ${gap}`);
    });

    test(`${side}へ押すのをやめると、母艦は少し滑ってから止まる`, () => {
        const { game, c } = setUp(dir);
        game.held.add(key);
        for (let f = 0; f < 40; f++) step(game);
        game.held.clear();
        const c0 = c.x;
        for (let f = 0; f < 60; f++) step(game);
        assert.equal(c.vx, 0, '止まっていない');
        assert.ok(dir * (c.x - c0) > 0.5, `滑っていない: ${c.x - c0}`);
    });
}

test('入力なしで（被弾で飛ばされて）ぶつかっても、母艦は動かない', () => {
    // ゲームと同じくノックバックは上向き＋横向きの速さ（敵ミサイルの被弾）。地上で横の速さだけ与えると、
    // 入力が無いと次のフレームで 0 になって母艦に届かない（それでは「押さない」を確かめられない）
    const { game, c, p } = setUp(1);
    p.x -= 4;
    const c0 = c.x;
    applyKnockback(p, 1, MISSILE_HIT_KNOCKBACK_VY, MISSILE_HIT_KNOCKBACK_VX);   // 右（母艦の方）へ飛ばす
    p.onGround = false;   // 飛ばされて宙にいる（接地のままだと最初のフレームで地上の摩擦が横の速さを消す）
    let touched = false;
    for (let f = 0; f < 30; f++) {
        step(game);
        if (p.x + p.width >= c.x - 0.01) touched = true;
    }
    assert.ok(touched, '前提: 母艦にぶつかっている');
    assert.equal(c.x, c0);
});

test('母艦は壁で止まり、母艦も自機も岩に入らない', () => {
    // 列 22 から右が壁（x = 352）。母艦の右の縁は 15T + 64 = 304 なので、48px 押すと壁
    const { game, c, p } = setUp(1, 22);
    game.held.add('KeyD');
    for (let f = 0; f < 200; f++) {
        step(game);
        assert.equal(collidesWithTerrain(c, game.map, c._slopePoints(c)), false, `母艦が岩の中 f=${f} (${c.x})`);
        assert.equal(collidesWithTerrain(p, game.map), false, `自機が岩の中 f=${f} (${p.x})`);
    }
    // 母艦の当たりの点も縁より内側にあるので、ドッキングして操縦したときと同じく縁が壁に 2px 弱入って止まる
    assert.ok(c.x + c.width > 22 * T - 3 && c.x + c.width < 22 * T + 2, `壁で止まっていない: 右の縁 ${c.x + c.width}`);
});

test('ホバー中でも横から押せる', () => {
    // 母艦を床から浮かせた高さには置けない（落ちる）ので、自機を母艦の側面の高さで浮かせて押す
    const { game, c, p } = setUp(1);
    game.held.add('KeyD');
    game.held.add('KeyW');
    const c0 = c.x;
    for (let f = 0; f < 40; f++) {
        p.hoverFuel = 100;
        step(game);
    }
    // 自機が母艦の側面より上へ抜けたら押せていないので、押せた距離で見る
    assert.ok(c.x - c0 > 5, `動いていない: ${c.x - c0}`);
});

test('ドッキング中は今までどおり A/D で母艦を操縦する（押す処理は割り込まない）', () => {
    const { game, c, p } = setUp(1);
    p.docked = true;
    game.held.add('KeyD');
    for (let f = 0; f < 60; f++) step(game);
    // ドッキング中の最高速は CARRIER_SPEED の積み上げで約 1.82。押す速さ 0.875 に縛られていない
    assert.ok(c.vx > 1.5, `ドッキング中の速さ ${c.vx}`);
});
