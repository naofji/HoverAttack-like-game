import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { Game } from '../src/js/main.js';
import {
  SE_MASTER_GAIN, SE_COMP_THRESHOLD, SE_COMP_RATIO, SE_COMP_ATTACK,
  SE_FADE_OUT_SECONDS,
} from '../src/js/utils/Constants.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';

/**
 * 効果音の実装が置いてあるファイル一式。**AudioManager.js だけを見ない。**
 *
 * 音の系統ごとに audio/sounds/ と audio/engine/ へ分けたので、1ファイルだけを
 * 読むと「移した先は見張りの外」になる（実際、ジングルを移しただけで下の
 * fnMaster のテストが落ちた）。BGM の2ファイルは**わざと外している** ──
 * あちらは効果音バスを通さず出力へ直結するのが正しい。
 */
const seSourceFiles = () => {
  const files = [new URL('../src/js/audio/AudioManager.js', import.meta.url)];
  for (const dir of ['sounds', 'engine']) {
    const d = new URL(`../src/js/audio/${dir}/`, import.meta.url);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) if (f.endsWith('.js')) files.push(new URL(f, d));
  }
  return files.map((u) => ({ label: u.pathname.split('/').pop(), text: readFileSync(u, 'utf8') }));
};

const SOURCE = seSourceFiles().map((f) => f.text).join('\n');

/** dst まで辿り着けるか（間に何が挟まっていてもよい）。 */
function reaches(node, dst, seen = new Set()) {
  if (node === dst) return true;
  if (seen.has(node)) return false;
  seen.add(node);
  return (node.outputs || []).some((n) => reaches(n, dst, seen));
}

/**
 * fn が新しく作ったノードだけを返す。
 * 「この呼び出しが何を組んだか」を、バスの組み立て分と混ぜずに見るため。
 */
function nodesMadeBy(ctx, fn) {
  const before = ctx.created.length;
  fn();
  return ctx.created.slice(before);
}

// --- バスの組み立て -----------------------------------------------------------

test('効果音は フェード段 → ユーザー音量 → 底上げ → リミッタ → 出力 の順に通る', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    const fade = audioManager.seFade;
    const userGain = audioManager.seUserGain;
    const master = audioManager.seMaster;

    assert.equal(fade.gain.value, 1, 'フェード段は素通しで始まる');
    assert.equal(userGain.gain.value, 1.0, 'ユーザー音量は既定で素通し');
    assert.equal(master.gain.value, SE_MASTER_GAIN);
    assert.equal(fade.outputs[0], userGain, 'フェード段がユーザー音量に繋がっていない');
    assert.equal(userGain.outputs[0], master, 'ユーザー音量が底上げに繋がっていない');

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

  // ここまでは「バスの形」の確認。**実際に鳴らして経路を辿る**のが本題。
  //
  // 以前はソースに `fnMaster.connect(this._stingDest());` という文字列が
  // あるかを見ていた。実装をファイルごと移しただけで落ちるし（実際に落ちた）、
  // 逆に文字列だけ残して到達不能になっても気づけない。
  const ctx2 = fakeAudioCtx();
  withCtx(ctx2, () => {
    audioManager._createSeBus();
    const made = nodesMadeBy(ctx2, () => audioManager.playGameOver());
    assert.ok(made.length > 0, 'playGameOver が何も鳴らしていない');

    // (1) 曲は効果音のフェード段を通らない ── 通ると fadeOutSe() で一緒に消える
    for (const n of made) {
      assert.ok(!reaches(n, audioManager.seFade),
        '曲がフェード段を通っている（効果音を引くと曲も消える）');
    }
    // (2) それでも底上げとリミッタは共有する ── 直結すると音量が揃わず割れる
    assert.ok(made.some((n) => reaches(n, audioManager.seMaster)),
      '曲が seMaster を通っていない（底上げとリミッタを共有していない）');
    // (3) 最終的には出力へ届く
    assert.ok(made.some((n) => reaches(n, ctx2.destination)),
      '曲が出力へ届いていない');
  });
});

/** audioManager のメソッドを記録用に差し替え、必ず元へ戻す。 */
function spyAudio(names, fn) {
  const saved = {};
  const calls = [];
  for (const n of names) {
    saved[n] = audioManager[n];
    audioManager[n] = (...args) => { calls.push(n); };
  }
  try { fn(calls); } finally { Object.assign(audioManager, saved); }
  return calls;
}

test('ゲームオーバーで効果音を引いてから曲を鳴らす', () => {
  // 以前は main.js のソースから文字列の**出現順**を見ていた。行を並べ替えず
  // 早期 return を1つ足すだけで実際の順序は変わるのに、テストは通ってしまう。
  // 実際に走らせて呼ばれた順を見る。
  const g = Object.create(Game);
  Object.assign(g, { gameState: 'playing', stateTimer: 99 });

  const calls = spyAudio(['stopBGM', 'fadeOutSe', 'playGameOver'], () => {
    g._triggerGameOver();
  });

  assert.equal(g.gameState, 'gameover', 'ゲームオーバーに入っていない');
  assert.ok(calls.includes('fadeOutSe'), 'ゲームオーバーで効果音を引いていない');
  assert.ok(calls.includes('playGameOver'), '曲を鳴らしていない');
  assert.ok(calls.indexOf('fadeOutSe') < calls.indexOf('playGameOver'),
    `曲を鳴らしてから引いている: ${calls.join(' → ')}`);
});

