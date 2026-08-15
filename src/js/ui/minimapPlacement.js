// ============================================
// minimapPlacement - ミニマップの置き場所（左上＞左下＞右上＞右下）を選ぶ純関数
// ============================================
//
// canvas を一切使わないのは、node --test で直接テストするため
// （このリポジトリの方針: 純ロジックは utils/ や単独モジュールに切り出す）。

/**
 * 四隅それぞれの左上スクリーン座標を計算するだけの関数。
 * pickMiniMapCorner が内部で使うほか、ScreenRenderer が「現在表示中の隅」
 * （= 遷移の fade 中は desired とは限らない）の座標を引くのにも使う。
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
 * @param {number} [opts.padding] 矩形の当たり判定に足す余白。実際に重なってから
 *   動くと手遅れなので、これを渡すと少し手前で反応するようになる
 * @returns {{x:number,y:number,corner:string}} ミニマップ左上のスクリーン座標と隅の名前
 */
export function pickMiniMapCorner({ canvasW, canvasH, mapW, mapH, margin, hudTop, hudBottom, avoid = [], padding = 0 }) {
    const positions = miniMapCornerPositions({ canvasW, canvasH, mapW, mapH, margin, hudTop, hudBottom });

    // 優先順位どおりに並べる: 左上 ＞ 左下 ＞ 右上 ＞ 右下
    const order = ['topLeft', 'bottomLeft', 'topRight', 'bottomRight'];

    const containsPoint = (rect, p) =>
        p.x >= rect.x - padding && p.x <= rect.x + mapW + padding &&
        p.y >= rect.y - padding && p.y <= rect.y + mapH + padding;

    for (const name of order) {
        const rect = positions[name];
        const blocked = avoid.some((p) => p && containsPoint(rect, p));
        if (!blocked) return { ...rect, corner: name };
    }

    // 四隅すべて塞がっていた場合のフォールバック（左上）
    return { ...positions.topLeft, corner: 'topLeft' };
}
