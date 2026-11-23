// スパイダーの体（entities/EnemySpider.js）。偽の地図（tests/helpers/enemy-world.js）の上で本物を走らせる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemySpider } from '../src/js/entities/EnemySpider.js';
import { boxHitsSolid } from '../src/js/utils/surfaceCrawl.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import {
  SPIDER_SIZE, SPIDER_HP, SPIDER_SCORE, TILE_SIZE,
  SPIDER_FIRE_WINDUP, SPIDER_FIRE_RETRY, SPIDER_SHELL_AIM_ABOVE, SPIDER_THREAD_SHOOT_FRAMES,
} from '../src/js/utils/Constants.js';

const T = TILE_SIZE;
const S = SPIDER_SIZE;

/** 消せる格子の偽地図。rows を書き換えると isSolid が追従する */
function world(rowStrings) {
  const rows = rowStrings.map((s) => s.split(''));
  const map = makeMap(rowStrings);
  map.isSolid = (r, c) => {
    if (r < 0 || c < 0 || r >= rows.length || c >= rows[0].length) return true;
    return rows[r][c] === '#';
  };
  map.isSolidAtPixel = (x, y) => map.isSolid(Math.floor(y / T), Math.floor(x / T));
  map.isSolidPoint = map.isSolidAtPixel;
  const game = makeGame(map);
  game.weekSeed = 12345;
  game.missionsCompleted = 5;
  return { game, map, rows, remove: (r, c) => { rows[r][c] = '.'; } };
}

const isSolidOf = (map) => (r, c) => map.isSolid(r, c);

/** 枠で囲んだ W×H の部屋 */
function roomRows(W, H) {
  const rows = ['#'.repeat(W)];
  for (let r = 1; r < H - 1; r++) rows.push('#' + '.'.repeat(W - 2) + '#');
  rows.push('#'.repeat(W));
  return rows;
}

/** 床（row の上面）に置いたスパイダー */
function onFloor(game, row, col) {
  const s = new EnemySpider(game, col * T + 1, row * T - S, 'floor');
  game.enemies.push(s);
  return s;
}

test('床に置くと動き出し、2000フレームのあいだ岩にめり込まない', () => {
  const { game, map } = world(roomRows(30, 14));
  const s = onFloor(game, 13, 5);
  const x0 = s.x;
  let maxMove = 0;
  for (let i = 0; i < 2000; i++) {
    s.update();
    assert.equal(boxHitsSolid(isSolidOf(map), s.x, s.y, S), false, `frame ${i}: めり込み (${s.x}, ${s.y}) ${s.mode}`);
    maxMove = Math.max(maxMove, Math.abs(s.x - x0));
  }
  assert.ok(maxMove >= 32, `動いた距離 ${maxMove}`);
});

test('部屋の中で十分動かすと床以外の面にも張り付く', () => {
  const { game } = world(roomRows(14, 10));
  const s = onFloor(game, 9, 5);
  const seen = new Set();
  for (let i = 0; i < 6000; i++) {
    s.update();
    if (s.surface) seen.add(s.surface);
  }
  assert.ok([...seen].some((v) => v !== 'floor'), `見た面: ${[...seen]}`);
});

test('天井で小ジャンプしても天井に戻る', () => {
  const { game } = world(roomRows(30, 14));
  const s = new EnemySpider(game, 10 * T + 1, T, 'ceiling');
  const y0 = s.y;
  s._startHop();
  assert.equal(s.mode, 'hop');
  let maxY = y0;
  for (let i = 0; i < 120 && s.mode === 'hop'; i++) {
    s.update();
    maxY = Math.max(maxY, s.y);
  }
  assert.equal(s.surface, 'ceiling');
  assert.ok(maxY > y0 + 4, `下へ跳んだか: ${maxY}`);
});

