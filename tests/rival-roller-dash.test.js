// rival のローラーダッシュ（設計: docs/superpowers/specs/2026-11-22-rival-roller-dash-design.md）
//
// 近づかれた rival が、自機から離れる向きへ高速で滑り、撃ちながら下がり、急停止する。
// 縛るのは
//   - 始める条件（接地・近すぎ・クールダウン・回避中でない・背後に床）
//   - 速さの形（一気に乗る → 一定 → 急停止）と、止まる位置が乱数でばらつくこと
//   - 滑走中は跳ばない・回避しない・でも撃つ
//   - 途中で終わる4条件（壁・落下・反動・追跡をやめた）
//   - 雪の床と上り坂で失速しないこと
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMap, makeGame, makeAttacker, flatFloorRows } from './helpers/enemy-world.js';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
    TILE_SIZE as T, ICE_SLIDE, SLOPE_UPHILL_SCALE, SLOPE_DOWNHILL_ACCEL,
    ROLLER_SPEED, ROLLER_ACCEL_FRAMES, ROLLER_GLIDE_FRAMES_MIN, ROLLER_GLIDE_FRAMES_MAX,
    ROLLER_STOP_FRAMES, ROLLER_COOLDOWN,
    RIVAL_AFTERIMAGE_SPEED, RIVAL_DASH_MULT, RIVAL_ALIGN_TRIGGER_FRAMES,
    ENEMY_ATTACKER_TYPES,
} from '../src/js/utils/Constants.js';

const SNOW = { motionAt: () => ({ speed: 1, gravity: 1, slide: ICE_SLIDE }), sightScale: 1, kind: 'snow' };
const FLOOR_Y = 20 * T;

/** Math.random を固定して fn を走らせる（滑る長さを決め打ちにする） */
function withRandom(value, fn) {
    const orig = Math.random;
    Math.random = typeof value === 'function' ? value : () => value;
    try { return fn(); } finally { Math.random = orig; }
}
function seeded(fn) {
    const rng = new SeededRNG(11);
    return withRandom(() => rng.next(), fn);
}

/** 床の上に rival を立たせ、自機をその右 offset px に置く */
function world(rows = flatFloorRows(), { x = 200, offset = 40, type = 'rival', env = null } = {}) {
    const game = makeGame(makeMap(rows));
    game.env = env;
    const e = makeAttacker(game, x, FLOOR_Y - 24, type);
    e.onGround = true;
    e.onTerrain = true;
    e.aiState = 'chase';
    game.player = { x: x + offset, y: FLOOR_Y - 24, width: 16, height: 24, alive: true, docked: false };
    return { game, e };
}

/** 始めてから終わるまで _updateRollerDash だけを回し、各フレームの |vx| を返す（始めたフレームを含む） */
function runProfile(e) {
    const speeds = [Math.abs(e.vx)];
    // 終わった後に呼ぶとクールダウンが1つ進むので、滑走中のあいだだけ回す
    for (let i = 0; i < 500 && e.isRollerDashing(); i++) { e._updateRollerDash(); speeds.push(Math.abs(e.vx)); }
    return speeds;
}

test('近づかれると自機から離れる向きに滑り始める', () => {
    const { e } = world();
    assert.equal(e._tryStartRollerDash(40), true);
    assert.equal(e.rollerDir, -1);
    assert.equal(e.rollerPhase, 'accel');
    assert.equal(e.isRollerDashing(), true);
});

test('始めない: 空中', () => {
    const { e } = world();
    e.onGround = false;
    assert.equal(e._tryStartRollerDash(40), false);
});

test('始めない: クールダウン中', () => {
    const { e } = world();
    e.rollerCooldown = 10;
    assert.equal(e._tryStartRollerDash(40), false);
});

test('始めない: 回避中', () => {
    const { e } = world();
    e.evadeTimer = 5;
    assert.equal(e._tryStartRollerDash(40), false);
});

test('始めない: 背後（逃げる側）に床が無い', () => {
    // rival の中心は x=208。左へ逃げるので 1タイル先の x=192（列12）の床を抜く
    const rows = flatFloorRows().map((s, r) => (r >= 20 ? s.slice(0, 12) + '.' + s.slice(13) : s));
    const { e } = world(rows);
    assert.equal(e._tryStartRollerDash(40), false);
    // 逆側（右へ逃げる）なら床があるので始まる＝床の確認が向きを見ていること
    assert.equal(e._tryStartRollerDash(-40), true);
});

