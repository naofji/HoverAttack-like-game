// 接続とスケジュールを記録するだけの AudioContext もどき。
//
// node:test には AudioContext が無いので、ノードの繋ぎ方や予約した値を
// 確かめたいときはこれを audioManager に差し込む。音は出ない。

import { audioManager } from '../../src/js/audio/AudioManager.js';

/** @returns {object} 作られたノードが `created` に積まれる疑似 ctx */
export function fakeAudioCtx() {
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: 'running',
    destination: { name: 'destination', inputs: [] },
    created: [],
    _param(value = 0) {
      return {
        value, events: [],
        setValueAtTime(v, t) { this.value = v; this.events.push(['set', v, t]); },
        linearRampToValueAtTime(v, t) { this.target = v; this.events.push(['ramp', v, t]); },
        exponentialRampToValueAtTime(v, t) { this.target = v; this.events.push(['exp', v, t]); },
        setTargetAtTime(v, t, tc) { this.target = v; this.events.push(['target', v, t, tc]); },
        cancelScheduledValues() { this.events.push(['cancel']); },
      };
    },
    _node(name, extra = {}) {
      const n = {
        name, inputs: [], outputs: [], started: 0, stopped: 0,
        connect(dst) { this.outputs.push(dst); (dst.inputs || []).push(this); },
        disconnect() {},
        ...extra,
      };
      ctx.created.push(n);
      return n;
    },
    createGain() { return ctx._node('gain', { gain: ctx._param(1) }); },
    createOscillator() {
      return ctx._node('oscillator', {
        type: 'sine', frequency: ctx._param(440), detune: ctx._param(0),
        start() { this.started++; }, stop() { this.stopped++; },
      });
    },
    createBiquadFilter() {
      return ctx._node('filter', {
        type: 'lowpass', frequency: ctx._param(350), Q: ctx._param(1),
      });
    },
    createBufferSource() {
      return ctx._node('bufferSource', {
        buffer: null, loop: false,
        start() { this.started++; }, stop() { this.stopped++; },
      });
    },
    createStereoPanner() { return ctx._node('panner', { pan: ctx._param(0) }); },
    createDynamicsCompressor() {
      return ctx._node('compressor', {
        threshold: ctx._param(0), knee: ctx._param(0), ratio: ctx._param(1),
        attack: ctx._param(0), release: ctx._param(0),
      });
    },
  };
  return ctx;
}

/** audioManager に ctx を差し込んで fn を実行し、必ず元へ戻す。 */
export function withCtx(ctx, fn) {
  const saved = {
    ctx: audioManager.ctx, fade: audioManager.seFade, master: audioManager.seMaster,
    faded: audioManager.seFaded, lx: audioManager.listenerX, loops: audioManager._loops,
  };
  audioManager.ctx = ctx;
  audioManager.seFade = null;
  audioManager.seMaster = null;
  audioManager.seFaded = false;
  audioManager._loops = {};
  try {
    return fn();
  } finally {
    Object.assign(audioManager, {
      ctx: saved.ctx, seFade: saved.fade, seMaster: saved.master,
      seFaded: saved.faded, listenerX: saved.lx, _loops: saved.loops,
    });
  }
}
