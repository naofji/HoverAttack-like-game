// ============================================
// Death Hold - 自機・母艦の破壊演出を見せるための待ち
// ============================================
// 破壊された瞬間から一定 tick のあいだ、リスポーン／ゲームオーバー遷移／
// カメラの追従対象の切り替えを止める。シミュレーション自体は止めないので、
// 破片や爆発はその間も飛び続ける。
//
// main.js は DOM に依存していてテストから import できないため、
// 状態遷移はこのモジュールに閉じ込めて単体でテストできるようにしている。

export class DeathHold {
    /** @param {number} frames ホールドの長さ（tick） */
    constructor(frames) {
        this.frames = frames;
        this.remaining = 0;
        this._focus = null;
    }

    /** ホールド中か。 */
    get active() {
        return this.remaining > 0;
    }

    /**
     * カメラに渡すフォーカス点。ホールドしていなければ null。
     * Camera.follow() は x + width / 2 で中心を求めるので、幅・高さ 0 の点を返すと
     * その座標がそのまま画面中心になる。
     */
    get focus() {
        return this._focus;
    }

    /**
     * 撃破地点を指定してホールドを開始する。
     * 既にホールド中なら何もしない — 自機と母艦がほぼ同時に壊れたときに
     * 視点が2つ目の撃破地点へ飛ぶのを防ぐ。
     */
    begin(x, y) {
        if (this.active) return;
        this.remaining = this.frames;
        this._focus = { x, y, width: 0, height: 0 };
    }

    /**
     * 1 tick 進める。
     * @returns {boolean} この tick でホールドが明けたら true
     */
    tick() {
        if (!this.active) return false;
        this.remaining--;
        if (this.remaining > 0) return false;
        this._focus = null;
        return true;
    }

    /** 即座に解除する（ステージ切り替え時）。 */
    clear() {
        this.remaining = 0;
        this._focus = null;
    }
}
