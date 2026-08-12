// ============================================
// thrusterFlame - ホバー噴射の炎を描く
// ============================================
//
// 自機（Player）と敵アタッカー（EnemyAttacker）が共有する。置き換え前は
// 「1〜4px の四角を毎フレーム3個ランダムに置く」7行が両方にほぼ同じ形で
// 二重化していた。形を足すと二重化が悪化するので、先に1本にまとめてある。
//
// 炎はノズル中心に左右対称に置くので、自機のワールド座標でも、敵の
// scale(-1, 1) 済みローカル座標でも、呼び出し側で向きを場合分けせずに使える。
//
// 1px 高の段を積んで台形にしているのは、パスで塗るより既存のドット絵の
// 質感に合うため（段ごとの幅をテストで検証できるという利点もある）。

import {
    THRUSTER_FLAME_WIDTH, THRUSTER_FLAME_LEN_MIN, THRUSTER_FLAME_LEN_MAX,
    THRUSTER_FLAME_CORE_RATIO, THRUSTER_FLAME_CORE_WHITE, THRUSTER_FLAME_FLICKER,
    THRUSTER_FLAME_ALPHA, THRUSTER_FLAME_CORE_ALPHA,
    THRUSTER_FLAME_GAP, THRUSTER_FLAME_SWAY,
    ATTACKER_CLIMB_THRUST_MIN, ATTACKER_CLIMB_THRUST_MAX, ATTACKER_FLAME_POWER_MIN,
} from '../utils/Constants.js';
import { lerpColor } from '../utils/color.js';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/**
 * 幅 topW から 1 へ絞りながら、1px 高の段を length 段ぶん積む。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx ノズルの中心 x
 * @param {number} topY 根元の y
 * @param {number} topW 根元の幅
 * @param {number} length 段数（= 炎の長さ px）
 * @param {number} swayPx 先端での横のずれ px。根元は 0 で、先端へ比例して寄る
 */
function _drawTaper(ctx, cx, topY, topW, length, swayPx) {
    for (let i = 0; i < length; i++) {
        const t = length > 1 ? i / (length - 1) : 1; // 0=根元, 1=先端
        const w = Math.max(1, Math.round(topW - (topW - 1) * t));
        // 根元を動かさないのが肝。根元ごと振ると炎がノズルから外れて見える
        const x = cx + swayPx * t;
        ctx.fillRect(Math.round(x - w / 2), topY + i, w, 1);
    }
}

/**
 * ノズルから下へ伸びる炎を1つ描く。外炎（噴射色）の中に白寄りの芯を重ねる。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} nozzleX ノズルの中心 x
 * @param {number} nozzleY ノズルの下端 y（炎の根元はここから GAP ぶん下）
 * @param {{color: string, power: number, flicker?: number, sway?: number}} opts
 *   color   外炎の色（#rrggbb）
 *   power   0〜1。1 で LEN_MAX、0 で LEN_MIN
 *   flicker 0〜1。先端の伸び縮み。既定は Math.random()（テストは固定値を渡す）
 *   sway    0〜1。先端の左右の振れ。0.5 で振れなし。既定は Math.random()
 */
export function drawThrusterFlame(ctx, nozzleX, nozzleY,
                                  { color, power, flicker = Math.random(), sway = Math.random() }) {
    const p = clamp01(power);
    const base = THRUSTER_FLAME_LEN_MIN + (THRUSTER_FLAME_LEN_MAX - THRUSTER_FLAME_LEN_MIN) * p;
    // flicker / sway とも 0〜1 を -1〜+1 に写して振れ幅を掛ける
    const swing = 1 + (clamp01(flicker) * 2 - 1) * THRUSTER_FLAME_FLICKER;
    const swayPx = (clamp01(sway) * 2 - 1) * THRUSTER_FLAME_SWAY;
    const outerLen = Math.max(1, Math.round(base * swing));
    const coreLen = Math.max(1, Math.round(outerLen * THRUSTER_FLAME_CORE_RATIO));

    const cx = Math.round(nozzleX);
    // 機体にめり込んで見えないよう、ノズル下端から GAP ぶん空けて根元を置く
    const top = Math.round(nozzleY) + THRUSTER_FLAME_GAP;

    ctx.fillStyle = color;
    ctx.globalAlpha = THRUSTER_FLAME_ALPHA;
    _drawTaper(ctx, cx, top, THRUSTER_FLAME_WIDTH, outerLen, swayPx);

    // 芯の振れは長さの比で割り戻す。_drawTaper の t は「その炎自身の先端まで」の比なので、
    // 同じ swayPx を渡すと短い芯のほうが急に傾き、途中で外炎からはみ出す
    ctx.fillStyle = lerpColor(color, '#FFFFFF', THRUSTER_FLAME_CORE_WHITE);
    ctx.globalAlpha = THRUSTER_FLAME_CORE_ALPHA;
    _drawTaper(ctx, cx, top, THRUSTER_FLAME_WIDTH - 2, coreLen, swayPx * (coreLen / outerLen));

    ctx.globalAlpha = 1.0;
}

/**
 * 敵アタッカーの climbThrust（0.45〜0.75）を炎の power（0.6〜1.0）へ写す。
 * 0〜1 に正規化すると heavy（0.45）の炎がほぼ消えるので下限を上げてある。
 * @param {number} climbThrust
 * @returns {number} 0.6〜1.0
 */
export function attackerFlamePower(climbThrust) {
    const span = ATTACKER_CLIMB_THRUST_MAX - ATTACKER_CLIMB_THRUST_MIN;
    const t = clamp01((climbThrust - ATTACKER_CLIMB_THRUST_MIN) / span);
    return ATTACKER_FLAME_POWER_MIN + (1 - ATTACKER_FLAME_POWER_MIN) * t;
}
