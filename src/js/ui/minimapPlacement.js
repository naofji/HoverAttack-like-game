// ============================================
// minimapPlacement - ミニマップの置き場所（四隅の座標と、Tab で回す順番）の純関数
// ============================================
//
// canvas を一切使わないのは、node --test で直接テストするため
// （このリポジトリの方針: 純ロジックは utils/ や単独モジュールに切り出す）。
//
// 2026-11-07 まではここに「自機・クロスヘアを避けて隅を選ぶ」関数が3つ
// （固定優先順位の pickMiniMapCorner / pickCornerFromPositions と、カーソルの反対側を
// 選ぶ pickStickyMiniMapCorner）あった。「チラチラ動いて邪魔」という苦情で
// 自動移動ごと撤去し、置き場所はプレイヤーが Tab で選ぶ形にした
// （経緯は Constants.js の MINIMAP_CORNER_ORDER）。

import { MINIMAP_CORNER_ORDER } from '../utils/Constants.js';

/**
 * 四隅それぞれの左上スクリーン座標を計算するだけの関数。
 * ScreenRenderer が「現在表示中の隅」（= 遷移の fade 中は設定の隅とは限らない）の
 * 座標を引くのに使う。
 *
 * @param {object} opts
 * @param {number} opts.canvasW
 * @param {number} opts.canvasH
 * @param {number} opts.mapW ミニマップの幅
 * @param {number} opts.mapH ミニマップの高さ
 * @param {number} opts.margin 画面端／HUD帯からの余白
 * @param {number} opts.hudTop 上部 HUD 帯の高さ（この分だけ内側に入れる）
 * @param {number} opts.hudBottom 下部 HUD 帯の高さ
 * @returns {{topLeft, bottomLeft, topRight, bottomRight}} 各 {x,y}
 */
export function miniMapCornerPositions({ canvasW, canvasH, mapW, mapH, margin, hudTop, hudBottom }) {
    const topY = hudTop + margin;
    const bottomY = canvasH - hudBottom - margin - mapH;
    const leftX = margin;
    const rightX = canvasW - margin - mapW;
    return {
        topLeft: { x: leftX, y: topY },
        bottomLeft: { x: leftX, y: bottomY },
        topRight: { x: rightX, y: topY },
        bottomRight: { x: rightX, y: bottomY },
    };
}

/**
 * Tab を1回押したあとの隅。MINIMAP_CORNER_ORDER の次へ進み、最後の次は先頭へ戻る。
 * settings.js の stepSetting（choice は端で止まる）を使わないのは、ここは
 * 「押すたびに回る」もので、端で止まると右下から先へ動かせなくなるため。
 * 知らない値（壊れた保存値など）からは先頭（左上）へ。
 * @param {string} corner 今の隅
 * @returns {string}
 */
export function nextMiniMapCorner(corner) {
    const i = MINIMAP_CORNER_ORDER.indexOf(corner);
    if (i < 0) return MINIMAP_CORNER_ORDER[0];
    return MINIMAP_CORNER_ORDER[(i + 1) % MINIMAP_CORNER_ORDER.length];
}

/**
 * ミニマップの矩形に、操作中の機体の矩形かクロスヘアの点が掛かっているか。
 * 掛かっている間だけミニマップを薄くする（MINIMAP_OVERLAP_ALPHA）。
 * 機体を点ではなく矩形で見るのは、中心が外にあっても体の半分が下に隠れていると
 * 見づらさは同じだから。クロスヘアは狙う1点が見えればよいので点で見る。
 * 辺の上（ちょうど接している）は掛かっていない扱い。
 *
 * @param {{x:number,y:number,w:number,h:number}} rect ミニマップの矩形（スクリーン座標）
 * @param {{x:number,y:number,w:number,h:number}|null} unitRect 機体の矩形（スクリーン座標）
 * @param {{x:number,y:number}|null} point クロスヘアの点
 * @returns {boolean}
 */
export function miniMapOverlaps(rect, unitRect, point) {
    if (unitRect &&
        unitRect.x < rect.x + rect.w && unitRect.x + unitRect.w > rect.x &&
        unitRect.y < rect.y + rect.h && unitRect.y + unitRect.h > rect.y) {
        return true;
    }
    if (point &&
        point.x > rect.x && point.x < rect.x + rect.w &&
        point.y > rect.y && point.y < rect.y + rect.h) {
        return true;
    }
    return false;
}

/**
 * 重なりの倍率を1フレーム進める。重なっていれば low へ、いなければ 1 へ、speed ずつ近づく。
 * @param {number} current 今の倍率（low〜1）
 * @param {boolean} overlapping
 * @param {number} low 重なっている間の倍率（MINIMAP_OVERLAP_ALPHA）
 * @param {number} speed 1フレームの変化量（MINIMAP_OVERLAP_FADE_SPEED）
 * @returns {number}
 */
export function stepMiniMapOverlapFade(current, overlapping, low, speed) {
    return overlapping ? Math.max(low, current - speed) : Math.min(1, current + speed);
}
