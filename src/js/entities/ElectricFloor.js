// ============================================
// ElectricFloor - 要塞の電流の床
// ============================================
//
// 廊下の床を放電が走る。予兆（火花だけ）→ 放電（ダメージ）→ 休み、を繰り返す。
// バリアが「撃って開ける門」なのに対し、こちらは壊せず、**間を読んで通るか、上を飛ぶ**罠。
// 廊下の高さ 64px に対し放電は 20px なので、高度を取れば避けられる（床に降りて戦うときの圧）。
//
// 敵の一種にはしない（FortressBarrier と同じ理由。game.enemies に入れると撃破数やロックオンに混ざる）。
// 敵・弾には効かない: 守備隊が自分の罠で減ると「開けた先に待ち構えている」が崩れるのと、
// 弾を素通りさせれば撃ち合いの邪魔にならない（バリアは弾を吸うので、そちらとの違いにもなる）。
//
// 床のタイルが壊れたら、その1タイルの放電は止まる（床は金属1層＝壊せる）。放電する床が無いのに
// 光っていると嘘になるので、毎フレーム足元を見る。
//
// 設計: docs/superpowers/specs/2026-10-29-stage7-fortress-hazards-design.md

import {
    TILE_SIZE, BLOCK_EMPTY,
    ELECTRIC_FLOOR_WARN_FRAMES, ELECTRIC_FLOOR_ACTIVE_FRAMES, ELECTRIC_FLOOR_REST_FRAMES,
    ELECTRIC_FLOOR_H, ELECTRIC_FLOOR_TOUCH_DAMAGE, ELECTRIC_FLOOR_HIT_INTERVAL, ELECTRIC_FLOOR_KICK_VY,
    ELECTRIC_FLOOR_COLOR, ELECTRIC_FLOOR_CORE_COLOR, ELECTRIC_FLOOR_GLOW_COLOR,
    ELECTRIC_FLOOR_ELECTRODE_COLOR, ELECTRIC_FLOOR_ELECTRODE_LAMP, ELECTRIC_FLOOR_ELECTRODE_LAMP_OFF,
} from '../utils/Constants.js';
import { recordHit } from '../utils/hitPoint.js';
import { audioManager } from '../audio/AudioManager.js';

const PERIOD = ELECTRIC_FLOOR_WARN_FRAMES + ELECTRIC_FLOOR_ACTIVE_FRAMES + ELECTRIC_FLOOR_REST_FRAMES;

export const ELECTRIC_PHASE = { REST: 'rest', WARN: 'warn', ACTIVE: 'active' };

/** 周期の中の位置から段階を返す。順番は 予兆 → 放電 → 休み（休みの終わりが次の予兆の直前） */
export function electricPhase(t) {
    const m = ((t % PERIOD) + PERIOD) % PERIOD;
    if (m < ELECTRIC_FLOOR_WARN_FRAMES) return ELECTRIC_PHASE.WARN;
    if (m < ELECTRIC_FLOOR_WARN_FRAMES + ELECTRIC_FLOOR_ACTIVE_FRAMES) return ELECTRIC_PHASE.ACTIVE;
    return ELECTRIC_PHASE.REST;
}

