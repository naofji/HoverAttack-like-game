// ============================================
// HoverMist - ホバー中に地表・水面で舞う粉雪と水滴、水中の噴射の泡（自機と敵アタッカーの共通部品）
// ============================================
//
// 自機（Player）と敵アタッカー（EnemyAttacker）は、同じ中身の _kickHoverSnowMist / _kickHoverWaterMist を
// 1つずつ持っていた（違うのは「敵は画面外では撒かない」だけ）。2026-11-25 の「無敵ブロックの上で雪が舞う」
// の修正で hoverGroundIsSnow を両方に同じように書き足すことになったので、slopeBody.js / walkerBody.js と
// 同じく1つにまとめた（意味は自機・敵のどちらとも変えていない。敵の元のコードとは、副作用の無い計算の
// 順番と画面外の判定の書き方だけが違う）。
// 母艦の同名のメソッドは船体を3等分して見る別の作りなので、ここには入れない。
// 噴射の泡（_emitJetBubbles）も同じ事情で 2026-11-26 に合流した（自機は飛び立ちの泡を直に書いていた）。
// 泡の出る点 _hoverNozzle() は自機（描画の矩形から）と敵（型の flameX/flameY としゃがみから）で中身が
// 違うので、各クラスに残して呼ぶだけにしている。
//
// Object.assign で prototype へ混ぜる前提のオブジェクトリテラルで、`this` は機体。
// 機体に要るもの: game・x/y/width/height・motion.slide・onGround/onTerrain・hovering、
// 印として _burstSnowPuff（飛び立った直後に粉雪を1回）と _burstMistFrames（飛び立った直後に水滴を出す残り）。
// 粒を画面内の機体だけに絞るなら、prototype に hoverMistOnScreenOnly = true を置く（敵アタッカー。
// 画面外の9割で撒くと particles を食い潰す。自機は常に画面内なので置かない）。

import {
    VIEW_CULL_MARGIN,
    HOVER_SNOW_MIST_MIN_ALT, HOVER_SNOW_MIST_MAX_ALT, HOVER_SNOW_MIST_INTERVAL, HOVER_SNOW_MIST_COUNT, HOVER_SNOW_MIST_BURST_COUNT,
    HOVER_WATER_MIST_MIN_ALT, HOVER_WATER_MIST_MAX_ALT, HOVER_WATER_MIST_INTERVAL,
    HOVER_JET_BUBBLE_INTERVAL,
} from '../utils/Constants.js';
import {
    groundClearance, groundSlopeDirection, snowMistOriginY, hoverGroundIsSnow,
    waterClearance, hoverWaterMistCount, hoverWaterMistCloseness,
} from '../utils/surface.js';
import { isInView } from '../utils/viewCull.js';
import { JET_BUBBLE_DROP } from './thrusterFlame.js';

