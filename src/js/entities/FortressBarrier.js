// ============================================
// FortressBarrier - 要塞の電磁パルスのバリア
// ============================================
//
// 天井と床に1基ずつユニットが立ち、その間に縦のバリアが張られる。**両方**壊すと
// 消えて奥へ進めるようになる。壁を壊して進むのではなく装置を倒して進む形にした
// のは、横視点のゲームとして成立させるため（縦横の格子は真上から見た間取り図に
// 見える、という実機の指摘への答え）。
//
// 敵の一種にはしていない。game.enemies に入れると撃破数・スコア・Auto Aim の
// 対象に混ざってしまうので、地雷と同じく専用の配列（game.barriers）に置いて
// 自分で当たり判定を回す。
//
// 設計: docs/superpowers/specs/2026-09-06-stage7-fortress-design.md 節4b

import {
    TILE_SIZE,
    BARRIER_EMITTER_HP, BARRIER_UNIT_W, BARRIER_UNIT_H, BARRIER_FIELD_W,
    BARRIER_TOUCH_DAMAGE, BARRIER_KNOCKBACK_VX, BARRIER_KNOCKBACK_VY,
    BARRIER_PULSE_PERIOD, BARRIER_COLOR, BARRIER_GLOW_COLOR,
    BARRIER_UNIT_COLOR, BARRIER_UNIT_LAMP_COLOR,
} from '../utils/Constants.js';
import { playBlast } from './destruction.js';
import { recordHit } from '../utils/hitPoint.js';

