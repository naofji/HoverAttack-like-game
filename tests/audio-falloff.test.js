import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  offscreenDistance, positionalVolume, nearestHoveringEnemy, stereoPan,
} from '../src/js/utils/audioFalloff.js';
import {
  AUDIO_PAN_RANGE, AUDIO_PAN_MAX, CANVAS_WIDTH, CANVAS_HEIGHT,
  AUDIO_OFFSCREEN_GAIN, AUDIO_OFFSCREEN_FADE,
} from '../src/js/utils/Constants.js';

/** 画面がワールド原点あたりを映している状態。 */
const VIEW = {
  cx: 2000, cy: 1000,
  halfW: CANVAS_WIDTH / 2, halfH: CANVAS_HEIGHT / 2,
};

// --- 画面からのはみ出し -------------------------------------------------------

test('画面の中にいれば 0', () => {
  assert.equal(offscreenDistance(VIEW.cx, VIEW.cy, VIEW), 0);
  assert.equal(offscreenDistance(VIEW.cx + VIEW.halfW, VIEW.cy, VIEW), 0, '右端が外扱い');
  assert.equal(offscreenDistance(VIEW.cx, VIEW.cy - VIEW.halfH, VIEW), 0, '上端が外扱い');
});

test('外に出たぶんだけ増える（縦横それぞれ）', () => {
  assert.equal(offscreenDistance(VIEW.cx + VIEW.halfW + 100, VIEW.cy, VIEW), 100);
  assert.equal(offscreenDistance(VIEW.cx - VIEW.halfW - 40, VIEW.cy, VIEW), 40);
  assert.equal(offscreenDistance(VIEW.cx, VIEW.cy + VIEW.halfH + 70, VIEW), 70);
});

test('斜めは大きい方を採る（平方根を取らない）', () => {
  const d = offscreenDistance(VIEW.cx + VIEW.halfW + 30, VIEW.cy + VIEW.halfH + 90, VIEW);
  assert.equal(d, 90);
});

// --- ホバー音の音量 -----------------------------------------------------------

test('画面に映っている敵は一律で満音量', () => {
  // これが今回の主眼。以前は距離の2乗で減衰させていたため、可聴範囲(480px)が
  // 画面の半分(512px)より狭く、映っている敵が既にほぼ無音だった。
  for (const dx of [0, 128, 256, 384, 511]) {
    assert.equal(positionalVolume(VIEW.cx + dx, VIEW.cy, VIEW), 1,
      `画面内 ${dx}px で減衰している`);
  }
  for (const dy of [0, 200, 383]) {
    assert.equal(positionalVolume(VIEW.cx, VIEW.cy + dy, VIEW), 1,
      `画面内（縦 ${dy}px）で減衰している`);
  }
});

test('画面を出た瞬間に半分になる', () => {
  const justOut = positionalVolume(VIEW.cx + VIEW.halfW + 1, VIEW.cy, VIEW);
  assert.ok(justOut < AUDIO_OFFSCREEN_GAIN
    && justOut > AUDIO_OFFSCREEN_GAIN * 0.99,
    `半分になっていない: ${justOut}`);
});

test('画面外はさらに離れるほど小さくなり、1画面ぶんで無音', () => {
  let prev = Infinity;
  for (let out = 0; out <= AUDIO_OFFSCREEN_FADE; out += 64) {
    const v = positionalVolume(VIEW.cx + VIEW.halfW + out, VIEW.cy, VIEW);
    assert.ok(v <= prev, `${out}px で大きくなった: ${prev} -> ${v}`);
    prev = v;
  }
  assert.equal(positionalVolume(VIEW.cx + VIEW.halfW + AUDIO_OFFSCREEN_FADE, VIEW.cy, VIEW), 0);
});

test('遠くの敵は完全に無音になる', () => {
  // ここを 0 にしないと、マップのどこかに敵がいる限り低い唸りが鳴り続ける
  assert.equal(positionalVolume(VIEW.cx + 99999, VIEW.cy, VIEW), 0);
  assert.equal(positionalVolume(VIEW.cx, VIEW.cy - 99999, VIEW), 0);
});

test('左右対称', () => {
  for (const out of [50, 200, 400]) {
    assert.equal(
      positionalVolume(VIEW.cx + VIEW.halfW + out, VIEW.cy, VIEW),
      positionalVolume(VIEW.cx - VIEW.halfW - out, VIEW.cy, VIEW),
      `${out}px で非対称`,
    );
  }
});

