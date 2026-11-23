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
    RIVAL_AFTERIMAGE_SPEED, RIVAL_AFTERIMAGE_INTERVAL, RIVAL_ALIGN_TRIGGER_FRAMES,
    ENEMY_ATTACKER_TYPES, ROLLER_SPARK_COUNT, ROLLER_SPARK_STOP_COUNT,
} from '../src/js/utils/Constants.js';
import { SpawnEffects } from '../src/js/systems/SpawnEffects.js';

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

test('滑走中の残像が本体の陰から見える間隔で並ぶ', () => {
    // 2.4px/frame のときは間隔 4.8px で、手前の残像が幅16pxの本体にほぼ隠れて
    // 「残像が出ていない」と見えた（実機の指摘 2026-11-22）。見えていた回避ダッシュの
    // 初速 3.6 の間隔（7.2px）以上を求める
    assert.ok(ROLLER_SPEED > RIVAL_AFTERIMAGE_SPEED);
    assert.ok(ROLLER_SPEED * RIVAL_AFTERIMAGE_INTERVAL >= 7,
        `残像の間隔 ${(ROLLER_SPEED * RIVAL_AFTERIMAGE_INTERVAL).toFixed(1)}px が狭い`);
});

test('上り坂でも残像のしきい値を超える速さで滑る', () => {
    const uphill = ROLLER_SPEED * SLOPE_UPHILL_SCALE - SLOPE_DOWNHILL_ACCEL;
    assert.ok(uphill > RIVAL_AFTERIMAGE_SPEED, `上り坂で ${uphill.toFixed(2)}px/frame`);
});

