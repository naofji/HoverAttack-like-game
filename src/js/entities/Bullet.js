// ============================================
// Bullet - 直進する小さな弾の共通の振る舞い
// ============================================

import { audioManager } from '../audio/AudioManager.js';
import { motionFor } from '../world/StageEnvironment.js';
import { BULLET_WATER_DRAG, BULLET_WATER_MIN_SPEED, BULLET_WATER_TRAIL_INTERVAL, PARTICLE_LIFETIME } from '../utils/Constants.js';
import { TrailParticle } from './Particle.js';

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
        this.frameCounter = 0;

        audioManager.playWeapon(spec.sound, this.x, this.y);
    }

    update() {
        if (!this.alive) return;

        // 水中(滝含む)では motion.speed をその場の倍率として移動量に掛けるのではなく、
        // vx/vy 自体を毎フレーム弱める。前者だと「水中だけ遅いが空気に出た瞬間に
        // 元の速さへ戻る」不自然な動きになる（実機の指摘）。抗力方式なら水中でどんどん
        // 減速して止まり、空気に出ても減速済みの速度のまま飛び続ける
        const motion = motionFor(this.game, this.x, this.y);
        if (motion.speed < 1) {
            this.vx *= BULLET_WATER_DRAG;
            this.vy *= BULLET_WATER_DRAG;
            // 寿命が尽きるまで水中に静止したまま漂うのは不自然なので、
            // 十分弱まったら寿命を待たずに自然消滅させる
            if (Math.hypot(this.vx, this.vy) < BULLET_WATER_MIN_SPEED) {
                this.alive = false;
                return;
            }
            // 水中を進んでいることが分かるよう、白い尾を引く（Missile と同じ仕組み）
            this.frameCounter++;
            if (this.frameCounter % BULLET_WATER_TRAIL_INTERVAL === 0) {
                this.game.particles.push(new TrailParticle(this.x, this.y, PARTICLE_LIFETIME));
            }
        }
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