test('床から糸で天井へ登る', () => {
  // 高さ 8 タイルの通路（床は row 9、天井の下面は row 1 の上端）
  const { game } = world(roomRows(30, 10));
  const s = onFloor(game, 9, 10);
  s._startThread();
  assert.equal(s.mode, 'thread');
  assert.equal(s.threadAnchor.y, T);
  let lastY = s.y;
  for (let i = 0; i < 400 && s.mode === 'thread'; i++) {
    s.update();
    if (s.mode !== 'thread') break;
    assert.equal(s.surface, null);
    assert.ok(s.y <= lastY, `単調に登る: ${s.y} > ${lastY}`);
    lastY = s.y;
  }
  assert.equal(s.surface, 'ceiling');
  assert.equal(s.threadAnchor, null);
  assert.equal(s.y, T);
});

test('天井から糸で床へ降りる', () => {
  const { game } = world(roomRows(30, 10));
  const s = new EnemySpider(game, 10 * T + 1, T, 'ceiling');
  s._startThread();
  assert.equal(s.mode, 'thread');
  assert.equal(s.threadAnchor.y, T);
  let lastY = s.y;
  for (let i = 0; i < 400 && s.mode === 'thread'; i++) {
    s.update();
    if (s.mode !== 'thread') break;
    assert.ok(s.y >= lastY);
    lastY = s.y;
  }
  assert.equal(s.surface, 'floor');
  assert.equal(s.y, 9 * T - S);
});

// 2026-11-23 ユーザー指定: 「糸を伝って降りるスピードは登るスピードより速くしていい」（1.2 と 1.6 では差が見えなかった）
test('糸で降りるのは、同じ高さを登るより2倍以上速い', () => {
  const frames = (s) => {
    s._startThread();
    let n = 0;
    while (s.mode === 'thread' && n < 400) { s.update(); n++; }
    assert.notEqual(s.mode, 'thread');
    return n;
  };
  const up = frames(onFloor(world(roomRows(30, 10)).game, 9, 10));
  const down = frames(new EnemySpider(world(roomRows(30, 10)).game, 10 * T + 1, T, 'ceiling'));
  // 糸が届くまでの SHOOT_FRAMES はどちらも同じなので、動いている間で比べる
  const C = SPIDER_THREAD_SHOOT_FRAMES;
  assert.ok((down - C) * 2 <= up - C, `登り ${up - C} フレーム / 降り ${down - C} フレーム`);
});

test('糸の支点が壊れると落ちる', () => {
  const { game, remove } = world(roomRows(30, 10));
  const s = onFloor(game, 9, 10);
  s._startThread();
  for (let i = 0; i < 40; i++) s.update();
  assert.equal(s.mode, 'thread');
  // 支点のタイル（天井の row 0、スパイダーの真上の列）を消す
  const c = Math.floor(s.threadAnchor.x / T);
  remove(0, c);
  s.update();
  assert.equal(s.mode, 'fall');
  for (let i = 0; i < 200 && s.surface !== 'floor'; i++) s.update();
  assert.equal(s.surface, 'floor');
});

test('真上が遠すぎれば糸を使わない', () => {
  // 天井が 12 タイル上（SPIDER_THREAD_MAX_TILES = 10 より遠い）。壁は遠く、床だけを這う
  const { game } = world(roomRows(200, 15));
  const s = onFloor(game, 14, 100);
  for (let i = 0; i < 3000; i++) {
    s.update();
    assert.notEqual(s.mode, 'thread', `frame ${i}`);
  }
});

test('壁から向かいの壁へ跳び移る', () => {
  // 幅 4 タイルの縦穴（内側は col 1..4）。左の壁（col 0）の右面に張り付く
  const rows = [];
  for (let r = 0; r < 20; r++) rows.push(r === 19 ? '######' : '#....#');
  const { game } = world(rows);
  const s = new EnemySpider(game, T, 8 * T, 'wallL');
  s._startLeap();
  assert.equal(s.mode, 'leap');
  for (let i = 0; i < 120 && s.mode === 'leap'; i++) s.update();
  assert.equal(s.surface, 'wallR');
  assert.equal(s.x + S, 5 * T);
});

