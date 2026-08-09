import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceVolume, loudestHoverVolume, nearestHoveringEnemy, stereoPan } from '../src/js/utils/audioFalloff.js';
import {
  ENEMY_HOVER_AUDIBLE_RANGE, AUDIO_PAN_RANGE, AUDIO_PAN_MAX, CANVAS_WIDTH,
} from '../src/js/utils/Constants.js';

const R = ENEMY_HOVER_AUDIBLE_RANGE;

test('距離0で最大、可聴範囲の外で無音', () => {
  assert.equal(distanceVolume(0, R), 1);
  assert.equal(distanceVolume(R, R), 0);
  assert.equal(distanceVolume(R * 2, R), 0);
});

test('距離が伸びるほど単調に小さくなる', () => {
  let prev = Infinity;
  for (let d = 0; d <= R; d += R / 20) {
    const v = distanceVolume(d, R);
    assert.ok(v <= prev, `${d}px で大きくなった: ${prev} -> ${v}`);
    prev = v;
  }
});

test('近いほど急に大きくなる（線形ではない）', () => {
  // 線形なら中間距離でちょうど 0.5 になる。実際の音の減衰は近距離ほど効くので、
  // 中間では 0.5 より小さくなってほしい
  assert.ok(distanceVolume(R / 2, R) < 0.5,
    `中間距離で線形と同じ: ${distanceVolume(R / 2, R)}`);
});

test('負の距離でも壊れない', () => {
  assert.equal(distanceVolume(-10, R), 1);
});

// --- 複数の敵から1つの音量を決める ---

const hovering = (x, y) => ({ x, y, width: 16, height: 24, alive: true, hovering: true });

test('ホバーしている敵がいなければ無音', () => {
  const enemies = [{ ...hovering(0, 0), hovering: false }];
  assert.equal(loudestHoverVolume(enemies, 0, 0, R), 0);
});

test('死んだ敵は数えない', () => {
  const enemies = [{ ...hovering(0, 0), alive: false }];
  assert.equal(loudestHoverVolume(enemies, 0, 0, R), 0);
});

test('いちばん近い敵の音量になる（合計ではない）', () => {
  const near = hovering(50, 0);
  const far = hovering(R - 10, 0);
  const both = loudestHoverVolume([far, near], 8, 12, R);
  const onlyNear = loudestHoverVolume([near], 8, 12, R);
  assert.ok(Math.abs(both - onlyNear) < 1e-9,
    `合計されている: 2体 ${both} / 近い1体 ${onlyNear}`);
});

test('敵が増えても音量が1を超えない', () => {
  const many = Array.from({ length: 20 }, (_, i) => hovering(i * 2, 0));
  assert.ok(loudestHoverVolume(many, 0, 0, R) <= 1);
});

test('遠ざかると小さくなる', () => {
  const near = loudestHoverVolume([hovering(100, 0)], 0, 0, R);
  const far = loudestHoverVolume([hovering(400, 0)], 0, 0, R);
  assert.ok(far < near, `遠いほうが大きい: 近 ${near} / 遠 ${far}`);
});

test('敵の中心で距離を測る（左上ではない）', () => {
  // 幅16・高さ24 の敵。中心は (x+8, y+12)
  const e = hovering(100, 100);
  const atCenter = loudestHoverVolume([e], 108, 112, R);
  assert.equal(atCenter, 1, '中心にいるのに最大音量でない');
});

test('敵の配列が無くても壊れない', () => {
  assert.equal(loudestHoverVolume(null, 0, 0, R), 0);
  assert.equal(loudestHoverVolume([], 0, 0, R), 0);
});

// --- 左右の振り分け -----------------------------------------------------------

test('聞き手と同じ位置なら中央', () => {
  assert.equal(stereoPan(100, 100), 0);
});

test('右にあれば右、左にあれば左', () => {
  assert.ok(stereoPan(300, 100) > 0, '右の音源が右に振られない');
  assert.ok(stereoPan(-100, 100) < 0, '左の音源が左に振られない');
});

