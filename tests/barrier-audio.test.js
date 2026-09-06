import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audioManager } from '../src/js/audio/AudioManager.js';
import { FortressBarrier } from '../src/js/entities/FortressBarrier.js';
import { Game } from '../src/js/main.js';
import { nearestActiveBarrier } from '../src/js/utils/audioFalloff.js';
import { BARRIER_EMITTER_HP } from '../src/js/utils/Constants.js';

/** audioManager の呼び出しを記録する（tests/audio-wiring.test.js の spyAudio と同じ流儀）。 */
function spyAudio(names) {
  const calls = [];
  const originals = {};
  for (const n of names) {
    originals[n] = audioManager[n];
    audioManager[n] = (...args) => calls.push({ name: n, args });
  }
  return {
    calls,
    count(n) { return calls.filter((c) => c.name === n).length; },
    restore() { for (const n of names) audioManager[n] = originals[n]; },
  };
}

function makeGame(over = {}) {
  return {
    particles: [], projectiles: [], enemies: [], barriers: [],
    player: null, carrier: null, camera: null,
    spawnExplosion() {}, spawnDebris() {}, addScore() {},
    ...over,
  };
}

const SPEC = { c: 10, top: 4, bottom: 8 };

test('弾を吸うたびに吸収音が鳴る', () => {
  const spy = spyAudio(['playBarrierAbsorb', 'playBarrierDown']);
  try {
    const game = makeGame();
    const b = new FortressBarrier(game, SPEC);
    game.projectiles = [{ x: b.fieldX + 1, y: b.fieldY + 4, alive: true, exploded: false, isPlayerOwned: false }];
    b.update();
    assert.equal(spy.count('playBarrierAbsorb'), 1, '吸収音が鳴っていない');
    assert.equal(spy.count('playBarrierDown'), 0, 'まだ落ちていないのに落下音が鳴った');
  } finally { spy.restore(); }
});

test('落下音は2基目を壊した瞬間にだけ鳴る', () => {
  const spy = spyAudio(['playBarrierDown']);
  try {
    const b = new FortressBarrier(makeGame(), SPEC);
    b.damageEmitter('top', BARRIER_EMITTER_HP);
    assert.equal(spy.count('playBarrierDown'), 0, '1基目で落下音が鳴った');
    b.damageEmitter('bottom', BARRIER_EMITTER_HP);
    assert.equal(spy.count('playBarrierDown'), 1, '2基目で落下音が鳴らない');
  } finally { spy.restore(); }
});

test('唸りは一番近い1本の音量で鳴り、聞こえなければ 0 を渡す', () => {
  const spy = spyAudio(['setBarrierHum']);
  try {
    const near = new FortressBarrier(makeGame(), { c: 10, top: 4, bottom: 8 });
    const far = new FortressBarrier(makeGame(), { c: 900, top: 4, bottom: 8 });
    const fake = {
      barriers: [far, near],
      _viewRect: () => ({ cx: near.fieldX, cy: near.fieldY, halfW: 683, halfH: 384 }),
    };
    Game._updateBarrierSound.call(fake);
    assert.equal(spy.count('setBarrierHum'), 1);
    const [volume, x] = spy.calls[0].args;
    assert.ok(volume > 0, '近いバリアが聞こえていない');
    assert.ok(Math.abs(x - (near.fieldX + near.fieldW / 2)) < 1, '近いほうの位置で鳴っていない');

    // 遠くしか無ければ 0
    spy.calls.length = 0;
    const away = { barriers: [far], _viewRect: () => ({ cx: 0, cy: 0, halfW: 683, halfH: 384 }) };
    Game._updateBarrierSound.call(away);
    assert.deepEqual(spy.calls[0].args, [0, null]);
  } finally { spy.restore(); }
});

