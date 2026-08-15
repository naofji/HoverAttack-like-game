import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { TILE_SIZE, HOVER_COOLDOWN_AFTER_BURST } from '../src/js/utils/Constants.js';

// ============================================
// 天井の低い場所でバーストジャンプしたとき
// ============================================
//
// 実機フィードバック:「バーストジャンプして天井が低いと当たって跳ね返り、
// 再び着地してまたジャンプ、を繰り返してしまう。ユーザーのイメージは、
// 天井に当たったらそこからホバリングが始まって張り付く動き」。
//
// 原因はバースト時に立つ hoverCooldown(HOVER_COOLDOWN_AFTER_BURST=20フレーム)。
// 天井に当たると vy=0 になるが、クールダウンが残っているのでホバー分岐に
// 入れず、重力で落ちて着地し、W が押しっぱなしなのでまたバーストする。
//
// 直し方は「天井に当たった瞬間にクールダウンを 0 にする」だけ。ホバーの推力
// (-0.50) が重力(0.30) を上回るので、そのまま天井に押し付けられ続ける。

// TILE_SIZE=16。バーストの最高到達点は初速 -5.8・重力 0.30 で実測 53.2px。
// 「天井が低い」状況を作るため、床(row 20 の上面 = y 320)に立つ自機(高さ16、
// 頭は y 304)から 32px 上に天井の下面が来るように row 16 を天井にした
// （下面 = 17*16 = 272）。バーストは約7フレームで天井に届く＝バースト後の
// クールダウン(20フレーム)が残っている間に当たる。これが再現したい条件で、
// 天井が遠いとクールダウンが切れてから自然にホバーへ移るので再現しない
const CEILING_ROW = 16;
const FLOOR_ROW = 20;
const CEILING_BOTTOM = (CEILING_ROW + 1) * TILE_SIZE;
const FLOOR_Y = FLOOR_ROW * TILE_SIZE;

/** 天井(row 16 以上)と床(row 20 以下)を張った世界。 */
function rows() {
  const out = [];
  for (let r = 0; r < 24; r++) {
    if (r <= CEILING_ROW || r >= FLOOR_ROW) out.push('#'.repeat(24));
    else out.push('.'.repeat(24));
  }
  return out;
}

/** W だけを押している入力。 */
function inputWith(held) {
  return {
    keys: {},
    isKeyDown: (code) => held.has(code),
    isKeyPressed: () => false,
    isCharPressed: () => false,
    mouse: { left: false, right: false },
    isLeftClickPressed: () => false,
    isRightClickPressed: () => false,
    rightHoldFrames: 0,
    crosshairLocked: false,
    getMouseWorld: () => ({ x: 0, y: 0 }),
    getTargetWorld: () => ({ x: 0, y: 0 }),
  };
}

function world(held) {
  const game = makeGame(makeMap(rows()));
  game.input = inputWith(held);
  game.camera = { x: 0, y: 0, shake() {} };
  game.canvas = { width: 1024, height: 768 };
  return game;
}

/**
 * 床に立った状態から始める。自機は 16x16 なので、床の上面に足を乗せる。
 * まず W を押していない状態で数フレーム回して接地を確定させる。
 */
function standing(held) {
  const game = world(held);
  const p = new Player(game, 100, FLOOR_Y - 16);
  game.player = p;
  return { game, p };
}

/** バースト音の回数を数えながら n フレーム回す。 */
function runCountingBursts(p, n) {
  const saved = audioManager.playBurst;
  let bursts = 0;
  audioManager.playBurst = () => { bursts++; };
  try {
    for (let i = 0; i < n; i++) p.update();
  } finally {
    audioManager.playBurst = saved;
  }
  return bursts;
}

/** 天井に接している（頭が天井の下面のすぐ下にある）か。 */
function touchingCeiling(p) {
  return p.y - CEILING_BOTTOM < 1.5;
}

