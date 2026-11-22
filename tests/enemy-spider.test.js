// スパイダーの体（entities/EnemySpider.js）。偽の地図（tests/helpers/enemy-world.js）の上で本物を走らせる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EnemySpider } from '../src/js/entities/EnemySpider.js';
import { boxHitsSolid } from '../src/js/utils/surfaceCrawl.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { SPIDER_SIZE, SPIDER_HP, SPIDER_SCORE, TILE_SIZE } from '../src/js/utils/Constants.js';

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
