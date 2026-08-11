import { test } from 'node:test';
import assert from 'node:assert/strict';

import { avoidObstacle } from '../src/js/utils/obstacleAvoidance.js';
import { EnemyHomingMissile } from '../src/js/entities/EnemyHomingMissile.js';
import { EnemyCruiseMissile } from '../src/js/entities/EnemyCruiseMissile.js';

/**
 * 誘導ミサイルと巡航ミサイルの障害物回避。
 *
 * 以前は同じ制御構造を2つのクラスがそれぞれ持っていた。数値だけが違い、
 * しかも「片側回避」と「行き止まり」で効き具合が別（誘導は行き止まりの
 * ほうが強く、巡航は逆に弱い）という、写した側が気づきにくい差があった。
 * 構造を1本にしたので、その差が保たれていることをここで縛る。
 */

/** 壁の当たり方を関数で与える簡易マップ。 */
const mapWith = (solid) => ({ isSolidAtPixel: solid, width: 4000, height: 4000 });

const NO_WALL = mapWith(() => false);
const ALL_WALL = mapWith(() => true);

const BASE = { x: 100, y: 100, angle: 0, lookAhead: 40,
    sideDrift: 0.15, sideTurn: 0.05, deadEndDrift: 0.2 };

test('前方が空いていれば何もしない', () => {
    const r = avoidObstacle({ ...BASE, map: NO_WALL });
    assert.deepEqual(r, { driftAngle: 0, turn: 0 });
});

// 進行方向は +x なので、正面は (140,100)、左斜め前は y が小さいほう
// (128,72)、右斜め前は y が大きいほう (128,128) を見る。
// 正面が塞がっていないと回避そのものが起きないので、壁は正面を含める。

test('左が塞がっていれば右へ逃げる', () => {
    const map = mapWith((x, y) => y <= 100);   // 正面と左だけ壁
    const r = avoidObstacle({ ...BASE, map });
    assert.equal(r.driftAngle, 0.15, '右向き（正）に傾くこと');
    assert.equal(r.turn, 0.05);
});

test('右が塞がっていれば左へ逃げる（符号が反転する）', () => {
    const map = mapWith((x, y) => y >= 100);   // 正面と右だけ壁
    const r = avoidObstacle({ ...BASE, map });
    assert.equal(r.driftAngle, -0.15);
    assert.equal(r.turn, -0.05);
});

test('行き止まりでは片側回避と別の（より強い）値で振る', () => {
    const r = avoidObstacle({ ...BASE, map: ALL_WALL, x: 100 });
    assert.equal(r.driftAngle, 0.2, '行き止まりは deadEndDrift');
    assert.equal(r.turn, 0.1, '進路の曲げは傾きの半分');
    assert.notEqual(Math.abs(r.driftAngle), Math.abs(BASE.sideDrift),
        '片側回避と同じ値になってしまっている');
});

test('行き止まりの逃げる向きは位置で決まる（同じ場所なら同じ判断）', () => {
    const even = avoidObstacle({ ...BASE, map: ALL_WALL, x: 100 });
    const odd = avoidObstacle({ ...BASE, map: ALL_WALL, x: 101 });
    assert.equal(even.driftAngle, 0.2);
    assert.equal(odd.driftAngle, -0.2, '隣の座標では逆へ振れること');

    // 同じ座標を何度呼んでも同じ（乱数を使っていない＝毎フレーム震えない）
    for (let i = 0; i < 5; i++) {
        assert.equal(avoidObstacle({ ...BASE, map: ALL_WALL, x: 100 }).driftAngle, 0.2);
    }
});

test('見通し距離より遠い壁は見えない', () => {
    const map = mapWith((x) => x > 200);
    assert.deepEqual(
        avoidObstacle({ ...BASE, map, lookAhead: 40 }),
        { driftAngle: 0, turn: 0 },
        '40px 先には壁が無いのに反応している',
    );
    assert.notEqual(
        avoidObstacle({ ...BASE, map, lookAhead: 150 }).driftAngle, 0,
        '150px 先の壁を見落としている',
    );
});

// --- 機種ごとの性格 ---

function makeMissile(Cls, opts = {}) {
    const game = { map: ALL_WALL, player: null, carrier: null, particles: [] };
    const m = new Cls(game, 100, 100, 0, opts.path ?? undefined);
    m.homingActive = opts.homingActive ?? false;
    m.driftAngle = 0;
    return m;
}

test('誘導ミサイル: 終末誘導に入ると進路を変えず傾くだけ', () => {
    const cruising = makeMissile(EnemyHomingMissile);
    const angleBefore = cruising.angle;
    cruising._avoidObstacles();
    assert.notEqual(cruising.angle, angleBefore, '巡航中は進路も曲がるはず');

    const homing = makeMissile(EnemyHomingMissile, { homingActive: true });
    const homingAngleBefore = homing.angle;
    homing._avoidObstacles();
    assert.equal(homing.angle, homingAngleBefore, '終末誘導中に進路が曲がっている');
    assert.notEqual(homing.driftAngle, 0, '傾きは付くはず');
});

test('巡航ミサイル: 経路を辿っている間は進路を変えない', () => {
    const free = makeMissile(EnemyCruiseMissile);
    const freeAngle = free.angle;
    free._avoidObstacles();
    assert.notEqual(free.angle, freeAngle, '経路が無ければ進路も曲がるはず');

    const onPath = makeMissile(EnemyCruiseMissile, { path: [{ x: 0, y: 0 }, { x: 500, y: 100 }] });
    const pathAngle = onPath.angle;
    onPath._avoidObstacles();
    assert.equal(onPath.angle, pathAngle, '経路追従中に進路が曲がっている');
    assert.notEqual(onPath.driftAngle, 0, '傾きは付くはず');
});

test('2機種で回避の強さが違う（誘導のほうが大きく振る）', () => {
    const homing = makeMissile(EnemyHomingMissile);
    const cruise = makeMissile(EnemyCruiseMissile);
    homing._avoidObstacles();
    cruise._avoidObstacles();
    assert.equal(Math.abs(homing.driftAngle), 0.2);
    assert.equal(Math.abs(cruise.driftAngle), 0.1);
});
