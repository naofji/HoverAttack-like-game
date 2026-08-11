import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioManager } from '../src/js/audio/AudioManager.js';
import {
  SE_MASTER_GAIN, SE_COMP_THRESHOLD, SE_COMP_RATIO, SE_COMP_ATTACK,
  SE_FADE_OUT_SECONDS,
} from '../src/js/utils/Constants.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';

const SOURCE = readFileSync(new URL('../src/js/audio/AudioManager.js', import.meta.url), 'utf8');

/** dst まで辿り着けるか（間に何が挟まっていてもよい）。 */
function reaches(node, dst, seen = new Set()) {
  if (node === dst) return true;
  if (seen.has(node)) return false;
  seen.add(node);
  return (node.outputs || []).some((n) => reaches(n, dst, seen));
}

// --- バスの組み立て -----------------------------------------------------------

test('効果音は フェード段 → 底上げ → リミッタ → 出力 の順に通る', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    const fade = audioManager.seFade;
    const master = audioManager.seMaster;

    assert.equal(fade.gain.value, 1, 'フェード段は素通しで始まる');
    assert.equal(master.gain.value, SE_MASTER_GAIN);
    assert.equal(fade.outputs[0], master, 'フェード段が底上げに繋がっていない');

    const comp = master.outputs[0];
    assert.equal(comp.name, 'compressor', 'リミッタを通さずに出力へ繋いでいる');
    assert.equal(comp.outputs[0], ctx.destination);
  });
});

test('リミッタの設定値が定数どおり', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    const comp = audioManager.seMaster.outputs[0];
    assert.equal(comp.threshold.value, SE_COMP_THRESHOLD);
    assert.equal(comp.ratio.value, SE_COMP_RATIO);
    assert.equal(comp.attack.value, SE_COMP_ATTACK);
  });
});

test('持ち上げは 1.0 を超える（そうでないと底上げにならない）', () => {
  assert.ok(SE_MASTER_GAIN > 1, `底上げになっていない: ${SE_MASTER_GAIN}`);
  assert.ok(SE_COMP_RATIO > 1 && SE_COMP_THRESHOLD < 0, 'リミッタが効いていない設定');
});

test('DynamicsCompressor の無い環境では素通しして出力へ繋ぐ', () => {
  const ctx = fakeAudioCtx();
  delete ctx.createDynamicsCompressor;
  withCtx(ctx, () => {
    audioManager._createSeBus();
    assert.equal(audioManager.seMaster.outputs[0], ctx.destination);
  });
});

// --- 効果音がバスを通ること ---------------------------------------------------

test('位置つきの音はパンナーを経てフェード段へ入る（出力へ直結しない）', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    audioManager.setListenerX(0);
    const out = audioManager._out(300);
    assert.equal(out.name, 'panner');
    assert.equal(out.outputs[0], audioManager.seFade, 'パンナーが出力へ直結している');
    assert.ok(reaches(out, ctx.destination));
  });
});

test('位置なしの音もフェード段へ入る（全体の底上げから漏れない）', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    assert.equal(audioManager._out(undefined), audioManager.seFade);
    assert.equal(audioManager._seDest(), audioManager.seFade);
  });
});

test('バスが未構築でも落ちない', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    assert.equal(audioManager._seDest(), ctx.destination);
    assert.equal(audioManager._stingDest(), ctx.destination);
  });
});

// --- ゲームオーバーのフェード ---------------------------------------------------

test('効果音だけを滑らかに引く', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    audioManager.fadeOutSe();

    const ramps = audioManager.seFade.gain.events.filter((e) => e[0] === 'ramp');
    assert.equal(ramps.length, 1, 'フェードが1回で行われていない');
    assert.equal(ramps[0][1], 0, '0 まで引いていない');
    assert.equal(ramps[0][2], SE_FADE_OUT_SECONDS, '指定の時間で引いていない');
    // 底上げ側は触らない。ここを動かすと戻し忘れで全部無音になる
    assert.equal(audioManager.seMaster.gain.value, SE_MASTER_GAIN);
  });
});

test('ぶつ切りにしない（時間をかけて引く）', () => {
  assert.ok(SE_FADE_OUT_SECONDS > 0.1, `短すぎて途切れて聞こえる: ${SE_FADE_OUT_SECONDS}秒`);
  assert.ok(SE_FADE_OUT_SECONDS < 1.5, `長すぎて終わった感じにならない: ${SE_FADE_OUT_SECONDS}秒`);
});

