import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/js/main.js';
import { Player } from '../src/js/entities/Player.js';
import { AutoAimUnit } from '../src/js/entities/AutoAimUnit.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';
import { AimLeadTracker } from '../src/js/utils/aimLead.js';
import { AUTO_AIM_LEAD_WINDOW, AUTO_AIM_LEAD_DEADZONE } from '../src/js/utils/Constants.js';

/** _updateAutoAim() だけを呼べる最小の game。 */
function makeScene(playerOverrides = {}, enemy = null) {
  const g = Object.create(Game);
  g.settings = { ...DEFAULT_SETTINGS };
  g.player = {
    alive: true, docked: false, autoAimPaused: false,
    autoAimTimer: 100, autoAimMaxTimer: 3600,
    currentWeapon: 'mg', x: 0, y: 0, width: 16, height: 24,
    ...playerOverrides,
  };
  g.enemies = enemy ? [enemy] : [];
  g.carrier = null;
  g.smokeScreens = [];
  g.camera = { x: 0, y: 0 };
  g.autoAimTarget = null;
  g.autoAimLeadPoint = null;
  g.autoAimLockedEnemy = enemy ?? null;
  g.aimLead = new AimLeadTracker(AUTO_AIM_LEAD_WINDOW, AUTO_AIM_LEAD_DEADZONE);
  // ロック対象が無い経路は docked/paused のガードを抜けたあと必ず
  // getMouseWorld() を呼ぶ（新規ロック探索のため）。ブリーフのひな形には
  // 無かったが、実装を読まずに書かれたための抜けなので実行して判明した。
  g.input = { mouse: { x: 0, y: 0 }, getMouseWorld: () => ({ x: 0, y: 0 }) };
  g._prevMouseX = 0;
  g._prevMouseY = 0;
  return g;
}

function fakeEnemy() {
  return { alive: true, x: 40, y: 40, width: 20, height: 20, vx: 0, vy: 0 };
}

// --- 残り時間の減り方 ---

test('通常は残り時間が減る（現行どおり）', () => {
  const g = makeScene();
  g._updateAutoAim();
  assert.equal(g.player.autoAimTimer, 99);
});

// 回帰: 現行はドック中に減らない。母艦に籠って温存する立ち回りを作らないため変える。
test('ドック中も残り時間が減る', () => {
  const g = makeScene({ docked: true });
  g._updateAutoAim();
  assert.equal(g.player.autoAimTimer, 99, 'ドック中に止まっている');
});

test('ドック中はスナップしない', () => {
  const g = makeScene({ docked: true }, fakeEnemy());
  g._updateAutoAim();
  assert.equal(g.autoAimTarget, null, 'ドック中なのに敵に吸い付いている');
});

test('解除中も残り時間が減り、スナップはしない', () => {
  const g = makeScene({ autoAimPaused: true }, fakeEnemy());
  g._updateAutoAim();
  assert.equal(g.player.autoAimTimer, 99, '解除中に止まっている');
  assert.equal(g.autoAimTarget, null, '解除中なのに敵に吸い付いている');
});

test('死亡中は減らない（現行どおり）', () => {
  const g = makeScene({ alive: false });
  g._updateAutoAim();
  assert.equal(g.player.autoAimTimer, 100);
});

