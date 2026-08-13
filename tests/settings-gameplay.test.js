import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { PLAYER_MG_BURST_SIZE, MG_RELOAD_THRESHOLD_DEFAULT } from '../src/js/utils/Constants.js';

const SIZE = PLAYER_MG_BURST_SIZE;

/** _updateMGReload / switchWeapon だけを呼べる最小の Player。 */
function makePlayer(settings, burstLeft = MG_RELOAD_THRESHOLD_DEFAULT) {
  const input = { mouse: { left: false }, isKeyDown: () => false };
  const p = Object.create(Player.prototype);
  p.game = { input, settings };
  p.currentWeapon = 'mg';
  p.missiles = 5;
  p.mgReloadTimer = 0;
  p.mgFireTimer = 0;
  p.mgBurstLeft = burstLeft;
  p.mgSwitchedToMG = false;
  p.mgManualReload = false;
  return { p, input };
}

test('always: しきい値以下で引き金を離すと装填が始まる（従来の挙動）', () => {
  const { p, input } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'always' });
  p._updateMGReload(input);
  assert.ok(p.mgReloadTimer > 0);
});

test('off: しきい値以下でも装填が始まらない', () => {
  const { p, input } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'off' });
  p._updateMGReload(input);
  assert.equal(p.mgReloadTimer, 0);
});

test('しきい値の設定が効く', () => {
  const s = { ...DEFAULT_SETTINGS, mgAutoReloadMode: 'always', mgReloadThreshold: 2 };
  const { p, input } = makePlayer(s, 3);
  p._updateMGReload(input);
  assert.equal(p.mgReloadTimer, 0, 'しきい値 2 なのに残弾 3 で装填している');

  const { p: q, input: qi } = makePlayer(s, 2);
  q._updateMGReload(qi);
  assert.ok(q.mgReloadTimer > 0, 'しきい値ちょうどで装填していない');
});

// フラグは立てっぱなしにしない。gameSpeed 0.8 では 1 フレームに 0 ティックのことがあるので、
// 「立てる」のは入力処理、「消す」のは読んだ側（ティック）という分担にしてある。
test('onSwitch: F で mg に持ち替えたときだけ装填し、フラグは1回で消える', () => {
  const { p, input } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'onSwitch' });
  p._updateMGReload(input);
  assert.equal(p.mgReloadTimer, 0, '切り替えていないのに装填している');

  p.currentWeapon = 'missile';
  p.switchWeapon();
  assert.equal(p.currentWeapon, 'mg');
  assert.equal(p.mgSwitchedToMG, true, '切り替えフラグが立っていない');

  p._updateMGReload(input);
  assert.ok(p.mgReloadTimer > 0, '切り替えたのに装填していない');
  assert.equal(p.mgSwitchedToMG, false, 'フラグが消えていない');
});

test('onSwitch: mg から missile への切り替えではフラグが立たない', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'onSwitch' });
  p.currentWeapon = 'mg';
  p.switchWeapon();
  assert.equal(p.currentWeapon, 'missile');
  assert.equal(p.mgSwitchedToMG, false);
});

test('設定が無くても落ちない（現行どおり自動装填する）', () => {
  const { p, input } = makePlayer(undefined);
  assert.doesNotThrow(() => p._updateMGReload(input));
  assert.ok(p.mgReloadTimer > 0);
});

// 早期 return する2経路（武器違い／装填中）でもフラグは消える、という分担を直接縛る。
// _updateMGReload は「読んだら必ず消す」ブロックを早期 return より前に置いているが、
// これはコメントだけが守る規約なので、リファクタで早期 return の後ろに動かされても
// テストが無ければ気づけない。動かすと「次に mg へ戻った瞬間に古い『切り替えた』が
// 効いてしまう」（ブリーフの言葉どおり）という再発防止のためのテスト。
// mgManualReload も同じ1本のブロックで一緒に消えるので、ここでまとめて縛る
// （手動フラグだけ別経路で消すような分岐は無いため、専用テストを分ける必要はない）。
test('武器がmg以外: 呼ばれた時点でフラグが消え、次にmgへ戻ってもリロードを引きずらない', () => {
  const { p, input } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'onSwitch' });
  p.currentWeapon = 'missile';
  p.mgSwitchedToMG = true;
  p.mgManualReload = true;

  p._updateMGReload(input);
  assert.equal(p.mgSwitchedToMG, false, '武器違いで早期returnしてもフラグが消えていない');
  assert.equal(p.mgManualReload, false, '武器違いで早期returnしても手動フラグが消えていない');

  // mg に戻っても、さっきの「切り替えた」は使い回されないはず
  p.currentWeapon = 'mg';
  p._updateMGReload(input);
  assert.equal(p.mgReloadTimer, 0, '前回のフラグが生き残り、切り替えていないのに装填している');
});

test('装填中: 呼ばれた時点でフラグが消え、リロードは再始動しない', () => {
  const { p, input } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'onSwitch' });
  p.mgReloadTimer = 30;
  p.mgSwitchedToMG = true;
  p.mgManualReload = true;

  p._updateMGReload(input);
  assert.equal(p.mgSwitchedToMG, false, '装填中で早期returnしてもフラグが消えていない');
  assert.equal(p.mgManualReload, false, '装填中で早期returnしても手動フラグが消えていない');
  assert.equal(p.mgReloadTimer, 30, '装填中なのにタイマーが再始動している');
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
