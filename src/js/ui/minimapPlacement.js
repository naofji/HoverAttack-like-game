// ============================================
// minimapPlacement - ミニマップの置き場所（左上＞左下＞右上＞右下）を選ぶ純関数
// ============================================
//
// canvas を一切使わないのは、node --test で直接テストするため
// （このリポジトリの方針: 純ロジックは utils/ や単独モジュールに切り出す）。

/**
 * 四隅の候補から、自機・クロスヘアのどちらとも重ならない最初の候補を選ぶ。
 * どの候補も塞がっていたら、最優先の「左上」にフォールバックする
 * （表示しないという選択肢は無いため、既定位置に戻すのが一番驚きが少ない）。
 *
 * @param {object} opts
 * @param {number} opts.canvasW
 * @param {number} opts.canvasH
 * @param {number} opts.mapW ミニマップの幅
 * @param {number} opts.mapH ミニマップの高さ
 * @param {number} opts.margin 画面端／HUD帯からの余白
 * @param {number} opts.hudTop 上部 HUD 帯の高さ（この分だけ内側に入れる）
 * @param {number} opts.hudBottom 下部 HUD 帯の高さ
 * @param {Array<{x:number,y:number}>} opts.avoid 避けたい点（自機・クロスヘアなど）
 * @returns {{x:number,y:number}} ミニマップ左上のスクリーン座標
 */
export function pickMiniMapCorner({ canvasW, canvasH, mapW, mapH, margin, hudTop, hudBottom, avoid = [] }) {
    const topY = hudTop + margin;
    const bottomY = canvasH - hudBottom - margin - mapH;
    const leftX = margin;
    const rightX = canvasW - margin - mapW;

    // 優先順位どおりに並べる: 左上 ＞ 左下 ＞ 右上 ＞ 右下
    const candidates = [
        { x: leftX, y: topY },
        { x: leftX, y: bottomY },
        { x: rightX, y: topY },
        { x: rightX, y: bottomY },
    ];

    const containsPoint = (rect, p) =>
        p.x >= rect.x && p.x <= rect.x + mapW && p.y >= rect.y && p.y <= rect.y + mapH;

    for (const c of candidates) {
        const blocked = avoid.some((p) => p && containsPoint(c, p));
        if (!blocked) return c;
    }

    // 四隅すべて塞がっていた場合のフォールバック（左上）
    return candidates[0];
}