test('離れるほど端に寄る（単調）', () => {
  let prev = -Infinity;
  for (let dx = 0; dx <= AUDIO_PAN_RANGE * 1.5; dx += AUDIO_PAN_RANGE / 12) {
    const v = stereoPan(dx, 0);
    assert.ok(v >= prev - 1e-9, `${dx}px で戻った: ${prev} -> ${v}`);
    prev = v;
  }
});

test('左右に振り切っても片耳だけにはしない', () => {
  // 完全に片方へ振るとヘッドホンで不自然になる
  assert.equal(stereoPan(99999, 0), AUDIO_PAN_MAX);
  assert.equal(stereoPan(-99999, 0), -AUDIO_PAN_MAX);
  assert.ok(AUDIO_PAN_MAX < 1, `振り切っている: ${AUDIO_PAN_MAX}`);
});

test('画面端の音源はほぼ振り切る（画面内の位置が伝わる）', () => {
  // 可聴範囲と揃っていないと、聞こえているのに中央から鳴る音が出る
  const atEdge = Math.abs(stereoPan(CANVAS_WIDTH / 2, 0));
  assert.ok(atEdge > AUDIO_PAN_MAX * 0.8,
    `画面端でも中央寄り: ${atEdge.toFixed(2)}`);
});

test('左右対称', () => {
  for (const dx of [50, 200, 400, 800]) {
    assert.ok(Math.abs(stereoPan(dx, 0) + stereoPan(-dx, 0)) < 1e-9, `${dx}px で非対称`);
  }
});

// --- いちばん近い敵の選別 -----------------------------------------------------

function hoverer(x, y = 0) {
  return { x, y, width: 16, height: 24, alive: true, hovering: true };
}

test('ホバー中の敵がいなければ null（音を止められる）', () => {
  assert.equal(nearestHoveringEnemy([], 0, 0, R), null);
  assert.equal(nearestHoveringEnemy([{ ...hoverer(0), hovering: false }], 0, 0, R), null);
  assert.equal(nearestHoveringEnemy([{ ...hoverer(0), alive: false }], 0, 0, R), null);
});

test('可聴範囲の外しかいなければ null', () => {
  assert.equal(nearestHoveringEnemy([hoverer(R * 2)], 0, 0, R), null);
});

test('いちばん近い1体を返す（合計しないので敵が増えても青天井にならない）', () => {
  const near = nearestHoveringEnemy([hoverer(300), hoverer(100), hoverer(200)], 0, 12, R);
  assert.ok(Math.abs(near.x - 108) < 1e-6, `いちばん近い敵を選んでいない: ${near.x}`);

  // 敵を増やしても音量は最も近い1体ぶんのまま
  const crowd = nearestHoveringEnemy(
    [hoverer(100), hoverer(110), hoverer(120), hoverer(130)], 0, 12, R,
  );
  assert.ok(crowd.volume <= 1, `音量が1を超えた: ${crowd.volume}`);
  assert.ok(Math.abs(crowd.volume - near.volume) < 1e-6, '敵の数で音量が変わっている');
});

test('loudestHoverVolume は従来どおり音量だけを返す', () => {
  const enemies = [hoverer(100), hoverer(300)];
  const near = nearestHoveringEnemy(enemies, 0, 12, R);
  assert.equal(loudestHoverVolume(enemies, 0, 12, R), near.volume);
  assert.equal(loudestHoverVolume([], 0, 12, R), 0);
});

test('選ばれた敵の位置で左右に振れる（右の敵は右から聞こえる）', () => {
  const listenerX = 500;
  const right = nearestHoveringEnemy([hoverer(600)], listenerX, 12, R);
  const left = nearestHoveringEnemy([hoverer(400)], listenerX, 12, R);
  assert.ok(stereoPan(right.x, listenerX) > 0, '右の敵が右から聞こえない');
  assert.ok(stereoPan(left.x, listenerX) < 0, '左の敵が左から聞こえない');
});
