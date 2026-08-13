import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldStartMGReload } from '../src/js/utils/mgReload.js';
import { PLAYER_MG_BURST_SIZE } from '../src/js/utils/Constants.js';

const SIZE = PLAYER_MG_BURST_SIZE;
const HALF = Math.floor(SIZE / 2);

test('オートリロード ON: 残弾が半分以下で引き金を離すと装填する（現行の挙動）', () => {
  assert.equal(shouldStartMGReload(HALF, SIZE, false, true), true);
});

test('オートリロード ON: 撃ち切ったら引き金を握っていても装填する', () => {
  assert.equal(shouldStartMGReload(0, SIZE, true, true), true);
});

test('オートリロード ON: 残弾が十分なら装填しない', () => {
  assert.equal(shouldStartMGReload(SIZE, SIZE, false, true), false);
});

// OFF は「弾が尽きたときだけ」。手動リロードのキーは作らない（R はミニマップで埋まっている）。
test('オートリロード OFF: 残弾が半分以下で引き金を離しても装填しない', () => {
  assert.equal(shouldStartMGReload(HALF, SIZE, false, false), false);
});

test('オートリロード OFF: 残弾が 1 でも装填しない', () => {
  assert.equal(shouldStartMGReload(1, SIZE, false, false), false);
});

test('オートリロード OFF: 撃ち切ったら装填する（撃てなくなっては困る）', () => {
  assert.equal(shouldStartMGReload(0, SIZE, false, false), true);
  assert.equal(shouldStartMGReload(0, SIZE, true, false), true);
});

test('第4引数を省略すると ON 扱い（既存の呼び出しが壊れない）', () => {
  assert.equal(shouldStartMGReload(HALF, SIZE, false), true);
});

import { Game } from '../src/js/main.js';

/** _handleDocking() だけを呼べる最小の game。 */
function makeDockScene(settings) {
  const player = {
    alive: true, docked: false, currentWeapon: 'mg', repairKits: 0,
    x: 0, y: 0, width: 16, height: 24, vx: 3, vy: -2,
    resupply() { this.resupplied = true; },
  };
  const carrier = {
    alive: true, x: 100, y: 200, width: 64, height: 24, hp: 10, maxHp: 10, lives: 3,
    canDock: () => true,
  };
  const game = Object.create(Game);
  game.player = player;
  game.carrier = carrier;
  game.settings = settings;
  game.map = { isSolidAtPixel: () => false };
  game.input = {
    isKeyPressed: (code) => code === 'KeyS',   // S を押した1フレーム
  };
  return { game, player };
}

test('autoSwitchMissile ON: ドッキングでミサイルに持ち替える', () => {
  const { game, player } = makeDockScene({ autoSwitchMissile: true });
  game._handleDocking();
  assert.equal(player.docked, true, 'そもそもドッキングしていない');
  assert.equal(player.currentWeapon, 'missile');
});

test('autoSwitchMissile OFF: 持っている武器のまま（現行の挙動）', () => {
  const { game, player } = makeDockScene({ autoSwitchMissile: false });
  game._handleDocking();
  assert.equal(player.docked, true);
  assert.equal(player.currentWeapon, 'mg');
});

test('設定が無くても落ちない（現行の挙動のまま）', () => {
  const { game, player } = makeDockScene(undefined);
  assert.doesNotThrow(() => game._handleDocking());
  assert.equal(player.currentWeapon, 'mg');
});
