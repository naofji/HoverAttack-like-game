// ============================================
// AudioManager - 効果音バス
// ============================================
//
// 効果音 → フェード段 → 底上げ → リミッタ → 出力、という1本の経路の組み立てと、
// そこにぶら下がるループ音の管理、ゲームオーバー時のフェード。
//
// **BGM はこのバスを通さない**（音量調節を独立させるため）。状態を告げる曲は
// フェード段より後ろ（_stingDest）に繋ぐので、効果音を引いても消えない。
// この2点は tests/se-bus.test.js が縛っている。
//
// **AudioManager.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は audioManager シングルトンを指す
// （理由は audio/sounds/stings.js の冒頭）。

import {
    SE_MASTER_GAIN, SE_COMP_THRESHOLD, SE_COMP_KNEE,
    SE_COMP_RATIO, SE_COMP_ATTACK, SE_COMP_RELEASE, SE_FADE_OUT_SECONDS,
} from '../../utils/Constants.js';

export const AudioSeBus = {
    /**
     * 効果音のマスターバスを作る。効果音 → ゲイン → リミッタ → 出力。
     *
     * 効果音は元々29箇所が個別に destination へ繋がっていて、全体を上げる
     * 場所が無かった。素で 1.0 を超える音（ホバー音は 1.2）があるため、
     * 単純に持ち上げると割れる。圧縮を挟んでから持ち上げている。
     * BGM はこのバスを通さない。BGM の音量調節と独立させるため。
     */
    _createSeBus() {
        // 効果音 → フェード段 → 底上げ → リミッタ → 出力
        //
        // フェード段を分けているのは、ゲームオーバーで効果音だけを引くため。
        // 底上げとリミッタより手前に置くことで、そこを通らない音（ゲーム
        // オーバーの曲）は音量も掛かり方も変わらないまま残る。
        this.seMaster = this.ctx.createGain();
        this.seMaster.gain.value = SE_MASTER_GAIN;
        this.seFade = this.ctx.createGain();
        this.seFade.gain.value = 1;
        // ユーザー設定の音量は seFade とは別の段にする。同じ段を使うと、
        // ゲームオーバーのフェードとユーザー設定が互いを上書きしてしまう
        this.seUserGain = this.ctx.createGain();
        this.seUserGain.gain.value = this.seUserVolume;
        this.seFade.connect(this.seUserGain);
        this.seUserGain.connect(this.seMaster);

        if (typeof this.ctx.createDynamicsCompressor === 'function') {
            const comp = this.ctx.createDynamicsCompressor();
            comp.threshold.value = SE_COMP_THRESHOLD;
            comp.knee.value = SE_COMP_KNEE;
            comp.ratio.value = SE_COMP_RATIO;
            comp.attack.value = SE_COMP_ATTACK;
            comp.release.value = SE_COMP_RELEASE;
            this.seMaster.connect(comp);
            comp.connect(this.ctx.destination);
        } else {
            this.seMaster.connect(this.ctx.destination);
        }
    },

    /**
     * 効果音の接続先。バスがまだ無ければ素の出力に落ちる。
     * @returns {AudioNode}
     */
    _seDest() {
        return this.seFade || this.ctx.destination;
    },

    /**
     * 鳴り続ける音の共通の骨格。
     *
     * 「無ければ作る → 毎回 setTargetAtTime で追従させる」という形は
     * エンジンにも補給のハムにも要る。ここに集約して、
     * 音ごとの違いは build / tune の2つだけに出るようにしてある。
     * （ホバーだけは実測で音量・音色を詰めた経緯があり、この骨格に
     * 乗せ替えると質感が変わる恐れがあるため、あえて手書きのまま残してある）
     *
     * 毎フレーム呼んでよい。呼ぶのをやめるだけでは止まらないので、
     * 止めるときは _stopLoopSound() を呼ぶこと。
     *
     * @param {string} key 音の名前（_loops のキー）
     * @param {{build: () => object, tune: (nodes: object, t: number) => void}} spec
     *   build は `{ gain, sources: [...] }` を含むノード束を返す。
     *   gain は止めるときに引く段、sources は start / stop する音源
     */
    _loopSound(key, spec) {
        if (!this._prepare()) return;
        let nodes = this._loops[key];
        if (!nodes) {
            nodes = spec.build();
            this._loops[key] = nodes;
            for (const src of nodes.sources) src.start();
        }
        spec.tune(nodes, this.ctx.currentTime);
    },

    /**
     * ループ音を止める。ぶつ切りにせず引いてから音源を捨てる。
     * 鳴っていないときや、音の出せない環境で呼んでも何も起きない。
     * @param {string} key
     * @param {number} [fade] 引くのにかける時定数（秒）
     */
    _stopLoopSound(key, fade = 0.12) {
        const nodes = this._loops[key];
        if (!nodes) return;
        this._loops[key] = null;
        nodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, fade);
        const { sources } = nodes;
        setTimeout(() => {
            for (const src of sources) {
                try { src.stop(); src.disconnect(); } catch (e) { /* 既に停止 */ }
            }
        }, Math.max(250, fade * 2000));
    },

    /**
     * 状態を告げる曲（ゲームオーバーなど）の接続先。
     * 効果音のフェードより後ろに繋ぐので、効果音を引いても残る。
     * @returns {AudioNode}
     */
    _stingDest() {
        return this.seMaster || this.ctx.destination;
    },

    /**
     * 効果音を滑らかに引いて止める。ゲームオーバーで使う。
     *
     * 持続音（自機のホバー・敵のホバー・母艦のエンジン・補給のハム）は音源ごと止める。
     * 音量を戻したときに鳴り出さないようにするため。
     * 状態を告げる曲と BGM はこの段を通らないので影響を受けない。
     *
     * @param {number} [seconds]
     */
    /**
     * 鳴り続ける音を全部止める。
     *
     * 自機のホバー、敵のホバー、母艦のエンジン、回復ハムの4つは、
     * 止める指示があるまで鳴り続ける作り（毎フレームの更新で音量を
     * 追従させている）。ミッションを抜けると更新が止まるので、
     * 抜けるときに明示的に止めないと鳴りっぱなしになる。
     *
     * 効果音バスは触らないので、この後に鳴らす音（クリアのファンファーレ）は
     * 影響を受けない。バスごと引きたいときは fadeOutSe を使う。
     */
    stopLoopingSe() {
        this.stopHover();
        this.stopEnemyHover();
        this.stopCarrierEngine();
        this.stopRepairHum();
    },

    fadeOutSe(seconds = SE_FADE_OUT_SECONDS) {
        this.seFaded = true;
        this.stopLoopingSe();
        if (!this.ctx || !this.seFade) return;

        const t = this.ctx.currentTime;
        this.seFade.gain.cancelScheduledValues(t);
        this.seFade.gain.setValueAtTime(this.seFade.gain.value, t);
        this.seFade.gain.linearRampToValueAtTime(0, t + seconds);
    },

    /**
     * 引いた効果音を戻す。何度呼んでもよいので、プレイ中は毎フレーム
     * 呼んで構わない。どの経路からミッションに入っても無音のまま
     * 取り残されないようにするため。
     */
    resumeSe() {
        if (!this.seFaded) return;
        this.seFaded = false;
        if (!this.ctx || !this.seFade) return;

        const t = this.ctx.currentTime;
        this.seFade.gain.cancelScheduledValues(t);
        this.seFade.gain.setValueAtTime(1, t);
    },
};
