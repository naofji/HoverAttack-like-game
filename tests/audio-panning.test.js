import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { stereoPan } from '../src/js/utils/audioFalloff.js';
import { AUDIO_PAN_MAX, CANVAS_WIDTH } from '../src/js/utils/Constants.js';

/** StereoPannerNode を持つ最小の AudioContext もどき。 */
function fakeCtx() {
  const ctx = {
    destination: { name: 'destination' },
    panners: [],
    createStereoPanner() {
      const p = { pan: { value: 0 }, connectedTo: null, connect(n) { this.connectedTo = n; } };
      ctx.panners.push(p);
      return p;
    },
  };
  return ctx;
}

/** ctx と聞き手を差し替えて試し、必ず元へ戻す。 */
function withCtx(ctx, listenerX, fn) {
  const savedCtx = audioManager.ctx;
  const savedListener = audioManager.listenerX;
  audioManager.ctx = ctx;
  audioManager.setListenerX(listenerX);
  try { return fn(); } finally {
    audioManager.ctx = savedCtx;
    audioManager.listenerX = savedListener;
  }
}

const CENTER = 1000;   // 画面中心のワールドX

// --- 聞き手の設定 -------------------------------------------------------------

test('聞き手が未設定なら定位しない（メニュー中など）', () => {
  const ctx = fakeCtx();
  withCtx(ctx, null, () => {
    assert.equal(audioManager._panFor(CENTER + 300), 0);
    assert.equal(audioManager._out(CENTER + 300), ctx.destination);
  });
});

test('setListenerX は有限数以外を受けたら定位を止める', () => {
  const saved = audioManager.listenerX;
  try {
    audioManager.setListenerX(500);
    assert.equal(audioManager.listenerX, 500);
    // NaN をそのまま持つと pan.value が NaN になり WebAudio が例外を投げる
    for (const bad of [undefined, null, NaN, Infinity, '300']) {
      audioManager.setListenerX(bad);
      assert.equal(audioManager.listenerX, null, `${String(bad)} を受け入れている`);
    }
    // 0 は正当な座標なので残す
    audioManager.setListenerX(0);
    assert.equal(audioManager.listenerX, 0);
  } finally { audioManager.listenerX = saved; }
});

// --- ワールドX から左右へ -----------------------------------------------------

test('音源のワールドX を渡すだけで左右に振れる（呼び出し側は計算しない）', () => {
  const ctx = fakeCtx();
  withCtx(ctx, CENTER, () => {
    assert.ok(audioManager._panFor(CENTER + 300) > 0, '右の音源が右から鳴らない');
    assert.ok(audioManager._panFor(CENTER - 300) < 0, '左の音源が左から鳴らない');
    assert.equal(audioManager._panFor(CENTER), 0, '画面中心の音源が中央でない');
  });
});

test('位置を省略した音は中央のまま（UI・自機の操作音）', () => {
  const ctx = fakeCtx();
  withCtx(ctx, CENTER, () => {
    assert.equal(audioManager._panFor(undefined), 0);
    assert.equal(audioManager._out(undefined), ctx.destination);
    assert.equal(ctx.panners.length, 0, '中央の音でパンナーを作っている');
  });
});

test('ワールドX が 0 でも「位置なし」と混同しない', () => {
  // 0 は falsy なので、雑な判定だと原点の音源が中央に落ちる
  const ctx = fakeCtx();
  withCtx(ctx, CENTER, () => {
    assert.ok(audioManager._panFor(0) < 0, `原点の音源が中央に落ちた: ${audioManager._panFor(0)}`);
  });
});

test('画面中心が基準なので、画面端の音源はほぼ振り切る', () => {
  const ctx = fakeCtx();
  withCtx(ctx, CENTER, () => {
    const edge = Math.abs(audioManager._panFor(CENTER + CANVAS_WIDTH / 2));
    assert.ok(edge > AUDIO_PAN_MAX * 0.8, `画面端でも中央寄り: ${edge.toFixed(2)}`);
  });
});

test('聞き手が動けば同じ音源の定位も動く', () => {
  const ctx = fakeCtx();
  const sourceX = 1200;
  const a = withCtx(ctx, 1000, () => audioManager._panFor(sourceX));   // 音源は右
  const b = withCtx(ctx, 1400, () => audioManager._panFor(sourceX));   // 音源は左
  assert.ok(a > 0 && b < 0, `カメラの移動が定位に反映されない: ${a} / ${b}`);
});

// --- 出力ノードの組み立て -----------------------------------------------------

test('定位が要るときだけ destination の手前にパンナーが入る', () => {
  const ctx = fakeCtx();
  const out = withCtx(ctx, CENTER, () => audioManager._out(CENTER + 300));
  assert.equal(ctx.panners.length, 1);
  assert.equal(out, ctx.panners[0], 'パンナーが出力になっていない');
  assert.equal(out.pan.value, stereoPan(CENTER + 300, CENTER));
  assert.equal(out.connectedTo, ctx.destination, 'destination に繋がっていない');
});

test('パンは -1..1 に収まる（範囲外だと WebAudio が例外を投げる）', () => {
  const ctx = fakeCtx();
  withCtx(ctx, CENTER, () => {
    for (const x of [CENTER + 999999, CENTER - 999999]) {
      const v = audioManager._out(x).pan.value;
      assert.ok(v >= -1 && v <= 1, `範囲外: ${v}`);
    }
  });
  assert.ok(AUDIO_PAN_MAX <= 1);
});

test('StereoPanner の無いブラウザでは直結に落ちる', () => {
  const ctx = fakeCtx();
  delete ctx.createStereoPanner;
  assert.equal(withCtx(ctx, CENTER, () => audioManager._out(CENTER + 400)), ctx.destination);
});