function overlaps(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pointIn(px, py, r) {
    return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

export class FortressBarrier {
    /**
     * @param {object} game
     * @param {{c:number, top:number, bottom:number}} spec タイル座標。
     *   Map._generateFortress() が fortressZones[].barriers に入れたもの
     */
    constructor(game, spec) {
        this.game = game;
        this.alive = true;
        this.timer = 0;
        this.emitterHP = { top: BARRIER_EMITTER_HP, bottom: BARRIER_EMITTER_HP };

        const cx = spec.c * TILE_SIZE + TILE_SIZE / 2;
        this.topUnit = {
            x: cx - BARRIER_UNIT_W / 2, y: spec.top * TILE_SIZE,
            width: BARRIER_UNIT_W, height: BARRIER_UNIT_H,
        };
        this.bottomUnit = {
            x: cx - BARRIER_UNIT_W / 2,
            y: (spec.bottom + 1) * TILE_SIZE - BARRIER_UNIT_H,
            width: BARRIER_UNIT_W, height: BARRIER_UNIT_H,
        };
        // バリアの帯はユニットとユニットの間
        this.fieldX = cx - BARRIER_FIELD_W / 2;
        this.fieldW = BARRIER_FIELD_W;
        this.fieldY = this.topUnit.y + this.topUnit.height;
        this.fieldH = this.bottomUnit.y - this.fieldY;
    }

    /**
     * **2基とも壊すまでバリアは消えない**（片方だけでは残る）。
     * 「両方を潰す」が遊びの核なので、片方で消えると成立しない。
     * 残った1基が張り続けている、という絵として読ませる。
     */
    get active() {
        return this.emitterHP.top > 0 || this.emitterHP.bottom > 0;
    }

    get fieldRect() {
        return { x: this.fieldX, y: this.fieldY, width: this.fieldW, height: this.fieldH };
    }

    /** ユニットにダメージ。壊れた瞬間に爆発を出す。 */
    damageEmitter(which, amount) {
        if (this.emitterHP[which] <= 0) return false;
        this.emitterHP[which] -= amount;
        if (this.emitterHP[which] <= 0) {
            this.emitterHP[which] = 0;
            const unit = which === 'top' ? this.topUnit : this.bottomUnit;
            playBlast(this.game, unit.x + unit.width / 2, unit.y + unit.height / 2, 'missileHit');
            return true;
        }
        return false;
    }

    update() {
        this.timer++;
        const game = this.game;

        // 1. 弾は「ユニットに当たったら削る」「バリアに当たったら吸収」。
        //    ユニットを先に見るのは、ユニットがバリアの手前側にあるので
        //    そちらが優先されないと開けられなくなるため
        for (const proj of game.projectiles || []) {
            if (!proj.alive || proj.exploded) continue;
            if (proj.isPlayerOwned && this._hitUnit(proj)) continue;
            if (!this.active) continue;
            if (pointIn(proj.x, proj.y, this.fieldRect)) {
                // 吸収。exploded を立てて、着弾の爆発と地形破壊が走らないようにする
                proj.alive = false;
                proj.exploded = true;
            }
        }

        if (!this.active) return;

        // 2. 自機: ダメージ＋来た方向へ押し戻す。ダメージだけだと強行突破できてしまう
        const player = game.player;
        if (player && player.alive && !player.docked && player.invincibleTimer <= 0
            && overlaps(player, this.fieldRect)) {
            recordHit(player, this.fieldX + this.fieldW / 2, player.y);
            player.takeDamage(BARRIER_TOUCH_DAMAGE);
            this._pushBack(player);
        }

        // 3. 敵: 押し戻すだけ。**ダメージは与えない** — 守備隊が自分のバリアで
        //    自滅すると「開けた瞬間に出てくる」という狙いが成立しなくなる
        for (const enemy of game.enemies || []) {
            if (!enemy.alive) continue;
            if (enemy.width == null) continue; // 基地など矩形を持たないものは無視
            if (overlaps(enemy, this.fieldRect)) this._pushBack(enemy);
        }
    }

    /** 自機の弾がユニットに当たったか。当たったら削って true。 */
    _hitUnit(proj) {
        for (const which of ['top', 'bottom']) {
            if (this.emitterHP[which] <= 0) continue;
            const unit = which === 'top' ? this.topUnit : this.bottomUnit;
            if (!pointIn(proj.x, proj.y, unit)) continue;
            this.damageEmitter(which, proj.blockDamage ?? 15);
            proj.alive = false;
            proj.exploded = true;
            return true;
        }
        return false;
    }

    /** 来た方向へ返す。中心より左に居れば左へ、右に居れば右へ。 */
    _pushBack(entity) {
        const center = this.fieldX + this.fieldW / 2;
        const entityCenter = entity.x + entity.width / 2;
        const dir = entityCenter < center ? -1 : 1;
        entity.vx = dir * BARRIER_KNOCKBACK_VX;
        entity.vy = BARRIER_KNOCKBACK_VY;
    }

    draw(ctx) {
        // ユニット（壊れていない側だけ）
        for (const which of ['top', 'bottom']) {
            if (this.emitterHP[which] <= 0) continue;
            const u = which === 'top' ? this.topUnit : this.bottomUnit;
            ctx.fillStyle = BARRIER_UNIT_COLOR;
            ctx.fillRect(u.x, u.y, u.width, u.height);
            // 稼働中だけランプが点く。消えていれば「もう片方を探せ」の合図になる
            if (this.active) {
                const lit = (this.timer % BARRIER_PULSE_PERIOD) < BARRIER_PULSE_PERIOD / 2;
                ctx.fillStyle = lit ? BARRIER_UNIT_LAMP_COLOR : BARRIER_UNIT_COLOR;
                ctx.fillRect(u.x + 2, u.y + u.height / 2 - 1, u.width - 4, 2);
            }
        }
        if (!this.active) return;

        // バリア本体。芯を明滅させ、その外に淡いグロー
        const phase = (this.timer % BARRIER_PULSE_PERIOD) / BARRIER_PULSE_PERIOD;
        const pulse = 0.6 + 0.4 * Math.sin(phase * Math.PI * 2);
        ctx.fillStyle = BARRIER_GLOW_COLOR;
        ctx.fillRect(this.fieldX - 3, this.fieldY, this.fieldW + 6, this.fieldH);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = BARRIER_COLOR;
        ctx.fillRect(this.fieldX, this.fieldY, this.fieldW, this.fieldH);
        ctx.globalAlpha = 1;
    }
}
