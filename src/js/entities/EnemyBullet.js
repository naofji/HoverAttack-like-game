// ============================================
// EnemyBullet - Projectile fired by enemy units
// ============================================

import {
    ENEMY_BULLET_SPEED, ENEMY_BULLET_RADIUS, ENEMY_BULLET_LIFETIME,
} from '../utils/Constants.js';
import { Bullet } from './Bullet.js';

export class EnemyBullet extends Bullet {
    constructor(game, x, y, angle) {
        super(game, x, y, angle, {
            speed: ENEMY_BULLET_SPEED,
            radius: ENEMY_BULLET_RADIUS,
            lifetime: ENEMY_BULLET_LIFETIME,
            sound: 'enemyMg',
        });
    }

    get bodyColor() { return '#FFCC00'; }
}
