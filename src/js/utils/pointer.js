// ============================================
// マウス座標の変換
// ============================================

/** 値を lo〜hi に収める */
function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

/**
 * ブラウザの client 座標を canvas の内部座標に直す。
 *
 * canvas は内部解像度 1024x768 のまま CSS で拡大表示しているので、
 * rect の実寸で割り戻さないと照準が倍率のぶんズレる。
 *
 * さらに canvas の範囲へクランプしている。リスナを window に付けたため
 * 黒帯やブラウザ UI の上でも座標が来るが、そこで照準を画面外へ飛ばすと
 * 敵に当たらなくなる。端に張り付かせるほうが操作として素直。
 *
 * @param {{left:number,top:number,width:number,height:number}} rect getBoundingClientRect() 相当
 * @param {number} canvasW canvas.width
 * @param {number} canvasH canvas.height
 * @param {number} clientX MouseEvent.clientX
 * @param {number} clientY MouseEvent.clientY
 * @returns {{x:number,y:number}} canvas 内部座標（0..canvasW-1 / 0..canvasH-1）
 */
export function canvasPointer(rect, canvasW, canvasH, clientX, clientY) {
    // 非表示中などで rect が潰れていると 0 除算で NaN になり、
    // 以降ずっと照準が壊れたままになる。この場合は原点に張り付かせる。
    if (rect.width <= 0 || rect.height <= 0) {
        return { x: 0, y: 0 };
    }

    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;

    return {
        x: clamp((clientX - rect.left) * scaleX, 0, canvasW - 1),
        y: clamp((clientY - rect.top) * scaleY, 0, canvasH - 1)
    };
}
