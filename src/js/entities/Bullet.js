// ============================================
// Bullet - 直進する小さな弾の共通の振る舞い
// ============================================

import { audioManager } from '../audio/AudioManager.js';

/**
 * マシンガン弾の土台。自機と敵で、速さ・大きさ・寿命・音・色が違うだけで、
 * 「まっすぐ飛ぶ・寿命で消える・壁に当たったら消える」は全く同じだった。
 *
 * 地形は壊さない（壊すのはミサイルとグレネードの仕事）。機体との当たり判定は
 * ここでは見ない。CollisionManager が一括で処理する。
 *
 * 新しい弾を足すときは、このクラスを継承して SPEC を渡す。
 */
export class Bullet {
    /**
     * @param {object} game
     * @param {number} x 発射位置
     * @param {number} y
     * @param {number} angle 進む向き（ラジアン）
     * @param {object} spec 弾の性格
     * @param {number} spec.speed 1フレームに進む距離
     * @param {number} spec.radius 当たり・見た目の半径
     * @param {number} spec.lifetime 消えるまでのフレーム数
     * @param {string} spec.sound WEAPON_SOUNDS のキー
     */
    constructor(game, x, y, angle, spec) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * spec.speed;
        this.vy = Math.sin(angle) * spec.speed;
        this.radius = spec.radius;
        this.alive = true;
        this.lifetime = spec.lifetime;

        audioManager.playWeapon(spec.sound, this.x, this.y);
    }

    update() {
        if (!this.alive) return;

        this.x += this.vx;
        this.y += this.vy;
        this.lifetime--;

        if (this.lifetime <= 0) {
            this.alive = false;
            return;
        }

        // 壁に当たったら消える。弾はブロックを壊さない
        if (this.game.map.isSolidAtPixel(this.x, this.y)) {
            this.alive = false;
        }
    }

    /**
     * 芯を白く抜いた光る弾。外側の色だけ派生クラスが決める。
     * 芯の半径を固定の 1px にしてあるのは、小さい弾でも「光っている」と
     * 分かるようにするため。
     */
    draw(ctx) {
        if (!this.alive) return;

        ctx.fillStyle = this.bodyColor;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 1, 0, Math.PI * 2);
        ctx.fill();
    }

    /** 弾の外周の色。派生クラスが実装する。 @abstract */
    get bodyColor() { return '#FFFFFF'; }
}
