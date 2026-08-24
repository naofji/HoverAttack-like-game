// ============================================
// Ranking Screens
// ============================================
//
// 週間ランキング（ローカル／グローバル）・Wall of Fame・面別ランキングの描画。
// 4画面とも同じ表を描くので、_drawRankingList が枠と行を引き受け、
// 各画面は見出しと色と行データだけを渡す。
//
// 列の座標は screens/layout.js に置いてある（RANKING_COLUMNS / FAME_COLUMNS）。
// 実機で見て決めた値なので、動かすときはあちらのコメントを読むこと。
//
// **ScreenRenderer.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は ScreenRenderer を指す（理由は screens/miniMap.js の冒頭）。

import { STAGE_PALETTES } from '../../utils/Constants.js';
import { flagEmoji } from '../../utils/geo.js';
import { formatClock } from '../../utils/formatTime.js';
import { lerpColor } from '../../utils/color.js';
import { drawStageScene } from '../StageScene.js';
import { TIER, ROW_HIGHLIGHT, SPACE, lineHeight, font, drawScanlines } from '../theme.js';
import {
    RANKING_COLUMNS, RANKING_TABLE_WIDTH, RANKING_SLOTS,
    FAME_COLUMNS, FAME_BLOCK_WIDTH,
} from './layout.js';