test('消えたバリアは唸らない', () => {
  const b = new FortressBarrier(makeGame(), SPEC);
  b.damageEmitter('top', BARRIER_EMITTER_HP);
  b.damageEmitter('bottom', BARRIER_EMITTER_HP);
  const view = { cx: b.fieldX, cy: b.fieldY, halfW: 683, halfH: 384 };
  assert.equal(nearestActiveBarrier([b], view), null);
});

test('バリアの音は3つとも引数なしで呼んでも例外を投げない', () => {
  audioManager.setBarrierHum();
  audioManager.stopBarrierHum();
  audioManager.playBarrierAbsorb();
  audioManager.playBarrierDown();
  assert.ok(true);
});

// --- 音量の実測（A特性）---
// 「音作りを変えたら A特性で音量を実測する」（CLAUDE.md）。狭いバンドパスで
// エネルギーを捨てたぶんを補正し忘れて聞こえない音になった前例があるため、
// 相対 dB をここで縛る。合成は tools/render-barrier-sounds.mjs と同じ設計。
import { aWeightedRms, transientLevel, db } from './helpers/dsp.js';
import { humGen, absorbGen, downGen } from '../tools/render-barrier-sounds.mjs';
import {
  BARRIER_ABSORB_DECAY, BARRIER_DOWN_TIME, BARRIER_HUM_FREQ, BARRIER_HUM_HARMONIC,
  REPAIR_HUM_FREQ_TO, REPAIR_HUM_GAIN,
} from '../src/js/utils/Constants.js';

test('吸収音は唸りに埋もれず、かつ大きすぎない', () => {
  const hum = aWeightedRms(humGen());
  const absorb = transientLevel(absorbGen(), BARRIER_ABSORB_DECAY);
  const diff = db(absorb / hum);
  assert.ok(diff > 0.5,
    `吸収(${db(absorb).toFixed(1)}dB) が唸り(${db(hum).toFixed(1)}dB) に埋もれる（差 ${diff.toFixed(1)}dB）`);
  // 吸うたびに鳴るので、耳障りにならない範囲に収める
  assert.ok(diff < 8, `吸収音が大きすぎる（差 ${diff.toFixed(1)}dB）`);
});

test('唸りは回復ハムより控えめ（実機で「うざい」と出たので下げた）', () => {
  const hum = aWeightedRms(humGen());
  const repair = aWeightedRms(repairHumGen());
  const diff = db(hum / repair);
  assert.ok(diff < -3, `唸りが控えめでない（回復ハムとの差 ${diff.toFixed(1)}dB）`);
  // 下げすぎて聞こえないのも困る。**実際に一度 -54dB まで落として下げすぎた**
  assert.ok(diff > -10, `唸りが小さすぎて聞こえない（差 ${diff.toFixed(1)}dB）`);
});

test('唸りは低い唸りではなく細い高音（母艦エンジンと帯域を分ける）', () => {
  assert.ok(BARRIER_HUM_FREQ >= 200, `芯が低すぎる (${BARRIER_HUM_FREQ}Hz)`);
  assert.equal(BARRIER_HUM_HARMONIC, 0, '倍音の矩形波が復活している（低域が太る）');
});

/** 比較用: 回復ハム（三角波）。tools/render-barrier-sounds.mjs と同じ。 */
function repairHumGen() {
  const SR = 48000;
  return (i) => {
    const t = i / SR;
    const phase = (t * REPAIR_HUM_FREQ_TO) % 1;
    return (4 * Math.abs(phase - 0.5) - 1) * REPAIR_HUM_GAIN;
  };
}

test('落下音は吸収音より大きい（開いたことが分かる）', () => {
  const absorb = transientLevel(absorbGen(), BARRIER_ABSORB_DECAY);
  const down = transientLevel(downGen(), BARRIER_DOWN_TIME);
  assert.ok(db(down / absorb) > 1,
    `落下(${db(down).toFixed(1)}dB) が吸収(${db(absorb).toFixed(1)}dB) より目立たない`);
});
