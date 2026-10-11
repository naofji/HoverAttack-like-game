// ============================================
// explosives - 町の爆発物の誘爆
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（3b章）
// 爆発物は「材料が爆発物のかけらだけでできた建物」（Town の b.explosive）。欠け・火・落下は
// Town と FireSystem が trigger() で知らせ、ここは順番待ちと爆発そのものだけを持つ。
// 爆発は画面の近くなら playBlast（→ spawnExplosion → town.blast・地雷の誘爆・爆発音）、
// 画面の外なら town.blast と地雷の誘爆だけ（粒と音は出さない。spec 2章「画面の外」）。
// どちらも岩は壊さない（spawnExplosion は地形に触らない）。

import { MAT_MASK, MAT_EXPLOSIVE, CHUNK } from './chunks.js';
import { playBlast, detonateNearbyMines } from '../../entities/destruction.js';
import { applyBlastDamage } from '../../utils/blastDamage.js';
import {
    TOWN_EXPLOSIVE_DAMAGE, TOWN_EXPLOSIVE_RADIUS, TOWN_EXPLOSIVE_BLAST_COUNT,
    LANDMINE_KNOCKBACK_VY, LANDMINE_KNOCKBACK_VX, VIEW_CULL_MARGIN,
} from '../../utils/Constants.js';

const HALF = CHUNK / 2;

export class ExplosiveSystem {
    constructor(town) {
        this.town = town;
        this.frame = 0;
        // 建物 → { due, x, y, landed }。x, y は爆発する場所の控え（かけらも破片も残っていないとき使う）
        this.queue = new Map();
    }

    /**
     * 爆発物 b を delay フレーム後に爆発させる。同じ建物には早いほうを残す。
     * x, y を渡すのは落ちて砕けたとき（その場所で爆発する。landed）
     */
    trigger(b, delay, x, y) {
        if (!b.explosive || b.exploded) return;
        const due = this.frame + delay;
        const landed = x !== undefined;
        const e = this.queue.get(b);
        if (!e) {
            this.queue.set(b, {
                due, landed,
                x: landed ? x : b.x + b.width / 2, y: landed ? y : b.y + b.height / 2,
            });
            return;
        }
        if (due < e.due) e.due = due;
        if (landed) Object.assign(e, { x, y, landed });
    }

    /** 毎 tick（Town.update から）。期限の来たものを早い順に爆発させる */
    update(game, view) {
        this.frame++;
        if (this.queue.size === 0) return;
        const ready = [...this.queue].filter(([, e]) => e.due <= this.frame).sort((p, q) => p[1].due - q[1].due);
        for (const [b, e] of ready) this._explode(b, e, game, view);
    }

    _near(view, x, y) {
        if (!view) return true;
        const m = VIEW_CULL_MARGIN;
        return x >= view.x - m && x <= view.x + view.w + m && y >= view.y - m && y <= view.y + view.h + m;
    }

    /**
     * 爆発する場所。落ちて砕けた所 → まだ落ちている破片 → 残ったかけらの真ん中 → 控え の順。
     * 爆風で丸ごと消し飛んだ爆発物は、控え（引き金のときの建物の真ん中）で爆発する
     */
    _where(b, e) {
        if (e.landed) return { x: e.x, y: e.y };
        const piece = this.town.falling.find((p) => p.alive && p.sourceId === b.id);
        if (piece) return { x: piece.cx, y: piece.cy };
        let n = 0, sx = 0, sy = 0;
        for (let k = 0; k < b.cells.length; k++) {
            if ((b.cells[k] & MAT_MASK) !== MAT_EXPLOSIVE) continue;
            const i = k % b.cw;
            sx += b.x + i * CHUNK + HALF;
            sy += b.y + ((k - i) / b.cw) * CHUNK + HALF;
            n++;
        }
        return n > 0 ? { x: sx / n, y: sy / n } : { x: e.x, y: e.y };
    }

    _explode(b, e, game, view) {
        const town = this.town;
        this.queue.delete(b);
        b.exploded = true;
        const { x, y } = this._where(b, e);
        // 爆発した爆発物は残さない。まだ落ちている破片も一緒に消す（破片が後で着地して2度目の爆発をしないように）
        for (const p of town.falling) if (p.sourceId === b.id) p.alive = false;
        town.falling = town.falling.filter((p) => p.alive);
        town.consume(b);
        if (this._near(view, x, y)) {
            playBlast(game, x, y, 'townExplosive');
        } else {
            town.blast(x, y, TOWN_EXPLOSIVE_BLAST_COUNT);
            detonateNearbyMines(game, x, y);
        }
        applyBlastDamage(game, x, y, {
            radius: TOWN_EXPLOSIVE_RADIUS, damage: TOWN_EXPLOSIVE_DAMAGE,
            knockVy: LANDMINE_KNOCKBACK_VY, knockVx: LANDMINE_KNOCKBACK_VX,
        });
    }
}
