// ============================================
// EnemyBurstShell - スパイダーの弾（自機の手前で破裂して糸を広げる）
// ============================================
//
// game.enemyBullets に入れる。町の建物（Town.sweepProjectile）・Orb で止まる扱いは、
// 普通の敵弾と同じものがそのまま効く（townKind 'bullet' は Bullet から継ぐ）。
// 判別子は isBurstShell フラグ（isBaseLaser と同じ作法。constructor.name は使わない）。
//
// 破裂の条件（設計書「弾」の節）:
//   1. 自機の中心から SPIDER_SHELL_BURST_RANGE まで近づいた（外から入ったときだけ）
//   2. 狙いの点に着いた（age が逆算したフレーム数に達した）
//   3. 地形・建物に当たった、寿命が切れた
// 自機・母艦に直撃したときは CollisionManager が burst({ fragments: false }) を呼ぶ
// （直撃でダメージを受けたうえに、機体の中から糸を広げて絡めると二重の罰になるため）。

import {
    SPIDER_SHELL_SPEED, SPIDER_SHELL_GRAVITY, SPIDER_SHELL_RADIUS, SPIDER_SHELL_LIFETIME,
    COLOR_SPIDER_SHELL, COLOR_SPIDER_SHELL_BLINK, SPIDER_SHELL_BLINK_FRAMES,
    COLOR_SPIDER_SHELL_HIGHLIGHT, COLOR_SPIDER_SHELL_BODY, COLOR_SPIDER_SHELL_SHADE, COLOR_SPIDER_SHELL_RIM,
    SPIDER_SHELL_BURST_RANGE, SPIDER_SHELL_BURST_FLASH_RADIUS,
    SPIDER_SHELL_SCORE, TOWN_SWEEP_STEP,
    COLOR_SPIDER_SHELL_GLOW, SPIDER_SHELL_GLOW_RADIUS, SPIDER_SHELL_GLOW_PERIOD, SPIDER_SHELL_GLOW_ALPHA,
} from '../utils/Constants.js';
import { Bullet } from './Bullet.js';
import { SpiderWeb } from './SpiderWeb.js';
import { ImpactFlash } from './Particle.js';
import { audioManager } from '../audio/AudioManager.js';
import { playBlast } from './destruction.js';

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
        // 自機から BURST_RANGE の外にいたことがあるか。撃った時点で内側なら、外へ出るまで距離では割らない
        this.armed = this._playerDist() > SPIDER_SHELL_BURST_RANGE;
    }

    update() {
        if (!this.alive) return;
        // 6面に水は無いので、Bullet の水の抗力は扱わない。順は shellBallistics.simulateShell と同じ
        this.age++;
        this.vy += SPIDER_SHELL_GRAVITY;
        this.x += this.vx;
        this.y += this.vy;
        this.lifetime--;
        if (this.game.map.isSolidPoint(this.x, this.y)) {
            // 岩の中で割ると5発が最初の1歩で岩に消える（最終レビュー）。1フレーム前の位置は岩の外だったので、そこで割る
            this.x -= this.vx;
            this.y -= this.vy;
            this.burst();
            return;
        }
        if (this.lifetime <= 0 || this.age >= this.target.frames || this._reachedPlayer()) this.burst();
    }

    /** 自機の中心までの距離。自機がいなければ Infinity */
    _playerDist() {
        const p = this.game.player;
        if (!p || !p.alive) return Infinity;
        return Math.hypot(this.x - (p.x + p.width / 2), this.y - (p.y + p.height / 2));
    }

    /** 自機から BURST_RANGE の外から内へ入ったか */
    _reachedPlayer() {
        const d = this._playerDist();
        if (d > SPIDER_SHELL_BURST_RANGE) {
            this.armed = true;
            return false;
        }
        return this.armed;
    }

    /** 割れるまでの見込みのフレーム数（点滅を始める合図）。狙いの点に着くか、自機の 140px に入るかの早いほう */
    _framesToBurst() {
        const left = this.target.frames - this.age;
        if (!this.armed) return left;
        const d = this._playerDist() - SPIDER_SHELL_BURST_RANGE;
        return Math.min(left, d / SPIDER_SHELL_SPEED);
    }

    /**
     * その場で割れる。fragments が true なら自機へ向けて5本の糸（SpiderWeb）を扇に広げる。
     * 2026-11-23 ユーザー指定で、5発の普通の敵弾から糸に変えた（当たると動きが遅くなる。ダメージは無い）。
     * 走査中（CollisionManager の enemyBullets の後ろからの走査）に push しても、
     * 末尾に足された糸はそのフレームには処理されず、次のフレームから伸びる
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
        const angle = p && p.alive
            ? Math.atan2(p.y + p.height / 2 - this.y, p.x + p.width / 2 - this.x)
            : Math.PI / 2;
        game.enemyBullets.push(new SpiderWeb(game, this.x, this.y, angle));
    }

    /** 自機が撃ち落とした（ミサイル・グレネード）。割れずに消え、5発は出ない */
    destroyByPlayer() {
        if (!this.alive) return;
        this.alive = false;
        playBlast(this.game, this.x, this.y, 'homingHit');
        this.game.addScore(SPIDER_SHELL_SCORE);
    }

    /**
     * 町の建物に当たった。消えるのではなく、そこで割れる（建物の多い6面で弾が効かなくならないように）。
     * 当たった点で割ると5発がその建物を素通りする（Town.sweepProjectile は出発点に重なる建物を外接矩形で
     * 見て無視するため。最終レビュー）。来た向きへ TOWN_SWEEP_STEP ずつ戻し、外接矩形の外へ出てから割る
     */
    onTownWall(x, y) {
        const speed = Math.hypot(this.vx, this.vy) || 1;
        const ux = this.vx / speed;
        const uy = this.vy / speed;
        const town = this.game.map && this.game.map.town;
        // 1 tick に進む距離より長く戻ることは無い（前の tick の終わりは建物の外だった）
        const maxSteps = Math.ceil(speed / TOWN_SWEEP_STEP) + 1;
        let bx = x - ux * TOWN_SWEEP_STEP;
        let by = y - uy * TOWN_SWEEP_STEP;
        for (let i = 0; town && i < maxSteps && town.buildingsAt(bx, by).length > 0; i++) {
            bx -= ux * TOWN_SWEEP_STEP;
            by -= uy * TOWN_SWEEP_STEP;
        }
        this.x = bx;
        this.y = by;
        this.burst();
    }

    /** 破裂が近いと地の色が明るめの紫と交互に点滅する（霧の中で「もうすぐ割れる」と分かるように） */
    get bodyColor() {
        const left = this._framesToBurst();
        if (left <= SPIDER_SHELL_BLINK_FRAMES && Math.floor(this.age / 3) % 2 === 0) return COLOR_SPIDER_SHELL_BLINK;
        return COLOR_SPIDER_SHELL_BODY;
    }

    /**
     * 深紫の球（ユーザー指定）。光が左上から当たっている体で、ハイライトの中心を左上へずらした放射グラデーションを
     * 球いっぱいに塗る（ハイライト → 地の色 → 影 → 暗い縁）。Bullet の「白い芯の光る弾」とは描き方が違うので上書きする。
     * ハイライトは小さく・左上へ大きめにずらし、球の右下の 4 割を影と縁にあてて、光の側と影の側の差で丸みを出す
     */
    draw(ctx) {
        if (!this.alive) return;
        this._drawGlow(ctx);
        const r = this.radius;
        const g = ctx.createRadialGradient(this.x - r * 0.4, this.y - r * 0.45, r * 0.05, this.x, this.y, r);
        g.addColorStop(0, COLOR_SPIDER_SHELL_HIGHLIGHT);
        g.addColorStop(0.3, this.bodyColor);
        g.addColorStop(0.75, COLOR_SPIDER_SHELL_SHADE);
        g.addColorStop(1, COLOR_SPIDER_SHELL_RIM);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * 球の周りの脈打つ紫の光（霧の中で目立たせる。球そのものは暗いまま立体に見せたいので、光は外に出す）。
     * 割れる直前は速く脈打って「もうすぐ割れる」を知らせる
     */
    _drawGlow(ctx) {
        const left = this._framesToBurst();
        const period = left <= SPIDER_SHELL_BLINK_FRAMES ? SPIDER_SHELL_GLOW_PERIOD / 3 : SPIDER_SHELL_GLOW_PERIOD;
        const [lo, hi] = SPIDER_SHELL_GLOW_ALPHA;
        const k = 0.5 - 0.5 * Math.cos((this.age / period) * Math.PI * 2);
        const g = ctx.createRadialGradient(this.x, this.y, this.radius * 0.5, this.x, this.y, SPIDER_SHELL_GLOW_RADIUS);
        g.addColorStop(0, COLOR_SPIDER_SHELL_GLOW);
        g.addColorStop(1, 'rgba(181, 124, 255, 0)');   // COLOR_SPIDER_SHELL_GLOW の透明
        const prev = ctx.globalAlpha;
        ctx.globalAlpha = lo + (hi - lo) * k;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.x, this.y, SPIDER_SHELL_GLOW_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = prev;
    }
}

/**
 * 自機のグレネードの爆風の半径に入ったスパイダーの弾を壊す。他の敵弾には効かせない（範囲を広げない）。
 * @returns {number} 壊した数
 */
export function destroyShellsInRadius(game, x, y, radius) {
    let n = 0;
    for (const b of game.enemyBullets) {
        if (!b.isBurstShell || !b.alive) continue;
        if (Math.hypot(b.x - x, b.y - y) < radius) {
            b.destroyByPlayer();
            n++;
        }
    }
    return n;
}
