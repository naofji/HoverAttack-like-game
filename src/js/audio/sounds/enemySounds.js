// ============================================
// AudioManager - 敵の音
// ============================================
//
// 敵のホバー（共有の1ループを、いちばん近い敵の距離で駆動する）、
// バースト、着地、ドローンの移動、そして武器の発射音。
//
// 武器の音だけは表引き ── 音色そのものは audio/weaponSounds.js の
// WEAPON_SOUNDS にあり、ここは種類と位置を渡すだけ。**新しい発射音を足すときは
// あちらの表に1行**で、このファイルは触らない。
//
// **AudioManager.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は audioManager シングルトンを指す
// （理由は audio/sounds/stings.js の冒頭）。

import {
    ENEMY_HOVER_MAX_GAIN,
    ENEMY_HOVER_NOISE_FREQ, ENEMY_HOVER_NOISE_Q,
    ENEMY_HOVER_WOBBLE_HZ, ENEMY_HOVER_WOBBLE_DEPTH,
    ENEMY_HOVER_BODY_FREQ, ENEMY_HOVER_BODY_GAIN, ENEMY_HOVER_MAKEUP,
    ENEMY_HOVER_ATTACK, ENEMY_HOVER_RELEASE,
    ENEMY_BURST_FREQ_FROM, ENEMY_BURST_FREQ_TO, ENEMY_BURST_GAIN,
    DRONE_MOVE_FREQ_FROM, DRONE_MOVE_FREQ_TO, DRONE_MOVE_DURATION,
    DRONE_MOVE_FILTER_Q, DRONE_MOVE_FILTER_MULT, DRONE_MOVE_FILTER_END_MULT,
    DRONE_MOVE_DETUNE, DRONE_MOVE_GAIN, DRONE_MOVE_SUB_GAIN,
    ENEMY_LANDING_NOISE_HARD, ENEMY_LANDING_NOISE_SOFT,
    ENEMY_LANDING_THUMP_HARD, ENEMY_LANDING_THUMP_SOFT,
} from '../../utils/Constants.js';
import { WEAPON_SOUNDS, renderWeaponSound } from '../weaponSounds.js';