export const HoverMist = {
    /** 粒を画面内の機体だけに絞る機体（hoverMistOnScreenOnly）で、いま画面の外にいるか */
    _hoverMistOffScreen() {
        return !!this.hoverMistOnScreenOnly && !!this.game.camera && !!this.game.canvas
            && !isInView(this, this.game.camera, this.game.canvas, VIEW_CULL_MARGIN);
    },

    /**
     * 雪面の1〜2ブロック上空をホバーしているときだけ、地表で粉雪が舞う。
     * 接地中（着地・滑走・歩行）は _kickSnow の担当なので、ここでは onTerrain を
     * 見て住み分ける。地面までの距離は groundClearance が持つ（副作用なし）。
     */
    _kickHoverSnowMist() {
        // 飛び立った印は、この呼び出しで必ず使い切る（画面外などで出せなかったときに、古い印があとで効かないように）
        const burst = this._burstSnowPuff;
        this._burstSnowPuff = false;
        if (!this.game.spawnSnowMist) return;
        if (this.onTerrain) return;
        if (this.motion.slide <= 0) return;
        if (this._hoverMistOffScreen()) return;
        const clearance = groundClearance(this, this.game, HOVER_SNOW_MIST_MAX_ALT);
        if (clearance === null || clearance < HOVER_SNOW_MIST_MIN_ALT) return;
        if (!hoverGroundIsSnow(this, this.game, clearance)) return;   // 無敵ブロックの上には雪が無い
        const fx = this.x + this.width / 2;
        const fy = snowMistOriginY(this, this.game, clearance);   // 岩の中から出さない（snowMistOriginY）
        const onSlope = groundSlopeDirection(this, this.game, clearance) !== 0;
        if (burst) {
            // 飛び立つ瞬間は間引きを待たず、多めに 1 回。次のホバーの粉雪は INTERVAL 後
            this._hoverMistTimer = 0;
            this.game.spawnSnowMist(fx, fy, HOVER_SNOW_MIST_BURST_COUNT, onSlope);
            return;
        }
        this._hoverMistTimer = (this._hoverMistTimer || 0) + 1;
        if (this._hoverMistTimer % HOVER_SNOW_MIST_INTERVAL !== 0) return;
        this.game.spawnSnowMist(fx, fy, HOVER_SNOW_MIST_COUNT, onSlope);
    },

    /**
     * 水面の少し上空をホバーしているとき（と飛び立った直後）だけ、水面で水滴が舞う（_kickHoverSnowMist
     * の水面版）。自機のバーストの直後はホバーの待ち時間（HOVER_COOLDOWN_AFTER_BURST）で hovering が
     * 立たないので、HOVER_WATER_MIST_BURST_FRAMES のあいだは別に数える（2026-10-11 実機の指摘）。雪は「床の slide」で面を判定したが、水面には onTerrain が
     * 立たない（水は衝突しない）ので、面の種類は env.kind、距離は
     * waterClearance で見る。すでに水に触れていれば null が返るので、
     * その場合はしぶき(spawnSplash)に任せて何もしない。
     */
    _kickHoverWaterMist() {
        // 早く抜ける条件（画面外など）より先に数える（水の面でなくても、画面外でも、飛び立った直後の時間は過ぎていく）
        const bursting = this._burstMistFrames > 0;
        if (bursting) this._burstMistFrames--;
        if (!this.hovering && !bursting) return;
        if (this.onGround || this.onTerrain) { this._burstMistFrames = 0; return; }
        if (!this.game.spawnWaterMist) return;
        if (!this.game.env || this.game.env.kind !== 'water') return;
        if (this._hoverMistOffScreen()) return;
        const clearance = waterClearance(this, this.game, HOVER_WATER_MIST_MAX_ALT);
        if (clearance === null || clearance < HOVER_WATER_MIST_MIN_ALT) return;
        this._hoverWaterMistTimer = (this._hoverWaterMistTimer || 0) + 1;
        if (this._hoverWaterMistTimer % HOVER_WATER_MIST_INTERVAL !== 0) return;
        const fx = this.x + this.width / 2;
        const fy = this.y + this.height + clearance;
        const count = hoverWaterMistCount(clearance);
        const closeness = hoverWaterMistCloseness(clearance);
        this.game.spawnWaterMist(fx, fy, count, closeness);
    },

    /**
     * 水中でホバーしているあいだ、炎の先から泡が舞う（2026-10-11 ユーザー要望）。水の中かどうかは
     * spawnBubbles が粒ごとに見るので、ここではホバーしているかと間引きだけ。泡は噴流に押されて
     * いったん下へ向かい、浮力で昇りに転じる（BUBBLE_BURSTS.jet）。
     * kind が 'burst' なら飛び立ち（自機のバーストジャンプ、敵の movement.js の _jump）の一吹きで、
     * ホバーも間引きも見ずに1回撒く。泡は描画側の上限 WATER_BUBBLE_SPAWNED_MAX を自機と敵で分け合う
     * @param {'jet'|'burst'} [kind]
     */
    _emitJetBubbles(kind = 'jet') {
        if (!this.game.spawnBubbles) return;
        if (kind === 'jet') {
            if (!this.hovering) return;
            this._jetBubbleTimer = (this._jetBubbleTimer || 0) + 1;
            if (this._jetBubbleTimer % HOVER_JET_BUBBLE_INTERVAL !== 0) return;
        }
        if (this._hoverMistOffScreen()) return;
        const n = this._hoverNozzle();
        this.game.spawnBubbles(n.x, n.y + JET_BUBBLE_DROP, kind);
    },
};
