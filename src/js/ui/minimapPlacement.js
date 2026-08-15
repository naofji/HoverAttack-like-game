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
 * 「カーソル（クロスヘア）がいる側とは反対側の隅」を選ぶ純関数。
 * 左右・上下を画面の中心線で独立に決め、境目には不感帯（ヒステリシス）を置く。
 *
 * pickMiniMapCorner / pickCornerFromPositions（固定優先順位: 左上＞左下＞右上＞右下）
 * との違いはここ: あちらは avoid と重ならない最初の候補を毎フレーム選び直すため、
 * カーソルが画面中央付近を横切るたびにミニマップが隅を往復してしまう。
 *
 * **初版（対角2隅しか使えなかった実装）について。**
 * 最初は「今の隅にカーソルが乗ったら動く。動き先はカーソルから最も遠い隅」と
 * していた。これは実機で「右上に来ることが1度もない」と指摘され、実際に
 * 4000回の走査で topLeft と bottomRight にしか行かないことを確認した。
 * 理由は構造的なもので、動く条件が「カーソルが**今の隅**に乗ること」なので、
 * そのとき最も遠い隅は**必ず対角**になる。結果 topLeft→bottomRight→topLeft…
 * という閉じたループから出られず、残る2隅は理論上到達不能だった。
 *
 * そこで「動く条件」と「動き先」を同じ1つの基準（カーソルがどちら側にいるか）に
 * まとめた。左右と上下を別々に見るので、カーソルの位置に応じて4隅すべてが出る。
 *
 * 往復しない理由は、基準が「今の隅」ではなく画面の中心線になったことと、
 * 中心線の前後に不感帯を置いたこと。カーソルが中心付近で揺れても側は変わらない
 * （不感帯を出るには横 spanX*hysteresis、縦 spanY*hysteresis ぶん離れる必要がある）。
 *
 * 自機（ドッキング中は母艦）と重なる隅は避ける。裏返す順は「上下 → 左右 → 両方」。
 * カーソルとの左右関係のほうが体感で効くので、まず上下だけを裏返して左右を保つ。
 *
 * @param {{topLeft, bottomLeft, topRight, bottomRight}} positions miniMapCornerPositions() の戻り値
 * @param {number} mapW ミニマップの幅
 * @param {number} mapH ミニマップの高さ
 * @param {string|null} currentCorner 今表示している隅。無ければ（初回など）null→左上扱い
 * @param {{x:number,y:number}|null} unitPoint 自機（またはドッキング中の母艦）の画面座標
 * @param {{x:number,y:number}|null} crosshairPoint クロスヘアの画面座標
 * @param {number} [padding] クロスヘアの当たり判定にだけ足す余白
 * @param {number} [hysteresis] 中心線の不感帯。隅と隅の間隔に対する比
 * @returns {{x:number,y:number,corner:string}}
 */
export function pickStickyMiniMapCorner({ positions, mapW, mapH, currentCorner = null, unitPoint = null, crosshairPoint = null, padding = 0, hysteresis = 0.15 }) {
    const overlaps = (rect, p, pad) =>
        !!p && p.x >= rect.x - pad && p.x <= rect.x + mapW + pad && p.y >= rect.y - pad && p.y <= rect.y + mapH + pad;

    const blockedByUnit = (name) => overlaps(positions[name], unitPoint, 0);
    const blockedByCrosshair = (name) => overlaps(positions[name], crosshairPoint, padding);

    const current = CORNER_NAMES.includes(currentCorner) ? currentCorner : 'topLeft';
    let side = current.endsWith('Left') ? 'left' : 'right';
    let half = current.startsWith('top') ? 'top' : 'bottom';

    // 表示領域（HUD帯を除く）の中心。positions から逆算できるので引数を増やさない。
    // 左右: leftX と rightX の中点にミニマップ幅の半分を足すと画面中央になる
    const centerX = (positions.topLeft.x + positions.topRight.x + mapW) / 2;
    const centerY = (positions.topLeft.y + positions.bottomLeft.y + mapH) / 2;
    // 不感帯は隅と隅の間隔に比例させる。画面サイズや HUD の高さが変わっても
    // 「中心付近では動かない」の体感が変わらないようにするため
    const deadX = Math.abs(positions.topRight.x - positions.topLeft.x) * hysteresis;
    const deadY = Math.abs(positions.bottomLeft.y - positions.topLeft.y) * hysteresis;

    if (crosshairPoint) {
        // 不感帯の中では今の側を保つ（＝往復しない）
        if (crosshairPoint.x > centerX + deadX) side = 'left';
        else if (crosshairPoint.x < centerX - deadX) side = 'right';
        if (crosshairPoint.y > centerY + deadY) half = 'top';
        else if (crosshairPoint.y < centerY - deadY) half = 'bottom';
    }

    const nameOf = (v, h) => v + (h === 'left' ? 'Left' : 'Right');
    const otherV = half === 'top' ? 'bottom' : 'top';
    const otherH = side === 'left' ? 'right' : 'left';
    // 裏返す順: そのまま → 上下 → 左右 → 両方
    const order = [
        nameOf(half, side),
        nameOf(otherV, side),
        nameOf(half, otherH),
        nameOf(otherV, otherH),
    ];

    const best = order.find((n) => !blockedByUnit(n) && !blockedByCrosshair(n))
        ?? order.find((n) => !blockedByUnit(n))
        ?? order[0];
    return { ...positions[best], corner: best };
}