test('足場を壊すと落ちて床に張り付く', () => {
  const rows = [
    '..........',
    '..........',
    '...####...',
    '..........',
    '..........',
    '..........',
    '##########',
  ];
  const { game, remove } = world(rows);
  const s = onFloor(game, 2, 4);
  for (let c = 3; c < 7; c++) remove(2, c);
  s.update();
  assert.equal(s.mode, 'fall');
  for (let i = 0; i < 120 && s.mode === 'fall'; i++) s.update();
  assert.equal(s.surface, 'floor');
  assert.equal(s.y, 6 * T - S);
});

test('同じ場所に置いた2体は同じ動きをする', () => {
  const a = world(roomRows(30, 14));
  const b = world(roomRows(30, 14));
  const sa = onFloor(a.game, 13, 5);
  const sb = onFloor(b.game, 13, 5);
  for (let i = 0; i < 300; i++) { sa.update(); sb.update(); }
  assert.deepEqual([sa.x, sa.y, sa.surface], [sb.x, sb.y, sb.surface]);
});

test(`HP ${SPIDER_HP} で壊れ、点が入り alive が落ちる`, () => {
  const { game } = world(roomRows(30, 14));
  let score = 0;
  game.addScore = (n) => { score += n; };
  game.spawnDebris = () => {};
  const s = onFloor(game, 13, 5);
  s.takeDamage(SPIDER_HP - 1);
  assert.equal(s.alive, true);
  s.takeDamage(1);
  assert.equal(s.alive, false);
  assert.equal(score, SPIDER_SCORE);
});

// ------------------------------------------
// 撃つ
// ------------------------------------------

/** 床（row の上面）に立つ自機 */
function playerOnFloor(game, row, x) {
  game.player = { x, y: row * T - 24, width: 16, height: 24, alive: true, docked: false };
  return game.player;
}

const shells = (game) => game.enemyBullets.filter((b) => b.isBurstShell);

test('見通しのよい自機には撃ち、弾が狙いの点へ向かう', () => {
  const { game } = world(roomRows(40, 14));
  const s = onFloor(game, 13, 5);
  const p = playerOnFloor(game, 13, s.x + 250);
  s.fireTimer = 0;
  s.update();
  assert.equal(s.mode, 'windup');
  for (let i = 0; i < SPIDER_FIRE_WINDUP + 1; i++) s.update();
  const list = shells(game);
  assert.equal(list.length, 1);
  assert.equal(list[0].target.x, p.x + p.width / 2);
  assert.equal(list[0].target.y, p.y + p.height / 2 - SPIDER_SHELL_AIM_ABOVE);
  assert.ok(list[0].target.frames > 0);
});

test('軌道が岩に当たるなら撃たない', () => {
  // 高さ 2 タイルの低い通路（row 10 が天井）。まっすぐの見通しはあるが、狙いの点が岩の中
  const rows = roomRows(40, 14).map((r, i) => (i === 10 ? '#' + '#'.repeat(38) + '#' : r));
  const { game } = world(rows);
  const s = onFloor(game, 13, 5);
  playerOnFloor(game, 13, s.x + 250);
  s.fireTimer = 0;
  s.update();
  assert.equal(shells(game).length, 0);
  assert.notEqual(s.mode, 'windup');
  assert.equal(s.fireTimer, SPIDER_FIRE_RETRY);
});

test('射程の外には撃たない', () => {
  const { game } = world(roomRows(120, 14));
  const s = onFloor(game, 13, 5);
  playerOnFloor(game, 13, s.x + 1200);
  s.fireTimer = 0;
  for (let i = 0; i < 60; i++) s.update();
  assert.equal(shells(game).length, 0);
});

test('ドック中の自機には撃たない', () => {
  const { game } = world(roomRows(40, 14));
  const s = onFloor(game, 13, 5);
  playerOnFloor(game, 13, s.x + 250).docked = true;
  s.fireTimer = 0;
  for (let i = 0; i < 60; i++) s.update();
  assert.equal(shells(game).length, 0);
});

test('糸にぶら下がっている間は撃たず、張り付いたら撃つ', () => {
  const { game } = world(roomRows(40, 10));
  const s = onFloor(game, 9, 10);
  playerOnFloor(game, 9, s.x + 200);
  s._startThread();
  s.fireTimer = 0;
  let frames = 0;
  while (s.mode === 'thread' && frames < 400) {
    s.update();
    frames++;
    if (s.mode === 'thread') assert.equal(shells(game).length, 0, `frame ${frames}`);
  }
  assert.equal(s.surface, 'ceiling');
  for (let i = 0; i < SPIDER_FIRE_WINDUP + 3; i++) s.update();
  assert.equal(shells(game).length, 1);
});

