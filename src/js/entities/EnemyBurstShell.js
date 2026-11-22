// ============================================
// EnemyBurstShell - スパイダーの弾（自機の頭上で破裂して5発を降らせる）
// ============================================
//
// game.enemyBullets に入れる。町の建物（Town.sweepProjectile）・Orb で止まる扱いは、
// 普通の敵弾と同じものがそのまま効く（townKind 'bullet' は Bullet から継ぐ）。
// 判別子は isBurstShell フラグ（isBaseLaser と同じ作法。constructor.name は使わない）。
//
// 破裂の条件（設計書「弾」の節）:
//   1. 狙いの点に着いた（age が逆算したフレーム数に達した）
//   2. 自機より上にいて、自機との横の距離が近い（自機が動いて弾の下へ来た）
//   3. 地形・建物に当たった、寿命が切れた
// 自機・母艦に直撃したときは CollisionManager が burst({ fragments: false }) を呼ぶ
// （その場から5発を出すと機体の中から出て次のフレームで全部当たるため）。

import {
    SPIDER_SHELL_SPEED, SPIDER_SHELL_GRAVITY, SPIDER_SHELL_RADIUS, SPIDER_SHELL_LIFETIME,
    COLOR_SPIDER_SHELL, COLOR_SPIDER_SHELL_BLINK, SPIDER_SHELL_BLINK_FRAMES,
    SPIDER_SHELL_BURST_DX, SPIDER_SHELL_FRAGMENTS, SPIDER_SHELL_SPREAD, SPIDER_SHELL_BURST_FLASH_RADIUS,
    ENEMY_BULLET_SPEED, ENEMY_BULLET_RADIUS, ENEMY_BULLET_LIFETIME,
} from '../utils/Constants.js';
import { Bullet } from './Bullet.js';
import { ImpactFlash } from './Particle.js';
import { audioManager } from '../audio/AudioManager.js';

/** 破裂して飛ぶ5発。普通の敵弾と同じ速さ・ダメージで、発射音は鳴らさない */
export class ShellFragment extends Bullet {
    constructor(game, x, y, angle) {
        super(game, x, y, angle, {
            speed: ENEMY_BULLET_SPEED,
            radius: ENEMY_BULLET_RADIUS,
            lifetime: ENEMY_BULLET_LIFETIME,
        });
        this.isPlayerOwned = false;
    }

    get bodyColor() { return COLOR_SPIDER_SHELL; }
}

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
        if (this.lifetime <= 0 || this.age >= this.target.frames
            || this._aboveNearPlayer() || this.game.map.isSolidPoint(this.x, this.y)) {
            this.burst();
        }
    }

    /** 自機より上（自機の上端より上）にいて、横が近いか */
    _aboveNearPlayer() {
        const p = this.game.player;
        if (!p || !p.alive) return false;
        return this.y < p.y && Math.abs(this.x - (p.x + p.width / 2)) <= SPIDER_SHELL_BURST_DX;
    }

    /**
     * その場で割れる。fragments が true なら自機へ向けて扇形に5発。
     * 走査中（CollisionManager の enemyBullets の後ろからの走査）に push しても、
     * 末尾に足された破片はそのフレームには処理されず、次のフレームから飛ぶ
     */
    burst({ fragments = true } = {}) {
        if (!this.alive) return;
        this.alive = false;
        const game = this.game;
        game.particles.push(new ImpactFlash(this.x, this.y, SPIDER_SHELL_BURST_FLASH_RADIUS, 0, {
            core: COLOR_SPIDER_SHELL_BLINK, ring: COLOR_SPIDER_SHELL,
        }));
        game.spawnSparks(this.x, this.y);
        audioManager.playWeapon('spiderBurst', this.x, this.y);
        if (!fragments) return;
        const p = game.player;
        const base = p && p.alive
            ? Math.atan2(p.y + p.height / 2 - this.y, p.x + p.width / 2 - this.x)
            : Math.PI / 2;
        const n = SPIDER_SHELL_FRAGMENTS;
        for (let i = 0; i < n; i++) {
            const a = base - SPIDER_SHELL_SPREAD / 2 + (SPIDER_SHELL_SPREAD * i) / (n - 1);
            game.enemyBullets.push(new ShellFragment(game, this.x, this.y, a));
        }
    }

    /** 町の建物に当たった。消えるのではなく、そこで割れる（建物の多い6面で弾が効かなくならないように） */
    onTownWall(x, y) {
        this.x = x;
        this.y = y;
        this.burst();
    }

    /** 破裂が近いと白と交互に点滅する（霧の中で「もうすぐ割れる」と分かるように） */
    get bodyColor() {
        const left = this.target.frames - this.age;
        if (left <= SPIDER_SHELL_BLINK_FRAMES && Math.floor(this.age / 3) % 2 === 0) return COLOR_SPIDER_SHELL_BLINK;
        return COLOR_SPIDER_SHELL;
    }
}
