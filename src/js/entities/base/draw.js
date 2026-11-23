// ============================================
// EnemyBase - 描画（構造物・シールド・周回シールドの羽根・コア・救援パルス・巡航ミサイルの予告線）
// ============================================
//
// 敵基地の見た目。HP・シールド・武器の状態は EnemyBase.js が持っていて、ここは読むだけ。
// 1108行のうち約330行が絵で、武器のロジックと混ざって見通しが悪かったので分けた
// （2026-11-24、中身は動かしただけ。自機の player/draw.js と同じ切り方）。
//
// **EnemyBase.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、
// `this` はインスタンスを指す（理由は attacker/legs.js の冒頭）。
// _orbitMaxHalfHeight / _orbitCenterY は羽根の幾何で、床に収まるかのテスト
// （base-sits-on-floor）も読む。

import {
    ENEMY_BASE_DRAW_OVERHANG,
    BASE_ORBIT_SHIELD_DEPLOY, BASE_ORBIT_SHIELD_GUARD_HALF, BASE_ORBIT_SHIELD_HEIGHT,
} from '../../utils/Constants.js';
import { panelOffsetX, panelDepth, isGuardAngle } from '../../utils/orbitShield.js';
import { lerpColor, withAlpha } from '../../utils/color.js';

// 周回シールドの羽根の見た目。描画専用のパラメータなので Constants ではなく
// ここに置いている（EnemyAttacker の LEG_STYLES と同じ扱い）。
const ORBIT_PANEL = {
    width: 13,          // 真正面を向いたときの見かけの幅 px
    // 真横（＝ガード成立）を向いたときに残る厚み。0 にすると一番肝心な瞬間に
    // 羽根が消えてしまうので、線として必ず残す
    edge: 3,
    dark: '#2B3440',    // 奥に回ったときの色
    light: '#F0F6FF',   // 手前に来たときの色
    // 手前／奥での拡大率。0.06 では平行投影と見分けがつかず「回っている板」に
    // 見えなかったので 0.30 まで上げた。手前で 1.3倍・奥で 0.7倍になり、
    // 幅にも高さにも掛ける（＝相似で大きくなる）
    perspective: 0.30,
    // 軌道リング（楕円）の見下ろし量。奥行きは羽根の大きさで見せ、
    // リングは「どこを回っているか」だけを示す。
    // 羽根自体はこの分ずらさない — 上下させると板の上端がふらついて落ち着かず、
    // 中心の高さを固定した方が回転が素直に読めた（ユーザー確認 2026-08-23）
    tilt: 7,
    orbitAlpha: 0.22,   // 軌道リングを薄く残す濃さ。羽根の行き先が読める
    barrierAlpha: 0.35, // ガード中にコアとの間へ引くバリア線の濃さ
};