export const RankingScreens = {
    _drawRankingList(ctx, o) {
        const canvas = this.game.canvas;
        const cols = RANKING_COLUMNS;
        const tableW = RANKING_TABLE_WIDTH;
        const left = Math.round((canvas.width - tableW) / 2);

        ctx.fillStyle = o.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        ctx.font = font('title', true);
        this._metallicText(ctx, o.title, canvas.width / 2, 40, o.titleColor);

        // 副題は表題の説明。小さくして表題との差をはっきりさせる。
        ctx.fillStyle = o.subtitleColor;
        ctx.font = font('small');
        ctx.fillText(o.subtitle, canvas.width / 2, 40 + SPACE.md + 2);

        // --- 見出し行 ---
        const headerY = 40 + SPACE.md + SPACE.lg + 2;
        ctx.fillStyle = o.subtitleColor;
        ctx.font = font('small', true);
        for (const c of cols) {
            ctx.textAlign = c.align;
            ctx.fillText(c.label, left + c.x, headerY);
        }
        ctx.strokeStyle = o.subtitleColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(left, headerY + SPACE.sm + 0.5);
        ctx.lineTo(left + tableW, headerY + SPACE.sm + 0.5);
        ctx.stroke();

        const scores = o.scores || [];
        const slots = RANKING_SLOTS;
        const startY = headerY + SPACE.lg + SPACE.xs;
        const bottom = canvas.height - SPACE.xl;
        const lineH = Math.floor((bottom - startY) / slots);
        const emptyShade = lerpColor(o.rowDim, o.bg, 0.45);

        ctx.font = font('body', true);
        for (let index = 0; index < slots; index++) {
            const entry = scores[index];
            const rowY = startY + index * lineH;

            if (!entry) {
                // 空き枠。順位だけ残して他は罫で埋める。
                ctx.fillStyle = emptyShade;
                for (const c of cols) {
                    if (c.key === 'tries') continue; // 空き枠に T の点線は出さない（意味が無い）
                    ctx.textAlign = c.align;
                    ctx.fillText(c.key === 'rank' ? `${index + 1}.` : '·····', left + c.x, rowY);
                }
                continue;
            }

            const highlighted = index === o.highlightIndex
                && Math.floor(Date.now() / 200) % 2 === 0;
            const shade = lerpColor(o.rowBright, o.rowDim, Math.min(index / (slots - 1), 1));

            const values = {
                rank: `${index + 1}.`,
                score: String(entry.score),
                name: String(entry.name || ''),
                // tries が無い(旧データ)か 1(初回クリア)なら何も描かない。
                // セーブを使わない大多数の行を "T1" で汚さないため。
                tries: (Number(entry.tries) || 1) >= 2 ? `T${Number(entry.tries)}` : '',
                flag: flagEmoji(entry.country),
                mission: String(entry.mission),
                time: entry.clearTime ? String(entry.clearTime) : '—',
            };

            for (const c of cols) {
                const text = values[c.key];
                if (!text) continue;
                ctx.textAlign = c.align;
                if (highlighted) {
                    ctx.fillStyle = ROW_HIGHLIGHT;
                    ctx.fillText(text, left + c.x, rowY);
                } else {
                    this._metallicText(ctx, text, left + c.x, rowY, shade);
                }
            }
        }

        drawScanlines(ctx, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        this._drawStartHint(ctx);
        ctx.textAlign = 'left';
    },

    drawLocalRanking(ctx, scores, highlightIndex = -1, weekId = '') {
        this._drawRankingList(ctx, {
            scores, highlightIndex,
            title: '▌ LOCAL RANKING — THIS DEVICE',
            subtitle: `${weekId} · YOUR MACHINE`,
            bg: TIER.local.bg, titleColor: TIER.local.title, subtitleColor: TIER.local.subtitle,
            rowBright: TIER.local.rowBright, rowDim: TIER.local.rowDim,
        });
    },

    drawGlobalRanking(ctx, scores, highlightIndex = -1, weekId = '') {
        this._drawRankingList(ctx, {
            scores, highlightIndex,
            title: '◍ GLOBAL RANKING — THIS WEEK 🌐',
            subtitle: `${weekId} · WORLDWIDE`,
            bg: TIER.global.bg, titleColor: TIER.global.title, subtitleColor: TIER.global.subtitle,
            rowBright: TIER.global.rowBright, rowDim: TIER.global.rowDim,
        });
    },

    drawWallOfFame(ctx, fame) {
        const canvas = this.game.canvas;

        ctx.fillStyle = TIER.fame.bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 表題。この画面の主役なので最大サイズ＋クローム。
        ctx.font = font('title', true);
        ctx.textAlign = 'center';
        this._metallicText(ctx, '✦ WALL OF FAME ✦', canvas.width / 2, 40, TIER.fame.title);

        // 副題は「表題の説明」であって見出しではない。小さく落ち着かせて、
        // 表題との大小差をはっきりさせる（以前は16px太字で週見出しと同格だった）。
        ctx.fillStyle = TIER.fame.subtitle;
        ctx.font = font('small');
        ctx.fillText('WEEKLY CHAMPIONS', canvas.width / 2, 40 + SPACE.md + 2);

        if (!fame || fame.length === 0) {
            ctx.fillStyle = TIER.fame.subtitle;
            ctx.font = font('sub', true);
            ctx.fillText('NO CHAMPIONS YET', canvas.width / 2, canvas.height / 2);
        } else {
            // 週ブロックを2列に並べる。1列だと画面の横半分以上が空くうえ、
            // 表示できる週数も半分になってしまう。
            const cols = FAME_COLUMNS;
            const blockW = FAME_BLOCK_WIDTH;
            const colGap = SPACE.xl + SPACE.md;
            const totalW = blockW * 2 + colGap;
            const left = Math.round((canvas.width - totalW) / 2);

            const areaTop = 40 + SPACE.md + SPACE.lg + SPACE.sm;
            const bottom = canvas.height - SPACE.xl;
            const blockH = SPACE.md + lineHeight('body') * 3 + SPACE.md;
            const rowsPerCol = Math.max(1, Math.floor((bottom - areaTop) / blockH));

            // 週数が少ないときは上に寄せず、縦に中央へ置く（下だけ大きく空くのを防ぐ）
            const usedRows = Math.min(rowsPerCol, Math.ceil(fame.length / 2));
            const topY = areaTop + Math.floor(((bottom - areaTop) - usedRows * blockH) / 2);

            fame.slice(0, rowsPerCol * 2).forEach((wk, i) => {
                const colIndex = Math.floor(i / rowsPerCol);   // 先に縦を埋めてから隣の列へ
                const blockLeft = left + colIndex * (blockW + colGap);
                let y = topY + (i % rowsPerCol) * blockH;

                // 週の見出しは「ラベル」。行より小さくして、序列を大きさで示す。
                ctx.textAlign = 'left';
                ctx.fillStyle = TIER.fame.subtitle;
                ctx.font = font('small', true);
                ctx.fillText(wk.weekId, blockLeft, y);
                y += SPACE.md;

                // 3行しかないブロックの中で文字サイズを変えると行送りが混ざり
                // (18px→26px / 16px→23px)、ブロック全体が歪んで見える。
                // サイズは揃え、1位の強調は明るさ（クロームの階調）だけで示す。
                ctx.font = font('body', true);
                wk.entries.forEach((e, rank) => {
                    const shade = lerpColor(TIER.fame.rowBright, TIER.fame.rowDim, Math.min(rank / 2, 1));
                    const values = {
                        rank: `${rank + 1}.`,
                        score: String(e.score),
                        name: String(e.name || ''),
                        flag: flagEmoji(e.country),
                        // 週ランキング表と同じ規則。1（と旧データ）は空文字にして、
                        // 描画ループの `if (!text) continue;` に落とす
                        tries: (Number(e.tries) || 1) >= 2 ? `T${Number(e.tries)}` : '',
                    };
                    for (const c of cols) {
                        const text = values[c.key];
                        if (!text) continue;
                        ctx.textAlign = c.align;
                        this._metallicText(ctx, text, blockLeft + c.x, y, shade);
                    }
                    y += lineHeight('body');
                });
            });
        }

        // 走査線は分岐の外で1回だけ。以前は分岐の中と外で二重に掛かっていて、
        // この画面だけ走査線の濃さが 0.10 ではなく 0.19 相当になっていた。
        drawScanlines(ctx, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        this._drawStartHint(ctx);
        ctx.textAlign = 'left';
    },

    drawStageRankings(ctx, stageIndex, stageData, palette) {
        const canvas = this.game.canvas;
        const W = canvas.width;
        const H = canvas.height;
        const stageNo = stageIndex + 1;
        // Brighten the (often dark) stage colour into a legible accent.
        const accent = lerpColor(palette.fill, '#ffffff', 0.55);

        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, W, H);

        // Title + subtitle
        ctx.textAlign = 'center';
        ctx.font = font('title', true);
        this._metallicText(ctx, `STAGE ${stageNo}`, W / 2, 46, accent);
        ctx.fillStyle = lerpColor(palette.fill, '#ffffff', 0.35);
        ctx.font = font('small', true);
        ctx.fillText('THIS WEEK · TOP 5', W / 2, 70);

        // Scene strip (full width)
        drawStageScene(ctx, 40, 84, W - 80, 150, stageIndex, palette, Date.now());

        // Two side-by-side lists.
        this._drawStageColumn(ctx, 'FASTEST TIME', stageData.time || [], W * 0.27, 258, accent, true);
        this._drawStageColumn(ctx, 'HIGH SCORE', stageData.score || [], W * 0.73, 258, accent, false);

        // Divider between columns
        ctx.strokeStyle = lerpColor(palette.fill, '#000000', 0.1);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2, 250);
        ctx.lineTo(W / 2, 250 + 200);
        ctx.stroke();

        drawScanlines(ctx, canvas.width, canvas.height);

        ctx.textAlign = 'center';
        this._drawStartHint(ctx);
        ctx.textAlign = 'left';
    },

    _drawStageColumn(ctx, label, rows, centerX, topY, accent, isTime) {
        // Header
        ctx.textAlign = 'center';
        ctx.fillStyle = accent;
        ctx.font = font('sub', true);
        ctx.fillText(label, centerX, topY);

        const startY = topY + 30;
        const lineH = 30;
        const left = centerX - 150;
        if (rows.length === 0) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#666666';
            ctx.font = font('body');
            ctx.fillText('NO RECORDS YET', centerX, startY + 16);
            ctx.textAlign = 'left';
            return;
        }
        ctx.textAlign = 'left';
        rows.forEach((entry, i) => {
            const y = startY + i * lineH;
            const rank = String(i + 1);
            const name = String(entry.name || '').substring(0, 8);
            const flag = flagEmoji(entry.country);
            const valStr = isTime ? formatClock(entry.timeMs) : String(entry.score).toLocaleString();

            // Rank number in accent, dimmer for lower ranks.
            ctx.font = font('body', true);
            ctx.fillStyle = lerpColor(accent, '#5a5a5a', Math.min(i / 4, 1) * 0.55);
            ctx.fillText(rank + '.', left, y);
            // Name (off-white) + flag
            ctx.fillStyle = '#EAEAEA';
            ctx.fillText(name + (flag ? ' ' + flag : ''), left + 30, y);
            // Value, right-aligned within the column
            ctx.textAlign = 'right';
            ctx.fillStyle = isTime ? '#EAEAEA' : accent;
            ctx.fillText(valStr, left + 300, y);
            ctx.textAlign = 'left';
        });
    },
};
