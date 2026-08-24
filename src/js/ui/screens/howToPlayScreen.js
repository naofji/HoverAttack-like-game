// ============================================
// How To Play Screen
// ============================================
//
// 遊び方の2ページ（デモループの中で10秒ずつ切り替わる）。
// 1ページ目が目的とルールとアイテム、2ページ目が操作図。
//
// **ScreenRenderer.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は ScreenRenderer を指す（理由は screens/miniMap.js の冒頭）。

import { RepairKit } from '../../entities/RepairKit.js';
import { AutoAimUnit } from '../../entities/AutoAimUnit.js';
import { MissileKit } from '../../entities/MissileKit.js';
import { OverdriveKit } from '../../entities/OverdriveKit.js';
import { drawControlsDiagram, controlsDiagramHeight } from '../controlsDiagram.js';
import { UI, SPACE, lineHeight, font, glow, drawFrame, drawPanel, drawScanlines } from '../theme.js';
import { PANEL_HEAD, PANEL_PAD, panelHeight, panelContentTop } from './layout.js';

/**
 * 遊び方画面の ITEMS パネルに並べる拾い物。
 *
 * ここが「拾えるもの」の一覧そのもの。アイテムを増やしたらこの表に1行足す。
 * パネルの高さも行数から求めるので、足すだけでレイアウトが追従する。
 * アイコンは type で dummyKits を引き、実物のアイテムを描く。
 */
const ITEM_GUIDE = [
    { type: 'missile', color: '#FF4444', name: 'MISSILE SUPPLY KIT', desc: 'FULLY RESTORES YOUR MISSILE AMMO UPON PICKUP.' },
    { type: 'overdrive', color: '#FFDD22', name: 'OVERDRIVE KIT', desc: 'RARE DROP FROM HEAVY. GRANTS INFINITE AMMO AND NO RELOAD FOR A LIMITED TIME.' },
    { type: 'autoaim', color: '#FF8800', name: 'AUTO-AIM UNIT', desc: 'ENABLES AUTO-AIM FOR A LIMITED TIME. (DROPPED BY ARTILLERY)' },
    { type: 'repair', color: '#00FF00', name: 'CARRIER REPAIR KIT', desc: 'REPAIRS CARRIER HP WHEN DOCKED. GRANTS +1 LIFE IF FULL. (DROPPED BY RIVAL)' },
];