// --- いちばん大きく聞こえる敵の選別 -------------------------------------------

/** 画面中心から dx,dy だけずれた位置にホバーする敵。 */
function hoverer(dx, dy = 0) {
  return {
    x: VIEW.cx + dx - 8, y: VIEW.cy + dy - 12,
    width: 16, height: 24, alive: true, hovering: true,
  };
}

test('ホバー中の敵がいなければ null（音を止められる）', () => {
  const view = VIEW;
  assert.equal(nearestHoveringEnemy([], view), null);
  assert.equal(nearestHoveringEnemy(null, view), null);
  assert.equal(nearestHoveringEnemy([{ ...hoverer(0), hovering: false }], view), null);
  assert.equal(nearestHoveringEnemy([{ ...hoverer(0), alive: false }], view), null);
});

test('遠すぎる敵しかいなければ null', () => {
  assert.equal(nearestHoveringEnemy([hoverer(99999)], VIEW), null);
});

test('いちばん大きく聞こえる1体を返す（合計しないので青天井にならない）', () => {
  const offscreen = VIEW.halfW + 200;
  const best = nearestHoveringEnemy([hoverer(offscreen), hoverer(100)], VIEW);
  assert.equal(best.volume, 1, '画面内の敵より画面外を選んでいる');
  assert.ok(Math.abs(best.x - (VIEW.cx + 100)) < 1e-6);

  // 敵を増やしても音量は1体ぶんのまま
  const crowd = nearestHoveringEnemy(
    [hoverer(0), hoverer(50), hoverer(100), hoverer(150)], VIEW,
  );
  assert.equal(crowd.volume, 1, `音量が1体ぶんを超えた: ${crowd.volume}`);
});

test('画面内に誰もいなければ、いちばん近い画面外の敵を拾う', () => {
  const near = VIEW.halfW + 100;
  const far = VIEW.halfW + 400;
  const best = nearestHoveringEnemy([hoverer(far), hoverer(near)], VIEW);
  assert.ok(Math.abs(best.x - (VIEW.cx + near)) < 1e-6, '遠い方を選んでいる');
  assert.ok(best.volume < AUDIO_OFFSCREEN_GAIN);
});

test('選ばれた敵の位置で左右に振れる', () => {
  const right = nearestHoveringEnemy([hoverer(300)], VIEW);
  const left = nearestHoveringEnemy([hoverer(-300)], VIEW);
  assert.ok(stereoPan(right.x, VIEW.cx) > 0, '右の敵が右から聞こえない');
  assert.ok(stereoPan(left.x, VIEW.cx) < 0, '左の敵が左から聞こえない');
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

test('振り切っても片側の成分を残す', () => {
  // 等パワー則では pan が 1 に近づくほど片側が痩せ、モノラル環境で目減りする。
  // pan=0.85 だと -2.1dB 落ちて「遠くなった」と感じたため上限を下げてある。
  assert.equal(stereoPan(99999, 0), AUDIO_PAN_MAX);
  assert.equal(stereoPan(-99999, 0), -AUDIO_PAN_MAX);
  assert.ok(AUDIO_PAN_MAX <= 0.7, `振り切りすぎ: ${AUDIO_PAN_MAX}`);
});

test('画面端の音源は左右がはっきり分かれる', () => {
  const atEdge = Math.abs(stereoPan(CANVAS_WIDTH / 2, 0));
  assert.ok(atEdge > AUDIO_PAN_MAX * 0.8, `画面端でも中央寄り: ${atEdge.toFixed(2)}`);
  // 等パワー則での左右差が 6dB 以上あれば方向は聞き分けられる
  const x = (atEdge + 1) / 2;
  const diff = 20 * Math.log10(Math.sin(x * Math.PI / 2) / Math.cos(x * Math.PI / 2));
  assert.ok(diff >= 6, `左右差が小さく方向が分からない: ${diff.toFixed(1)}dB`);
});

test('左右対称（パン）', () => {
  for (const dx of [50, 200, 400, 800]) {
    assert.ok(Math.abs(stereoPan(dx, 0) + stereoPan(-dx, 0)) < 1e-9, `${dx}px で非対称`);
  }
});

test('画面の縦横は音の判定と食い違わない', () => {
  assert.equal(VIEW.halfW, CANVAS_WIDTH / 2);
  assert.equal(VIEW.halfH, CANVAS_HEIGHT / 2);
  assert.equal(AUDIO_PAN_RANGE, CANVAS_WIDTH / 2, 'パンの範囲が画面幅とずれている');
});
