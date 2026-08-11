// ============================================
// PlayerBullet - Projectile fired by Machine Gun
// ============================================

import {
    PLAYER_MG_SPEED, PLAYER_MG_RADIUS, PLAYER_MG_LIFETIME,
} from '../utils/Constants.js';
import { Bullet } from './Bullet.js';

export class PlayerBullet extends Bullet {
    constructor(game, x, y, angle) {
        super(game, x, y, angle, {
            speed: PLAYER_MG_SPEED,
            radius: PLAYER_MG_RADIUS,
            lifetime: PLAYER_MG_LIFETIME,
            sound: 'playerMg',
        });
        // CollisionManager が自機の弾かどうかを見る
        this.isPlayerOwned = true;
    }

    // 敵弾より明るい黄色。撃ち合いの最中にどちらの弾か見分けられるように
    get bodyColor() { return '#FFDD33'; }
}
