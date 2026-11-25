// ============================================
// 地雷の更新（自機が踏む・自機の弾で誘爆）
// ============================================
//
// main.js から切り出した（2026-11-25、中身は動かしただけ）。地雷そのものの絵と爆発は
// entities/Landmine.js、倒した敵機の爆発での誘爆は destruction.js の detonatesMines。
//
// AutoAim.js と同じく **Object.assign で Game に混ぜる前提**の
// オブジェクトリテラルで、`this` は Game を指す。

import { LANDMINE_SCORE } from '../utils/Constants.js';

export const Landmines = {
    _updateLandmines() {
        for (let i = this.landmines.length - 1; i >= 0; i--) {
            const mine = this.landmines[i];
            mine.update();

            if (this.player && this.player.alive && !this.player.docked &&
                this.player.invincibleTimer <= 0 && mine.collidesWith(this.player)) {
                mine.detonate();
            }

            if (mine.alive) {
                for (const proj of this.projectiles) {
                    // 敵の弾では起爆しない（continue であって break ではない。敵の弾が
                    // 先に並んでいても、後ろの自機の弾で起爆できないといけない）。
                    // 地雷の爆風は game.enemies 全員に当たるので、敵の流れ弾で起爆すると
                    // 敵が敵を巻き添えにしていた。誘爆させてよいのは自機の弾と、
                    // 倒した敵機の爆発（destruction.js の detonatesMines）だけ
                    if (!proj.isPlayerOwned) continue;
                    if (proj.alive && !proj.exploded && mine.collidesWithPoint(proj.x, proj.y)) {
                        mine.detonate();
                        proj.alive = false;
                        proj.exploded = true;
                        this.addScore(LANDMINE_SCORE);
                        break;
                    }
                }
            }

            if (!mine.alive) this.landmines.splice(i, 1);
        }
    },
};
