// ============================================
// AudioManager - 自機まわりの単発の効果音
// ============================================
//
// 着地・破壊・アイテム取得・バースト・爆発・武器切替・レーザー・被弾・
// 敵基地の破壊。どれも1回鳴って終わる音で、鳴り続ける音は
// audio/sounds/loopSounds.js のほう。
//
// **外部の import を1つも必要としない** ── 波形は this._noiseBurst() /
// this._toneBurst()、出力先は this._out() を通す。
//
// **AudioManager.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は audioManager シングルトンを指す
// （理由は audio/sounds/stings.js の冒頭）。

export const AudioPlayerSounds = {
    /**
     * 着地音。強い着地（スタンする落下）ほど重く鳴る。
     * @param {boolean} hard スタンを伴う落下か
     */
    playLanding(hard = false) {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;
        const dest = this._seDest();
        const vol = hard ? 0.26 : 0.12;
        const dur = hard ? 0.20 : 0.10;

        // 接地の衝撃（低いノイズ）
        this._noiseBurst({
            t, dest, dur, gain: vol,
            from: hard ? 700 : 1100, to: 120,
        });

        // 機体の重みを出す低い一撃
        this._toneBurst({
            t, dest, dur, type: 'sine', gain: vol * 0.8,
            from: hard ? 110 : 150, to: 45,
        });
    },

    /**
     * 自機の破壊。汎用の爆発音とは別に、下降する悲鳴のような成分を重ねて
     * 「やられた」ことが音だけで分かるようにする。
     */
    playPlayerDestroyed() {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;
        const dest = this._seDest();

        // 崩れ落ちる金属音（下降するノコギリ波）。
        // ノコギリ波をそのまま出すと耳に刺さるので、ローパスも一緒に閉じる
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(2400, t);
        lowpass.frequency.exponentialRampToValueAtTime(300, t + 0.9);
        this._toneBurst({
            t, dest, dur: 0.9, type: 'sawtooth', gain: 0.16,
            from: 420, to: 55, through: lowpass,
        });

        // 厚みを出す爆発のノイズ
        this._noiseBurst({
            t, dest, dur: 0.7, gain: 0.3, from: 1800, to: 160,
        });
    },

    /** アイテム取得。短く明るい上昇音。 */
    playPickup() {
        if (!this._prepare()) return;
        const t = this.ctx.currentTime;
        for (const [delay, freq] of [[0, 660], [0.05, 880], [0.10, 1320]]) {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t + delay);
            g.gain.exponentialRampToValueAtTime(0.07, t + delay + 0.008);
            g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.08);
            osc.connect(g); g.connect(this._seDest());
            osc.start(t + delay); osc.stop(t + delay + 0.09);
        }
    },


    /** バースト移動の噴射。上へ開く掃引で、押し出される感じを出す。 */
    playBurst() {
        if (!this._prepare()) return;

        // 減衰しきらず 0.06 で残す（噴射が続いている最中に途切れないように）
        this._noiseBurst({
            t: this.ctx.currentTime, dest: this._seDest(),
            gain: 0.1, dur: 0.4, end: 0.06,
            from: 1000, to: 3000, sweepDur: 0.3,
        });
    },

    playExplosion(large = false, sourceX) {
        if (!this._prepare()) return;

        // ローパスを 40Hz まで落とすため聞こえる帯域が薄い。マスターの底上げに
        // 加えて、爆発だけさらに +3dB 持ち上げる（画面端で埋もれていたため）。
        // 掃引のほうが包絡より短い＝暗くなりきってから尾を引く
        this._noiseBurst({
            t: this.ctx.currentTime, dest: this._out(sourceX),
            gain: large ? 0.42 : 0.21,
            dur: large ? 0.8 : 0.3, end: 0.01,
            from: large ? 1000 : 600, to: 40, sweepDur: large ? 0.5 : 0.2,
        });
    },

    // --- Weapons ---


    /** 武器の切り替え。短く落ちる電子音1つ。 */
    playSwitch() {
        if (!this._prepare()) return;

        this._toneBurst({
            t: this.ctx.currentTime, dest: this._seDest(),
            type: 'square', from: 1200, to: 400,
            gain: 0.03, dur: 0.05,
        });
    },

    // --- Laser ---
    playLaserCharge() {
        if (!this._prepare()) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(100, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(1200, this.ctx.currentTime + 1.5); // 1.5s charge

        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.5);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5);

        osc.connect(gain);
        gain.connect(this._seDest());

        osc.start();
        osc.stop(this.ctx.currentTime + 1.5);
    },

    playLaserFire() {
        if (!this._prepare()) return;

        const osc = this.ctx.createOscillator();
        const sub = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(80, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(40, this.ctx.currentTime + 0.5);

        sub.type = 'sine';
        sub.frequency.setValueAtTime(40, this.ctx.currentTime);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;

        osc.connect(filter);
        sub.connect(filter);
        filter.connect(gain);
        gain.connect(this._seDest());

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.6);

        osc.start();
        sub.start();
        osc.stop(this.ctx.currentTime + 0.6);
        sub.stop(this.ctx.currentTime + 0.6);
    },

    playHeavyDamage() {
        if (!this._prepare()) return;

        const now = this.ctx.currentTime;
        const dest = this._seDest();

        // 頭の「バキッ」。掃引を包絡より短く切って、鋭さだけを立てる
        this._noiseBurst({
            t: now, dest, gain: 0.3, dur: 0.15, end: 0.01,
            from: 2000, to: 100, sweepDur: 0.1,
        });

        // 重さを出す低い一撃。歪ませて軋みを足す
        const distortion = this.ctx.createWaveShaper();
        distortion.curve = this._makeDistortionCurve(100);
        this._toneBurst({
            t: now, dest, type: 'sawtooth', gain: 0.2,
            from: 100, to: 30, freqDur: 0.3, dur: 0.4,
            through: distortion,
        });
    },

    playBaseDestroyed() {
        if (!this._prepare()) return;

        const now = this.ctx.currentTime;
        const notes = [
            { f: 523.25, t: 0, d: 0.1 }, // C5
            { f: 659.25, t: 0.12, d: 0.1 }, // E5
            { f: 783.99, t: 0.24, d: 0.3 }  // G5
        ];

        const dest = this._seDest();
        // 音程は動かさない（to を渡さない）。和音を順に置くだけのファンファーレ
        notes.forEach((note) => {
            this._toneBurst({
                t: now + note.t, dest, type: 'triangle',
                from: note.f, gain: 0.08, dur: note.d, end: 0.01,
            });
        });
    },
};
