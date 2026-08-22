// リペアキットは拾った瞬間に自機も少し治す。
// キット自体は手元に残るので、母艦の修理は今までどおり効く。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { RepairKit, REPAIR_KIT_HEAL } from '../src/js/entities/RepairKit.js';
import { makeMap, flatFloorRows } from './helpers/enemy-world.js';
import { PLAYER_MAX_HP, REPAIR_KIT_PLAYER_HEAL } from '../src/js/utils/Constants.js';

function makeGame() {
  return {
    map: makeMap(flatFloorRows()),
    particles: [], projectiles: [], enemies: [], enemyBullets: [], repairKits: [],
    camera: { x: 0, y: 0 }, canvas: { width: 1024, height: 768 },
    input: {
      mouse: { x: 0, y: 0, left: false },
      isKeyDown: () => false, isKeyPressed: () => false,
      getTargetWorld: () => ({ x: 0, y: 0 }), crosshairLocked: false,
    },
    spawnExplosion() { }, spawnHeavyDamage() { }, spawnSparks() { },
    spawnDebris() { }, addScore() { }, spawnSmokeScreen() { },
  };
}

function makePlayer(hp) {
  const p = new Player(makeGame(), 100, 100);
  p.hp = hp;
  return p;
}

test('自機の回復量は控えめ（母艦の回復量より小さい）', () => {
  assert.equal(REPAIR_KIT_PLAYER_HEAL, 30);
  assert.ok(REPAIR_KIT_PLAYER_HEAL < REPAIR_KIT_HEAL,
    '自機の回復が母艦以上だと、持ち帰る意味が薄れる');
});

test('リペアキットを拾うと自機が回復する', () => {
  const p = makePlayer(40);
  new RepairKit(p.game, 0, 0).onPickup(p);
  assert.equal(p.hp, 40 + REPAIR_KIT_PLAYER_HEAL);
});

test('回復は最大HPを超えない', () => {
  const p = makePlayer(PLAYER_MAX_HP - 5);
  new RepairKit(p.game, 0, 0).onPickup(p);
  assert.equal(p.hp, PLAYER_MAX_HP);
});

// 自機を治しても、母艦の修理分としてキットは手元に残る
test('拾ったキットは所持数として残る', () => {
  const p = makePlayer(40);
  new RepairKit(p.game, 0, 0).onPickup(p);
  assert.equal(p.repairKits, 1);
});

test('満タンで拾ってもキットは手に入る', () => {
  const p = makePlayer(PLAYER_MAX_HP);
  new RepairKit(p.game, 0, 0).onPickup(p);
  assert.equal(p.hp, PLAYER_MAX_HP);
  assert.equal(p.repairKits, 1);
});

// ------------------------------------------
// Player.heal()
// ------------------------------------------

test('heal は最大HPで頭打ちになる', () => {
  const p = makePlayer(90);
  p.heal(9999);
  assert.equal(p.hp, PLAYER_MAX_HP);
});

test('死んでいる自機は回復しない', () => {
  const p = makePlayer(10);
  p.alive = false;
  p.heal(50);
  assert.equal(p.hp, 10);
});
