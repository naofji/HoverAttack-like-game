// ============================================
// 坂を歩く・坂に当たる機体の共通の手順（自機・敵アタッカーに混ぜる）
// ============================================
//
// 設計: docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md（決定3・7・11）
// 計画: docs/superpowers/plans/2026-10-27-tile-shape-2-bodies.md
//
// **Player.prototype / EnemyAttacker.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` はインスタンス（x, y, width, height, vx, vy, motion, onGround, onTerrain,
// game.map を持つ）。自機とアタッカーは横→縦の同じ手順で地形を解いているので、坂の扱いも
// 同じものを使う（片方だけ直して食い違うのを避ける）。
//
// どの手順も、体の近くに形のあるタイル（満ちでも空でもないタイル）が無ければ何もしない。
// 呼んだ側はそのとき今までのタイル単位の手順を通るので、5面以外の軌跡は変わらない
// （tests/terrain-shape-invariance.test.js）。
//
// 点判定の点を変える機体は `_slopePoints`（entity → 点の配列）を持てば、坂の部品も同じ点で探す。

import {
    SLOPE_CLIMB_MARGIN, SLOPE_DEFLECT, SLOPE_DOWNHILL_ACCEL, ICE_MAX_SLIDE_SPEED, TILE_SIZE,
} from '../utils/Constants.js';
import { liftOutOfFloor, dropOutOfCeiling, floorBelow } from '../utils/slopeMotion.js';