test('壁の端を越えた小ジャンプは、横へ落ち続けずに普通に落ちる（最終レビュー Important 2）', async () => {
  const { SPIDER_HOP_MAX_FRAMES } = await import('../src/js/utils/Constants.js');
  // 宙に浮いた 1×2 タイルの柱。右面の上の方に張り付き、上へ進みながら小ジャンプ → 柱の上端を越える
  const rows = [];
  for (let r = 0; r < 30; r++) rows.push('.'.repeat(30));
  rows[10] = '.'.repeat(15) + '#' + '.'.repeat(14);
  rows[11] = '.'.repeat(15) + '#' + '.'.repeat(14);
  const { game } = world(rows);
  const s = new EnemySpider(game, 16 * T, 10 * T + 2, 'wallL');
  s.fwd = { x: 0, y: -1 };
  const x0 = s.x;
  s._startHop();
  let maxDx = 0;
  let f = 0;
  for (; f < 200 && s.mode === 'hop'; f++) {
    s.update();
    maxDx = Math.max(maxDx, Math.abs(s.x - x0));
  }
  assert.ok(f <= SPIDER_HOP_MAX_FRAMES + 1, `小ジャンプが ${f} フレーム続いた`);
  assert.ok(maxDx <= 1.5 * T, `横に ${maxDx.toFixed(1)}px 流れた`);
});

test('高さ 8 タイルの低い部屋でも、頭上 SPIDER_SHELL_AIM_ABOVE を狙って撃つ', () => {
  const { game } = world(roomRows(40, 10));
  const s = onFloor(game, 9, 5);
  const p = playerOnFloor(game, 9, s.x + 200);
  const pcy = p.y + p.height / 2;
  s.fireTimer = 0;
  for (let i = 0; i < SPIDER_FIRE_WINDUP + 2; i++) s.update();
  const list = shells(game);
  assert.equal(list.length, 1, '低い部屋で撃たなかった');
  assert.equal(pcy - list[0].target.y, SPIDER_SHELL_AIM_ABOVE);
});

// ------------------------------------------
// 2026-11-23 ユーザー指定: フナムシのような一定の這い方ではなく、ドローンのようなトリッキーな動き。
// 小ジャンプは横跳び
// ------------------------------------------
test('走りは短く速い（ダッシュ）', async () => {
  const { SPIDER_CRAWL_SPEED, SPIDER_RUN_FRAMES, ENEMY_DRONE_SPEED } = await import('../src/js/utils/Constants.js');
  assert.ok(SPIDER_CRAWL_SPEED >= ENEMY_DRONE_SPEED * 0.9, 'ドローンのダッシュ並みの速さでない');
  const { game } = world(roomRows(80, 6));
  const s = onFloor(game, 5, 40);
  s.fireTimer = 1e9;
  // 1回の走り＝同じ向きで crawl が続く間（切り返しは止まらずに逆へ走るので、向きが変わったら別の走り）
  let run = 0, longest = 0, fx = s.fwd.x;
  for (let i = 0; i < 3000; i++) {
    s.update();
    if (s.mode === 'crawl' && s.fwd.x === fx) run++;
    else { longest = Math.max(longest, run); run = s.mode === 'crawl' ? 1 : 0; }
    fx = s.fwd.x;
  }
  assert.ok(longest > 0 && longest <= SPIDER_RUN_FRAMES[1], `一番長い走り ${longest} フレーム`);
});

/** 自機から横にどれだけ離れているか、最後の n フレームの平均 */
function standoff(game, s, p, frames, n) {
  let sum = 0;
  for (let i = 0; i < frames; i++) {
    s.update();
    if (i >= frames - n) sum += Math.abs((s.x + S / 2) - (p.x + p.width / 2));
  }
  return sum / n;
}

