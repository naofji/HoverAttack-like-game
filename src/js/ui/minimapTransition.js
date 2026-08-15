// ============================================
// minimapTransition - ミニマップの隅の切り替えを「消える→切り替わる→現れる」で
// つなぐ純関数。canvas を一切使わないのは、node --test で直接テストするため。
// ============================================
//
// 以前は望ましい隅（desired）が変わった瞬間に corner をその場で差し替えていて、
// マップが動くたびにミニマップがパッと別の隅へ飛んで見えた。ここでは
// 「今の隅のままフェードアウト → 0 になった時点で切り替え → フェードイン」の
// 3段にすることで、切り替わりが唐突に見えないようにする。

/**
 * @param {{corner: string, fade: number, phase: 'idle'|'out'|'in'}} state 今の状態
 * @param {string} desired いま望ましい隅
 * @param {number} speed 1フレームあたりのフェード量
 * @returns {{corner: string, fade: number, phase: 'idle'|'out'|'in'}} 次の状態（引数は書き換えない）
 */
export function advanceMiniMapTransition(state, desired, speed) {
    const { corner, fade } = state;

    if (desired === corner) {
        // 望みどおりの隅にいる（またはフェードアウトを始める前に desired が
        // 元へ戻った）。何もしていないときは完全に見えているのが自然なので、
        // fade を 1 へ戻す。
        const nextFade = Math.min(1, fade + speed);
        return { corner, fade: nextFade, phase: nextFade >= 1 ? 'idle' : 'in' };
    }

    // 望ましい隅が変わった → まず今の隅のままフェードアウトする。
    // ここで corner を変えないのが肝心（重なってから切り替わるのを防ぐため）。
    const nextFade = Math.max(0, fade - speed);
    if (nextFade <= 0) {
        // 0 に達した瞬間、その時点の最新の desired に切り替えてフェードインを始める。
        // （引数の desired は毎フレーム呼び出し側が渡し直すので、途中で desired が
        // 何度変わっても、ここで使われるのは常に最新の値になる）
        return { corner: desired, fade: 0, phase: 'in' };
    }
    return { corner, fade: nextFade, phase: 'out' };
}