test('始めない: rollerDash の無い型（heavy）', () => {
    const { e } = world(undefined, { type: 'heavy' });
    assert.equal(e._tryStartRollerDash(40), false);
    assert.equal(ENEMY_ATTACKER_TYPES.rival.rollerDash, true);
});

test('速さは accel で線形に上がり、glide で ROLLER_SPEED、stop で 0 へ落ちる', () => {
    const { e } = world();
    const speeds = withRandom(0, () => { e._tryStartRollerDash(40); return runProfile(e); });
    const A = ROLLER_ACCEL_FRAMES, G = ROLLER_GLIDE_FRAMES_MIN, S = ROLLER_STOP_FRAMES;
    assert.equal(speeds.length, A + G + S);
    for (let k = 0; k < A; k++) {
        assert.ok(Math.abs(speeds[k] - ROLLER_SPEED * (k + 1) / A) < 1e-9, `accel ${k}: ${speeds[k]}`);
    }
    for (let k = A; k < A + G; k++) assert.equal(speeds[k], ROLLER_SPEED, `glide ${k}`);
    for (let k = A + G + 1; k < A + G + S; k++) assert.ok(speeds[k] < speeds[k - 1], `stop ${k} が減っていない`);
    assert.equal(speeds[A + G + S - 1], 0);
    assert.equal(e.isRollerDashing(), false);
    assert.equal(e.rollerCooldown, ROLLER_COOLDOWN);
});

test('滑る長さは乱数で MIN..MAX に散る（止まる位置が読めない）', () => {
    const lengths = [0, 0.9999].map((r) => {
        const { e } = world();
        return withRandom(r, () => { e._tryStartRollerDash(40); return runProfile(e).length; });
    });
    const fixed = ROLLER_ACCEL_FRAMES + ROLLER_STOP_FRAMES;
    assert.deepEqual(lengths, [fixed + ROLLER_GLIDE_FRAMES_MIN, fixed + ROLLER_GLIDE_FRAMES_MAX]);
});

test('滑る速さは残像の尾が出る速さで、回避ダッシュの初速よりは遅い', () => {
    // 設計上の主張: 滑走中は尾が出る（しきい値超え）が、「消える」回避ダッシュとは区別がつく
    assert.ok(ROLLER_SPEED > RIVAL_AFTERIMAGE_SPEED);
    assert.ok(ROLLER_SPEED < ENEMY_ATTACKER_TYPES.rival.speed * RIVAL_DASH_MULT);
});

test('update() で近づくと滑り始める（zigzag の近すぎる分岐から呼ばれている）', () => seeded(() => {
    const { e } = world();
    e.update();
    assert.equal(e.isRollerDashing(), true);
}));

test('滑走中は update() を回しても跳ばず、回避も始まらない', () => seeded(() => {
    const { e } = world();
    e._tryStartRollerDash(40);
    // 軸合わせが溜まっていても回避に入らない（ローラーダッシュが優先）
    e.alignYFrames = RIVAL_ALIGN_TRIGGER_FRAMES + 1;
    for (let i = 0; i < 200 && e.isRollerDashing(); i++) {
        e.update();
        assert.equal(e.jumpCooldown, 0, `frame ${i}: 跳んだ`);
        assert.equal(e.evadeTimer, 0, `frame ${i}: 回避が始まった`);
    }
}));

test('滑走中も撃つ', () => seeded(() => {
    const { e } = world();
    e.config = { ...e.config, fireInterval: 10 };
    e.fireTimer = 1;
    let fired = 0;
    e._fire = () => { fired++; };
    e._tryStartRollerDash(40);
    let rollingFrames = 0;
    for (let i = 0; i < 200 && e.isRollerDashing(); i++) { e.update(); rollingFrames++; }
    assert.ok(rollingFrames > 20, `滑走が短すぎる: ${rollingFrames}`);
    assert.ok(fired > 0, '滑走中に1発も撃っていない');
}));