// この世界の前提が崩れていないことを先に確かめる。天井が遠すぎて届かない／
// 近すぎて最初から接している、のどちらでもこのファイルのテストは意味を失う
test('前提: 床から天井まではバースト1回で届く高さで、最初は接していない', () => {
  const held = new Set();
  const { p } = standing(held);
  for (let i = 0; i < 5; i++) p.update();
  assert.equal(p.onGround, true, '床に立っていない');
  assert.ok(!touchingCeiling(p), '最初から天井に接している');

  held.add('KeyW');
  for (let i = 0; i < 60 && !touchingCeiling(p); i++) p.update();
  assert.ok(touchingCeiling(p), 'バーストしても天井に届いていない');
});

test('天井に当たったらホバーへ移り、W を押している間は張り付く', () => {
  const held = new Set();
  const { p } = standing(held);
  for (let i = 0; i < 5; i++) p.update();

  held.add('KeyW');
  for (let i = 0; i < 60 && !touchingCeiling(p); i++) p.update();
  assert.ok(touchingCeiling(p), '前提が崩れている：天井に届いていない');

  // 天井に着いてから、バーストのクールダウン(20フレーム)より十分長く回す。
  // 跳ね返る実装だとこの間に落ちてしまう
  for (let i = 0; i < HOVER_COOLDOWN_AFTER_BURST * 3; i++) {
    p.update();
    assert.ok(
      touchingCeiling(p),
      `天井から離れた（${i}フレーム目, y=${p.y.toFixed(2)}, 天井の下面=${CEILING_BOTTOM}）`,
    );
  }
  assert.equal(p.hovering, true, 'ホバー状態になっていない');
});

// 「跳ね返って着地してまたジャンプ」のループが起きていないことの直接の証拠。
// 張り付いている間にバーストが2回目以降鳴っていたら、床に戻っている
test('W を押しっぱなしにしてもバーストは1回しか起きない（跳ね返りのループが無い）', () => {
  const held = new Set(['KeyW']);
  const { p } = standing(held);
  const bursts = runCountingBursts(p, 200);
  assert.equal(bursts, 1, `バーストが ${bursts} 回起きている（跳ね返りのループ）`);
});

test('W を離せば天井から落ちる', () => {
  const held = new Set();
  const { p } = standing(held);
  for (let i = 0; i < 5; i++) p.update();

  held.add('KeyW');
  for (let i = 0; i < 60 && !touchingCeiling(p); i++) p.update();
  assert.ok(touchingCeiling(p), '前提が崩れている：天井に届いていない');

  held.delete('KeyW');
  for (let i = 0; i < 30; i++) p.update();
  assert.ok(!touchingCeiling(p), 'W を離しても天井に張り付いたまま');
});

// 張り付きは燃料を通常のホバーと同じペースで食う。無限には吊り下がれない
test('天井に張り付いている間も燃料を消費し、尽きれば落ちる', () => {
  const held = new Set(['KeyW']);
  const { p } = standing(held);
  for (let i = 0; i < 60 && !touchingCeiling(p); i++) p.update();
  assert.ok(touchingCeiling(p), '前提が崩れている：天井に届いていない');

  const fuelAtCeiling = p.hoverFuel;
  for (let i = 0; i < 20; i++) p.update();
  assert.ok(p.hoverFuel < fuelAtCeiling, '張り付いている間に燃料が減っていない');

  // 燃料が尽きるまで回すと、いずれ落ちる（実測で約250フレーム後に床へ）。
  // 「ちょうど0で止まる」ではないことに注意：着地後も W を押していると
  // 回復(0.5/f)と消費(0.4/f)がせめぎ合って0の近くを往復する。ここで見たいのは
  // 「無限に吊り下がれない」ことなので、床に戻っていることで判定する
  for (let i = 0; i < 400; i++) p.update();
  assert.ok(p.hoverFuel < 1, `燃料が尽きていない: ${p.hoverFuel}`);
  assert.ok(!touchingCeiling(p), '燃料が尽きても天井に張り付いたまま');
  // onGround では判定しない：燃料が0付近だと回復と消費のせめぎ合いで
  // 数ピクセル浮き沈みし、onGround がフレームごとに入れ替わる。
  // 見たいのは「天井から床の側へ戻った」ことなので位置で判定する
  assert.ok(
    p.y > FLOOR_Y - 32,
    `燃料が尽きたのに床の近くへ戻っていない: y=${p.y.toFixed(1)}`,
  );
});
