import { test } from 'node:test';
import assert from 'node:assert/strict';

import { audioManager } from '../src/js/audio/AudioManager.js';
import { fakeAudioCtx, withCtx } from './helpers/fake-audio-ctx.js';

/**
 * 手続き合成の単発音が、どんなノードをどう繋ぎ、どの値をいつ予約するか。
 *
 * これらは `WEAPON_SOUNDS` の表に載っていない（表の部品は必ず FLOOR まで
 * 指数減衰する前提だが、ここの音は減衰の終端が 0.0001〜0.09 とばらばらで、
 * 掃引時間と包絡時間が違うもの、発振器をフィルタや歪みに通すものがある）。
 * そのためオフライン再現による音量実測ができない。代わりに、鳴らすはずの
 * ノードと予約値をここで直接押さえる。予約が同じなら出る音も同じ。
 *
 * **期待値は _noiseBurst / _toneBurst に切り出す前の実装から書き起こしてある。**
 * 組み立て関数の側を書き換えて数値がずれたら、ここで落ちる。
 */

/** audioManager に偽 ctx を差して fn を鳴らし、作られたノードを返す。 */
function capture(fn) {
    const ctx = fakeAudioCtx();
    return withCtx(ctx, () => {
        audioManager.noiseBuffer = { name: 'noise' };
        audioManager.listenerView = { cx: 0, cy: 0, halfW: 512, halfH: 384 };
        audioManager.listenerX = 0;
        fn();
        return ctx.created;
    });
}

const nodesOf = (list, type) => list.filter((n) => n.name === type);

/** ノイズ源に繋がるローパスと、その先のゲインを1組にして返す。 */
function noiseChain(nodes) {
    const src = nodesOf(nodes, 'bufferSource')[0];
    assert.ok(src, 'ノイズ源が無い');
    const filter = src.outputs[0];
    const gain = filter.outputs[0];
    return { src, filter, gain };
}

function oscChain(nodes, index = 0) {
    const osc = nodesOf(nodes, 'oscillator')[index];
    assert.ok(osc, `${index} 番目の発振器が無い`);
    return { osc, next: osc.outputs[0] };
}

/** パラメータの予約列を [種類, 値, 時刻] の配列で取り出す。 */
const events = (param) => param.events.map(([k, v, t]) => [k, Number(v.toFixed(6)), Number(t.toFixed(6))]);

test('playLanding(通常): ノイズ 1100→120Hz と 150→45Hz の一撃', () => {
    const nodes = capture(() => audioManager.playLanding(false));
    const { src, filter, gain } = noiseChain(nodes);

    assert.equal(filter.type, 'lowpass');
    assert.deepEqual(events(filter.frequency), [['set', 1100, 0], ['exp', 120, 0.1]]);
    assert.deepEqual(events(gain.gain), [['set', 0.12, 0], ['exp', 0.001, 0.1]]);
    assert.equal(src.started, 1);
    assert.equal(src.stopped, 1);

    const { osc, next } = oscChain(nodes);
    assert.equal(osc.type, 'sine');
    assert.deepEqual(events(osc.frequency), [['set', 150, 0], ['exp', 45, 0.1]]);
    assert.deepEqual(events(next.gain), [['set', 0.096, 0], ['exp', 0.001, 0.1]]);
});

test('playLanding(強い着地): 音量と長さが上がり、音程が下がる', () => {
    const nodes = capture(() => audioManager.playLanding(true));
    const { filter, gain } = noiseChain(nodes);

    assert.deepEqual(events(filter.frequency), [['set', 700, 0], ['exp', 120, 0.2]]);
    assert.deepEqual(events(gain.gain), [['set', 0.26, 0], ['exp', 0.001, 0.2]]);

    const { osc, next } = oscChain(nodes);
    assert.deepEqual(events(osc.frequency), [['set', 110, 0], ['exp', 45, 0.2]]);
    assert.deepEqual(events(next.gain), [['set', 0.208, 0], ['exp', 0.001, 0.2]]);
});

test('playSwitch: 1200→400Hz の短い矩形波', () => {
    const nodes = capture(() => audioManager.playSwitch());
    const { osc, next } = oscChain(nodes);
    assert.equal(osc.type, 'square');
    assert.deepEqual(events(osc.frequency), [['set', 1200, 0], ['exp', 400, 0.05]]);
    assert.deepEqual(events(next.gain), [['set', 0.03, 0], ['exp', 0.001, 0.05]]);
});

test('playBurst: 掃引は上へ開き、包絡は掃引より長く 0.06 で残す', () => {
    // 減衰しきらないのが要点。噴射の途中で音が切れないようにしてある
    const nodes = capture(() => audioManager.playBurst());
    const { filter, gain } = noiseChain(nodes);
    assert.deepEqual(events(filter.frequency), [['set', 1000, 0], ['exp', 3000, 0.3]]);
    assert.deepEqual(events(gain.gain), [['set', 0.1, 0], ['exp', 0.06, 0.4]]);
});

