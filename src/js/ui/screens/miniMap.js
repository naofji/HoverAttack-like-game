// ============================================
// MiniMap
// ============================================
//
// プレイ中に R キーで出るミニマップ。置き場所は Tab で回す四隅のどれか（設定の miniMapCorner）。Map 側が焼いたキャッシュを縮小して敷き、
// その上に自機・母艦・敵を点で重ねる。
//
// **ScreenRenderer.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は ScreenRenderer を指す。関数化して renderer を第一引数に
// 取る形にしなかったのは、テストが `new ScreenRenderer(game)` して
// `renderer.drawMiniMap(ctx)` と呼んでいるため（ui/flows/settingsFlow.js と同じ理由）。

import {
    TILE_SIZE, MINIMAP_ALPHA, MINIMAP_MARGIN, HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT,
    MINIMAP_MAX_WIDTH_RATIO, MINIMAP_FADE_SPEED,
    MINIMAP_VIEWPORT_HIGHLIGHT, COLOR_MINIMAP_VIEWPORT, MINIMAP_CORNER_ORDER,
    MINIMAP_OVERLAP_ALPHA, MINIMAP_OVERLAP_FADE_SPEED,
} from '../../utils/Constants.js';
import { miniMapCornerPositions, miniMapOverlaps, stepMiniMapOverlapFade } from '../minimapPlacement.js';
import { advanceMiniMapTransition } from '../minimapTransition.js';
import { crosshairScreenPos } from '../Crosshair.js';