export const SlopeBody = {
    /** 体（と、この先 dx・dy 動く範囲）に形のあるタイルが掛かっているか */
    _touchesShapedTile(dx, dy) {
        const ax = Math.abs(dx) + 1, ay = Math.abs(dy) + 1;
        return this.game.map.hasShapedTileIn(this.x - ax, this.y - ay, this.width + 2 * ax, this.height + 2 * ay);
    },

    /**
     * 横に動いて地形に当たったとき、坂なら斜辺の外へ上下に押し出す。地上なら坂を上り、空中なら
     * 上へ（天井の斜面なら下へ）逸れて、横の速さは保つ。1フレームに動かしてよいのは横の
     * 移動量＋余裕まで。それを超える高さは壁として、呼んだ側の乗り上げ・停止へ回す。
     * @returns {boolean} 坂として解いたか
     */
    _slideAlongSlopeHorizontally() {
        const dx = this.vx * this.motion.speed;
        if (!this._touchesShapedTile(dx, 0)) return false;
        const reach = Math.abs(dx) + SLOPE_CLIMB_MARGIN;
        const lift = liftOutOfFloor(this.game.map, this, reach, this._slopePoints);
        if (lift !== null) { this.y -= lift; return true; }
        const drop = dropOutOfCeiling(this.game.map, this, reach, this._slopePoints);
        if (drop !== null) { this.y += drop; return true; }
        return false;
    },

    /**
     * 落ちて坂に着いたら、タイルの上端ではなく斜辺へ体を合わせる。斜辺に当たった縦の速さの
     * 一部は下り向きの横の速さになる（SLOPE_DEFLECT）。
     * @returns {boolean} 坂として処理したか（偽なら呼んだ側がタイルの上端へスナップする）
     */
    _landOnSlope() {
        const dy = this.vy * this.motion.speed;
        if (!this._touchesShapedTile(0, dy)) return false;
        const lift = liftOutOfFloor(this.game.map, this, Math.abs(dy) + SLOPE_CLIMB_MARGIN, this._slopePoints);
        if (lift === null) return false;
        this.y -= lift;
        const slope = this.game.map.floorSlopeAt(this.x + this.width / 2, this.y + this.height);
        this.vx += -slope * this.vy * SLOPE_DEFLECT;
        this._capSlopeVx();
        return true;
    },

    /**
     * 上昇して天井の斜面に当たったら、斜辺の外へ下ろし、縦の速さの一部を天井の高い側
     * （開いた側）への横の速さにする（決定11「天井の斜面に沿って流される」）。
     * @returns {boolean} 斜面として処理したか
     */
    _hitCeilingSlope() {
        const dy = this.vy * this.motion.speed;
        if (!this._touchesShapedTile(0, dy)) return false;
        const drop = dropOutOfCeiling(this.game.map, this, Math.abs(dy) + SLOPE_CLIMB_MARGIN, this._slopePoints);
        if (drop === null) return false;
        this.y += drop;
        const slope = this.game.map.ceilingSlopeAt(this.x + this.width / 2, this.y - 0.01);
        this.vx += -slope * Math.abs(this.vy) * SLOPE_DEFLECT;
        this._capSlopeVx();
        return true;
    },

    /**
     * 斜辺に当たって足した横の速さを、坂で滑るときの最高速で頭打ちにする。ホバーで天井の斜面に
     * 張り付くと毎フレーム足され、上限が無いと 7px/フレームを超えて弾き飛ばされた（段2の最終レビュー。
     * 速いほど押し出せる距離 |dx|+余裕 も伸びて、細い面取りの先へ入り込みやすくなる）
     */
    _capSlopeVx() {
        this.vx = Math.max(-ICE_MAX_SLIDE_SPEED, Math.min(ICE_MAX_SLIDE_SPEED, this.vx));
    },

    /**
     * 体が岩の中で動けなくなっていたら、真上の最初に岩に当たらない高さ（1タイル以内、1px 刻み）へ
     * 出す。形の規則は岩を増やすこともある（坂の下の段が壊れると坂が面取りに戻る）うえ、点の
     * すき間を細い張り出しが抜けて四角いタイル用のスナップが体を岩に置くこともあり、そのとき
     * 横の当たりで vx = 0 を毎フレーム繰り返して動けなくなった（段4の最終レビュー: 本物の5面で
     * 母艦は 177 回中 16 回、戦車は壊れた横の岩で 94 回中 4 回）。形のあるタイルが近くに無ければ
     * 何もしない（5面以外の軌跡を変えない）。`_collidesWithMap` は機体ごとのものを使う
     * @returns {boolean} 出したか
     */
    _popOutOfRock() {
        if (!this._touchesShapedTile(0, TILE_SIZE) || !this._collidesWithMap()) return false;
        const y0 = this.y;
        for (let k = 1; k <= TILE_SIZE; k++) {
            this.y = y0 - k;
            if (!this._collidesWithMap()) return true;
        }
        this.y = y0;
        return false;
    },

    /**
     * 形のあるタイルの近くで、四角いタイル用のスナップ（タイルの境目へ寄せる）が体を岩の中へ
     * 置いてしまったら、動く前の位置へ戻す。坂として解けなかった当たり（面取りの細い先が点の
     * すき間を抜けて当たった、など）の戻り先が四角い地形の前提のままだと、頭が当たったのに
     * 足のタイルの上端へ寄せて板を突き抜けた（段2の最終レビュー。戦車の Safety Fallback と同じ考え）
     * @param {'x'|'y'} axis 戻す軸
     * @param {number} before 動く前の値
     */
    _undoSnapIntoRock(axis, before) {
        if (!this._touchesShapedTile(TILE_SIZE, TILE_SIZE)) return;
        if (this._collidesWithMap()) this[axis] = before;
    },

    /**
     * 坂を下るとき: 前のフレームに地形に立っていて、今フレームに横へ動いた分だけ床が下がって
     * いたら、落下を待たずに斜辺へ下ろす（坂のあいだ空中に出ない）。下ろしてよいのは横の
     * 移動量＋余裕までなので、面取りの先の垂直な落差（崖）には届かず、そこでは落ちる。
     * @param {boolean} prevOnTerrain 前フレームに地形に接地していたか
     * @returns {boolean} 下ろして接地させたか
     */
    _glueDownSlope(prevOnTerrain) {
        if (this.onGround || this.vy < 0 || !prevOnTerrain) return false;
        // 届く距離は、このフレームに実際に横へ動いた量から取る。坂の上で壁に押し付けると、壁への
        // 吸着が x を戻して vx を 0 にするので、vx から取ると足元の坂の下がりに届かず、4フレーム
        // ごとに落ちては着地した（段2の最終レビュー。_frameStartX は _moveAndCollide の冒頭で記録）
        const moved = this._frameStartX === undefined ? Math.abs(this.vx * this.motion.speed) : Math.abs(this.x - this._frameStartX);
        const reach = moved + SLOPE_CLIMB_MARGIN;
        if (!this._touchesShapedTile(reach, reach)) return false;
        // 上から 1px 余分に探す: 重力で床へ 1px 未満沈んだ足の位置をそのまま「床」と読むと、
        // 坂の下の平らな床で 0.3px ずつ沈んでいった（実測）
        const floor = floorBelow(this.game.map, this, reach, this._slopePoints, 1);
        if (floor === null) return false;
        const prevY = this.y;
        this.y = floor - this.height;
        if (this._collidesWithMap()) { this.y = prevY; return false; }
        this.onGround = true;
        this.onTerrain = true;
        this.vy = 0;
        return true;
    },

    /**
     * 足元の 1px 探査で接地したとき、坂の上ならタイルの上端ではなく斜辺へ合わせる
     * （重力で 1px 未満沈んだ足も戻す。戻さないと 0〜0.9px 沈んでは着地し直すのを繰り返した）。
     * @returns {boolean} 坂として合わせたか（偽なら呼んだ側がタイルの上端へスナップする）
     */
    _settleOnSlope() {
        if (!this._touchesShapedTile(0, 1)) return false;
        const floor = floorBelow(this.game.map, this, 1, this._slopePoints, 1);
        if (floor !== null) {
            // 足の列の床へ合わせた先で、体の別の所（足の列のあいだの面取りの先など）が岩に入るなら合わせない
            const prevY = this.y;
            this.y = floor - this.height;
            if (this._collidesWithMap()) this.y = prevY;
        }
        return true;
    },

    /**
     * 坂の上の加速。下りは加速、上りは最高速が落ちる（押し続ければ上れ、離すと滑り落ちる）。
     * 坂の向きは足の中心の列の床の形から読む。床の縁や浮いた板の先の 8px の面取りも坂なので、
     * 中心がそこへ出れば同じく滑り落ちる。onGround は前フレームの結果。
     * @param {-1|0|1} held 進みたい向き（自機は入力、アタッカーは AI が出した vx の向き）
     * @param {number} uphillSpeed 上りに向いているときの横の速さ（向きは held）
     */
    _applySlope(held, uphillSpeed) {
        this.slopeDir = 0;
        if (this.motion.slide === 0 || !this.onGround) return;
        // 足の中心の列の床を探してから、その面の傾きを読む。坂では中心の列の床は一番高い足の
        // 床より低いので、(中心, 足の下端) をそのまま読むと上の空のタイルを掴んで途切れる（実測）
        const map = this.game.map;
        const cx = this.x + this.width / 2, bottom = this.y + this.height;
        const floorY = map.terrainTopY(cx, bottom - 1, bottom + TILE_SIZE / 2);
        if (floorY === null) return;
        this.slopeDir = map.floorSlopeAt(cx, floorY);
        if (this.slopeDir === 0) return;
        if (held === this.slopeDir) this.vx = held * uphillSpeed;
        this.vx += -this.slopeDir * SLOPE_DOWNHILL_ACCEL;
        this.vx = Math.max(-ICE_MAX_SLIDE_SPEED, Math.min(ICE_MAX_SLIDE_SPEED, this.vx));
    },
};
