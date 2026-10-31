// ============================================
// Landmine - Floor trap that explodes on contact
// ============================================

import {
    LANDMINE_WIDTH, LANDMINE_HEIGHT,
    LANDMINE_DAMAGE, LANDMINE_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX,
    LANDMINE_BLINK_INTERVAL,
    LANDMINE_BLAST_RADIUS
} from '../utils/Constants.js';
import { applyBlastDamage } from '../utils/blastDamage.js';
import { playBlast } from './destruction.js';
import { fallToGround, hasGroundBelow } from './PickupItem.js';

export class Landmine {
    constructor(game, x, y) {
        this.game = game;
        this.x = x;
        this.y = y;
        this.width = LANDMINE_WIDTH;
        this.height = LANDMINE_HEIGHT;
        this.alive = true;
        this.blinkTimer = Math.floor(Math.random() * LANDMINE_BLINK_INTERVAL);
        // 足場のブロックが壊れたら落ちる（ユーザー指定。格納塔・アイテムと同じ fallToGround）
        this.vy = 0;
        this.onGround = true;
    }

    update() {
        if (!this.alive) return;
        this.blinkTimer++;
        this._fallIfUnsupported();
    }

    /**
     * 足場が無くなったら落ちる。毎フレーム見るのは、足場は横から・下からも壊れるため（格納塔と同じ）。
     * map の無い偽ゲームのテストが多いので、map が無ければ何もしない。
     * 地図の外周は固い岩なので、落ちた先が無くて落ち続けることはない。
     */
    _fallIfUnsupported() {
        const map = this.game && this.game.map;
        if (!map || !map.isSolidPoint) return;
        if (this.onGround && !hasGroundBelow(this)) this.onGround = false;
        if (this.onGround) return;
        fallToGround(this);
        // 落下中だけ見る。町は地雷の隣にも建つので、床に置いてあるだけで起爆してはいけない
        if (this._touchesStructure()) this.detonate();
    }

    /**
     * 敵以外の構造物（格納塔・町の建物）に触れているか（ユーザー指定）。
     * 敵機は見ない: 敵が敵の地雷で壊れるのは friendly fire で、この変更の趣旨に反する。
     * 町は、かけらのある所だけを当たりにする（建物の外接矩形では、屋根の下の空きや
     * 欠けた穴に触れただけで爆発してしまう）。地雷の四隅と中心の5点で見る
     */
    _touchesStructure() {
        const g = this.game;
        for (const t of g.storageTowers || []) {
            if (t.alive && this.x < t.x + t.width && this.x + this.width > t.x &&
                this.y < t.y + t.height && this.y + this.height > t.y) return true;
        }
        const town = g.map && g.map.town;
        if (!town) return false;
        const xs = [this.x, this.x + this.width - 1, this.x + this.width / 2];
        const ys = [this.y, this.y + this.height - 1, this.y + this.height / 2];
        for (const px of xs) {
            for (const py of ys) {
                for (const b of town.buildingsAt(px, py)) {
                    const k = town.cellAt(b, px, py);
                    if (k >= 0 && b.cells[k]) return true;
                }
            }
        }
        return false;
    }

    /**
     * Check collision with a rectangular entity (player, carrier, etc.)
     * Returns true if this mine overlaps with the given bounding box.
     */
    collidesWith(entity) {
        if (!this.alive || !entity.alive) return false;
        return (
            this.x < entity.x + entity.width &&
            this.x + this.width > entity.x &&
            this.y < entity.y + entity.height &&
            this.y + this.height > entity.y
        );
    }

    /**
     * Check collision with a point (for projectiles like missiles).
     */
    collidesWithPoint(px, py) {
        if (!this.alive) return false;
        return (
            px >= this.x && px <= this.x + this.width &&
            py >= this.y && py <= this.y + this.height
        );
    }

    /**
     * Detonate the mine: spawn explosion, deal AoE damage, and trigger chain reactions.
     */
    detonate() {
        if (!this.alive) return;
        this.alive = false;

        // Explosion visual
        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        playBlast(this.game, cx, cy, 'landmine');

        applyBlastDamage(this.game, cx, cy, {
            radius: LANDMINE_BLAST_RADIUS, damage: LANDMINE_DAMAGE,
            knockVy: LANDMINE_KNOCKBACK_VY, knockVx: LANDMINE_KNOCKBACK_VX, source: this,
        });
    }

    draw(ctx) {
        if (!this.alive) return;

        const blinkOn = (this.blinkTimer % LANDMINE_BLINK_INTERVAL) < (LANDMINE_BLINK_INTERVAL / 2);

        // --- Base (dark metallic rectangle) ---
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // --- Top highlight ---
        ctx.fillStyle = '#555555';
        ctx.fillRect(this.x + 1, this.y, this.width - 2, 2);

        // --- Blinking LED (red dot) ---
        if (blinkOn) {
            ctx.fillStyle = '#FF0000';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + 2, 2, 0, Math.PI * 2);
            ctx.fill();

            // Glow effect
            ctx.fillStyle = 'rgba(255, 50, 50, 0.3)';
            ctx.beginPath();
            ctx.arc(this.x + this.width / 2, this.y + 2, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
