import test from 'node:test';
import assert from 'node:assert';

import { centerOf } from '../src/js/utils/Physics.js';
import { EnemyCruiseMissile } from '../src/js/entities/EnemyCruiseMissile.js';
import { BaseLaser } from '../src/js/entities/BaseLaser.js';
import { EnemyBullet } from '../src/js/entities/EnemyBullet.js';

/**
 * この作りには x,y の約束が2通りある（左上基準と中心基準）。
 * 見分けが付かないまま一律に width/2 を足すと、巡航ミサイルで12px、
 * 基地レーザー(width=100)では50pxも実際と違う場所を測ってしまう。
 * 近接警報がこれを踏みかけたので、約束をテストで固定する。
 */

const fakeGame = { map: { width: 9999, height: 9999 } };

test('左上基準の機体は width/height の半分だけ内側が中心', () => {
    assert.deepStrictEqual(
        centerOf({ x: 300, y: 200, width: 24, height: 24 }),
        { x: 312, y: 212 },
    );
});

test('大きさを持たないものは x,y がそのまま中心', () => {
    assert.deepStrictEqual(centerOf({ x: 50, y: 60 }), { x: 50, y: 60 });
});

test('巡航ミサイルは x,y が中心（width=24 を足してはいけない）', () => {
    const m = new EnemyCruiseMissile(fakeGame, 300, 200, 0);
    assert.strictEqual(m.originIsCenter, true);
    assert.deepStrictEqual(centerOf(m), { x: 300, y: 200 });
});

test('基地レーザーは x,y が中心（width=100 を足すと50pxずれる）', () => {
    const laser = new BaseLaser(fakeGame, 300, 200, 0);
    assert.strictEqual(laser.originIsCenter, true);
    assert.deepStrictEqual(centerOf(laser), { x: 300, y: 200 });
});

test('通常の敵弾は大きさを持たないので x,y のまま', () => {
    const b = new EnemyBullet(fakeGame, 300, 200, 0);
    assert.deepStrictEqual(centerOf(b), { x: 300, y: 200 });
});

test('中心基準のものは width が変わっても中心が動かない', () => {
    // width を「見た目の広がり」として後から調整しても、
    // 当たり判定や警報の距離が釣られて動かないことを保証する
    const m = new EnemyCruiseMissile(fakeGame, 300, 200, 0);
    const before = centerOf(m);
    m.width = 999;
    m.height = 999;
    assert.deepStrictEqual(centerOf(m), before);
});