test('プレイに戻ると、引いた効果音が戻る', () => {
  // 'playing' に入る経路が8箇所あるので update() がまとめて面倒を見ている。
  // 「resumeSe という文字列が main.js にある」ではなく、実際に呼ばれるかを見る。
  for (const [state, expected] of [['playing', true], ['gameover', false]]) {
    const g = Object.create(Game);
    Object.assign(g, {
      gameState: state, settings: { ...DEFAULT_SETTINGS },
      missionTimer: 0, totalTime: 0, simAccumulator: 0, gameSpeed: 1,
      camera: { x: 0, y: 0 }, enemies: [], stateTimer: 0,
      input: {
        isKeyPressed: () => false, isKeyDown: () => false,
        isCharPressed: () => false, isLeftClickPressed: () => false,
        isRightClickPressed: () => false, getTypedChars: () => [],
        crosshairLocked: false, mouse: { x: 0, y: 0, left: false }, endFrame() {},
      },
    });
    // 状態ごとの更新は本題ではないので黙らせる（resumeSe が呼ばれるかだけ見る）
    g._updateGameState = () => {};

    const calls = spyAudio(['resumeSe'], () => { g.update(16); });
    assert.equal(calls.includes('resumeSe'), expected,
      `${state} のとき resumeSe が ${expected ? '呼ばれていない' : '呼ばれている'}`);
  }
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
  // ファイルごとに見る（連結して数えると行番号が意味を失うため）
  const lines = seSourceFiles().flatMap((f) => f.text.split('\n')
    .map((l, i) => ({ where: `${f.label}:${i + 1}`, text: l.trim() }))
    .filter((l) => l.text.includes('this.ctx.destination'))
    .filter((l) => !allowed.includes(l.text)));
  assert.deepEqual(lines, [],
    `効果音がバスを通らず出力へ直結している:\n${lines.map((l) => `  ${l.where}: ${l.text}`).join('\n')}`);
});

// --- ゲームオーバーのジングルが全体音量に従うこと ---------------------------
//
// playGameOver() は _stingDest()（seFade より後ろ）に繋がるので SE 音量には
// 従わない（意図的、上のテストどおり）。だが「全体音量」は文字どおり全部を
// 指すはずで、これまでは全体音量 0 で死んでも満音量で鳴っていた不具合があった。
// applySettings() が覚えておく stingMasterVolume を、鳴らす瞬間に一度だけ
// 掛けているかをここで確かめる。

// fnMaster は playGameOver() の中で最初に作る createGain()。_createSeBus() が
// 先に3つゲインノードを作っているので、その後にできた最初の gain ノードを探す。
function findFnMaster(ctx) {
  const before = ctx.created.length;
  audioManager.playGameOver();
  return ctx.created.slice(before).find((n) => n.name === 'gain');
}

test('全体音量 0 でゲームオーバーのジングルのゲインが 0 になる', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    audioManager.stingMasterVolume = 0;
    const fnMaster = findFnMaster(ctx);
    assert.ok(fnMaster, 'ジングルのマスターゲインが見当たらない');
    assert.equal(fnMaster.gain.value, 0, '全体音量 0 なのにゲインが 0 でない');
  });
});

test('全体音量 1 ならゲームオーバーのジングルは従来と同じゲイン（0.4）', () => {
  const ctx = fakeAudioCtx();
  withCtx(ctx, () => {
    audioManager._createSeBus();
    audioManager.stingMasterVolume = 1;
    const fnMaster = findFnMaster(ctx);
    assert.equal(fnMaster.gain.value, 0.4, '既存の音量バランスが変わっている');
  });
});

// stingMasterVolume は applySettings() が覚える。SE 音量には従わないので
// seUserVolume とは別に扱われていること（(2) の実装が正しい段に効くこと）を確かめる。
test('applySettings がマスター単体を stingMasterVolume に覚える', () => {
  audioManager.applySettings({ ...DEFAULT_SETTINGS, masterVolume: 0.3, seVolume: 1, bgmVolume: 1 });
  assert.equal(audioManager.stingMasterVolume, 0.3);
});

test('BGM は効果音のバスを通さない（BGM 音量と独立させるため）', () => {
  for (const file of ['BGMManager.js', 'MP3BGMManager.js']) {
    const src = readFileSync(new URL(`../src/js/audio/${file}`, import.meta.url), 'utf8');
    assert.ok(!src.includes('seFade') && !src.includes('seMaster'),
      `${file} が効果音のバスを参照している`);
    assert.ok(src.includes('this.ctx.destination'), `${file} が出力へ繋がっていない`);
  }
});