test('自機が見えると、ドローンのように自機から一定の間合いの所へ走り寄る', async () => {
  const { SPIDER_ENGAGE_DIST_X, SPIDER_ENGAGE_JITTER } = await import('../src/js/utils/Constants.js');
  // 天井の高い長い部屋（床は row 29）。自機は床の上、スパイダーの 420px 右。
  // スパイダーは壁から離して置く（壁に張り付くと、壁の上の行き先＝自機より上の高さを目指すので横には寄らない）
  const { game } = world(roomRows(80, 30));
  const s = onFloor(game, 29, 20);
  const p = playerOnFloor(game, 29, s.x + 420);
  s.fireTimer = 1e9;   // 撃たせない（動きだけ見る）
  const d = standoff(game, s, p, 600, 300);
  assert.ok(Math.abs(d - SPIDER_ENGAGE_DIST_X) <= SPIDER_ENGAGE_JITTER, `平均の間合い ${d.toFixed(0)}px`);
});

test('自機に近すぎると、間合いの所まで離れる', async () => {
  const { SPIDER_ENGAGE_DIST_X, SPIDER_ENGAGE_JITTER } = await import('../src/js/utils/Constants.js');
  // 1体だと、でたらめに動いてもたまたま間合いに収まることがあった（_seek を外しても通った）ので、何か所かで見る
  for (const col of [30, 36, 42, 48, 54]) {
    const { game } = world(roomRows(80, 30));
    const s = onFloor(game, 29, col);
    const p = playerOnFloor(game, 29, s.x + 20);
    s.fireTimer = 1e9;
    const d = standoff(game, s, p, 600, 300);
    assert.ok(Math.abs(d - SPIDER_ENGAGE_DIST_X) <= SPIDER_ENGAGE_JITTER, `列 ${col}: 平均の間合い ${d.toFixed(0)}px`);
  }
});

test('床の小ジャンプは横跳び（低く、横へ 2 タイル以上）', () => {
  const { game } = world(roomRows(40, 14));
  const s = onFloor(game, 13, 10);
  s.fwd = { x: 1, y: 0 };
  const x0 = s.x, y0 = s.y;
  s._startHop();
  let minY = y0;
  for (let i = 0; i < 120 && s.mode === 'hop'; i++) {
    s.update();
    minY = Math.min(minY, s.y);
  }
  assert.equal(s.surface, 'floor');
  assert.ok(s.x - x0 >= 2 * T, `横に ${(s.x - x0).toFixed(1)}px`);
  assert.ok(y0 - minY <= 12, `高さ ${(y0 - minY).toFixed(1)}px`);
  assert.ok(s.x - x0 > 3 * (y0 - minY), '横より縦に跳んだ');
});

test('横跳びの着地点に面が無ければ逆へ跳び、天井から落ちない', () => {
  // 天井は列 3〜12 だけ（その外は上へ抜けている）。スパイダーは右端近くで右向き → 右へ跳ぶと天井の外
  const rows = [];
  for (let r = 0; r < 20; r++) rows.push('.'.repeat(30));
  rows[2] = '...' + '#'.repeat(10) + '.'.repeat(17);
  const { game } = world(rows);
  const s = new EnemySpider(game, 11 * T + 1, 3 * T, 'ceiling');
  s.fwd = { x: 1, y: 0 };
  s._startHop();
  assert.equal(s.mode, 'hop');
  assert.equal(s.fwd.x, -1, '天井の外へ向かって跳んだ');
  for (let i = 0; i < 60 && s.mode === 'hop'; i++) s.update();
  assert.equal(s.surface, 'ceiling');
});

test('どちらへ跳んでも面が無ければ跳ばない', () => {
  const rows = [];
  for (let r = 0; r < 20; r++) rows.push('.'.repeat(30));
  rows[2] = '.'.repeat(10) + '##' + '.'.repeat(18);
  const { game } = world(rows);
  const s = new EnemySpider(game, 10 * T + 1, 3 * T, 'ceiling');
  s._startHop();
  assert.notEqual(s.mode, 'hop');
  assert.equal(s.surface, 'ceiling');
});