// 要件の要。設定画面でタイマーが止まるのは、_updatePlaying() ごと呼ばれず
// _simulationTick() が回らないから。減算を update() 直下など外へ出すと
// ポーズ中も減り始めるので、それを検出する。
test('設定画面を開いている間は update() を何度呼んでも残り時間が減らない', () => {
  const g = Object.create(Game);
  g.gameState = 'settings';
  g.settingsReturnTo = 'playing';
  g.settings = { ...DEFAULT_SETTINGS };
  g.player = { alive: true, docked: false, autoAimTimer: 100, autoAimPaused: false };
  g.camera = { x: 0, y: 0 };
  g.enemies = [];
  g.totalTime = 0;
  g.missionTimer = 0;
  g.simAccumulator = 0;
  g.gameSpeed = 1;
  g.input = {
    isKeyDown: () => false,
    isKeyPressed: () => false,
    isCharPressed: () => false,
    isLeftClickPressed: () => false,
    getTypedChars: () => [],
    crosshairLocked: false,
    mouse: { x: 0, y: 0, left: false },
    endFrame() {},
  };
  g._updateSettings = () => {};   // 設定画面の中身はこのテストの関心ではない

  for (let i = 0; i < 10; i++) g.update(16);
  assert.equal(g.player.autoAimTimer, 100, 'ポーズ中に残り時間が減っている');
});

// --- 不変条件: 解除状態は Auto Aim を持っている間だけ存在する ---

test('残り時間が 0 になった時点で解除状態が消える', () => {
  const g = makeScene({ autoAimTimer: 1, autoAimPaused: true });
  g._updateAutoAim();
  assert.equal(g.player.autoAimTimer, 0);
  assert.equal(g.player.autoAimPaused, false, '通常状態に戻ったのに解除が残っている');
});

test('残り時間が残っている間は解除状態が保たれる', () => {
  const g = makeScene({ autoAimTimer: 2, autoAimPaused: true });
  g._updateAutoAim();
  assert.equal(g.player.autoAimPaused, true, '早すぎる時点で解除が消えている');
});

// --- Player ---

test('respawn で解除状態が消える', () => {
  const p = Object.create(Player.prototype);
  p.autoAimPaused = true;
  p.game = { input: {} };
  p.respawn(0, 0);
  assert.equal(p.autoAimPaused, false);
  assert.equal(p.autoAimTimer, 0);
});

// --- 拾ったときの扱い ---

/** onPickup だけを呼べる最小の player。 */
function pickupPlayer(settings, paused) {
  return {
    autoAimTimer: 100, autoAimMaxTimer: 3600, autoAimPaused: paused,
    game: { settings },
  };
}

test('RESUME ON: 拾うと解除が解ける', () => {
  const p = pickupPlayer({ ...DEFAULT_SETTINGS, autoAimResumeOnPickup: true }, true);
  Object.create(AutoAimUnit.prototype).onPickup(p);
  assert.equal(p.autoAimPaused, false);
  assert.ok(p.autoAimTimer > 100, '残り時間が延びていない');
});

test('RESUME OFF: ゲージが残っているうちに拾っても解除のまま', () => {
  const p = pickupPlayer({ ...DEFAULT_SETTINGS, autoAimResumeOnPickup: false }, true);
  Object.create(AutoAimUnit.prototype).onPickup(p);
  assert.equal(p.autoAimPaused, true, 'この設定の目的が果たされていない');
});

test('設定が無くても落ちず、既定どおり解除が解ける', () => {
  const p = pickupPlayer(undefined, true);
  assert.doesNotThrow(() => Object.create(AutoAimUnit.prototype).onPickup(p));
  assert.equal(p.autoAimPaused, false);
});

// 通し: OFF でも、ゲージが尽きて通常状態に戻ったあとに拾えば ON で始まる。
// 「解除状態は Auto Aim を持っている間だけ存在する」が守られていれば自然にこうなる。
test('RESUME OFF: ゲージが尽きたあとに拾えば ON で始まる', () => {
  const settings = { ...DEFAULT_SETTINGS, autoAimResumeOnPickup: false };
  const g = makeScene({ autoAimTimer: 1, autoAimPaused: true });
  g.settings = settings;
  g._updateAutoAim();                       // ここでゲージが尽きる
  assert.equal(g.player.autoAimPaused, false, '尽きた時点で解除が消えていない');

  g.player.game = { settings };
  Object.create(AutoAimUnit.prototype).onPickup(g.player);
  assert.equal(g.player.autoAimPaused, false, '拾い直したのに解除のまま');
});
