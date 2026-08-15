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
 * 四隅の候補（miniMapCornerPositions() の戻り値）から、自機・クロスヘアの
 * どちらとも重ならない最初の候補を選ぶ。座標の計算そのものは含まない
 * （呼び出し側が既に positions を持っているとき、pickMiniMapCorner を経由すると
 * miniMapCornerPositions が二重に呼ばれてしまうため、ここを分けて共用できるようにした）。
 *
 * どの候補も塞がっていたら、最優先の「左上」にフォールバックする
 * （表示しないという選択肢は無いため、既定位置に戻すのが一番驚きが少ない）。
 *
 * @param {{topLeft, bottomLeft, topRight, bottomRight}} positions miniMapCornerPositions() の戻り値
 * @param {number} mapW ミニマップの幅
 * @param {number} mapH ミニマップの高さ
 * @param {Array<{x:number,y:number}>} avoid 避けたい点（自機・クロスヘアなど）
 * @param {number} [padding] 矩形の当たり判定に足す余白。実際に重なってから
 *   動くと手遅れなので、これを渡すと少し手前で反応するようになる
 * @returns {{x:number,y:number,corner:string}} ミニマップ左上のスクリーン座標と隅の名前
 */
export function pickCornerFromPositions(positions, mapW, mapH, avoid = [], padding = 0) {
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

/**
 * 四隅の候補から、自機・クロスヘアのどちらとも重ならない最初の候補を選ぶ。
 * 座標だけが欲しい呼び出し側は、position を先に計算して pickCornerFromPositions を
 * 直接使うほうがよい（このリポジトリでは ScreenRenderer.drawMiniMap がそう）。
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
    return pickCornerFromPositions(positions, mapW, mapH, avoid, padding);
}

const CORNER_NAMES = ['topLeft', 'bottomLeft', 'topRight', 'bottomRight'];

/**
 * 「動く理由があるときだけ動く。動くときはカーソル（クロスヘア）から
 * 最も遠い隅へ」というルールでミニマップの隅を選ぶ純関数。
 *
 * pickMiniMapCorner / pickCornerFromPositions（固定優先順位: 左上＞左下＞右上＞右下）
 * との違いはここ: あちらは avoid と重ならない最初の候補を毎フレーム選び直すため、
 * カーソルが画面中央付近を横切るたびにミニマップが隅を往復してしまう
 * （フェードを入れても、往復自体は止まらず落ち着かない）。
 * こちらは「今の隅がまだ許容できるなら動かない」を先に見るので、
 * カーソルがどちらに動いてもミニマップは基本的に動かない。
 *
 * 許容できる、の定義（ユーザー要望どおり2種類を分けている）:
 *   - 自機（ドッキング中は母艦）と重なっていない（padding 無し＝実際に重なったら即アウト）
 *   - クロスヘアが余白(padding)の外にある（余白ぶん手前で反応させたいので、
 *     クロスヘアだけ padding つきの当たり判定にする）
 *
 * 動く理由があるとき（＝今の隅が許容できない）は、次の順で選ぶ:
 *   1. 自機と重ならない隅の中で、クロスヘアから最も遠い隅
 *   2. （自機と重ならない隅が無ければ）自機の条件は諦めて、クロスヘアから最も遠い隅
 *
 * 距離は「隅の矩形の中心」とクロスヘアの距離で決める。矩形のどの点を基準にしても
 * 大差は無く、中心が一番実装・説明ともに単純だったのでこれを採用した
 * （角を基準にすると隅によって縦横比の効き方が変わり、直感と合わない結果になりうる）。
 *
 * @param {{topLeft, bottomLeft, topRight, bottomRight}} positions miniMapCornerPositions() の戻り値
 * @param {number} mapW ミニマップの幅
 * @param {number} mapH ミニマップの高さ
 * @param {string|null} currentCorner 今表示している隅。無ければ（初回など）null
 * @param {{x:number,y:number}|null} unitPoint 自機（またはドッキング中の母艦）の画面座標
 * @param {{x:number,y:number}|null} crosshairPoint クロスヘアの画面座標
 * @param {number} [padding] クロスヘアの当たり判定にだけ足す余白
 * @returns {{x:number,y:number,corner:string}}
 */
export function pickStickyMiniMapCorner({ positions, mapW, mapH, currentCorner = null, unitPoint = null, crosshairPoint = null, padding = 0 }) {
    const overlaps = (rect, p, pad) =>
        !!p && p.x >= rect.x - pad && p.x <= rect.x + mapW + pad && p.y >= rect.y - pad && p.y <= rect.y + mapH + pad;

    const blockedByUnit = (name) => overlaps(positions[name], unitPoint, 0);
    const blockedByCrosshair = (name) => overlaps(positions[name], crosshairPoint, padding);
    const isAcceptable = (name) => !blockedByUnit(name) && !blockedByCrosshair(name);

    // ルール1: 今の隅がまだ許容できるなら、そのまま留まる（往復させないための本体）
    if (currentCorner && isAcceptable(currentCorner)) {
        return { ...positions[currentCorner], corner: currentCorner };
    }

    // クロスヘアから遠い順に並べる（矩形中心との距離。平方根は順序に無関係なので省く）
    const distSqToCrosshair = (name) => {
        if (!crosshairPoint) return 0;
        const rect = positions[name];
        const cx = rect.x + mapW / 2;
        const cy = rect.y + mapH / 2;
        const dx = cx - crosshairPoint.x;
        const dy = cy - crosshairPoint.y;
        return dx * dx + dy * dy;
    };
    const byFarthestFirst = [...CORNER_NAMES].sort((a, b) => distSqToCrosshair(b) - distSqToCrosshair(a));

    // ルール2: 自機と重ならない隅の中で最遠のもの
    const candidate = byFarthestFirst.find((name) => !blockedByUnit(name));
    if (candidate) return { ...positions[candidate], corner: candidate };

    // ルール3: 自機と重ならない隅が無い＝自機の条件は諦めて、最遠の隅にフォールバック
    const fallback = byFarthestFirst[0];
    return { ...positions[fallback], corner: fallback };
}
