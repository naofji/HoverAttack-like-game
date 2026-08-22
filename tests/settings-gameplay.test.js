import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { PLAYER_MG_BURST_SIZE, MG_RELOAD_THRESHOLD_DEFAULT } from '../src/js/utils/Constants.js';
import { audioManager } from '../src/js/audio/AudioManager.js';

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

/** playSwitch の呼び出しを記録し、必ず元に戻す。 */
function withSwitchSpy(fn) {
  const calls = [];
  const orig = audioManager.playSwitch;
  audioManager.playSwitch = () => calls.push('playSwitch');
  try { fn(calls); } finally { audioManager.playSwitch = orig; }
}

test('F: ミサイルが残っていれば武器を切り替える', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS });
  p.missiles = 3;
  p.currentWeapon = 'mg';
  withSwitchSpy((calls) => {
    p.pressWeaponKey();
    assert.equal(p.currentWeapon, 'missile');
    assert.equal(p.mgManualReload, false, '切り替えなのにリロードを要求している');
    assert.deepEqual(calls, ['playSwitch']);
  });
});

// autoSwitchMissile ON でドックすると main.js が currentWeapon を 'missile' に固定するが、
// missiles は _updateDockedResupply() で少しずつしか補充されない。補充が終わる前に undock
// すると currentWeapon === 'missile' かつ missiles === 0 のまま取り残る。旧コードは
// weaponKeyAction(missiles) だけを見て 'reload' と判定し、mg の武器ガードに落ちて F が
// 無反応になっていた（サイレントな回帰）。currentWeapon === 'missile' を先に見ることで
// 「ミサイルを持っている限りはまず mg へ切り替える」よう直した
test('F: ドックで自動でミサイルへ持ち替えた直後（残弾0）に undock すると、F で mg へ切り替わる', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS });
  p.currentWeapon = 'missile';   // _handleDocking() の autoSwitchMissile が固定した状態
  p.missiles = 0;                // resupply() の途中、まだ補充されていない
  p.mgBurstLeft = PLAYER_MG_BURST_SIZE;   // resupply() 直後は mg も満タン
  withSwitchSpy((calls) => {
    p.pressWeaponKey();
    assert.equal(p.currentWeapon, 'mg', 'ミサイル発射機に取り残されている（F が無反応の再発）');
    assert.equal(p.mgManualReload, false, '切り替えのはずがリロードを要求している');
    assert.deepEqual(calls, ['playSwitch'], '切り替えの音が鳴っていない');
  });
});

// ミサイルが尽きると切り替え先が無くなるので、そのときだけ F の意味が変わる。
test('F: ミサイルが尽きていればリロードを要求し、武器は切り替えない', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS });
  p.missiles = 0;
  p.currentWeapon = 'mg';
  p.mgBurstLeft = 4;
  withSwitchSpy((calls) => {
    p.pressWeaponKey();
    assert.equal(p.currentWeapon, 'mg', '切り替わってしまっている');
    assert.equal(p.mgManualReload, true, 'リロードを要求していない');
    assert.deepEqual(calls, ['playSwitch'], '押した手応えの音が鳴っていない');
  });
});

test('F: ミサイルの端数（0.5 発）は尽きている扱い', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS });
  p.missiles = 0.5;
  p.currentWeapon = 'mg';
  p.mgBurstLeft = 4;
  withSwitchSpy(() => {
    p.pressWeaponKey();
    assert.equal(p.mgManualReload, true);
  });
});

// 受け付けなかったことが分かるように無音にする。新しい音は作らない。
test('F: 満タンでは要求も音も出ない', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS }, SIZE);
  p.missiles = 0;
  p.currentWeapon = 'mg';
  withSwitchSpy((calls) => {
    p.pressWeaponKey();
    assert.equal(p.mgManualReload, false);
    assert.deepEqual(calls, [], '受け付けていないのに音が鳴っている');
  });
});

test('F: 装填中は要求も音も出ない', () => {
  const { p } = makePlayer({ ...DEFAULT_SETTINGS }, 4);
  p.missiles = 0;
  p.currentWeapon = 'mg';
  p.mgReloadTimer = 30;
  withSwitchSpy((calls) => {
    p.pressWeaponKey();
    assert.equal(p.mgManualReload, false);
    assert.deepEqual(calls, []);
  });
});

// 手動はしきい値もモードも無視する。オフを選んだ人の唯一の装填手段なので。
test('F: モード off・しきい値より多い残弾でも装填が始まる', () => {
  const { p, input } = makePlayer({ ...DEFAULT_SETTINGS, mgAutoReloadMode: 'off' }, SIZE - 1);
  p.missiles = 0;
  p.currentWeapon = 'mg';
  withSwitchSpy(() => { p.pressWeaponKey(); });
  p._updateMGReload(input);
  assert.ok(p.mgReloadTimer > 0, '手動要求が装填に繋がっていない');
  assert.equal(p.mgManualReload, false, '要求フラグが消えていない');
});