function overlaps(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x
        && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** 整数2つから決まる 0〜1 の値（放電の形）。game.rng を引くと週次の決定性（敵の構成）に触れるので、位置と時刻から決める */
function hash01(a, b) {
    let h = Math.imul(a * 73856093 ^ b * 19349663, 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    return (h >>> 0) / 0xFFFFFFFF;
}

export class ElectricFloor {
    /**
     * @param {object} game
     * @param {{r:number, c0:number, c1:number}} spec タイル座標。r は廊下の一番下の空洞の行
     *   （足元の床はその下）。Map._generateFortress() が fortressZones[].electricFloors に入れたもの
     */
    constructor(game, spec) {
        this.game = game;
        this.r = spec.r;
        this.c0 = spec.c0;
        this.c1 = spec.c1;
        // 並んだ床が一斉に鳴らないよう、位置から段階をずらす（毎回同じ＝週次の決定性は保たれる）
        this.timer = Math.floor(hash01(spec.c0, spec.r) * PERIOD);
        this.hitCooldown = new Map();   // 相手 → 次に当てられるまでの残りフレーム
        this.justFired = false;
        this.x = spec.c0 * TILE_SIZE;
        this.width = (spec.c1 - spec.c0 + 1) * TILE_SIZE;
        this.y = (spec.r + 1) * TILE_SIZE - ELECTRIC_FLOOR_H;
        this.height = ELECTRIC_FLOOR_H;
    }

    get phase() { return electricPhase(this.timer); }

    /** 画面外カリングと音量に使う矩形 */
    get rect() { return { x: this.x, y: this.y, width: this.width, height: this.height }; }

    /** 足元の床が残っているタイルの列だけ（壊された所は放電しない）。マップが無い偽ゲームでは全部残っている扱い */
    _liveColumns() {
        const map = this.game.map;
        const cols = [];
        for (let c = this.c0; c <= this.c1; c++) {
            const solid = !map || !map.grid || map.grid[this.r + 1]?.[c] !== BLOCK_EMPTY;
            if (solid) cols.push(c);
        }
        return cols;
    }

    update() {
        const before = this.phase;
        this.timer++;
        this.justFired = before !== ELECTRIC_PHASE.ACTIVE && this.phase === ELECTRIC_PHASE.ACTIVE;
        for (const [who, left] of this.hitCooldown) {
            if (left <= 1) this.hitCooldown.delete(who); else this.hitCooldown.set(who, left - 1);
        }
        if (this.phase !== ELECTRIC_PHASE.ACTIVE) return;

        const live = this._liveColumns();
        if (live.length === 0) return;
        const game = this.game;
        const hit = (who) => {
            if (this.hitCooldown.has(who)) return false;
            for (const c of live) {
                const zone = { x: c * TILE_SIZE, y: this.y, width: TILE_SIZE, height: this.height };
                if (overlaps(who, zone)) return true;
            }
            return false;
        };

        // 自機。ドッキング中は母艦が受ける（自機は母艦の上に乗っているだけ）
        const player = game.player;
        if (player && player.alive && !player.docked && player.invincibleTimer <= 0 && hit(player)) {
            recordHit(player, player.x + player.width / 2, this.y + this.height);
            player.takeDamage(ELECTRIC_FLOOR_TOUCH_DAMAGE);
            player.vy = Math.min(player.vy ?? 0, ELECTRIC_FLOOR_KICK_VY);
            this.hitCooldown.set(player, ELECTRIC_FLOOR_HIT_INTERVAL);
        }
        // 母艦。自機がドッキングしたまま床を滑って抜ける抜け道を作らない（バリアの 2b と同じ理由）
        const carrier = game.carrier;
        if (carrier && carrier.alive && hit(carrier)) {
            recordHit(carrier, carrier.x + carrier.width / 2, this.y + this.height);
            carrier.takeDamage(ELECTRIC_FLOOR_TOUCH_DAMAGE);
            carrier.vy = Math.min(carrier.vy ?? 0, ELECTRIC_FLOOR_KICK_VY);
            this.hitCooldown.set(carrier, ELECTRIC_FLOOR_HIT_INTERVAL);
        }
    }

    /** 放電が始まる瞬間の音。呼ぶかどうか（画面内か）は main 側が決める */
    playZap(volume) {
        audioManager.playElectricZap(this.x + this.width / 2, volume);
    }

    draw(ctx) {
        const phase = this.phase;
        const live = this._liveColumns();
        const floorY = (this.r + 1) * TILE_SIZE;   // 足元の床の上面
        const active = phase === ELECTRIC_PHASE.ACTIVE;
        const warn = phase === ELECTRIC_PHASE.WARN;
        const frame = Math.floor(this.timer / 2);   // 形は2フレームごとに変える（毎フレームだとちらついて読めない）

        for (const c of live) {
            const x = c * TILE_SIZE;
            // 電極: 床に埋めた頭が1タイルに1つ。段階でランプが変わる
            ctx.fillStyle = ELECTRIC_FLOOR_ELECTRODE_COLOR;
            ctx.fillRect(x + 4, floorY - 3, TILE_SIZE - 8, 3);
            ctx.fillStyle = (active || (warn && this.timer % 6 < 3))
                ? ELECTRIC_FLOOR_ELECTRODE_LAMP : ELECTRIC_FLOOR_ELECTRODE_LAMP_OFF;
            ctx.fillRect(x + TILE_SIZE / 2 - 1, floorY - 3, 2, 2);

            if (warn) {
                // 予兆: 低く短い火花が時々飛ぶ。ダメージは無いので、芯の色を薄くして区別する
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = ELECTRIC_FLOOR_COLOR;
                for (let k = 0; k < 2; k++) {
                    if (hash01(c * 7 + k, frame) < 0.5) continue;
                    const sx = x + 2 + Math.floor(hash01(c, frame * 3 + k) * (TILE_SIZE - 4));
                    ctx.fillRect(sx, floorY - 5 - k * 3, 1, 2);
                }
                ctx.globalAlpha = 1;
            } else if (active) {
                // 放電: 電極から立ち上がるギザギザの柱。折れ線は fillRect の段々で描く
                // （tools/render-fortress-scene.mjs の PixelCanvas でも同じ絵になる）
                // 光の滲みは柱の周りだけ（四角いパネルで塗ると、暗い背景では光ではなく茶色い箱に見えた）
                ctx.fillStyle = ELECTRIC_FLOOR_GLOW_COLOR;
                ctx.fillRect(x + 2, floorY - 5, TILE_SIZE - 4, 2);
                let bx = x + 3 + Math.floor(hash01(c, frame) * (TILE_SIZE - 6));
                for (let y = floorY - 4; y > floorY - this.height; y -= 2) {
                    ctx.fillStyle = ELECTRIC_FLOOR_GLOW_COLOR;
                    ctx.fillRect(bx - 2, y, 6, 2);
                    ctx.fillStyle = ELECTRIC_FLOOR_COLOR;
                    ctx.fillRect(bx, y, 2, 2);
                    ctx.fillStyle = ELECTRIC_FLOOR_CORE_COLOR;   // 芯は1画素だけ白く
                    ctx.fillRect(bx, y, 1, 2);
                    const step = Math.floor(hash01(c + y, frame) * 3) - 1;   // -1, 0, +1
                    bx = Math.max(x + 1, Math.min(x + TILE_SIZE - 3, bx + step * 2));
                }
            }
        }
    }
}
