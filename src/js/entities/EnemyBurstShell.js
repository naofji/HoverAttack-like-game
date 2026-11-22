// ============================================
// EnemyBurstShell - スパイダーの弾（自機の頭上で破裂して5発を降らせる）
// ============================================
//
// game.enemyBullets に入れる。町の建物（Town.sweepProjectile）・Orb で止まる扱いは、
// 普通の敵弾と同じものがそのまま効く（townKind 'bullet' は Bullet から継ぐ）。
// 判別子は isBurstShell フラグ（isBaseLaser と同じ作法。constructor.name は使わない）。

import {
    SPIDER_SHELL_SPEED, SPIDER_SHELL_GRAVITY, SPIDER_SHELL_RADIUS, SPIDER_SHELL_LIFETIME,
    COLOR_SPIDER_SHELL,
} from '../utils/Constants.js';
import { Bullet } from './Bullet.js';

export class EnemyBurstShell extends Bullet {
    /**
     * @param {object} game
     * @param {number} x 発射点
     * @param {number} y
     * @param {number} angle shellBallistics.solveLaunch の角度
     * @param {{x:number, y:number, frames:number}} target 狙いの点と、着くまでのフレーム数
     */
    constructor(game, x, y, angle, target) {
        super(game, x, y, angle, {
            speed: SPIDER_SHELL_SPEED,
            radius: SPIDER_SHELL_RADIUS,
            lifetime: SPIDER_SHELL_LIFETIME,
            sound: 'spiderLaunch',
        });
        this.isPlayerOwned = false;
        this.isBurstShell = true;
        this.target = target;
        this.age = 0;
    }

    update() {
        if (!this.alive) return;
        // 6面に水は無いので、Bullet の水の抗力は扱わない。順は shellBallistics.simulateShell と同じ
        this.age++;
        this.vy += SPIDER_SHELL_GRAVITY;
        this.x += this.vx;
        this.y += this.vy;
        this.lifetime--;
        if (this.lifetime <= 0 || this.game.map.isSolidPoint(this.x, this.y)) this.alive = false;
    }

    get bodyColor() { return COLOR_SPIDER_SHELL; }
}
