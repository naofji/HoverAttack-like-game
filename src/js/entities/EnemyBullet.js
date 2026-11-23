// ============================================
// EnemyBullet - Projectile fired by enemy units
// ============================================

import {
    ENEMY_BULLET_SPEED, ENEMY_BULLET_RADIUS, ENEMY_BULLET_LIFETIME,
} from '../utils/Constants.js';
import { Bullet } from './Bullet.js';

export class EnemyBullet extends Bullet {
    /**
     * @param {{sound?: string|null}} [opts] sound: null で発射音を鳴らさない
     *   （スパイダーの弾が割れて出す5発。破裂音が別にあり、5発ぶん MG の音が重なると破裂が埋もれる）
     */
    constructor(game, x, y, angle, { sound = 'enemyMg' } = {}) {
        super(game, x, y, angle, {
            speed: ENEMY_BULLET_SPEED,
            radius: ENEMY_BULLET_RADIUS,
            lifetime: ENEMY_BULLET_LIFETIME,
            sound,
        });
        // 敵の弾。町（敵の陣地）の建物は、この弾では欠けない・燃えない（Town.sweepProjectile が見る）
        this.isPlayerOwned = false;
    }

    get bodyColor() { return '#FFCC00'; }
}