test('playExplosion: 大小で音量・長さ・掃引が変わり、掃引は包絡より短い', () => {
    const small = capture(() => audioManager.playExplosion(false, 0));
    let { filter, gain } = noiseChain(small);
    assert.deepEqual(events(filter.frequency), [['set', 600, 0], ['exp', 40, 0.2]]);
    assert.deepEqual(events(gain.gain), [['set', 0.21, 0], ['exp', 0.01, 0.3]]);

    const large = capture(() => audioManager.playExplosion(true, 0));
    ({ filter, gain } = noiseChain(large));
    assert.deepEqual(events(filter.frequency), [['set', 1000, 0], ['exp', 40, 0.5]]);
    assert.deepEqual(events(gain.gain), [['set', 0.42, 0], ['exp', 0.01, 0.8]]);
});

test('playHeavyDamage: 鋭いノイズ＋歪ませた低い一撃', () => {
    const nodes = capture(() => audioManager.playHeavyDamage());

    const { filter, gain } = noiseChain(nodes);
    assert.deepEqual(events(filter.frequency), [['set', 2000, 0], ['exp', 100, 0.1]]);
    assert.deepEqual(events(gain.gain), [['set', 0.3, 0], ['exp', 0.01, 0.15]]);

    const { osc, next } = oscChain(nodes);
    assert.equal(osc.type, 'sawtooth');
    assert.deepEqual(events(osc.frequency), [['set', 100, 0], ['exp', 30, 0.3]]);
    // 発振器はまず歪みへ、その先がゲイン
    assert.equal(next.name, 'shaper', '歪みを通っていない');
    assert.ok(next.curve, '歪みのカーブが設定されていない');
    assert.deepEqual(events(next.outputs[0].gain), [['set', 0.2, 0], ['exp', 0.001, 0.4]]);
});

test('playPlayerDestroyed: ローパスを閉じながら落ちるノコギリ波＋厚みのノイズ', () => {
    const nodes = capture(() => audioManager.playPlayerDestroyed());

    const { osc, next } = oscChain(nodes);
    assert.equal(osc.type, 'sawtooth');
    assert.deepEqual(events(osc.frequency), [['set', 420, 0], ['exp', 55, 0.9]]);
    // ノコギリ波が耳に刺さらないよう、ローパスも一緒に閉じる
    assert.equal(next.name, 'filter', 'ローパスを通っていない');
    assert.deepEqual(events(next.frequency), [['set', 2400, 0], ['exp', 300, 0.9]]);
    assert.deepEqual(events(next.outputs[0].gain), [['set', 0.16, 0], ['exp', 0.001, 0.9]]);

    const { filter, gain } = noiseChain(nodes);
    assert.deepEqual(events(filter.frequency), [['set', 1800, 0], ['exp', 160, 0.7]]);
    assert.deepEqual(events(gain.gain), [['set', 0.3, 0], ['exp', 0.001, 0.7]]);
});

test('playBaseDestroyed: 音程を動かさない3音のファンファーレ', () => {
    const nodes = capture(() => audioManager.playBaseDestroyed());
    const oscs = nodesOf(nodes, 'oscillator');
    assert.equal(oscs.length, 3);

    const expected = [
        { f: 523.25, t: 0, d: 0.1 },
        { f: 659.25, t: 0.12, d: 0.1 },
        { f: 783.99, t: 0.24, d: 0.3 },
    ];
    oscs.forEach((osc, i) => {
        const { f, t, d } = expected[i];
        assert.equal(osc.type, 'triangle');
        // 音程は動かさない = 予約は setValueAtTime の1つだけ
        assert.deepEqual(events(osc.frequency), [['set', f, t]], `${i}番目の音程`);
        assert.deepEqual(events(osc.outputs[0].gain), [['set', 0.08, t], ['exp', 0.01, t + d]]);
    });
});

test('敵の着地音は自機より低く沈む（40Hz 対 45Hz）', () => {
    const player = capture(() => audioManager.playLanding(true));
    const enemy = capture(() => audioManager.playEnemyLanding(0, 0, true));

    const playerThump = events(oscChain(player).osc.frequency);
    const enemyThump = events(oscChain(enemy).osc.frequency);
    assert.equal(playerThump[1][1], 45);
    assert.equal(enemyThump[1][1], 40);
});

test('位置つきの音はパンナーを通り、位置なしの音は通らない', () => {
    // 組み立て関数に出力先を渡す形にしたので、渡し間違えると
    // 距離減衰やパンが効かなくなる／余計に効く
    const panned = capture(() => audioManager.playExplosion(true, 900));
    assert.ok(nodesOf(panned, 'panner').length > 0, '爆発にパンナーが無い');

    const flat = capture(() => audioManager.playSwitch());
    assert.equal(nodesOf(flat, 'panner').length, 0, '武器切替にパンナーが付いている');
});

test('組み立て関数は引数なしでも例外を投げない（テスト環境で黙る約束）', () => {
    // AudioManager の play*/start*/stop* は引数なしで呼んでも落ちないこと
    assert.doesNotThrow(() => {
        audioManager.playLanding();
        audioManager.playExplosion();
        audioManager.playSwitch();
        audioManager.playBurst();
        audioManager.playHeavyDamage();
        audioManager.playPlayerDestroyed();
        audioManager.playBaseDestroyed();
    });
});