// ------------------------------------------
// 2026-11-23 ユーザー指定: 岩の出っ張った角は、いきなり側面へ移らず回り込む
// ------------------------------------------
test('出っ張った角は、角を軸に回り込んで側面へ移る（1フレームで跳ばない）', async () => {
  // 宙に浮いた 4×4 タイルの岩。上面を右へ走って右の側面へ回る
  const rows = [];
  for (let r = 0; r < 30; r++) rows.push('.'.repeat(30));
  for (let r = 10; r < 14; r++) rows[r] = '.'.repeat(10) + '####' + '.'.repeat(16);
  const { game, map } = world(rows);
  const s = new EnemySpider(game, 12 * T, 10 * T - S, 'floor');
  s.fwd = { x: 1, y: 0 };
  s.fireTimer = 1e9;
  s.mode = 'crawl';
  s.modeTimer = 1000;
  const P = { x: 14 * T, y: 10 * T };   // 回る角
  const isSolid = isSolidOf(map);
  let maxStep = 0;
  const rots = [];
  let px = s.x, py = s.y;
  for (let i = 0; i < 40 && s.surface !== 'wallL'; i++) {
    s.update();
    s.modeTimer = 1000;   // 途中で止まらせない
    maxStep = Math.max(maxStep, Math.hypot(s.x - px, s.y - py));
    px = s.x; py = s.y;
    assert.equal(boxHitsSolid(isSolid, s.x, s.y, S), false, `frame ${i}: 岩にめり込んだ`);
    rots.push(s._drawRotation());
  }
  assert.equal(s.surface, 'wallL', '側面へ回っていない');
  assert.ok(maxStep <= 6, `1フレームで ${maxStep.toFixed(1)}px 跳んだ`);
  assert.ok(rots.some((r) => r > 0.2 && r < Math.PI / 2 - 0.2), `回る途中の向きが無い: ${rots.map((r) => r.toFixed(2))}`);
  // 角の外側を回る（体の中心は角から離れたまま）
  assert.ok(Math.hypot(s.x + S / 2 - P.x, s.y + S / 2 - P.y) < 12);
});

// ------------------------------------------
// 2026-11-23 ユーザー指定: へこんだ角（床から壁へ登るなど）も、一瞬で向きを変えず滑らかに回る
// ------------------------------------------
test('へこんだ角は、その場で体を少しずつ起こして壁へ移る（向きが一瞬で 90° 変わらない）', () => {
  // 部屋の床を右へ走って、右の壁を登る
  const { game, map } = world(roomRows(30, 14));
  const s = onFloor(game, 13, 24);
  s.fwd = { x: 1, y: 0 };
  s.fireTimer = 1e9;
  s.mode = 'crawl';
  s.modeTimer = 1000;
  const isSolid = isSolidOf(map);
  const rots = [];
  let px = s.x, py = s.y, maxStep = 0;
  for (let i = 0; i < 40 && !(s.surface === 'wallR' && s.mode === 'crawl'); i++) {
    s.update();
    s.modeTimer = 1000;
    maxStep = Math.max(maxStep, Math.hypot(s.x - px, s.y - py));
    px = s.x; py = s.y;
    assert.equal(boxHitsSolid(isSolid, s.x, s.y, S), false, `frame ${i}: 岩にめり込んだ`);
    rots.push(s._drawRotation());
  }
  assert.equal(s.surface, 'wallR', '壁へ移っていない');
  assert.ok(maxStep <= 6, `1フレームで ${maxStep.toFixed(1)}px 跳んだ`);
  // 床 0 → 右の壁 −π/2 の途中の向きが2つ以上（1フレームで跳ばない）
  const mid = rots.filter((r) => r < -0.2 && r > -Math.PI / 2 + 0.2);
  assert.ok(mid.length >= 2, `回る途中の向き: ${rots.map((r) => r.toFixed(2))}`);
  // 回り終えたら壁を登り続ける
  const y0 = s.y;
  for (let i = 0; i < 5; i++) { s.update(); s.modeTimer = 1000; }
  assert.ok(s.y < y0 - 8, `登っていない ${y0} → ${s.y}`);
});
