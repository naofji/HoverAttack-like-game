// ============================================
// AudioManager - 出力（定位と波形の部品）
// ============================================
//
// 「どこへ・どの音量で・どんな波形で出すか」を引き受ける層。
//
// - 定位: 聞き手（画面中心）を基準にした左右の振り分けと、距離による減衰
// - 部品: _noiseBurst / _toneBurst。個々の効果音はこの2つを組み合わせて作る
//
// **自機ではなく画面中心を基準にする理由**など、選んだ根拠は各メソッドの
// コメントに残してある。動かす前に読むこと。
//
// **AudioManager.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は audioManager シングルトンを指す
// （理由は audio/sounds/stings.js の冒頭）。

import { stereoPan, positionalVolume } from '../../utils/audioFalloff.js';

export const AudioOutput = {
    /**
     * 聞き手の横位置（ワールド座標）を更新する。毎フレーム画面中心を渡す。
     *
     * 自機ではなく画面中心を基準にするのは、見えている位置と聞こえる向きを
     * 一致させるため。カメラはマップ端でクランプされるし、破壊演出中は
     * 撃破地点に留まるので、自機基準だと画面左の爆発が右から鳴りうる。
     *
     * @param {number|null} x 画面中心のワールドX。null で定位を止める
     */
    setListenerX(x) {
        this.listenerX = Number.isFinite(x) ? x : null;
    },

    /**
     * いま映っている範囲を渡す。左右の振り分けと、位置による音量の両方に使う。
     * 毎フレーム呼ぶ。null を渡すと定位も減衰も止まる（メニュー中など）。
     * @param {{cx:number, cy:number, halfW:number, halfH:number}|null} view
     */
    setListenerView(view) {
        this.listenerView = (view && Number.isFinite(view.cx)) ? view : null;
        this.setListenerX(view ? view.cx : null);
    },

    /**
     * 音源の位置から音量の倍率を求める。画面内なら 1、外なら小さくなる。
     * 画面が分からないうちは減衰させない（聞こえないより聞こえる方がまし）。
     * @param {number} x ワールドX
     * @param {number} y ワールドY
     * @returns {number} 0〜1
     */
    _positionalGain(x, y) {
        // 位置を持たない音（自機のリロードなど）は減衰させない。
        // 座標が無いまま計算に入れると NaN になり、黙って無音になる。
        if (x == null || y == null) return 1;
        if (!this.listenerView) return 1;
        return positionalVolume(x, y, this.listenerView);
    },

    /**
     * 音源のワールドX から左右の振り分けを求める。
     * 位置を持たない音（UI・自機の操作音）は sourceX 省略で中央のまま。
     * @param {number} [sourceX]
     * @returns {number} -1（左）〜 +1（右）
     */
    _panFor(sourceX) {
        if (sourceX == null || this.listenerX == null) return 0;
        return stereoPan(sourceX, this.listenerX);
    },

    /**
     * 音の出力先。音源のワールドX を渡すとその位置から聞こえるようになる。
     *
     * StereoPanner が無い環境では素通しして destination を返すので、
     * 呼び出し側は分岐を書かなくてよい。
     *
     * @param {number} [sourceX] 音源のワールドX。省略で中央
     * @returns {AudioNode} connect() の相手
     */
    _out(sourceX) {
        const pan = this._panFor(sourceX);
        if (!pan || typeof this.ctx.createStereoPanner !== 'function') {
            return this._seDest();
        }
        const panner = this.ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        panner.connect(this._seDest());
        return panner;
    },

    // ------------------------------------------
    // 単発音の組み立て
    //
    // 手続き合成の単発音は、どれも「音源 → (色付け) → ゲインの減衰 → 出力」
    // という同じ配線でできている。この骨組みが十数箇所に写されていて、
    // ノードの作成・接続・start/stop の書き忘れが起きやすかった。
    //
    // WEAPON_SOUNDS の表に載せなかったのは、表の部品が「必ず FLOOR まで
    // 指数減衰する」前提で作られているのに対し、ここの音は減衰の終端値が
    // 0.0001〜0.09 とばらばらで、掃引時間と包絡時間が違うもの、発振器を
    // フィルタや歪みに通すものがあるため。表に寄せると音が変わる。
    // 骨組みだけを共有し、音を決める数値は各メソッドに残す。
    // ------------------------------------------

    /**
     * ノイズの一撃。ローパスを掃引しながら減衰させる。
     *
     * @param {object} o
     * @param {number} o.t 開始時刻
     * @param {number} o.gain 開始ゲイン
     * @param {number} o.dur 包絡の長さ（この時刻に end へ達し、音源も止まる）
     * @param {number} [o.end] 減衰の終端。0 は指定できない（指数ランプのため）
     * @param {number} o.from ローパスの開始周波数
     * @param {number} [o.to] 終了周波数。省略すると掃引しない
     * @param {number} [o.sweepDur] 掃引の長さ。省略すると dur と同じ
     * @param {AudioNode} o.dest 接続先
     * @returns {AudioBufferSourceNode}
     */
    _noiseBurst({ t, gain, dur, end = 0.001, from, to, sweepDur = dur, dest }) {
        const noise = this.ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(from, t);
        if (to !== undefined) {
            filter.frequency.exponentialRampToValueAtTime(to, t + sweepDur);
        }

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(end, t + dur);

        noise.connect(filter);
        filter.connect(g);
        g.connect(dest);
        noise.start(t);
        noise.stop(t + dur);
        return noise;
    },

    /**
     * 音程のある一撃。周波数を滑らせながら減衰させる。
     *
     * @param {object} o
     * @param {number} o.t 開始時刻
     * @param {string} o.type 波形
     * @param {number} o.from 開始周波数
     * @param {number} [o.to] 終了周波数。省略すると音程を動かさない
     * @param {number} [o.freqDur] 音程が動く長さ。省略すると dur と同じ
     * @param {number} o.gain 開始ゲイン
     * @param {number} o.dur 包絡の長さ
     * @param {number} [o.end] 減衰の終端
     * @param {AudioNode} [o.through] 発振器とゲインの間に挟むノード（フィルタや歪み）
     * @param {AudioNode} o.dest 接続先
     * @returns {OscillatorNode}
     */
    _toneBurst({ t, type, from, to, freqDur, gain, dur, end = 0.001, through, dest }) {
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t);
        if (to !== undefined) {
            osc.frequency.exponentialRampToValueAtTime(to, t + (freqDur ?? dur));
        }

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(end, t + dur);

        if (through) {
            osc.connect(through);
            through.connect(g);
        } else {
            osc.connect(g);
        }
        g.connect(dest);
        osc.start(t);
        osc.stop(t + dur);
        return osc;
    },
};
