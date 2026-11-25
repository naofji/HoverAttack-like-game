// entities/EnemyTurret.js は描画を entities/turret/draw.js の TurretDraw に置き、Object.assign で
// EnemyTurret.prototype へ混ぜている（2026-11-25）。class 本体に同名のメソッドがあると、Object.assign は
// 値だけ上書きして列挙不可のまま残す。どちらが効いているか分からなくなるので、重なりをここで縛る
// （tests/hud-mixins.test.js と同じ見方）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemyTurret } from '../src/js/entities/EnemyTurret.js';
import { TurretDraw } from '../src/js/entities/turret/draw.js';

test('砲台の描画の層が class 本体の同名メソッドと重なっていない', () => {
  for (const key of Object.keys(TurretDraw)) {
    const desc = Object.getOwnPropertyDescriptor(EnemyTurret.prototype, key);
    assert.ok(desc, `TurretDraw.${key} が EnemyTurret.prototype に無い`);
    assert.equal(desc.enumerable, true, `TurretDraw.${key} が EnemyTurret.js の class 本体の同名メソッドと重なっている`);
    assert.equal(desc.value, TurretDraw[key], `TurretDraw.${key} が後から別のもので上書きされている`);
    assert.equal(typeof desc.value, 'function', `TurretDraw.${key} が関数でない`);
  }
});