/** F キー処理だけを通せる最小の game。 */
function makeFKeyScene(missiles) {
  const player = {
    alive: true, docked: false, currentWeapon: 'mg', missiles,
    pressed: 0,
    pressWeaponKey() { this.pressed++; },
    switchWeapon() { this.switched = true; },
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
  return { g, player };
}

// main.js は分岐を持たず Player に委ねる。規則が2箇所に分かれないようにするため。
// F の読み取りは _updatePlaying() の中にある（update() 直下ではない）。update() 直下に
// 置くと Shift/M と同じ「どの画面でも効く」入力になってしまい、後述の一時停止テストが
// 示すとおり設定画面でも武器が切り替わる回帰を生む。ここでは _updatePlaying() の
// 重い共同作業者（ミニマップ・ドッキング・射撃・物理ティック）だけ潰して直接呼ぶ。
test('main.js: F は pressWeaponKey() に委ねる（switchWeapon を直接呼ばない）', () => {
  const { g, player } = makeFKeyScene(0);
  g._updateMiniMap = () => {};
  g._handleDocking = () => {};
  g._handleShooting = () => {};
  g._simulationTick = () => {};
  g._updatePlaying(16);
  assert.equal(player.pressed, 1, 'pressWeaponKey が呼ばれていない');
  assert.equal(player.switched, undefined, 'switchWeapon を直接呼んでいる');
});

// F の読み取りが _updatePlaying() の外（update() 直下）に漏れ出すと、ポーズ中の
// 設定画面でも player.alive && !docked が真である限り武器が切り替わってしまう。
// 設定画面に武器の行は無いので、プレイヤーには「何も押していないのに次に
// プレイへ戻ったら武器が変わっていた」という説明の付かない現象に見える。
test('F: 設定画面（ポーズ中）では pressWeaponKey が呼ばれない', () => {
  const { g, player } = makeFKeyScene(3);
  g.gameState = 'settings';
  g._updateSettings = () => {};
  g.update(16);
  assert.equal(player.pressed, 0, 'ポーズ中なのに F が武器処理まで届いている');
});

// ============================================
// _fireMissile() のミサイル切れ自動復帰では mgSwitchedToMG を立てない
// ============================================
//
// switchWeapon() の missile→mg 分岐の中身（currentWeapon = 'mg'; playSwitch()）を
// _fireMissile() の2箇所（既に0発／撃った結果0発になった）がそのまま複製している。
// 「DRY にしよう」と後で switchWeapon() 呼び出しに置き換えると、テストは全部通る
// ように見えて、onSwitch モードでミサイルが尽きるたびに mg リロードが誤発火する
// （設計の言葉で言う「ゲーム側が勝手に戻したのは切り替えではない」を壊す）。
// 実測ではなくコード複製そのものが罠なので、両方の分岐を直接縛る。
function makeMissileFireScene(missiles) {
  const player = {
    currentWeapon: 'missile', missiles, missileCooldown: 0,
    mgSwitchedToMG: false,
    // 弾数の消費は Player 本体のものを借りる。ここに同じ式を書き写すと、
    // 上のコメントが警告しているコード複製そのものになる
    game: { debugInvincible: false },
    consumeMissile: Player.prototype.consumeMissile,
  };
  const g = Object.create(Game);
  g.projectiles = [];
  return { g, player };
}

test('_fireMissile: 既に0発のとき、mg へ戻るが mgSwitchedToMG は立たない', () => {
  const { g, player } = makeMissileFireScene(0);
  withSwitchSpy(() => {
    g._fireMissile(player, 0, 0, 0);
  });
  assert.equal(player.currentWeapon, 'mg', 'mg へ戻っていない');
  assert.equal(player.mgSwitchedToMG, false, 'ミサイル切れの自動復帰なのに切り替えフラグが立っている');
});

test('_fireMissile: 発射した結果ちょうど0発になったとき、mg へ戻るが mgSwitchedToMG は立たない', () => {
  const { g, player } = makeMissileFireScene(1);
  withSwitchSpy(() => {
    g._fireMissile(player, 0, 0, 0);
  });
  assert.equal(player.missiles, 0, 'ミサイルが減っていない');
  assert.equal(player.currentWeapon, 'mg', 'mg へ戻っていない');
  assert.equal(player.mgSwitchedToMG, false, 'ミサイル切れの自動復帰なのに切り替えフラグが立っている');
});
