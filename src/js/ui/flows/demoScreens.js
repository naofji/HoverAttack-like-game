// ============================================
// Demo (attract mode) Screens
// ============================================
//
// タイトルから始まるデモループの「画面の並び」と「各画面の描画」。
// main.js から切り出したが、テストが main.js 越しに import しているので
// main.js 側で re-export している。
//
// ここを main.js に残したままにすると attractFlow.js が main.js を
// import することになり循環参照になる。表そのものを下ろすほうが素直。

import { STAGE_PALETTES } from '../../utils/Constants.js';
import { stageRankingView } from '../../systems/StageRankingManager.js';


/** Screens that make up the title/attract-mode loop, in cycle order. */
export const DEMO_CYCLE_STATES = [
    'title', 'how_to_play', 'local_ranking_display',
    'global_ranking_display', 'stage_ranking_display', 'wall_of_fame_display'
];

/**
 * デモループの各画面の中身の描画。draw() から状態名で引く。
 *
 * この表に載っている状態は「世界を描かない全画面表示」であり、描画の後に
 * 必ず位置ドットが重なって終わる。その共通部分は draw() 側が持つので、
 * ここには画面ごとに違うところだけを書く。画面を足すときはここに1行。
 * @type {Object<string, (game: typeof Game, ctx: CanvasRenderingContext2D) => void>}
 */
export const DEMO_SCREEN_DRAWERS = {
    title: (g, ctx) => g.screenRenderer.drawTitleScreen(ctx),

    // 20秒を2ページに割る（前半10秒が1ページ目）
    how_to_play: (g, ctx) => g.screenRenderer.drawHowToPlay(ctx, g.stateTimer < 10000 ? 0 : 1),

    local_ranking_display: (g, ctx) => g.screenRenderer.drawLocalRanking(
        ctx, g.highScoreManager.getTop10(), g.localRankIndex, g.week.weekId,
    ),

    global_ranking_display: (g, ctx) => {
        // 未取得でも枠だけは出す（読み込み中に画面が真っ黒にならないように）
        const data = g.onlineData || { ranking: [], weekId: g.week.weekId };
        g.screenRenderer.drawGlobalRanking(ctx, data.ranking, g.globalRankIndex, data.weekId);
    },

    stage_ranking_display: (g, ctx) => {
        const idx = g.stageDisplayIndex;
        // ローカルとグローバルの両方を渡す（画面が上下2段で両方出す）
        const data = stageRankingView(g.onlineData, idx + 1, g.stageRankingManager.getStage(idx + 1));
        g.screenRenderer.drawStageRankings(ctx, idx, data, STAGE_PALETTES[idx]);
    },

    wall_of_fame_display: (g, ctx) => {
        const fame = (g.onlineData && g.onlineData.fame) || [];
        g.screenRenderer.drawWallOfFame(ctx, fame);
    },
};