test('速さを上げても、滑る距離はおよそ 60〜135px のまま（距離を取りすぎない）', () => {
    // 加速・減速はどちらも線形なので、その区間の距離は ROLLER_SPEED × フレーム数 / 2
    const ramp = ROLLER_SPEED * (ROLLER_ACCEL_FRAMES + ROLLER_STOP_FRAMES) / 2;
    const min = ramp + ROLLER_SPEED * ROLLER_GLIDE_FRAMES_MIN;
    const max = ramp + ROLLER_SPEED * ROLLER_GLIDE_FRAMES_MAX;
    assert.ok(min >= 55 && min <= 75, `最短 ${min.toFixed(0)}px`);
    assert.ok(max >= 125 && max <= 145, `最長 ${max.toFixed(0)}px`);
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

test('雪・氷の床でも一気に速さが乗り、止まるときも流れない（床の滑りを通さない）', () => {
    // _applyGroundSlide を直接呼ぶ（tests/enemy-snow-slide.test.js と同じ形）。
    // 床の滑りは自機と同じ規則で、動きたい向きがあれば目標がそのまま出て、目標 0 のときだけ
    // 惰性で流れる（2026-11-23 に update() の順序を直したときに揃えた）。滑走が床を通さない差は
    // 目標 0 のフレーム＝急停止の終わりに出る
    const { e } = world(undefined, { env: SNOW });
    e._tryStartRollerDash(40);
    e.vx = 0;
    e._applyGroundSlide(ROLLER_SPEED);
    assert.equal(e.vx, ROLLER_SPEED);
    e._applyGroundSlide(0);
    assert.equal(e.vx, 0, '滑走中なのに止まるときに流れた');

    // 差が出る fixture であることの確認: 滑走していなければ同じ床で目標 0 でも流れる
    const { e: walker } = world(undefined, { env: SNOW });
    walker.vx = ROLLER_SPEED;
    walker._applyGroundSlide(0);
    assert.ok(Math.abs(walker.vx) > ROLLER_SPEED * 0.5, `滑走していない vx ${walker.vx} が滑っていない`);
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

// --- 火花（Task 4）---

/** game.spawnRollerSparks の呼び出しを記録する */
function spySparks(game) {
    const calls = [];
    game.spawnRollerSparks = (x, y, count, dir) => calls.push({ x, y, count, dir, phase: null });
    return calls;
}

test('滑走中は数フレームおきに後ろ向きの火花が出る', () => {
    const { game, e } = world();
    const calls = spySparks(game);
    withRandom(0, () => {
        e._tryStartRollerDash(40);
        while (e.isRollerDashing() && e.rollerPhase !== 'stop') e._updateRollerDash();
    });
    // 最後の1回は stop 相に入った呼び出しの急停止の火花なので除く
    const rolling = calls.slice(0, -1);
    assert.equal(calls.at(-1).count, ROLLER_SPARK_STOP_COUNT);
    assert.ok(rolling.length >= 3, `火花が少ない: ${rolling.length}`);
    for (const c of rolling) {
        assert.equal(c.count, ROLLER_SPARK_COUNT);
        assert.equal(c.dir, -e.rollerDir, '火花が進む向きに飛んでいる');
    }
});

test('急停止の瞬間にまとめて火花が出る', () => {
    const { game, e } = world();
    const calls = spySparks(game);
    withRandom(0, () => {
        e._tryStartRollerDash(40);
        while (e.isRollerDashing()) e._updateRollerDash();
    });
    assert.equal(calls.filter((c) => c.count === ROLLER_SPARK_STOP_COUNT).length, 1);
});

test('壁で終わったときは急停止の火花が出ない', () => seeded(() => {
    const rows = flatFloorRows().map((s, r) => (r < 20 ? s.slice(0, 8) + '#' + s.slice(9) : s));
    const { game, e } = world(rows, { x: 170 });
    const calls = spySparks(game);
    e._tryStartRollerDash(40);
    for (let i = 0; i < 200 && e.isRollerDashing(); i++) e.update();
    assert.ok(calls.length > 0, '前提: 滑走中の火花は出ている');
    assert.equal(calls.filter((c) => c.count === ROLLER_SPARK_STOP_COUNT).length, 0);
}));

test('雪の床では火花を出さない（雪煙が代わり）', () => {
    const { game, e } = world(undefined, { env: SNOW });
    const calls = spySparks(game);
    withRandom(0, () => {
        e._tryStartRollerDash(40);
        while (e.isRollerDashing()) e._updateRollerDash();
    });
    assert.equal(calls.length, 0);
});

test('spawnRollerSparks は指定した数の粒を、指定した向きに飛ばす', () => {
    const game = { particles: [] };
    SpawnEffects.spawnRollerSparks.call(game, 0, 0, 5, -1);
    assert.equal(game.particles.length, 5);
    for (const p of game.particles) assert.ok(p.vx < 0, `vx=${p.vx}`);
});

// --- 壁以外に止められたとき（最終レビューの指摘）---
// 崖のふちの踏みとどまり（collision.js）と機体どうしの当たり（_checkHorizontalEntities）は
// vx を 0 にするだけで _reactToWall を通らない。そこで止まったまま glide を続けないこと

test('崖のふちで止められたら、その場で終わる', () => seeded(() => {
    // 背後 1タイル先（列12）には床があるので始まるが、3タイル先（列10）から左は崖
    const rows = flatFloorRows().map((s, r) => (r >= 20 ? '.'.repeat(11) + s.slice(11) : s));
    const { e } = world(rows);
    assert.equal(e._tryStartRollerDash(40), true);
    let stuck = 0;
    for (let i = 0; i < 120 && e.isRollerDashing(); i++) {
        const x0 = e.x;
        e.update();
        if (e.isRollerDashing() && Math.abs(e.x - x0) < 1e-9) stuck++;
    }
    assert.equal(e.isRollerDashing(), false, '滑走が終わっていない');
    assert.ok(stuck <= 1, `止まったまま ${stuck} フレーム滑走を続けた`);
}));

test('真後ろの機体に止められたら、その場で終わる', () => seeded(() => {
    const { game, e } = world();
    // rival（x=200）の左に heavy を置いて塞ぐ
    const blocker = makeAttacker(game, 170, FLOOR_Y - 24, 'heavy');
    blocker.update = () => {};
    assert.equal(e._tryStartRollerDash(40), true);
    let stuck = 0;
    for (let i = 0; i < 120 && e.isRollerDashing(); i++) {
        const x0 = e.x;
        e.update();
        if (e.isRollerDashing() && Math.abs(e.x - x0) < 1e-9) stuck++;
    }
    assert.equal(e.isRollerDashing(), false, '滑走が終わっていない');
    assert.ok(stuck <= 1, `止まったまま ${stuck} フレーム滑走を続けた`);
}));
