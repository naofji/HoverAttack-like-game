// ============================================
// fire - 町の火（火元・燃料・燃え進み・燃え移り・崩れ・残り火）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（3章）
// 火元はかけら1つ。燃え進みの1回（TOWN_FIRE_TICK フレームごと）に、自分のかけらを焦がし、
// 燃料を減らし、材料に沿って隣のかけらへ進み、近くの別の建物へ燃え移る。
// 焦げたかけらは燃えているあいだだけ確率で崩れて抜け、支えが切れれば上が落ちる
// （燃えた家がやがて自分から崩れる）。
// 町の状態（かけら・支え・破片）を変えるのは Town のメソッド経由だけにする。ここは火のことだけを持つ。
// 乱数は town.random（既定 Math.random。spec 3章「乱数」）。

import { CHUNK, MAT_MASK, CHARRED } from './chunks.js';
import { TOWN_RUIN_SHADE } from './palette.js';
import {
    TOWN_MATERIALS, TOWN_FIRE_TICK, TOWN_FIRES_MAX, TOWN_FIRES_PER_BUILDING,
    TOWN_FIRE_BRANCH, TOWN_FIRE_JUMP_RANGE, TOWN_METAL_SCORCH, TOWN_EMBER_FRAMES, TOWN_EMBERS_MAX,
} from '../../utils/Constants.js';

const HALF = CHUNK / 2;

/** かけらの値から材料の行（空なら undefined） */
export const matOf = (v) => (v ? TOWN_MATERIALS[v & MAT_MASK] : undefined);

/** 燃えるかけらか。焦げたかけら（燃え尽きた所・崩壊の土台）はもう燃えない */
export const burnable = (v) => !!v && !(v & CHARRED) && !!(matOf(v) && matOf(v).burns);

export class FireSystem {
    constructor(town) {
        this.town = town;
        this.fires = [];
        this.embers = [];
        this.frame = 0;
    }

    countIn(b) {
        let n = 0;
        for (const f of this.fires) if (f.b === b) n++;
        return n;
    }

    isBurning(b, k) {
        return this.fires.some((f) => f.b === b && f.k === k);
    }

    /** かけら k に火をつける。燃えない・もう燃えている・上限なら false */
    ignite(b, k) {
        if (this.fires.length >= TOWN_FIRES_MAX) return false;
        const v = b.cells[k];
        if (!burnable(v) || this.isBurning(b, k) || this.countIn(b) >= TOWN_FIRES_PER_BUILDING) return false;
        const [lo, hi] = matOf(v).fuel;
        this.fires.push({ b, k, fuel: lo + Math.floor(this.town.random() * (hi - lo + 1)) });
        return true;
    }

    /** かけらが消えた（欠け・崩れ・切り離し）。その上の火も消す */
    onCellsRemoved(b, list) {
        if (this.fires.length === 0) return;
        const gone = new Set(list);
        this.fires = this.fires.filter((f) => !(f.b === b && gone.has(f.k)));
    }

    /** 毎フレーム。燃え進みは TOWN_FIRE_TICK フレームに1回。燃えている破片の燃料と残り火は毎フレーム減る */
    update() {
        this.frame++;
        for (const p of this.town.falling) if (p.fireFuel > 0) p.fireFuel--;
        for (const e of this.embers) e.frames--;
        this.embers = this.embers.filter((e) => e.frames > 0);
        if (this.frame % TOWN_FIRE_TICK === 0) this._tick();
    }

    _tick() {
        for (const f of [...this.fires]) {
            if (!this.fires.includes(f)) continue;
            const { b } = f;
            if (!b.cells[f.k]) { this._remove(f); continue; }
            this._char(b, f.k);
            f.fuel -= TOWN_FIRE_TICK;
            if (f.fuel <= 0) {
                const c = FireSystem.center(b, f.k);
                this.addEmber(c.x, c.y);
                this._remove(f);
                continue;
            }
            this._spreadWithin(f);
            this._jumpAcross(f);
        }
        this._crumble();
    }

    _neighbors(b, k) {
        const i = k % b.cw;
        const nb = [];
        if (i > 0) nb.push(k - 1);
        if (i < b.cw - 1) nb.push(k + 1);
        if (k >= b.cw) nb.push(k - b.cw);
        if (k + b.cw < b.cells.length) nb.push(k + b.cw);
        return nb;
    }

    /**
     * 材料に沿って隣のかけらへ進む。燃える隣から1つ選び、その材料の spread の確率で火が進む
     * （たいていは火元が移る。TOWN_FIRE_BRANCH の確率で元を残して増える）。
     * 隣の金属は熱で焦げるだけで、火は金属の上に乗らない＝燃え移りを中継しない
     */
    _spreadWithin(f) {
        const { b } = f;
        const fuelable = [];
        for (const n of this._neighbors(b, f.k)) {
            const v = b.cells[n];
            if (!v || this.isBurning(b, n)) continue;
            if (burnable(v)) fuelable.push(n);
            else if (!(v & CHARRED) && !matOf(v).burns && this.town.random() < TOWN_METAL_SCORCH) this._char(b, n);
        }
        if (fuelable.length === 0) return;
        const n = fuelable[Math.floor(this.town.random() * fuelable.length)];
        if (this.town.random() >= matOf(b.cells[n]).spread) return;
        if (this.town.random() < TOWN_FIRE_BRANCH && this.ignite(b, n)) return;
        f.k = n;
    }