export const HowToPlayScreen = {
    drawHowToPlay(ctx, page) {
        const canvas = this.game.canvas;
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;

        // Rich Background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, UI.panelFill);
        bgGrad.addColorStop(1, UI.bg);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Grid overlay for tech feel
        ctx.strokeStyle = 'rgba(0, 204, 255, 0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < W; i += 40) { ctx.moveTo(i, 0); ctx.lineTo(i, H); }
        for (let j = 0; j < H; j += 40) { ctx.moveTo(0, j); ctx.lineTo(W, j); }
        ctx.stroke();

        // Header
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = font('head', true);
        glow(ctx, UI.ok, 'mid');
        ctx.fillStyle = UI.ok;
        ctx.fillText('─── HOW TO PLAY ───', cx, 50);
        ctx.restore();

        if (page === 0) {
            // ---- PAGE 1: MISSION & RULES ----

            // パネルの高さを中身から求め、余った縦幅を等間隔に配る。
            // 以前はパネル間15pxに対して最終パネルの下が108px空いていた。
            const lineH = lineHeight('small');
            const ILLUST_H = 115;
            const ITEM_H = 64;
            const objectiveH = panelHeight(lineH * 2);
            const rulesH = panelHeight(Math.max(lineH * 6, ILLUST_H));
            const itemsH = panelHeight(ITEM_H * ITEM_GUIDE.length);
            const areaTop = 80;
            const areaBottom = H - SPACE.xl;
            const gap = Math.floor(
                (areaBottom - areaTop - objectiveH - rulesH - itemsH) / 3,
            );

            const objectiveY = areaTop;
            const rulesY = objectiveY + objectiveH + gap;
            const itemsY = rulesY + rulesH + gap;

            // PANEL 1: OBJECTIVE
            drawPanel(ctx, cx - 400, objectiveY, 800, objectiveH, 'MISSION OBJECTIVE', UI.accent);
            ctx.font = font('small');
            ctx.textAlign = 'center';
            let ty = panelContentTop(objectiveY, lineH);
            ctx.fillStyle = UI.ink;
            ctx.fillText('DESTROY ENEMY ROBOTS, OBLITERATE THE ENEMY BASE CORE, AND CAPTURE THE FLAG.', cx, ty);
            ctx.fillStyle = UI.warn;
            ctx.fillText('* GAME OVER IF THE CARRIER LOSES ALL ITS LIVES.', cx, ty + lineH);

            // PANEL 2: BASIC RULES
            drawPanel(ctx, cx - 400, rulesY, 800, rulesH, 'BASIC RULES', UI.accent);
            ctx.fillStyle = UI.dim;
            ctx.font = font('small');
            ctx.textAlign = 'left';

            const rules = [
                '1) CONTROL CARRIER WHILE DOCKED.',
                '   DETACH TO CONTROL ATTACKER (CARRIER BECOMES DEFENSELESS).',
                '2) DOCKING ATTACKER WITH CARRIER RESUPPLIES AMMO/FUEL',
                '   AND REPAIRS DAMAGE.',
                '3) IF ATTACKER IS DESTROYED, RESPAWN AT CARRIER.',
                '   IF CARRIER IS DESTROYED, RESPAWN AT START.',
            ];
            const rulesTop = panelContentTop(rulesY, lineH);
            rules.forEach((line, i) => ctx.fillText(line, cx - 380, rulesTop + i * lineH));

            // 右側のイラスト枠。パネルの中身の縦幅に対して中央へ置く。
            const illustTop = rulesY + PANEL_HEAD
                + Math.floor((rulesH - PANEL_HEAD - ILLUST_H) / 2);
            ctx.strokeStyle = 'rgba(0, 200, 255, 0.2)';
            ctx.lineWidth = 1;
            drawFrame(ctx, cx + 220, illustTop, 140, ILLUST_H, 'rgba(0, 200, 255, 0.2)', { radius: 6 });

            // Draw illustration: Player docking onto Carrier
            const illustMidX = cx + 290;
            this._drawMiniPlayer(ctx, illustMidX, illustTop + 22);
            this._drawMiniCarrier(ctx, illustMidX, illustTop + 82);

            // Docking arrow
            ctx.strokeStyle = UI.accent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(illustMidX, illustTop + 37);
            ctx.lineTo(illustMidX, illustTop + 67);
            ctx.lineTo(illustMidX - 4, illustTop + 63);
            ctx.moveTo(illustMidX, illustTop + 67);
            ctx.lineTo(illustMidX + 4, illustTop + 63);
            ctx.stroke();

            // PANEL 3: ITEMS
            drawPanel(ctx, cx - 400, itemsY, 800, itemsH, 'ITEMS', UI.accent);

            const items = ITEM_GUIDE;

            if (!this.dummyKits) {
                // 説明用に絵を描き起こさず、実物のアイテムを 2.5倍で描く。
                // 別に描くと、アイテムの見た目を変えたときに解説だけ古くなる
                this.dummyKits = {
                    'missile': new MissileKit(this.game, 0, 0),
                    'overdrive': new OverdriveKit(this.game, 0, 0),
                    'autoaim': new AutoAimUnit(this.game, 0, 0),
                    'repair': new RepairKit(this.game, 0, 0)
                };
            }
            // Animate dummy kits
            Object.values(this.dummyKits).forEach(kit => kit.frameCounter++);

            const itemsTop = itemsY + PANEL_HEAD + PANEL_PAD;
            items.forEach((item, i) => {
                const y = itemsTop + i * ITEM_H + Math.round(ITEM_H / 2);

                // Draw Icon using the actual game entity logic scaled up
                ctx.save();
                const dummy = this.dummyKits[item.type];
                if (dummy) {
                    ctx.translate(cx - 380, y - 20);
                    ctx.scale(2.5, 2.5); // 16 * 2.5 = 40
                    dummy.x = 0;
                    dummy.y = 0;
                    dummy.draw(ctx);
                }
                ctx.restore();

                // Text
                ctx.textAlign = 'left';
                ctx.fillStyle = item.color;
                ctx.font = font('body', true);
                ctx.fillText(item.name, cx - 320, y - 8);

                ctx.fillStyle = UI.dim;
                ctx.font = font('small');
                ctx.fillText(item.desc, cx - 320, y + 15);
            });

        } else {
            // ---- PAGE 2: CONTROLS ----
            // キー名と説明を並べた表では「手をどこに置くのか」が読めなかったので
            // 図にした（controlsDiagram.js）。設定画面のオーバーレイと同じものを
            // 描くので、2画面で見た目も文言もずれない
            const panelW = 800;
            const panelH = panelHeight(controlsDiagramHeight());
            const areaTop = 80;
            const areaBottom = H - SPACE.xl;
            const panelY = areaTop + Math.floor(((areaBottom - areaTop) - panelH) / 2);

            drawPanel(ctx, cx - panelW / 2, panelY, panelW, panelH, 'CONTROLS', UI.accent);
            drawControlsDiagram(
                ctx,
                cx - panelW / 2 + PANEL_PAD + SPACE.md,
                panelY + PANEL_HEAD + PANEL_PAD,
                panelW - (PANEL_PAD + SPACE.md) * 2,
            );
        }

        drawScanlines(ctx, W, H);

        this._drawStartHint(ctx, 600);
    },
};
