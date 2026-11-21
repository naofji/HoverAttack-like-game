// ============================================
// EnemyAttacker - ローラーダッシュ（rival）
// ============================================
//
// 近づかれたら、自機の方を向いたまま後ろへ高速で滑って距離を取る（撃ちながら）。
// 設計: docs/superpowers/specs/2026-11-22-rival-roller-dash-design.md
//
// 状態は rollerPhase（null | 'accel' | 'glide' | 'stop'）と、その相の経過
// rollerTimer、逃げる向き rollerDir、滑る長さ rollerGlideFrames、クールダウン
// rollerCooldown。滑走中は _updateMovement の先頭で移動を乗っ取るので、ジグザグ・
// ジャンプ・回避（_chaseTarget の中身）はまるごと止まる。射撃（_handleShooting）は
// 移動と別に回るので、そのまま撃つ。
//
// 外から終わらせる道は3つあり、どれも _endRollerDash に集まる:
//   - 壁（attacker/collision.js の _reactToWall。跳び越えにかからない）
//   - 反動（EnemyAttacker.update の反動分岐。反動中は _updateMovement が来ないので、
//     放っておくと反動明けに続きを滑ってしまう）
//   - 足が離れた・追跡をやめた（ここ、_updateRollerDash の頭）
// 途中で終わったときは急停止の音・火花を出さない。壁や落下で止まったのに
// 「キィッ」と鳴るのは不自然なので、演出は滑り切って stop 相に入ったときだけ。
//
// **EnemyAttacker.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` はインスタンスを指す（理由は attacker/legs.js の冒頭）。

import {
    TILE_SIZE,
    ROLLER_SPEED, ROLLER_ACCEL_FRAMES, ROLLER_GLIDE_FRAMES_MIN, ROLLER_GLIDE_FRAMES_MAX,
    ROLLER_STOP_FRAMES, ROLLER_COOLDOWN,
} from '../../utils/Constants.js';
import { isRecoiling } from '../../utils/Recoil.js';

export const AttackerRollerDash = {
    /** 滑走中か。 */
    isRollerDashing() {
        return this.rollerPhase != null;
    },

    /**
     * 近づかれたときに呼ぶ（zigzag_chase の「近すぎる」分岐）。条件を満たせば
     * 滑走を始め、このフレームの vx（加速の1フレーム目）も決めて true。
     * @param {number} dx 相手の中心 − 自分の中心（X）
     */
    _tryStartRollerDash(dx) {
        if (!this.config.rollerDash) return false;
        if (this.isRollerDashing() || this.rollerCooldown > 0) return false;
        if (!this.onGround || this.aiState !== 'chase') return false;
        if (this.evadeTimer > 0 || isRecoiling(this)) return false;

        const dir = dx > 0 ? -1 : 1;
        // 背後（逃げる側）の1タイル先に床が無ければ始めない。崖へ飛び出して落ちるのは
        // 「距離を取る」ではなく事故に見える。確かめるのは始めるときだけで、途中で床が
        // 尽きたら「足が離れた」で終わる
        const map = this.game.map;
        const probeX = this.x + this.width / 2 + dir * TILE_SIZE;
        const probeY = this.y + this.height + 4;
        if (map && !map.isSolidAtPixel(probeX, probeY)) return false;

        this.rollerDir = dir;
        this.rollerPhase = 'accel';
        this.rollerTimer = 0;
        const span = ROLLER_GLIDE_FRAMES_MAX - ROLLER_GLIDE_FRAMES_MIN + 1;
        this.rollerGlideFrames = ROLLER_GLIDE_FRAMES_MIN
            + Math.min(span - 1, Math.floor(Math.random() * span));
        this._stepRoller();
        return true;
    },

    /**
     * 滑走中なら1フレーム進めて vx を決め true。滑走中でなければクールダウンを
     * 進めて false（呼ぶ側はふだんの移動へ進む）。
     */
    _updateRollerDash() {
        if (!this.isRollerDashing()) {
            if (this.rollerCooldown > 0) this.rollerCooldown--;
            return false;
        }
        // 足が離れたら、vx はそのままにして空中の処理へ渡す（段差から落ちた・吹き飛ばされた）
        if (!this.onGround || this.aiState !== 'chase') {
            this._endRollerDash();
            return false;
        }
        this._stepRoller();
        return true;
    },

    /** 相を1フレーム進め、その相の速さで vx を決める。滑り切ったら締める。 */
    _stepRoller() {
        this.rollerTimer++;
        if (this.rollerPhase === 'accel' && this.rollerTimer > ROLLER_ACCEL_FRAMES) {
            this.rollerPhase = 'glide';
            this.rollerTimer = 1;
        }
        if (this.rollerPhase === 'glide' && this.rollerTimer > this.rollerGlideFrames) {
            this.rollerPhase = 'stop';
            this.rollerTimer = 1;
            this._onRollerStop();
        }
        this.vx = this.rollerDir * this._rollerSpeedNow();
        if (this.rollerPhase === 'stop' && this.rollerTimer >= ROLLER_STOP_FRAMES) {
            this._endRollerDash();
        }
    },

    /**
     * いまの相の速さ。加速は 0 → ROLLER_SPEED の線形、減速は ROLLER_SPEED → 0 の線形。
     * 一気に乗って一気に止まる形が「車輪で滑る」に見える（歩きの立ち上がりとの違い）。
     */
    _rollerSpeedNow() {
        switch (this.rollerPhase) {
            case 'accel': return ROLLER_SPEED * this.rollerTimer / ROLLER_ACCEL_FRAMES;
            case 'glide': return ROLLER_SPEED;
            case 'stop': return ROLLER_SPEED * (ROLLER_STOP_FRAMES - this.rollerTimer) / ROLLER_STOP_FRAMES;
            default: return 0;
        }
    },

    /** 滑り切って急停止に入った瞬間（火花・音はここから出す）。 */
    _onRollerStop() {},

    /** 滑走を終わらせてクールダウンを掛ける。音・火花は出さない。 */
    _endRollerDash() {
        this.rollerPhase = null;
        this.rollerTimer = 0;
        this.rollerCooldown = ROLLER_COOLDOWN;
    },
};
