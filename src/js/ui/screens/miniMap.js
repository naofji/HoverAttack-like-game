// ============================================
// MiniMap
// ============================================
//
// プレイ中に M キーで出るミニマップ。Map 側が焼いたキャッシュを縮小して敷き、
// その上に自機・母艦・敵を点で重ねる。
//
// **ScreenRenderer.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は ScreenRenderer を指す。関数化して renderer を第一引数に
// 取る形にしなかったのは、テストが `new ScreenRenderer(game)` して
// `renderer.drawMiniMap(ctx)` と呼んでいるため（ui/flows/settingsFlow.js と同じ理由）。

import {
    TILE_SIZE, MINIMAP_ALPHA, MINIMAP_MARGIN, HUD_TOP_HEIGHT, HUD_BOTTOM_HEIGHT,
    MINIMAP_MAX_WIDTH_RATIO, MINIMAP_FADE_SPEED, MINIMAP_AVOID_PADDING,
    MINIMAP_SIDE_HYSTERESIS, MINIMAP_AVOID_PADDING_UNIT,
    MINIMAP_VIEWPORT_HIGHLIGHT, COLOR_MINIMAP_VIEWPORT,
} from '../../utils/Constants.js';
import { pickStickyMiniMapCorner, miniMapCornerPositions } from '../minimapPlacement.js';
import { advanceMiniMapTransition } from '../minimapTransition.js';
import { crosshairScreenPos } from '../Crosshair.js';
import { UI, glow } from '../theme.js';

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

        // 表示位置は「操作している側」（ドッキング中でなければ自機、そうでなければ母艦）と
        // クロスヘアを避ける。母艦の方向矢印（HUD.drawCarrierArrow）はミニマップより
        // 上の面に描くようになったため、もう避ける必要が無い（重なっても矢印側が
        // 前面に出るので位置の問題が起きない）。
        // 自機／母艦とクロスヘアは性質が違うので別々に持つ:
        //   - 自機／母艦: 余白(MINIMAP_AVOID_PADDING_UNIT)の外にあれば OK。
        //     クロスヘアより大きく取るのは、隅の切り替えがフェードを挟むぶん
        //     早く動き始めないと、動いている最中に重なってしまうため
        //   - クロスヘア: 余白(MINIMAP_AVOID_PADDING)の外にあれば OK
        // （詳しくは pickStickyMiniMapCorner のコメント）
        // どちらを操作中かで避けるべき対象が変わるため、両方は見ずに操作している方だけを見る。
        let unitPoint = null;
        if (game.player && game.player.alive && !game.player.docked) {
            unitPoint = { x: game.player.x + game.player.width / 2 - game.camera.x, y: game.player.y + game.player.height / 2 - game.camera.y };
        } else if (game.carrier && game.carrier.alive) {
            unitPoint = { x: game.carrier.x + game.carrier.width / 2 - game.camera.x, y: game.carrier.y + game.carrier.height / 2 - game.camera.y };
        }
        // クロスヘアは「実際に描かれる位置」と一致させる必要があるため、Crosshair.draw() と
        // 共有の関数を呼ぶ（計算を二重に持つと避ける位置と描画位置がずれる）。
        const crosshairPoint = crosshairScreenPos(game);

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

        // 四隅の座標は先に1回だけ求めて、避ける隅を選ぶのにも実際に描く座標を
        // 引くのにも使い回す（以前は pickMiniMapCorner の内部と、直後の座標取得とで
        // 同じ引数の miniMapCornerPositions を2回呼んでいた）。
        // mapW/mapH には「実際に見える大きさ」＝縮小後の値を渡すこと。ここを
        // 元サイズのままにすると、置き場所の当たり判定が見た目とずれる。
        const positions = miniMapCornerPositions({
            canvasW: w,
            canvasH: h,
            mapW: destW,
            mapH: destH,
            margin: MINIMAP_MARGIN,
            hudTop: HUD_TOP_HEIGHT,
            hudBottom: HUD_BOTTOM_HEIGHT,
        });
        // 「カーソルがいる側の反対側」ルールで隅を選ぶ（詳しくは pickStickyMiniMapCorner）。
        // 「今の隅」は miniMapTransition.corner にある。まだ何も無い（初回描画）ときは
        // 'topLeft' を仮の今の隅として渡す。中心線の不感帯の中にカーソルがいるときは
        // 「今の隅」がそのまま答えになるので、初回の既定値がそこで効く
        // （＝画面中央にカーソルがある状態で開いたら左上に出る、という従来の見た目）。
        const currentCorner = this.miniMapTransition ? this.miniMapTransition.corner : 'topLeft';
        const desired = pickStickyMiniMapCorner({
            positions, mapW: destW, mapH: destH,
            currentCorner, unitPoint, crosshairPoint,
            padding: MINIMAP_AVOID_PADDING,
            unitPadding: MINIMAP_AVOID_PADDING_UNIT,
            hysteresis: MINIMAP_SIDE_HYSTERESIS,
        });

        // 隅の切り替えをフェードでつなぐ。初回描画（このインスタンスでまだ何も
        // 選んでいない）は、望ましい隅をそのまま完全に見える状態で採用する
        // （開いた瞬間に一度フェードインさせる必要は無い＝0.85→0.55等と同じ独立した
        // 開閉フェードは game.miniMapAlpha が別に受け持っている）。
        if (!this.miniMapTransition) {
            this.miniMapTransition = { corner: desired.corner, fade: 1, phase: 'idle' };
        } else {
            this.miniMapTransition = advanceMiniMapTransition(this.miniMapTransition, desired.corner, MINIMAP_FADE_SPEED);
        }

        const { x: mmX, y: mmY } = positions[this.miniMapTransition.corner];

        const alpha = game.miniMapAlpha || 0;

        ctx.save();
        // 最終的な濃さは3つの独立したフェードの積: 地形の上に重ねる基本濃度 ×
        // 開閉フェード(miniMapAlpha) × 隅の切り替えフェード(transition.fade)
        ctx.globalAlpha = MINIMAP_ALPHA * alpha * this.miniMapTransition.fade;

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
            ctx.globalAlpha = MINIMAP_VIEWPORT_HIGHLIGHT * alpha * this.miniMapTransition.fade;
            ctx.fillStyle = COLOR_MINIMAP_VIEWPORT;
            ctx.fillRect(clipX, clipY, clipW, clipH);
        }

        // 点（自機・敵・母艦）は地形と別に、開閉フェードと隅の切り替えフェードだけを
        // 掛け直す。MINIMAP_ALPHA（地形を背景に沈めるための値）は点には掛けない。
        // 点は「今どこにいるか」を読むための情報であって背景ではないので、地形と
        // 同じだけ薄めると一番目を引くはずの自機・敵の位置が読みにくくなる。
        // 掛け直さず 1.0 に固定していた版は、隅の切り替え中に点だけフルオパシティの
        // まま瞬間移動して見える不具合になっていた。
        ctx.globalAlpha = alpha * this.miniMapTransition.fade;

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
