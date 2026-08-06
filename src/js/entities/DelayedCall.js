// ============================================
// DelayedCall - 一定tick後に一度だけ処理を走らせる
// ============================================
// 破壊演出で「閃光が出てから爆発する」といった順序を作るために使う。
// 既存の Particle と同じ update()/draw()/alive の契約に従うので、
// game.particles に混ぜるだけでゲームループに乗り、ステージ切り替え時の
// クリアもそのまま効く（DebrisPart と同じ相乗り方式）。
//
// 描画は行わない。particles 配列を「毎tick進むもの置き場」として使っている。

export class DelayedCall {
    /**
     * @param {number} frames 何tick後に呼ぶか
     * @param {Function} fn 呼ぶ処理
     */
    constructor(frames, fn) {
        this.remaining = frames;
        this.fn = fn;
        this.alive = true;
    }

    update() {
        if (!this.alive) return;
        this.remaining--;
        if (this.remaining > 0) return;
        this.alive = false;
        this.fn();
    }

    /** 何も描かない。 */
    draw() {}
}
