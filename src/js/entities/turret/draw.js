// ============================================
// EnemyTurret - 描画（台座・ピボット・砲身・ビーム砲のフィンと放射器・パイロットランプと充填の輪）
// ============================================
//
// 砲台の見た目。照準・射撃・充填の状態は EnemyTurret.js が持っていて、ここは読むだけ。
// 618行のうち約170行が絵だったので分けた（2026-11-25、中身は動かしただけ。敵基地の base/draw.js と
// 同じ切り方）。型ごとの色・フィン・放射器は EnemyTurret.js の TURRET_TYPES の1行（spec）から引く。
//
// **EnemyTurret.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、
// `this` はインスタンスを指す（理由は attacker/legs.js の冒頭）。

import {
    REFLECT_BEAM_MUZZLE_FLASH_FRAMES, REFLECT_BEAM_MUZZLE_FLASH_RADIUS, COLOR_REFLECT_BEAM_CORE,
    COLOR_BEAM_CANNON_LAMP_BACK, BEAM_LAMP_RING_OUTER, BEAM_LAMP_RING_INNER,
} from '../../utils/Constants.js';
import { lerpColor } from '../../utils/color.js';

// 砲身の見た目。描画専用のパラメータなので Constants ではなくここに置く
// （entities/attacker/legs.js の LEG_STYLES と同じ扱い）。砲口の位置（EnemyTurret._muzzleOffset）も同じ砲身の
// 寸法から出すので、本体はここから import する
export const BARREL_BASE = 4;    // 砲身が始まる位置（中心から）
export const BARREL_LENGTH = 14; // 砲身の長さ

// beam 型のパイロットランプ（充填の進み具合を示す脈動）。描画専用のパラメータ
// なので Constants ではなくここに置く。「外周から中心にかけて脈打つ」を、
// 同じ半径から縮んでいく複数の輪を位相をずらして重ねる形で表現する
// （1本が中心に着いたら次の輪が外周に現れる。(t + k/本数) % 1 が肝）
const BEAM_LAMP_RINGS = 3;
const BEAM_LAMP_CYCLE_SLOW = 50;   // 充填直後(進み0)の脈の周期。ゆったり
const BEAM_LAMP_CYCLE_FAST = 14;   // 充填しきった(進み1)ときの周期。速くして「そろそろ撃つ」を伝える
const BEAM_LAMP_RING_LINE_WIDTH = 1.75; // 輪1本1本が独立して見える太さ(1.5〜2の指定内)
// 中心の塗りつぶし本体。輪(stroke)と別に残す。2→3（「中心のランプの大きさは
// もう少し大きくても大丈夫」）。座(BEAM_LAMP_BACK_RADIUS)より必ず小さいこと。
// 座との差が「ランプを受けるくぼみの縁」として見えるので、差は2px確保する
const BEAM_LAMP_CORE_RADIUS = 3;
// 暗い座の半径。ランプ本体より一回り大きい「受け皿」で、ピボットの円(半径8)の
// 上に敷かれる。**ランプ本体との差がくぼみの縁として見える**ので、差は2px 保つ。
//
// 7→4→5 と動かした。7 は「輪(最大半径6)を覆う」大きさとして選んだ値だが、輪を
// 砲台の外へ出した時点で基準はランプ本体に変わっており、値だけが取り残されて
// いた。ピボットの面積の 77% を黒く覆っていて、明るい面は外周1pxのリングだけ
// ＝実機で「PIVOT に黒いマスクを掛けていないか」と指摘された（ピボットを明るく
// するほど悪化する組み合わせで、ほぼ白にしたことであらわになった）。
// 現在の 5 はランプ本体(3)＋縁2px。覆うのは面積の39%で明るい面は広く残る。
// **ここを上げるときは「ピボットを塗り潰していないか」を必ず見ること**
// （tests/beam-cannon.test.js が面積比で縛っている）
const BEAM_LAMP_BACK_RADIUS = 5;
// 輪の濃さ（globalAlpha）の範囲。軌道の両端(外周に現れた瞬間・中心の縁に着いた瞬間)で
// 薄く、中間で濃くする。0まで下げると「消えている」瞬間ができて明滅に戻ってしまうため、
// 下限は0にしない
const BEAM_LAMP_RING_ALPHA_MIN = 0.1;
// 0.85→0.6。輪を砲台の下に回して形は隠れなくなったが、機体の外へはみ出す弧が
// 濃いままだと今度は地形の上で目立ちすぎる。脈が読める下限として 0.6 を選んだ
const BEAM_LAMP_RING_ALPHA_MAX = 0.6;