export const AudioEnemySounds = {
    /**
     * 敵のホバー音。共有の1ループを、いちばん近い敵の距離で駆動する。
     * 敵ごとにオシレーターを持つと数が増えるほど破綻するため。
     * 自機のホバー音と混ざっても区別できるよう、低めで濁った音にしてある。
     * @param {number} volume 0〜1。距離から求めた音量（nearestHoveringEnemy）
     * @param {number} [sourceX] その敵のワールドX。左右の振り分けに使う
     */
    setEnemyHover(volume, sourceX) {
        // 無音になっても音源は壊さない。敵の噴射は細切れなので、その都度
        // 作り直すと毎回ゼロから立ち上がることになり、音が痩せる。
        // 実測で平均音量が 1〜5dB 変わる。本当に止めるのは stopEnemyHover。
        if (volume <= 0) {
            if (this.enemyHoverGain) {
                this.enemyHoverGain.gain.setTargetAtTime(
                    0, this.ctx.currentTime, ENEMY_HOVER_RELEASE);
            }
            return;
        }
        if (!this._prepare()) return;

        if (!this.enemyHoverNoise) {
            this.enemyHoverNoise = this.ctx.createBufferSource();
            this.enemyHoverNoise.buffer = this.noiseBuffer;
            this.enemyHoverNoise.loop = true;
            this.enemyHoverGain = this.ctx.createGain();
            this.enemyHoverGain.gain.value = 0;

            // 主体は共鳴させたノイズ。自機と同じ音作りだが中心を下げてある
            const air = this.ctx.createBiquadFilter();
            air.type = 'bandpass';
            air.frequency.value = ENEMY_HOVER_NOISE_FREQ;
            air.Q.value = ENEMY_HOVER_NOISE_Q;

            // 中心周波数をゆっくり揺らす。自機の音は揺れないので、
            // この「ふらつき」だけで鳴っているのが敵だと分かる
            this.enemyHoverLfo = this.ctx.createOscillator();
            this.enemyHoverLfo.type = 'sine';
            this.enemyHoverLfo.frequency.value = ENEMY_HOVER_WOBBLE_HZ;
            const wobble = this.ctx.createGain();
            wobble.gain.value = ENEMY_HOVER_WOBBLE_DEPTH;
            this.enemyHoverLfo.connect(wobble);
            wobble.connect(air.frequency);

            // 高域だけだと軽いので、同じノイズを低く濾して機体の重さを足す
            const body = this.ctx.createBiquadFilter();
            body.type = 'lowpass';
            body.frequency.value = ENEMY_HOVER_BODY_FREQ;
            const bodyGain = this.ctx.createGain();
            bodyGain.gain.value = ENEMY_HOVER_BODY_GAIN;

            // 持続音なのでパンナーを持ち続け、毎フレーム値だけ更新する
            this.enemyHoverPanner = (typeof this.ctx.createStereoPanner === 'function')
                ? this.ctx.createStereoPanner()
                : null;

            this.enemyHoverNoise.connect(air);
            air.connect(this.enemyHoverGain);
            this.enemyHoverNoise.connect(body);
            body.connect(bodyGain);
            bodyGain.connect(this.enemyHoverGain);
            if (this.enemyHoverPanner) {
                this.enemyHoverGain.connect(this.enemyHoverPanner);
                this.enemyHoverPanner.connect(this._seDest());
            } else {
                this.enemyHoverGain.connect(this._seDest());
            }

            this.enemyHoverNoise.start();
            this.enemyHoverLfo.start();
        }

        // 立ち上がりは速く、減衰は遅く。噴射が細切れでも音が途切れない。
        // 対称にすると噴射の切れ目ごとにしぼんで「鳴っていない」印象になる。
        const target = volume * ENEMY_HOVER_MAX_GAIN * ENEMY_HOVER_MAKEUP;
        const rising = target > this.enemyHoverGain.gain.value;
        this.enemyHoverGain.gain.setTargetAtTime(
            target, this.ctx.currentTime,
            rising ? ENEMY_HOVER_ATTACK : ENEMY_HOVER_RELEASE,
        );
        if (this.enemyHoverPanner) {
            // 急に左右が飛ぶと不快なので、音量と同じく滑らかに寄せる
            this.enemyHoverPanner.pan.setTargetAtTime(
                this._panFor(sourceX), this.ctx.currentTime, 0.08,
            );
        }
    },

    /**
     * 敵アタッカーのジャンプ音。自機の playBurst と同じ「掃引するノイズ」だが、
     * 帯域を一段低くして自機の音と区別できるようにしてある。
     * 距離で音量が下がり、横位置で左右に振れる。
     * @param {number} x 音源のワールドX
     * @param {number} y 音源のワールドY
     */
    playEnemyBurst(x, y) {
        if (!this._prepare()) return;
        const level = this._positionalGain(x, y);
        if (level <= 0) return;

        // 自機の playBurst と同じ作り。減衰しきらず 0.6 倍で残す
        this._noiseBurst({
            t: this.ctx.currentTime, dest: this._out(x),
            gain: ENEMY_BURST_GAIN * level,
            dur: 0.4, end: ENEMY_BURST_GAIN * 0.6 * level,
            from: ENEMY_BURST_FREQ_FROM, to: ENEMY_BURST_FREQ_TO, sweepDur: 0.3,
        });
    },

    /**
     * 敵アタッカーの着地音。自機の playLanding と同じ「ノイズ＋低い一撃」だが、
     * 一撃をさらに低くしてある。距離で音量が下がり、横位置で左右に振れる。
     * @param {number} x 音源のワールドX
     * @param {number} y 音源のワールドY
     * @param {boolean} [hard] 強い落下か
     */
    playEnemyLanding(x, y, hard = false) {
        if (!this._prepare()) return;
        const level = this._positionalGain(x, y);
        if (level <= 0) return;

        const t = this.ctx.currentTime;
        const out = this._out(x);
        const vol = (hard ? 0.26 : 0.12) * level;
        const dur = hard ? 0.20 : 0.10;

        this._noiseBurst({
            t, dest: out, dur, gain: vol,
            from: hard ? ENEMY_LANDING_NOISE_HARD : ENEMY_LANDING_NOISE_SOFT, to: 120,
        });

        // 一撃は自機(45Hz)よりさらに低い40Hzまで落として、重量差を出す
        this._toneBurst({
            t, dest: out, dur, type: 'sine', gain: vol * 0.8,
            from: hard ? ENEMY_LANDING_THUMP_HARD : ENEMY_LANDING_THUMP_SOFT, to: 40,
        });
    },

    /**
     * ドローンが動き出したときの「プーーン」。高い方から低い方へ滑り落ちる。
     *
     * ホバリング中は鳴らさない。呼ぶのは突進を始めた瞬間だけで、持続音では
     * ないため止める必要も無い。
     *
     * 音程をわずかにずらした3本のノコギリ波を重ね、共鳴の強いローパスを
     * 音程より速く下降させる。3本のずれがうねりと厚みを生む。
     * 終端でフィルタを基音より上に残すことで、籠もった「ウ」ではなく
     * 開いた「オ」の母音になる（プーーンではなくポーーン）。
     *
     * @param {number} x 音源のワールドX
     * @param {number} y 音源のワールドY
     */
    playDroneMove(x, y) {
        if (!this._prepare()) return;
        const level = this._positionalGain(x, y);
        if (level <= 0) return;

        const t = this.ctx.currentTime;
        const end = t + DRONE_MOVE_DURATION;
        const out = this._out(x);

        // 共鳴の強いローパス。音程より高いところから、音程より速く落ちる
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.Q.value = DRONE_MOVE_FILTER_Q;
        filter.frequency.setValueAtTime(DRONE_MOVE_FREQ_FROM * DRONE_MOVE_FILTER_MULT, t);
        filter.frequency.exponentialRampToValueAtTime(
            DRONE_MOVE_FREQ_TO * DRONE_MOVE_FILTER_END_MULT, end);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(DRONE_MOVE_GAIN * level, t + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        filter.connect(gain);
        gain.connect(out);

        const voices = [];
        for (const cents of DRONE_MOVE_DETUNE) {
            const osc = this.ctx.createOscillator();
            osc.type = 'sawtooth';
            osc.detune.value = cents;
            osc.frequency.setValueAtTime(DRONE_MOVE_FREQ_FROM, t);
            osc.frequency.exponentialRampToValueAtTime(DRONE_MOVE_FREQ_TO, end);
            osc.connect(filter);
            voices.push(osc);
        }

        // 1オクターブ下のサイン波。芯の細さを補って機体の重さを出す
        const sub = this.ctx.createOscillator();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(DRONE_MOVE_FREQ_FROM / 2, t);
        sub.frequency.exponentialRampToValueAtTime(DRONE_MOVE_FREQ_TO / 2, end);
        const subGain = this.ctx.createGain();
        subGain.gain.value = DRONE_MOVE_SUB_GAIN;
        sub.connect(subGain);
        subGain.connect(filter);
        voices.push(sub);

        for (const v of voices) { v.start(t); v.stop(end); }
    },

    /**
     * 武器の発射音。種類は weaponSounds.js の表で決まる。
     *
     * 以前は弾もミサイルも同じ音だったので、武器ごとに関数を足すのではなく
     * 表を引く形にしてある。音を増やすときは表に1行足すだけでよい。
     *
     * @param {keyof typeof WEAPON_SOUNDS} kind
     * @param {number} x 音源のワールドX
     * @param {number} y 音源のワールドY
     */
    playWeapon(kind, x, y) {
        const profile = WEAPON_SOUNDS[kind];
        if (!profile) return;
        if (!this._prepare()) return;

        const level = this._positionalGain(x, y);
        if (level <= 0) return;

        renderWeaponSound(
            this.ctx, this._out(x), profile, this.noiseBuffer, level, this.ctx.currentTime,
        );
    },

    /** 敵のホバー音を止める。 */
    stopEnemyHover() {
        if (!this.enemyHoverGain) return;
        this.enemyHoverGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.10);
        const noise = this.enemyHoverNoise;
        const lfo = this.enemyHoverLfo;
        this.enemyHoverNoise = null;
        this.enemyHoverLfo = null;
        this.enemyHoverGain = null;
        this.enemyHoverPanner = null;
        setTimeout(() => {
            try {
                noise.stop(); noise.disconnect();
                if (lfo) { lfo.stop(); lfo.disconnect(); }
            } catch (e) { /* 既に停止 */ }
        }, 250);
    },
};