test('持続音は音源ごと止める（戻したときに鳴り出さないように）', () => {
  const ctx = fakeAudioCtx();
  const stopped = [];
  const saved = {
    h: audioManager.stopHover, e: audioManager.stopEnemyHover, c: audioManager.stopCarrierEngine,
  };
  audioManager.stopHover = () => stopped.push('hover');
  audioManager.stopEnemyHover = () => stopped.push('enemyHover');
  audioManager.stopCarrierEngine = () => stopped.push('carrier');
  try {
    withCtx(ctx, () => { audioManager._createSeBus(); audioManager.fadeOutSe(); });
  } finally {
    audioManager.stopHover = saved.h;
    audioManager.stopEnemyHover = saved.e;
    audioManager.stopCarrierEngine = saved.c;
  }
  assert.deepEqual(stopped.sort(), ['carrier', 'enemyHover', 'hover']);
});

test('戻すと元の音量に復帰する', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    audioManager.fadeOutSe();
    assert.equal(audioManager.seFaded, true);

    audioManager.resumeSe();
    assert.equal(audioManager.seFaded, false);
    assert.equal(audioManager.seFade.gain.value, 1, '素通しに戻っていない');
  });
});

test('引いていないときに戻しても何もしない（毎フレーム呼べる）', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    const before = audioManager.seFade.gain.events.length;
    audioManager.resumeSe();
    audioManager.resumeSe();
    assert.equal(audioManager.seFade.gain.events.length, before,
      '呼ぶたびに音量を書き換えている');
  });
});

test('ゲームオーバーの曲はフェード段を通さない（引いても消えない）', () => {
  // 効果音と一緒に消えては困る。底上げとリミッタは共有する。
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    assert.equal(audioManager._stingDest(), audioManager.seMaster);
    assert.notEqual(audioManager._stingDest(), audioManager.seFade);
    assert.ok(reaches(audioManager._stingDest(), ctx.destination));
  });
  assert.ok(SOURCE.includes('fnMaster.connect(this._stingDest());'),
    'playGameOver が効果音のフェード段に繋がっている');
});

test('ゲームオーバーで効果音を引いてから曲を鳴らす', () => {
  const main = readFileSync(new URL('../src/js/main.js', import.meta.url), 'utf8');
  const fade = main.indexOf('audioManager.fadeOutSe()');
  const sting = main.indexOf('audioManager.playGameOver()');
  assert.ok(fade > 0, 'ゲームオーバーで効果音を引いていない');
  assert.ok(sting > fade, '曲を鳴らしてから引いている');
  assert.ok(main.includes('audioManager.resumeSe()'), '引いた効果音を戻す処理が無い');
});

// --- 置換漏れが無いこと -------------------------------------------------------

test('効果音の実装が出力へ直結していない', () => {
  // 29箇所を機械的に置換したので、取りこぼしをここで止める。
  // ctx.destination を名指ししてよいのはバスの組み立てと素通しの箇所だけ。
  const allowed = [
    'comp.connect(this.ctx.destination);',
    'this.seMaster.connect(this.ctx.destination);',
    'return this.seFade || this.ctx.destination;',
    'return this.seMaster || this.ctx.destination;',
  ];
  const lines = SOURCE.split('\n')
    .map((l, i) => ({ n: i + 1, text: l.trim() }))
    .filter((l) => l.text.includes('this.ctx.destination'))
    .filter((l) => !allowed.includes(l.text));
  assert.deepEqual(lines, [],
    `効果音がバスを通らず出力へ直結している:\n${lines.map((l) => `  ${l.n}: ${l.text}`).join('\n')}`);
});

test('BGM は効果音のバスを通さない（BGM 音量と独立させるため）', () => {
  for (const file of ['BGMManager.js', 'MP3BGMManager.js']) {
    const src = readFileSync(new URL(`../src/js/audio/${file}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('seFade') && !src.includes('seMaster'),
      `${file} が効果音のバスを参照している`);
    assert.ok(src.includes('this.ctx.destination'), `${file} が出力へ繋がっていない`);
  }
});
