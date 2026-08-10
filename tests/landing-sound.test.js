import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { TILE_SIZE, GRAVITY } from '../src/js/utils/Constants.js';

const FLOOR_ROW = 20;
const FLOOR_Y = FLOOR_ROW * TILE_SIZE;

/** 押されているキーが無い入力。 */
function idleInput() {
  return {
    keys: {},
    isKeyDown: () => false,
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

/**
 * 床が途中で途切れる世界。col 12 より右は空。
 * 端に立ったときの挙動を見るため。
 */
function ledgeRows() {
  const rows = [];
  for (let r = 0; r < FLOOR_ROW; r++) rows.push('.'.repeat(24));
  for (let r = FLOOR_ROW; r < 24; r++) rows.push('#'.repeat(12) + '.'.repeat(12));
  return rows;
}

function flatRows() {
  const rows = [];
  for (let r = 0; r < FLOOR_ROW; r++) rows.push('.'.repeat(24));
  for (let r = FLOOR_ROW; r < 24; r++) rows.push('#'.repeat(24));
  return rows;
}

/** 着地音の回数を数えながら n フレーム回す。 */
function run(player, n) {
  const saved = audioManager.playLanding;
  let count = 0;
  audioManager.playLanding = () => { count++; };
  try {
    for (let i = 0; i < n; i++) player.update();
  } finally {
    audioManager.playLanding = saved;
  }
  return count;
}

function world(rows) {
  const game = makeGame(makeMap(rows));
  game.input = idleInput();
  game.camera = { x: 0, y: 0, shake() {} };
  game.canvas = { width: 1024, height: 768 };
  return game;
}

function spawn(game, x, y) {
  const p = new Player(game, x, y);
  game.player = p;
  return p;
}

/** 母艦もどき。甲板の上に立てる。 */
function fakeCarrier(x, y) {
  return {
    x, y, width: 96, height: 32, vx: 0, vy: 0, alive: true,
    platformLeft: 8, platformRight: 88,
  };
}

// --- 本来の着地 ---------------------------------------------------------------

test('高いところから落ちれば着地音が1回鳴る', () => {
  const game = world(flatRows());
  const p = spawn(game, 100, FLOOR_Y - 200);
  const count = run(p, 120);
  assert.equal(count, 1, `着地音が ${count} 回`);
});

test('着地したあと立ち続けても鳴り続けない', () => {
  const game = world(flatRows());
  const p = spawn(game, 100, FLOOR_Y - 60);
  run(p, 60);                       // 着地させる
  assert.equal(p.onGround, true, '接地していない');
  assert.equal(run(p, 180), 0, '立っているだけで鳴っている');
});

// --- 鳴ってはいけない場面 -------------------------------------------------------

test('地面の端に立っているだけで鳴らない', () => {
  // 足が半分はみ出す位置。接地判定が1フレームごとに入れ替わりうる
  const game = world(ledgeRows());
  const p = spawn(game, 12 * TILE_SIZE - 8, FLOOR_Y - 60);
  run(p, 60);                       // まず落ち着かせる
  const count = run(p, 180);
  assert.equal(count, 0, `端に立っているだけで ${count} 回鳴った`);
});

test('母艦の甲板に立っているだけで鳴らない', () => {
  const game = world(flatRows());
  const carrier = fakeCarrier(200, FLOOR_Y - 120);
  game.carrier = carrier;
  const p = spawn(game, 240, carrier.y - 40);
  run(p, 60);
  assert.equal(p.onGround, true, '甲板に乗っていない');
  const count = run(p, 180);
  assert.equal(count, 0, `甲板に立っているだけで ${count} 回鳴った`);
});

test('母艦が動いても、乗っているだけなら鳴らない', () => {
  const game = world(flatRows());
  const carrier = fakeCarrier(200, FLOOR_Y - 120);
  game.carrier = carrier;
  const p = spawn(game, 240, carrier.y - 40);
  run(p, 60);

  const saved = audioManager.playLanding;
  let count = 0;
  audioManager.playLanding = () => { count++; };
  try {
    for (let i = 0; i < 180; i++) {
      carrier.vx = Math.sin(i / 10) * 2;      // 左右に動く
      carrier.y += Math.sin(i / 17) * 0.4;    // 上下にも揺れる
      p.update();
    }
  } finally { audioManager.playLanding = saved; }

  assert.equal(count, 0, `動く甲板の上で ${count} 回鳴った`);
});

test('ほんの少し浮いて落ちた程度では鳴らない', () => {
  // 段差1px程度の接地の途切れを着地と数えない
  const game = world(flatRows());
  const p = spawn(game, 100, FLOOR_Y - 60);
  run(p, 60);
  p.onGround = false;
  p.vy = GRAVITY;                   // 1フレームぶんの落下速度しかない
  assert.equal(run(p, 30), 0, '微小な落下で鳴った');
});

// --- 本来の着地を潰していないこと -----------------------------------------------

test('段差1タイルを降りても鳴る（判定を厳しくしすぎない）', () => {
  const rows = [];
  for (let r = 0; r < FLOOR_ROW; r++) rows.push('.'.repeat(24));
  // col 12 より右は1タイル低い
  rows.push('#'.repeat(12) + '.'.repeat(12));
  for (let r = FLOOR_ROW + 1; r < 24; r++) rows.push('#'.repeat(24));

  const game = world(rows);
  const p = spawn(game, 13 * TILE_SIZE, FLOOR_Y - 30);
  const count = run(p, 90);
  assert.equal(count, 1, `1タイルの落下で ${count} 回`);
});

test('ジャンプ（バースト）して降りれば鳴る', () => {
  const game = world(flatRows());
  const p = spawn(game, 100, FLOOR_Y - 40);
  run(p, 60);                       // 着地させる

  const saved = audioManager.playLanding;
  let count = 0;
  audioManager.playLanding = () => { count++; };
  try {
    p.onGround = false;
    p.vy = -4;                      // 跳び上がった状態
    for (let i = 0; i < 120; i++) p.update();
  } finally { audioManager.playLanding = saved; }

  assert.equal(count, 1, `ジャンプ後の着地が ${count} 回`);
  assert.equal(p.onGround, true);
});

test('高速落下は硬い着地として鳴らす', () => {
  const game = world(flatRows());
  const p = spawn(game, 100, FLOOR_Y - 300);

  const saved = audioManager.playLanding;
  const hard = [];
  audioManager.playLanding = (h) => { hard.push(h); };
  try { for (let i = 0; i < 200; i++) p.update(); }
  finally { audioManager.playLanding = saved; }

  assert.deepEqual(hard, [true], `硬い着地にならなかった: ${JSON.stringify(hard)}`);
});