export const BaseDraw = {
    draw(ctx) {
        if (!this.alive) return;
        this._drawWarningPath(ctx);
        this._drawEmergencyPulse(ctx);

        const drawX = Math.round(this.x);
        const drawY = Math.round(this.y);
        ctx.save();
        ctx.translate(drawX, drawY);

        this._drawStructure(ctx);
        this._drawShields(ctx);
        // 奥に回っている羽根はコアより先に、手前の羽根はコアより後に描く。
        // 立体に見えるかどうかはこの順序がほぼ全て
        this._drawOrbitPanels(ctx, true);
        this._drawCore(ctx);
        this._drawOrbitPanels(ctx, false);

        ctx.restore();
    },

    /** Draw the expanding red rescue-pulse ring around the base while the alert is fresh. */
    _drawEmergencyPulse(ctx) {
        if (this.emergencyPulseTimer <= 0) return;

        const cx = this.x + this.width / 2;
        const cy = this.y + this.height / 2;
        const progress = 1 - (this.emergencyPulseTimer / this.emergencyPulseDuration); // 0 -> 1
        const radius = 20 + progress * 100;
        const alpha = 1 - progress;

        ctx.save();
        ctx.strokeStyle = `rgba(255, 40, 40, ${alpha})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    },

    /** Draw the pre-launch cruise-missile warning path. */
    _drawWarningPath(ctx) {
        if (!this.cruiseWarning || !this.preLaunchPath) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 0, 0, 1.0)';
        ctx.setLineDash([10, 5]);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.x + this.width / 2, this.y + this.height / 2);
        for (const pt of this.preLaunchPath) ctx.lineTo(pt.x, pt.y);
        ctx.stroke();
        ctx.restore();
    },

    /** Draw the base frame and structural pillars. */
    _drawStructure(ctx) {
        const coreX = this.width / 2;
        const coreY = this.height / 2;

        // Dark frame
        ctx.fillStyle = '#111111';
        ctx.fillRect(0, 0, this.width, this.height);

        // Structural pillars
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(coreX - 20, 0, 40, coreY - 25);
        ctx.fillRect(coreX - 20, coreY + 25, 40, this.height - (coreY + 25));

        // Pillar shading
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(coreX - 16, 0, 4, coreY - 25);
        ctx.fillRect(coreX - 16, coreY + 25, 4, this.height - (coreY + 25));
        ctx.fillStyle = '#888888';
        ctx.fillRect(coreX + 12, 0, 4, coreY - 25);
        ctx.fillRect(coreX + 12, coreY + 25, 4, this.height - (coreY + 25));

        // Horizontal clamps
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(coreX - 25, coreY - 28, 50, 6);
        ctx.fillRect(coreX - 25, coreY + 22, 50, 6);
        ctx.fillStyle = '#DDDDDD';
        ctx.fillRect(coreX - 23, coreY - 27, 46, 2);
        ctx.fillRect(coreX - 23, coreY + 23, 46, 2);
    },

    /** Draw all active shield rings. */
    _drawShields(ctx) {
        const cx = this.width / 2;
        const cy = this.height / 2;
        const t = this.coreAnimTimer;
        const rot1 = t * 0.020;
        const rot2 = -t * 0.030;
        const rot3 = t * 0.015;

        // Shield 3 (Outer)
        if (this.shields >= 3) {
            ctx.lineWidth = 3;
            this._drawSegmentedShield(ctx, cx, cy, 45, '#DDDDDD', rot3, 8);
            ctx.strokeStyle = '#888888';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, 48, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Shield 2 (Middle)
        if (this.shields >= 2) {
            ctx.lineWidth = 4;
            this._drawSegmentedShield(ctx, cx, cy, 35, '#AAAAAA', rot2, 6);
        }

        // Shield 1 (Inner)
        if (this.shields >= 1) {
            ctx.lineWidth = 5;
            this._drawSegmentedShield(ctx, cx, cy, 25, '#FFFFFF', rot1, 4);
            // Inner hex
            ctx.strokeStyle = 'rgba(200, 255, 255, 0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i <= 6; i++) {
                const a = i * (Math.PI / 3) + rot1;
                const hx = cx + Math.cos(a) * 20;
                const hy = cy + Math.sin(a) * 20;
                if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
            }
            ctx.stroke();
        }
    },

    /**
     * Draw metallic segmented arc shield ring.
     * @param {number} segments - Number of arc segments.
     */
    _drawSegmentedShield(ctx, cx, cy, radius, color, rotOffset, segments = 8) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        const step = (Math.PI * 2) / segments;
        const gap = 0.15;
        for (let i = 0; i < segments; i++) {
            const a = i * step + rotOffset;
            ctx.arc(cx, cy, radius, a + gap, a + step - gap);
        }
        ctx.stroke();

        // Connector nodes
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < segments; i++) {
            const a = i * step + rotOffset;
            const nx = cx + Math.cos(a) * radius;
            const ny = cy + Math.sin(a) * radius;
            ctx.fillRect(nx - 2, ny - 2, 4, 4);
        }
    },

    /**
     * 周回シールドの羽根を描く。
     *
     * 羽根はコア中心を通る鉛直軸のまわりを回る板で、それを真横から見ている。
     * 見かけの幅は正面を向いたとき最大、真横（＝ガード成立）で最小になる。
     * 一番守っている瞬間が一番細く見えるという困った性質があるので、
     * そのときだけコア色で縁を光らせ、コアとの間にバリア線を引いて補っている。
     *
     * @param {boolean} behind true なら奥に回っている羽根だけ（コアより先に描く）
     */
    _drawOrbitPanels(ctx, behind) {
        if (!this.orbitShieldActive) return;

        const cx = this.width / 2;
        const cy = this._orbitCenterY();
        const r = this.orbitRadius();
        // 展開が終わるまでは角度に関係なく無敵なので、見た目も全部光らせる
        const deploying = this.orbitDeployTimer < BASE_ORBIT_SHIELD_DEPLOY;
        const coreColor = this._getCoreColors().main;

        // 軌道リングを薄い楕円で残す。奥半分は羽根より先に、手前半分は後に
        // 描くので、コアの前後を線がくぐって見える
        this._drawOrbitTrail(ctx, cx, cy, r, behind);

        for (const a of this.orbitAngles()) {
            const depth = panelDepth(a);
            if ((depth < 0) !== behind) continue;

            const px = cx + panelOffsetX(a, r);
            // 手前ほど相似で大きく。幅は「板を斜めから見た見かけの幅」に
            // この拡大率を掛ける
            const scale = 1 + ORBIT_PANEL.perspective * depth;
            const w = (ORBIT_PANEL.edge + ORBIT_PANEL.width * Math.abs(depth)) * scale;
            const h = BASE_ORBIT_SHIELD_HEIGHT * scale;
            // 縦の中心は奥行きによらず一定。拡大は上下へ均等に伸びる
            const x = px - w / 2;
            const y = cy - h / 2;

            // 板の地の色。奥ほど暗く、手前ほど明るい
            ctx.fillStyle = lerpColor(ORBIT_PANEL.dark, ORBIT_PANEL.light, 0.5 + 0.5 * depth);
            ctx.fillRect(x, y, w, h);

            const guarding = deploying || isGuardAngle(a, BASE_ORBIT_SHIELD_GUARD_HALF);
            if (!guarding) continue;

            // ガード中の合図。縁をコア色で光らせる
            ctx.strokeStyle = coreColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);

            // コアとの間に薄いバリア線。細い羽根だけでは「今は防いでいる」が
            // 視界の端で拾えないので、面積のある手がかりを足している
            ctx.strokeStyle = withAlpha(coreColor, ORBIT_PANEL.barrierAlpha);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px, y);
            ctx.lineTo(px, y + h);
            ctx.stroke();
        }
    },

    /** 一番大きくなる（手前に来た）羽根の、中心から下端までの距離。 */
    _orbitMaxHalfHeight() {
        return (BASE_ORBIT_SHIELD_HEIGHT * (1 + ORBIT_PANEL.perspective)) / 2;
    },

    /**
     * 羽根の縦の中心。奥行きによらず一定に保つ（動かすと板の端がふらつく）。
     *
     * 素直にコアの高さ（箱の中心）でよい。基地は構造物のはみ出し
     * （ENEMY_BASE_DRAW_OVERHANG）ぶん持ち上げて置いてあるので、床の表面は
     * 箱の下端より 12px 下にある。手前で 1.3倍に伸びた羽根の下端（箱の下端 +7.4px）
     * でも届かない。それでも届く大きさにしたときのために、床で頭打ちにしておく。
     */
    _orbitCenterY() {
        const floorY = this.height + ENEMY_BASE_DRAW_OVERHANG;
        return Math.min(this.height / 2, floorY - this._orbitMaxHalfHeight());
    },

    /**
     * 軌道リングの楕円。rx は周回半径、ry は見下ろしぶん（ORBIT_PANEL.tilt）。
     * 楕円の媒介変数 t は y = cy + ry*sin t なので、t が π..2π の側が上＝奥、
     * 0..π の側が下＝手前になる。behind に合わせて半分ずつ描く。
     */
    _drawOrbitTrail(ctx, cx, cy, r, behind) {
        if (r <= 0) return;
        ctx.save();
        ctx.strokeStyle = withAlpha(ORBIT_PANEL.light, ORBIT_PANEL.orbitAlpha);
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (behind) ctx.ellipse(cx, cy, r, ORBIT_PANEL.tilt, 0, Math.PI, Math.PI * 2);
        else ctx.ellipse(cx, cy, r, ORBIT_PANEL.tilt, 0, 0, Math.PI);
        ctx.stroke();
        ctx.restore();
    },

    /** Draw the pulsating energy core with bloom, sparkles, and charge particles. */
    _drawCore(ctx) {
        let cx = this.width / 2 || 16;
        let cy = this.height / 2 || 24;
        if (!isFinite(cx)) cx = 16;
        if (!isFinite(cy)) cy = 24;

        const t = this.coreAnimTimer || 0;
        const pulse = (Math.sin(t / 8) + 1) / 2;
        const radius = Math.max(1, 8 + pulse * 3);

        try {
            const { main: coreColor, glow: coreGlow } = this._getCoreColors();

            // Bloom
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 4);
            bloom.addColorStop(0, coreColor);
            bloom.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = bloom;
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Primary glow gradient
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2);
            grad.addColorStop(0, '#FFFFFF');
            grad.addColorStop(0.2, '#FFFFFF');
            grad.addColorStop(0.5 + pulse * 0.2, coreColor);
            grad.addColorStop(1, coreGlow);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 2, 0, Math.PI * 2);
            ctx.fill();

            // Sparkles
            ctx.fillStyle = '#FFFFFF';
            for (let i = 0; i < 4; i++) {
                const sa = t * 0.1 + i * (Math.PI / 2);
                const sd = ((Math.sin(t * 0.2 + i) + 1) / 2) * radius;
                const sx = cx + Math.cos(sa) * sd;
                const sy = cy + Math.sin(sa) * sd;
                const ss = Math.random() * 2 + 1;
                ctx.fillRect(sx - ss / 2, sy - 0.5, ss, 1);
                ctx.fillRect(sx - 0.5, sy - ss / 2, 1, ss);
            }

            // Solid inner core
            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
            ctx.fill();

            // Charge particles
            if (this.attackState === 'charging') {
                ctx.fillStyle = coreColor;
                for (const p of this.chargeParticles) {
                    const s = 1 + (p.life / 30) * 2;
                    ctx.fillRect(cx + p.x - s / 2, cy + p.y - s / 2, s, s);
                }
            }
        } catch (e) {
            console.error('Gradient error in base:', e);
        }
    },

    /** Return the core color pair for the current mission index. */
    _getCoreColors() {
        const COLORS = [
            { main: '#FF2222', glow: 'rgba(255, 34, 34, 0)' },
            { main: '#FFAA11', glow: 'rgba(255, 170, 17, 0)' },
            { main: '#FFFF33', glow: 'rgba(255, 255, 51, 0)' },
            { main: '#33FF33', glow: 'rgba(51, 255, 51, 0)' },
            { main: '#22CCFF', glow: 'rgba(34, 204, 255, 0)' },
            { main: '#8344C0', glow: 'rgba(131, 68, 192, 0)' },
            { main: '#F68DF6', glow: 'rgba(246, 141, 246, 0)' },
        ];
        const idx = (this.game.missionsCompleted || 0) % COLORS.length;
        return COLORS[idx];
    },
};