export const MiniMap = {
    drawMiniMap(ctx) {
        const game = this.game;
        const w = game.canvas.width;
        const h = game.canvas.height;

        // 地形が壊れて「古い」印が立っていたら、開いて描く直前に1回だけ焼き直す。
        // 閉じている間は焼かないので毎フレームのコストは増えない。
        game.map.refreshMiniMap();
        const mm = game.map.miniMapCanvas;

        if (!mm) return;

        // 焼く解像度（cols*2 x rows*2）はマップの広さに比例するが、**画面に出す
        // 大きさはマップの広さによらず一定**にする。以前は「上限より小さければ
        // 等倍」＝拡大しない作りだったので、面が進んでマップが広くなるほど
        // ミニマップも大きくなり、面ごとに見え方が変わっていた（実機フィードバック）。
        // 幅を画面幅の MINIMAP_MAX_WIDTH_RATIO に合わせ、縦が HUD 帯の間に
        // 収まらないマップだけ高さ側で頭打ちにする（アスペクト比は常に保つ）。
        // 小さいマップは拡大されることになるが、ミニマップは元々彩度と明度を
        // 落として沈めた絵なので、多少の甘さは問題にならない。
        const availH = h - HUD_TOP_HEIGHT - HUD_BOTTOM_HEIGHT - MINIMAP_MARGIN * 2;
        const shrink = Math.min(
            (w * MINIMAP_MAX_WIDTH_RATIO) / mm.width,
            availH / mm.height,
        );
        const destW = mm.width * shrink;
        const destH = mm.height * shrink;

        // mapW/mapH には「実際に見える大きさ」＝縮小後の値を渡すこと。ここを
        // 元サイズのままにすると、右・下の隅で画面端からはみ出す。
        const positions = miniMapCornerPositions({
            canvasW: w,
            canvasH: h,
            mapW: destW,
            mapH: destH,
            margin: MINIMAP_MARGIN,
            hudTop: HUD_TOP_HEIGHT,
            hudBottom: HUD_BOTTOM_HEIGHT,
        });
        // 隅はプレイヤーが Tab で選んだもの（設定の miniMapCorner）。自機・クロスヘアを
        // 避けて自動で選ぶ作りは「チラチラ動いて邪魔」との苦情で撤去した
        // （経緯は Constants.js の MINIMAP_CORNER_ORDER）。知らない値は左上に落とす
        // （settings.js の読み込みが検証済みだが、テストの game は settings を持たないことがある）。
        const saved = game.settings && game.settings.miniMapCorner;
        const desired = MINIMAP_CORNER_ORDER.includes(saved) ? saved : 'topLeft';

        // Tab で隅を替えたときはフェードでつなぐ（瞬間移動すると、どこへ行ったか
        // 目で追えない）。初回描画（このインスタンスでまだ何も
        // 選んでいない）は、設定の隅をそのまま完全に見える状態で採用する
        // （開いた瞬間に一度フェードインさせる必要は無い＝0.85→0.55等と同じ独立した
        // 開閉フェードは game.miniMapAlpha が別に受け持っている）。
        if (!this.miniMapTransition) {
            this.miniMapTransition = { corner: desired, fade: 1, phase: 'idle' };
        } else {
            this.miniMapTransition = advanceMiniMapTransition(this.miniMapTransition, desired, MINIMAP_FADE_SPEED);
        }

        const { x: mmX, y: mmY } = positions[this.miniMapTransition.corner];

        const alpha = game.miniMapAlpha || 0;

        // 操作中の機体（ドッキング中でなければ自機、そうなら母艦）かクロスヘアが
        // ミニマップの下に入っている間は、全体を薄くして下の本編を見せる
        // （隅を自動で避ける作りを撤去したかわり。MINIMAP_OVERLAP_ALPHA のコメント参照）。
        // 見るのは「今出ている隅」の矩形。隅の切り替え中に、行き先ではなく
        // まだ見えている旧位置で判定するため。
        // クロスヘアは Crosshair.draw() と同じ crosshairScreenPos で取る（描く位置とずれないように）。
        const unit = (game.player && game.player.alive && !game.player.docked) ? game.player
            : (game.carrier && game.carrier.alive) ? game.carrier : null;
        const unitRect = unit
            ? { x: unit.x - game.camera.x, y: unit.y - game.camera.y, w: unit.width, h: unit.height }
            : null;
        const overlapping = miniMapOverlaps(
            { x: mmX, y: mmY, w: destW, h: destH }, unitRect, crosshairScreenPos(game));
        this.miniMapOverlapFade = stepMiniMapOverlapFade(
            this.miniMapOverlapFade ?? 1, overlapping, MINIMAP_OVERLAP_ALPHA, MINIMAP_OVERLAP_FADE_SPEED);
        // 隅の切り替えフェードと重なりの倍率は、地形・ハイライト・点のどれにも同じだけ掛かる
        const fade = this.miniMapTransition.fade * this.miniMapOverlapFade;

        ctx.save();
        // 最終的な濃さは4つの独立したフェードの積: 地形の上に重ねる基本濃度 ×
        // 開閉フェード(miniMapAlpha) × 隅の切り替えフェード(transition.fade) × 重なりの倍率
        ctx.globalAlpha = MINIMAP_ALPHA * alpha * fade;

        // Draw the cached static map, shrunk to destW/destH
        ctx.drawImage(mm, mmX, mmY, destW, destH);

        // 外枠は描かない。サイズを上げて薄さを補ったあとは、枠が無いほうが
        // 地形と馴染んで邪魔にならないという実機フィードバックで撤去した
        // （COLOR_MINIMAP_BORDER も使わなくなったので Constants.js から削除済み）。

        // 「今この画面に映っている範囲」を明るくする。ミニマップの表示サイズを
        // マップの広さによらず一定にしたことで失われた「全体がどれくらい広いか」を、
        // **可視領域が占める割合**という形で取り戻すためのもの（可視領域は常に
        // 64x48 タイル固定なので、割合がそのまま縮尺になる）。
        //
        // 白の半透明を重ねる。地形をもう一度重ねて不透明度を上げる方式は、
        // ミニマップがライブのゲーム画面の上に乗っているぶん背後の絵で
        // コントラストが変わってしまい、狙った差が出る保証がない。
        // 「外を暗くする」案はユーザーが却下（既に暗いのでこれ以上暗い部分を
        // 作るとマップとして読めなくなる）。
        //
        // 点より**先**に描くこと。ミニマップを開ける一番の目的は「見えていない
        // 敵がどこにいるか」なので、赤い点が白に埋もれてはいけない。
        const viewScale = game.map.miniMapScale * shrink;
        const viewX = mmX + (game.camera.x / TILE_SIZE) * viewScale;
        const viewY = mmY + (game.camera.y / TILE_SIZE) * viewScale;
        const viewW = (w / TILE_SIZE) * viewScale;
        const viewH = (h / TILE_SIZE) * viewScale;
        // マップの端ではカメラが止まるので、素直に計算するとミニマップの外へ
        // はみ出す。はみ出した白が地形の外に浮くと、ミニマップの矩形と食い違って見える
        const clipX = Math.max(mmX, viewX);
        const clipY = Math.max(mmY, viewY);
        const clipW = Math.min(mmX + destW, viewX + viewW) - clipX;
        const clipH = Math.min(mmY + destH, viewY + viewH) - clipY;
        if (clipW > 0 && clipH > 0) {
            // 濃さは地形と同じフェードに追随させるが、MINIMAP_ALPHA は掛けない
            // （あれは地形を背景に沈めるための値。ハイライトは沈める対象ではない）
            ctx.globalAlpha = MINIMAP_VIEWPORT_HIGHLIGHT * alpha * fade;
            ctx.fillStyle = COLOR_MINIMAP_VIEWPORT;
            ctx.fillRect(clipX, clipY, clipW, clipH);
        }

        // 点（自機・敵・母艦）は地形と別に、開閉フェードと隅の切り替えフェードだけを
        // 掛け直す。MINIMAP_ALPHA（地形を背景に沈めるための値）は点には掛けない。
        // 点は「今どこにいるか」を読むための情報であって背景ではないので、地形と
        // 同じだけ薄めると一番目を引くはずの自機・敵の位置が読みにくくなる。
        // 掛け直さず 1.0 に固定していた版は、隅の切り替え中に点だけフルオパシティの
        // まま瞬間移動して見える不具合になっていた。
        ctx.globalAlpha = alpha * fade;

        // Helper to draw a dot。点は miniMapScale だけでなく縮小率(shrink)にも
        // 追随させる必要がある。ここを忘れると、地形は縮むのに点だけ元の位置に
        // 残ってしまい、縮小したミニマップの上でずれて見える。
        // 縮尺は可視領域のハイライトと同じもの（viewScale）を使う。別々に持つと
        // 点とハイライトがずれる。
        const drawDot = (worldX, worldY, color, size = 2) => {
            const px = mmX + (worldX / TILE_SIZE) * viewScale;
            const py = mmY + (worldY / TILE_SIZE) * viewScale;
            ctx.fillStyle = color;
            ctx.fillRect(px - size / 2, py - size / 2, size, size);
        };

        // Carrier (Blue square)
        if (game.carrier && game.carrier.alive) {
            drawDot(game.carrier.x + game.carrier.width / 2, game.carrier.y + game.carrier.height / 2, '#0088FF', 5);
        }

        // Enemies (Red squares)
        for (const enemy of game.enemies) {
            if (enemy.alive) drawDot(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#FF3333', 3);
        }

        // Player (White square)
        if (game.player && game.player.alive && !game.player.docked) {
            drawDot(game.player.x + game.player.width / 2, game.player.y + game.player.height / 2, '#FFFFFF', 4);
        }

        ctx.restore();
    },

    _drawMiniCarrier(ctx, x, y) {
        ctx.save();
        ctx.translate(x - 20, y - 10);
        ctx.scale(0.6, 0.6); // Scale down slightly to fit UI
        const drawY = 0;

        // Bottom hull
        ctx.fillStyle = '#1a3a6a';
        ctx.fillRect(4, drawY + 14, 56, 16);
        // Top hull (red accent)
        ctx.fillStyle = '#AA2222';
        ctx.fillRect(8, drawY + 8, 48, 8);
        // Platform deck
        ctx.fillStyle = '#CC9900';
        ctx.fillRect(16, drawY + 4, 32, 5); // platformLeft=16, platformRight=48
        // Platform surface line
        ctx.fillStyle = '#FFCC00';
        ctx.fillRect(16, drawY + 4, 32, 2);
        // Cockpit window
        ctx.fillStyle = '#00AAFF';
        ctx.fillRect(28, drawY + 10, 8, 4);
        // Engine pods
        ctx.fillStyle = '#2255AA';
        ctx.fillRect(0, drawY + 18, 8, 10);
        ctx.fillRect(56, drawY + 18, 8, 10);
        // Thruster glow
        ctx.fillStyle = '#00CCFF';
        ctx.fillRect(1, drawY + 28, 6, 4);
        ctx.fillRect(57, drawY + 28, 6, 4);
        ctx.fillRect(20, drawY + 30, 6, 5);
        ctx.fillRect(38, drawY + 30, 6, 5);
        ctx.restore();
    },

    _drawMiniPlayer(ctx, x, y) {
        ctx.save();
        ctx.translate(x - 10, y - 10);
        ctx.scale(0.8, 0.8);

        // Backpack (hover unit)
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(2, 5, 4, 8);
        ctx.fillStyle = '#FF6600';
        ctx.fillRect(2, 12, 4, 2);

        // Body
        ctx.fillStyle = '#E8E8E8';
        ctx.fillRect(5, 4, 10, 12);
        // Head
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(6, 0, 8, 5);
        // Visor
        ctx.fillStyle = '#00AAFF';
        ctx.fillRect(10, 1, 3, 3);

        // Legs (Standing)
        ctx.fillStyle = '#E8E8E8';
        ctx.fillRect(6, 16, 3, 6);
        ctx.fillRect(9, 16, 3, 6);
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(4, 20, 4, 3);
        ctx.fillRect(7, 20, 4, 3);

        // Machine Gun
        ctx.fillStyle = '#555555';
        ctx.fillRect(10, 8, 8, 4);
        ctx.fillStyle = '#333333';
        ctx.fillRect(18, 9, 6, 2);

        ctx.restore();
    },
};
