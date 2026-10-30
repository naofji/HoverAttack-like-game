// ============================================
// StorageTower - 壊すと中身が出る格納塔
// ============================================
//
// お宝をむき出しで置くと、着いた時点で中身が全部見えてしまう。塔に入れて
// 「何かあるのは分かるが、中身は分からない」にする（ユーザーの案）。
//
// **どこに立つか（x, y）と中身（kind）だけを受け取り、要塞のことは知らない。**
// 今は7面の要塞の奥にだけ立つが、ほかの面に置くことも検討中なので、置き場所は
// map.storageTowerSpawns に足すだけで済む形にしてある。
//
// 敵の一種にはしていない。game.enemies に入れると撃破数・スコア・Auto Aim の
// 対象に混ざるので、バリアと同じく専用の配列（game.storageTowers）に置き、
// 自分で当たり判定を回す。自機は通り抜けられる（障害物にしない。地雷と同じ）。
//
// 設計: docs/superpowers/specs/2026-10-31-stage7-storage-towers-design.md

import {
    STORAGE_TOWER_W, STORAGE_TOWER_H, STORAGE_TOWER_HP,
    DAMAGE_PLAYER_MISSILE, PLAYER_MG_DAMAGE,
} from '../utils/Constants.js';
import { Missile } from './Missile.js';
import { PlayerBullet } from './PlayerBullet.js';
import { ITEM_SIZE } from './PickupItem.js';
import { spawnItem } from './itemKinds.js';
import { playBlast } from './destruction.js';

function pointIn(px, py, r) {
    return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

export class StorageTower {
    /**
     * @param {object} game
     * @param {{x:number, y:number, kind:string}} spec x は中心、y は**下端**（立っている床の上面）。
     *   kind は壊したときに出る中身（entities/itemKinds.js の種類）
     */
    constructor(game, { x, y, kind }) {
        this.game = game;
        this.kind = kind;
        this.width = STORAGE_TOWER_W;
        this.height = STORAGE_TOWER_H;
        this.x = x - STORAGE_TOWER_W / 2;
        this.y = y - STORAGE_TOWER_H;
        this.hp = STORAGE_TOWER_HP;
        this.maxHp = STORAGE_TOWER_HP;
        this.alive = true;
        this.timer = 0;
    }

    /**
     * 自機の弾だけを見る。敵の弾（isPlayerOwned が偽）では壊れない —
     * 守備隊の流れ弾で勝手に開くと「自分で壊して中身を見る」が崩れるため。
     * グレネードは素通りさせ、爆風（damageTowersInRadius）で削る（敵に対してと同じ）。
     */
    update() {
        if (!this.alive) return;
        this.timer++;
        for (const proj of this.game.projectiles || []) {
            // 壊れた後の弾は素通り。同じフレームの2発目まで吸うと、弾が何も無い所で消える
            if (!this.alive) break;
            if (!proj.alive || proj.exploded || !proj.isPlayerOwned) continue;
            if (!pointIn(proj.x, proj.y, this)) continue;
            if (proj instanceof Missile) {
                proj.alive = false;
                proj.exploded = true;
                playBlast(this.game, proj.x, proj.y, 'missileHit');
                this.damage(DAMAGE_PLAYER_MISSILE);
            } else if (proj instanceof PlayerBullet) {
                proj.alive = false;
                playBlast(this.game, proj.x, proj.y, 'mgHit');
                this.damage(PLAYER_MG_DAMAGE);
            }
        }
    }

    /**
     * ダメージを与える。壊れた瞬間に一度だけ中身を出す。
     * @returns {boolean} この呼び出しで壊れたら true
     */
    damage(amount) {
        if (!this.alive) return false;
        this.hp -= amount;
        if (this.hp > 0) return false;
        this.hp = 0;
        this.alive = false;
        const cx = this.x + this.width / 2;
        playBlast(this.game, cx, this.y + this.height / 2, 'missileHit');
        // 中身は塔の足元の床の上に出す（上端 = 下端 - アイテムの高さ）。宙から落とすと、
        // 落ちる間に床の穴や水へ流れて取れなくなることがある
        spawnItem(this.game, this.kind, cx, this.y + this.height - ITEM_SIZE);
        return true;
    }
}

/**
 * 爆風で塔を削る（自機のグレネード用）。距離は塔の中心まで — Grenade._explode が
 * 敵に対して測るのと同じ測り方にして、「敵なら当たる距離で塔には当たらない」を作らない。
 */
export function damageTowersInRadius(game, x, y, radius, amount) {
    for (const t of game.storageTowers || []) {
        if (!t.alive) continue;
        const dx = (t.x + t.width / 2) - x;
        const dy = (t.y + t.height / 2) - y;
        if (Math.sqrt(dx * dx + dy * dy) < radius) t.damage(amount);
    }
}
