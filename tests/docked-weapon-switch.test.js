// ============================================
// キャリアドッキング中の武器切り替えテスト
// ============================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';

function makeTestScene({ docked = true, alive = true, currentWeapon = 'missile', missiles = 5 } = {}) {
  const player = {
    alive,
    docked,
    currentWeapon,
    missiles,
    pressed: 0,
    pressWeaponKey() {
      this.pressed++;
      this.currentWeapon = (this.currentWeapon === 'missile') ? 'mg' : 'missile';
    },
  };
  const g = Object.create(Game);
  g.player = player;
  g.gameState = 'playing';
  g.settings = { ...DEFAULT_SETTINGS };
  g.missionTimer = 0;
  g.totalTime = 0;
  g.simAccumulator = 0;
  g.gameSpeed = 1;
  g.camera = { x: 0, y: 0 };
  g.enemies = [];
  g.input = {
    isKeyPressed: (code) => code === 'KeyF',
    isKeyDown: () => false,
    isCharPressed: () => false,
    isLeftClickPressed: () => false,
    isRightClickPressed: () => false,
    getTypedChars: () => [],
    crosshairLocked: false,
    mouse: { x: 0, y: 0, left: false },
    endFrame() {},
  };
  g._updateMiniMap = () => {};
  g._handleDocking = () => {};
  g._handleShooting = () => {};
  g._simulationTick = () => {};
  return { g, player };
}

test('ドッキング中でも F キーで pressWeaponKey() が呼ばれ、武器が切り替わる', () => {
  const { g, player } = makeTestScene({ docked: true, currentWeapon: 'missile' });
  g._updatePlaying(16);
  assert.equal(player.pressed, 1, 'ドッキング中に F キーを押しても pressWeaponKey が呼ばれていない');
  assert.equal(player.currentWeapon, 'mg', '武器が mg に切り替わっていない');

  // もう一度 F を押すと missile に戻る
  g._updatePlaying(16);
  assert.equal(player.pressed, 2);
  assert.equal(player.currentWeapon, 'missile', '武器が missile に戻っていない');
});

test('自機が死亡しているときはドッキング中（または非ドッキング中）でも pressWeaponKey() は呼ばれない', () => {
  const { g, player } = makeTestScene({ docked: true, alive: false });
  g._updatePlaying(16);
  assert.equal(player.pressed, 0, '死亡中なのに pressWeaponKey が呼ばれている');
});

test('ポーズ中（設定画面など）ではドッキング中であっても pressWeaponKey() は呼ばれない', () => {
  const { g, player } = makeTestScene({ docked: true });
  g.gameState = 'settings';
  g._updateSettings = () => {};
  g.update(16);
  assert.equal(player.pressed, 0, '設定画面表示中なのに武器キーが処理されている');
});