    /** 別の建物の、TOWN_FIRE_JUMP_RANGE 以内で一番近い燃えるかけらへ、その材料の catch の確率で燃え移る */
    _jumpAcross(f) {
        const { x, y } = FireSystem.center(f.b, f.k);
        for (const b2 of this.town.buildingsInCircle(x, y, TOWN_FIRE_JUMP_RANGE)) {
            if (b2 === f.b) continue;
            let best = -1, bestD = Infinity;
            for (let k = 0; k < b2.cells.length; k++) {
                if (!burnable(b2.cells[k])) continue;
                const c = FireSystem.center(b2, k);
                const d = Math.hypot(c.x - x, c.y - y);
                if (d <= TOWN_FIRE_JUMP_RANGE && d < bestD) { best = k; bestD = d; }
            }
            if (best >= 0 && this.town.random() < matOf(b2.cells[best]).catch) this.ignite(b2, best);
        }
    }

    /** 燃えている建物の、火が焦がしたかけら（今燃えていないもの）が crumble の確率で崩れて抜ける */
    _crumble() {
        for (const b of new Set(this.fires.map((f) => f.b))) {
            const list = [];
            for (const k of b.burnt) {
                if (!b.cells[k] || this.isBurning(b, k)) continue;
                if (this.town.random() < matOf(b.cells[k]).crumble) list.push(k);
            }
            for (const k of list) b.burnt.delete(k);
            this.town.removeAndSettle(b, list);
        }
    }

    /** (x, y) から半径 r 以内の燃えるかけらに、近い順に火をつける（1棟の上限まで）。爆発から */
    igniteNear(b, x, y, r) {
        const cand = [];
        for (let k = 0; k < b.cells.length; k++) {
            if (!burnable(b.cells[k])) continue;
            const c = FireSystem.center(b, k);
            const d = Math.hypot(c.x - x, c.y - y);
            if (d <= r) cand.push([d, k]);
        }
        cand.sort((p, q) => p[0] - q[0]);
        let lit = 0;
        for (const [, k] of cand) {
            if (this.countIn(b) >= TOWN_FIRES_PER_BUILDING || this.fires.length >= TOWN_FIRES_MAX) break;
            if (this.ignite(b, k)) lit++;
        }
        return lit;
    }

    /**
     * 弾が当たった点から CHUNK*2（8px）以内で一番近い燃えるかけらに、その材料の bulletIgnite の確率で。
     * 当たった所は弾の欠け（半径 4px＋ぎざぎざ）で先に抜けているので、6px では候補が残らないことがある
     */
    igniteByBullet(b, x, y) {
        let best = -1, bestD = Infinity;
        for (let k = 0; k < b.cells.length; k++) {
            if (!burnable(b.cells[k])) continue;
            const c = FireSystem.center(b, k);
            const d = Math.hypot(c.x - x, c.y - y);
            if (d <= CHUNK * 2 && d < bestD) { best = k; bestD = d; }
        }
        if (best < 0 || this.town.random() >= matOf(b.cells[best]).bulletIgnite) return false;
        return this.ignite(b, best);
    }

    /** 切り離される塊の上の火を外し、破片に持たせる燃料（いちばん多い残り）を返す */
    takeFires(b, group) {
        const set = new Set(group);
        let fuel = 0;
        this.fires = this.fires.filter((f) => {
            if (f.b !== b || !set.has(f.k)) return true;
            fuel = Math.max(fuel, f.fuel);
            return false;
        });
        return fuel;
    }

    /** 残り火を置く。上限を超えたら古いものから消す */
    addEmber(x, y) {
        this.embers.push({ x, y, frames: TOWN_EMBER_FRAMES });
        while (this.embers.length > TOWN_EMBERS_MAX) this.embers.shift();
    }

    _remove(f) {
        const i = this.fires.indexOf(f);
        if (i >= 0) this.fires.splice(i, 1);
    }

    /** かけらを焦がす（1度だけ焦げ色を重ねる）。燃えているあいだの崩れの対象に入れる */
    _char(b, k) {
        if (b.cells[k] & CHARRED) return;
        b.cells[k] |= CHARRED;
        b.burnt.add(k);
        const i = k % b.cw;
        b.ctx.fillStyle = TOWN_RUIN_SHADE;
        b.ctx.fillRect(i * CHUNK, ((k - i) / b.cw) * CHUNK, CHUNK, CHUNK);
    }

    /** かけらの中心のワールド座標 */
    static center(b, k) {
        const i = k % b.cw;
        return { x: b.x + i * CHUNK + HALF, y: b.y + ((k - i) / b.cw) * CHUNK + HALF };
    }
}