test('壁に当たると跳ばずにその場で終わる', () => seeded(() => {
    // 列 8 に天井まで届く壁。rival は x=170 から左へ滑る
    const rows = flatFloorRows().map((s, r) => (r < 20 ? s.slice(0, 8) + '#' + s.slice(9) : s));
    const { e } = world(rows, { x: 170 });
    e._tryStartRollerDash(40);
    let i = 0;
    for (; i < 200 && e.isRollerDashing(); i++) e.update();
    assert.equal(e.isRollerDashing(), false);
    assert.ok(e.x < 9 * T + 2, `壁まで届いていない x=${e.x}`);
    assert.equal(e.jumpCooldown, 0, '壁で跳んだ');
    assert.equal(e.rollerCooldown, ROLLER_COOLDOWN, 'クールダウンが掛かっていない');
}));

test('足が地面を離れたら終わり、vx はそのまま持ち越す', () => {
    const { e } = world();
    e._tryStartRollerDash(40);
    for (let i = 0; i < 10; i++) e._updateRollerDash();
    const vx = e.vx;
    e.onGround = false;
    assert.equal(e._updateRollerDash(), false);
    assert.equal(e.vx, vx);
    assert.equal(e.isRollerDashing(), false);
    assert.equal(e.rollerCooldown, ROLLER_COOLDOWN);
});

test('反動が入ったら終わる', () => seeded(() => {
    const { e } = world();
    e._tryStartRollerDash(40);
    e.recoilTimer = 5;
    e.update();
    assert.equal(e.isRollerDashing(), false);
}));

test('追跡をやめたら終わる', () => seeded(() => {
    const { game, e } = world();
    e._tryStartRollerDash(40);
    game.player.x = 100000;
    e.update();
    assert.equal(e.isRollerDashing(), false);
}));

test('雪・氷の床でも一気に速さが乗る（床の滑りを通さない）', () => {
    // _applyGroundSlide を直接呼ぶ（tests/enemy-snow-slide.test.js と同じ形）。
    // update() 経由だと、AI が this.vx を書いた後に this.vx を目標として渡すので、
    // 前の速さと目標が同じ値になって滑りの差が出ない（既存の作り。2026-11-22 に気づいた）
    const { e } = world(undefined, { env: SNOW });
    e._tryStartRollerDash(40);
    e.vx = 0;
    e._applyGroundSlide(ROLLER_SPEED);
    assert.equal(e.vx, ROLLER_SPEED);

    // 差が出る fixture であることの確認: 滑走していなければ同じ床で一発では届かない
    const { e: walker } = world(undefined, { env: SNOW });
    walker.vx = 0;
    walker._applyGroundSlide(ROLLER_SPEED);
    assert.ok(Math.abs(walker.vx) < ROLLER_SPEED * 0.9, `滑走していない vx ${walker.vx} が滑っていない`);
});

test('上り坂でも滑走の速さ × SLOPE_UPHILL_SCALE まで出る（歩きの上限で失速しない）', () => seeded(() => {
    // tests/attacker-slope.test.js と同じ坂（列 10〜19 が右へ上る、上面 y = 30T − x）
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
    const game = makeGame(makeMap(rows, null, { tileShape: 'snowSlope' }));
    game.env = SNOW;
    const x = 12 * T;
    const e = makeAttacker(game, x, 30 * T - (x + 14) - 24, 'rival');
    for (let i = 0; i < 3; i++) { e.aiState = 'patrol'; e._moveAndCollide(); }
    // 自機は坂の下（左）。rival は右＝上りへ逃げる
    game.player = { x: e.x - 40, y: e.y, width: 16, height: 24, alive: true, docked: false };
    e.onGround = true; e.onTerrain = true; e.aiState = 'chase';
    assert.equal(e._tryStartRollerDash(40 * -1), true);
    const glide = [];
    for (let i = 0; i < 40 && e.isRollerDashing(); i++) {
        e.update();
        if (e.rollerPhase === 'glide' && e.slopeDir !== 0) glide.push(Math.abs(e.vx));
    }
    assert.ok(glide.length > 0, '坂の上で滑っていない');
    const expected = ROLLER_SPEED * SLOPE_UPHILL_SCALE - SLOPE_DOWNHILL_ACCEL;
    for (const v of glide) assert.ok(Math.abs(v - expected) < 0.02, `上りの vx ${v}（期待 ${expected}）`);
    assert.ok(expected > e.maxSpeed * SLOPE_UPHILL_SCALE + 0.3, '前提: 歩きの上限より速いこと');
}));
