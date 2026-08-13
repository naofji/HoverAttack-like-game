import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldStartMGReload } from '../src/js/utils/mgReload.js';
import { PLAYER_MG_BURST_SIZE, MG_RELOAD_THRESHOLD_DEFAULT } from '../src/js/utils/Constants.js';

const SIZE = PLAYER_MG_BURST_SIZE;          // 16
const TH = MG_RELOAD_THRESHOLD_DEFAULT;     // 8

// --- 規則1: 弾切れは常に装填する（撃てないまま詰まないため） ---

test('弾切れ: どのモードでも、引き金を握っていても装填する', () => {
  for (const mode of ['off', 'onSwitch', 'always']) {
    assert.equal(shouldStartMGReload(0, SIZE, true, { mode }), true, mode);
    assert.equal(shouldStartMGReload(0, SIZE, false, { mode }), true, mode);
  }
});

// --- 規則2: 手動はしきい値もモードも無視する ---

test('手動: モード off でも、しきい値より多く残っていても装填する', () => {
  assert.equal(shouldStartMGReload(SIZE - 1, SIZE, false, { mode: 'off', manual: true }), true);
  assert.equal(shouldStartMGReload(SIZE - 1, SIZE, true, { mode: 'off', manual: true }), true,
    '引き金を握っていても手動は通す');
});

test('手動: 満タンでは装填しない（待ち時間だけ損する）', () => {
  assert.equal(shouldStartMGReload(SIZE, SIZE, false, { mode: 'off', manual: true }), false);
});

// --- 規則3: off は弾切れ以外で装填しない ---

test('off: 残弾 1 でも装填しない', () => {
  assert.equal(shouldStartMGReload(1, SIZE, false, { mode: 'off' }), false);
});

test('off: 切り替えても装填しない', () => {
  assert.equal(shouldStartMGReload(1, SIZE, false, { mode: 'off', switchedToMG: true }), false);
});

// --- 規則4: しきい値は onSwitch / always の両方に効く ---

test('しきい値より多く残っていれば、どちらのモードでも装填しない', () => {
  assert.equal(shouldStartMGReload(TH + 1, SIZE, false, { mode: 'always' }), false);
  assert.equal(shouldStartMGReload(TH + 1, SIZE, false, { mode: 'onSwitch', switchedToMG: true }), false,
    '弾倉がほぼ満タンなのに切り替えのたびにリロードを背負っている');
});

test('しきい値は設定で動く', () => {
  assert.equal(shouldStartMGReload(12, SIZE, false, { mode: 'always', threshold: 12 }), true,
    '境界（ちょうど threshold）で装填する');
  assert.equal(shouldStartMGReload(13, SIZE, false, { mode: 'always', threshold: 12 }), false);
  assert.equal(shouldStartMGReload(2, SIZE, false, { mode: 'always', threshold: 1 }), false,
    'しきい値を下げても効いていない');
});

// --- 規則5: onSwitch は切り替えたフレームだけ ---

test('onSwitch: 切り替えたフレームだけ装填する', () => {
  assert.equal(shouldStartMGReload(TH, SIZE, false, { mode: 'onSwitch', switchedToMG: true }), true);
  assert.equal(shouldStartMGReload(TH, SIZE, false, { mode: 'onSwitch', switchedToMG: false }), false);
});

test('onSwitch: 引き金を握っていても切り替えたなら装填する', () => {
  assert.equal(shouldStartMGReload(TH, SIZE, true, { mode: 'onSwitch', switchedToMG: true }), true);
});

// --- 規則6: always は引き金を離すまで待つ（従来の ON） ---

test('always: しきい値以下で引き金を離すと装填する（従来の挙動）', () => {
  assert.equal(shouldStartMGReload(TH, SIZE, false, { mode: 'always' }), true);
  assert.equal(shouldStartMGReload(3, SIZE, false, { mode: 'always' }), true);
});

test('always: 引き金を握っている間は撃たせる', () => {
  assert.equal(shouldStartMGReload(TH, SIZE, true, { mode: 'always' }), false);
  assert.equal(shouldStartMGReload(1, SIZE, true, { mode: 'always' }), false);
});

test('always: 満タンでは装填しない', () => {
  assert.equal(shouldStartMGReload(SIZE, SIZE, false, { mode: 'always' }), false);
});

// 既定値だけで呼んでも従来どおり動くこと（オプション省略の経路が生きている）
test('オプションを省略すると always ＋ 既定しきい値', () => {
  assert.equal(shouldStartMGReload(TH, SIZE, false), true);
  assert.equal(shouldStartMGReload(TH + 1, SIZE, false), false);
  assert.equal(shouldStartMGReload(TH, SIZE, true), false);
});

// Integration: refill happens when the reload timer completes
import { Player } from '../src/js/entities/Player.js';

test('magazine refills exactly when the reload timer reaches zero', () => {
  const input = {
    mouse: { left: false },
    isKeyDown: () => false,
  };
  const game = { input, map: { isSolidAtPixel: () => false }, carrier: null };
  const p = Object.create(Player.prototype);
  // Minimal state for _updateTimers/_updateMGReload only
  p.game = game;
  p.invincibleTimer = 0;
  p.missileCooldown = 0;
  p.mgFireTimer = 0;
  p.mgReloadTimer = 2;
  p.mgBurstLeft = 0;
  p.currentWeapon = 'mg';
  p.mgSwitchedToMG = false;
  p.mgManualReload = false;

  p._updateTimers();
  assert.equal(p.mgReloadTimer, 1);
  assert.equal(p.mgBurstLeft, 0);      // not yet
  p._updateTimers();
  assert.equal(p.mgReloadTimer, 0);
  assert.equal(p.mgBurstLeft, 16);     // refilled on completion

  // With a full mag and fire released, no new reload starts
  p._updateMGReload(input);
  assert.equal(p.mgReloadTimer, 0);

  // Low mag + fire released -> reload starts
  p.mgBurstLeft = 8;
  p._updateMGReload(input);
  assert.ok(p.mgReloadTimer > 0);
});
