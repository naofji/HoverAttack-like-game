// 格納塔（壊すと中身が出る塔）と、中身の種類→アイテムの表。
// 設計: docs/superpowers/specs/2026-10-31-stage7-storage-towers-design.md
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnItem } from '../src/js/entities/itemKinds.js';
import { RepairKit } from '../src/js/entities/RepairKit.js';
import { OverdriveKit } from '../src/js/entities/OverdriveKit.js';
import { ExtraLifeKit } from '../src/js/entities/ExtraLifeKit.js';

before(() => {
  const noopCtx = new Proxy({}, { get: () => () => ({ addColorStop: () => {} }) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }) };
});

function itemGame() {
  return { repairKits: [], missileKits: [], lifeKits: [] };
}

// ---------- 中身の種類→アイテムの表 ----------

test('spawnItem は kind ごとに正しいクラスを正しい配列に入れる', () => {
  const cases = [
    ['overdrive', OverdriveKit, 'missileKits'],
    ['repair', RepairKit, 'repairKits'],
    ['life', ExtraLifeKit, 'lifeKits'],
  ];
  for (const [kind, cls, list] of cases) {
    const game = itemGame();
    const item = spawnItem(game, kind, 100, 50);
    assert.ok(item instanceof cls, `${kind} のクラスが違う`);
    assert.deepEqual(game[list], [item], `${kind} が ${list} に入っていない`);
    for (const other of ['repairKits', 'missileKits', 'lifeKits'].filter((l) => l !== list)) {
      assert.equal(game[other].length, 0, `${kind} が ${other} にも入った`);
    }
    // PickupItem と同じ座標の約束（x は中心、y は上端）
    assert.equal(item.x + item.width / 2, 100);
    assert.equal(item.y, 50);
  }
});

test('spawnItem は未知の kind で例外を投げる（黙ってリペアにしない）', () => {
  assert.throws(() => spawnItem(itemGame(), 'nope', 0, 0));
});
