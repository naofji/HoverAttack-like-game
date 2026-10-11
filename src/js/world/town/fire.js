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

    /** 毎フレーム。燃え進みは TOWN_FIRE_TICK フレームに1回 */
    update() {
        this.frame++;
        if (this.frame % TOWN_FIRE_TICK === 0) this._tick();
    }

    _tick() {
        for (const f of [...this.fires]) {
            if (!this.fires.includes(f)) continue;
            const { b } = f;
            if (!b.cells[f.k]) { this._remove(f); continue; }
            this._char(b, f.k);
            f.fuel -= TOWN_FIRE_TICK;
            if (f.fuel <= 0) this._remove(f);
        }
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