export const TurretDraw = {
    /**
     * beam 型のパイロットランプ。ユーザー指定の「打ち終わると暗紫、充填が高まると
     * 紫に輝く、外周から中心にかけて脈打つ」の実装。
     *
     * - 色: 充填の進み具合（`_beamChargeProgress()`）で暗紫→明るい紫を
     *   `lerpColor()` で補間する（自前で色を混ぜない。既存の共通機構を使う）
     * - 座: ランプ本体を描く**前**に、COLOR_BEAM_CANNON_LAMP_BACK（ほぼ黒の紫）の
     *   円を敷く。COLOR_BEAM_CANNON_BASE/_PIVOT が明るい灰色のため、紫を直接その
     *   上に乗せてもコントラストが出ない（実機で「機体の白と重なってインパクトが
     *   弱め」と指摘された）。半径はランプ本体より一回り大きい
     *   BEAM_LAMP_BACK_RADIUS(4)。**ピボットを覆い隠さない大きさであること**が
     *   条件で、7 の頃はピボットの面積の77%を黒く塗り潰していた（定数側の
     *   コメント参照）
     *
     * **輪はこのメソッドでは描かない。** 砲台の実体より先に描く必要があるので
     * `_drawChargeRings()` に分けてあり、draw() の先頭から呼んでいる。
     * - 本体: 中心の小さな塗りつぶし円（BEAM_LAMP_CORE_RADIUS）。輪と違って
     *   縮まない、常にそこにある「ランプそのもの」
     * - 脈: 輪を BEAM_LAMP_RINGS 本、位相をずらして重ねる。「経過フレーム数」は
     *   専用のカウンタを持たず `chargeTotal - cooldownTimer` から出す（充填の
     *   進みそのものが時間の代わりになる。テストからも cooldownTimer を直接
     *   動かすだけで検証できる）。以前は半透明の円を塗りつぶし(fill)で重ねて
     *   いたが、それだと輪ではなくただの明滅に見える（実機フィードバック）。
     *   ctx.stroke() の輪郭線に変え、「本体＋その外側を内向きに縮んでいく輪」
     *   という見え方にした
     * - 輪の軌道: 当初はランプの内側（半径6px）だけで動かしていたが、それだと
     *   動く距離が短すぎて「波が中心へ寄る」と読めず、ただの明滅にしか見えない
     *   と実機で指摘された。砲台の胴体（ピボット半径8、機体24×24）にこれ以上の
     *   余地が無いため、**輪を砲台の外側へ出し**、BEAM_LAMP_RING_OUTER から
     *   BEAM_LAMP_RING_INNER まで収束させることで距離を稼いだ。
     *   その代償として輪が形の上に重なり「カタチが見えにくい」と再度指摘された
     *   ので、**輪を砲台より先に描く**ことで解いた（`_drawChargeRings()`）。
     *   軌道の両端（外周に現れた瞬間・中心の縁に着いた瞬間）で濃さを
     *   BEAM_LAMP_RING_ALPHA_MIN まで落とし、中間で BEAM_LAMP_RING_ALPHA_MAX まで
     *   上げる。輪が唐突に湧いて消えるように見えないための、Windows の
     *   ファイル転送インジケーターのような「なだらかな濃淡」を狙った
     * - 充填が進むほど周期を BEAM_LAMP_CYCLE_SLOW→FAST で短くし、脈を速くする。
     *   「そろそろ撃つ」が読めるのが狙い（冷却時間を無くした代わりの手がかり）
     */
    _drawChargeLamp(ctx) {
        const color = this._chargeLampColor();

        // 座（ランプ本体より先に描く。後だと座が上に乗って隠してしまう）
        ctx.fillStyle = COLOR_BEAM_CANNON_LAMP_BACK;
        ctx.beginPath();
        ctx.arc(0, 0, BEAM_LAMP_BACK_RADIUS, 0, Math.PI * 2);
        ctx.fill();

        // ランプ本体（塗りつぶしの点。輪と違って縮まない）
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(0, 0, BEAM_LAMP_CORE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
    },

    /** 充填の進み具合を表すランプの色（暗紫→明るい紫）。輪と本体で同じ色を使う。 */
    _chargeLampColor() {
        const { dim, bright } = this.spec.lampColors;
        return lerpColor(dim, bright, this._beamChargeProgress());
    },

    /**
     * 脈動の輪だけを描く。**砲台の実体を1つも描かないうちに呼ぶこと。**
     *
     * 輪を最後に描いていた頃は、輪が台座・砲身・フィン・ピボットの上に重なって
     * 「砲台のカタチが見えにくい」と実機で指摘された（3回目のフィードバック）。
     * 半径を詰めるだけでは輪が形を横切ること自体は残るので、**描画順で解いた**。
     * 先に描けば輪は機体のシルエットに隠れ、外へはみ出した弧だけが見える＝
     * 「外から機体に吸い込まれていく光」になり、形は原理的に隠れない。
     *
     * 同心円なので ctx.rotate() の前に描いても見た目は変わらない。
     */
    _drawChargeRings(ctx) {
        const color = this._chargeLampColor();
        const progress = this._beamChargeProgress();
        const cycle = BEAM_LAMP_CYCLE_SLOW + (BEAM_LAMP_CYCLE_FAST - BEAM_LAMP_CYCLE_SLOW) * progress;
        const elapsed = Math.max(0, (this.chargeTotal || 1) - this.cooldownTimer);

        // 脈動の輪（輪郭線）。BEAM_LAMP_RING_OUTER から BEAM_LAMP_RING_INNER まで
        // 収束させる。ランプの中(半径6px)では距離が短すぎて明滅にしか見えなかった
        // ため、機体の縁の外から始める（クラス冒頭のコメント参照）
        ctx.strokeStyle = color;
        ctx.lineWidth = BEAM_LAMP_RING_LINE_WIDTH;
        const ringSpan = BEAM_LAMP_RING_OUTER - BEAM_LAMP_RING_INNER;
        for (let k = 0; k < BEAM_LAMP_RINGS; k++) {
            // phase: 0=外周に現れた瞬間 → 1=中心の縁に着いた瞬間（一周したら次の輪が外周に現れる）
            const phase = ((elapsed / cycle) + k / BEAM_LAMP_RINGS) % 1;
            const r = BEAM_LAMP_RING_INNER + ringSpan * (1 - phase);
            // 軌道の両端(phase=0,1)で薄く、中間(phase=0.5)で濃くする。湧いて
            // 消えるのが唐突に見えないための「なだらかな濃淡」（実機フィードバック）。
            // sin(pi*phase) は両端で0・中央で1になるので、そのままカーブとして使える
            const fade = Math.sin(Math.PI * phase);
            ctx.globalAlpha = BEAM_LAMP_RING_ALPHA_MIN + (BEAM_LAMP_RING_ALPHA_MAX - BEAM_LAMP_RING_ALPHA_MIN) * fade;
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    },

    draw(ctx) {
        if (!this.alive) return;

        const drawX = Math.round(this.x);
        const drawY = Math.round(this.y);
        const cx = drawX + this.width / 2;
        const cy = drawY + this.height / 2;

        ctx.save();
        ctx.translate(cx, cy);

        const colors = this.spec.colors;

        // 充填の脈動の輪は**砲台の実体より先に**描く。後に描くと形の上に重なって
        // 「カタチが見えにくい」（実機フィードバック3回目）。_drawChargeRings() の
        // コメント参照
        if (this.spec.lampColors) {
            this._drawChargeRings(ctx);
        }

        // --- Draw Base ---
        ctx.fillStyle = colors.base;
        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 2;

        if (this.isCeilingMounted) {
            // Mounted to ceiling (top edge)
            ctx.fillRect(-10, -12, 20, 8);
            ctx.strokeRect(-10, -12, 20, 8);
            // Arm connecting base to pivot
            ctx.fillRect(-4, -4, 8, 4);
        } else {
            // Mounted to floor (bottom edge)
            ctx.fillRect(-10, 4, 20, 8);
            ctx.strokeRect(-10, 4, 20, 8);
            // Arm connecting base to pivot
            ctx.fillRect(-4, 0, 8, 4);
        }

        // --- Draw Rotating Turret Head ---
        ctx.rotate(this.currentAngle);

        // Barrel（厚みは型ごと。gun は従来どおり ±2）
        ctx.fillStyle = colors.barrel;
        const barrelLength = BARREL_LENGTH - this.recoil;
        const barrelHalf = this.spec.barrelHalfHeight ?? 2;
        ctx.fillRect(BARREL_BASE, -barrelHalf, barrelLength, barrelHalf * 2);
        ctx.strokeRect(BARREL_BASE, -barrelHalf, barrelLength, barrelHalf * 2);

        // 冷却フィン（beam 型のみ）。**塗りのある板**を砲身にまたがらせて、
        // 輪郭に凹凸を出す。色だけで区別していた既存タレットとの差別化のため。
        // 線ではなく板にしたのは、線だと砲身から浮いて「櫛」に見えたため
        const fins = this.spec.fins;
        if (fins) {
            ctx.fillStyle = fins.color;
            ctx.lineWidth = 1;
            for (let i = 0; i < fins.count; i++) {
                // 砲身を count+1 等分した内側の点に置く。両端（付け根と砲口）を
                // 空けることで、エミッタとピボットのどちらにも被らない
                const fx = BARREL_BASE + barrelLength * (i + 1) / (fins.count + 1);
                ctx.fillRect(fx - fins.width / 2, -fins.halfHeight, fins.width, fins.halfHeight * 2);
                ctx.strokeRect(fx - fins.width / 2, -fins.halfHeight, fins.width, fins.halfHeight * 2);
            }

            // フィン描画で lineWidth を上書きしたままにすると、直後のピボットの
            // stroke() が細い線で描かれ、draw() 冒頭で設定した本来の輪郭
            // （#222222・2px）が薄い縁に化ける。beam 型だけ砲台の輪郭が弱く見える
            // 退行になっていたため、ここで明示的に戻す
            ctx.lineWidth = 2;
        }

        // 砲口の放射器（beam 型のみ）。砲身の先に一回り大きい塊を付けて、
        // 「ここからビームが出る」を形で示す。放射光もこの位置に出る
        const emitter = this.spec.emitter;
        if (emitter) {
            const ex = BARREL_BASE + barrelLength - emitter.length;
            ctx.fillStyle = colors.pivot;
            ctx.fillRect(ex, -emitter.halfHeight, emitter.length, emitter.halfHeight * 2);
            ctx.strokeRect(ex, -emitter.halfHeight, emitter.length, emitter.halfHeight * 2);
        }

        // Main pivot body (Circle)
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fillStyle = colors.pivot;
        ctx.fill();
        ctx.stroke();

        // Warning light。beam 型は充填の進み具合を見せるランプに差し替わる
        // （lampColors の有無で分岐。fins と同じ「型ごとの違いは表の1行」の扱い）
        if (this.spec.lampColors) {
            this._drawChargeLamp(ctx);
        } else {
            ctx.fillStyle = (this.state === 'bursting') ? '#FF2222' : '#FFCC00';
            ctx.beginPath();
            ctx.arc(0, 0, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // 発射直後の砲口の放射光。撃ったことを伝えるための演出で、遅いビームの
        // 出どころを見失わないようにする役目。**予告ではない**
        if (this.muzzleFlash > 0) {
            const t = this.muzzleFlash / REFLECT_BEAM_MUZZLE_FLASH_FRAMES;
            const r = REFLECT_BEAM_MUZZLE_FLASH_RADIUS * t;
            // 発射時点で固定した位置を使う（_muzzleOffset() だと反動で縮んだ
            // 砲身に毎フレーム追従してしまい、ビームの発射位置から光が離れる）
            const gx = this.muzzleFlashOffset;
            const grad = ctx.createRadialGradient(gx, 0, 0, gx, 0, Math.max(0.1, r));
            grad.addColorStop(0, COLOR_REFLECT_BEAM_CORE);
            // 外周は透明。不透明な暗紫のままだと「暗い円板の縁」に見えてしまう。
            // グラデーションのストップに rgba を直接書くのは BaseLaser に前例がある
            grad.addColorStop(1, 'rgba(59, 15, 107, 0)');
            ctx.globalAlpha = t;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(gx, 0, Math.max(0.1, r), 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    },
};
