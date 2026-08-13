// ============================================
// holdKey - 1つのキーでタップと長押しを見分ける
// ============================================
//
// 長押しは押した瞬間から始まるので、「押した瞬間にタップの動作をする」作りとは
// 同居できない — 長押しのたびにタップの動作も道連れになる。タップを**離した
// ときに**確定させることでこれを解く。代償はタップの確定が数フレーム遅れること。
//
// ゲームも DOM も要らない純ロジックなので utils に置いてある（mgReload.js と
// 同じ立ち位置）。状態は呼び出し側が持ち、ここは新しい状態を返すだけにして、
// 同じ仕組みを他のキーにも使えるようにしてある。

/** 押していない状態。呼び出し側の初期値。 */
export function initialHoldState() {
    return { heldMs: 0, fired: false };
}

/**
 * 1フレーム進める。
 *
 * @param {{heldMs: number, fired: boolean}} [state] 前フレームの状態
 * @param {boolean} down 今このフレームに押されているか
 * @param {number} deltaMs 実経過ミリ秒
 * @param {number} thresholdMs これ以上押し続けたら長押し
 * @returns {{state: object, tap: boolean, hold: boolean}}
 *   tap  … 離した瞬間で、長押しに達していなかった
 *   hold … しきい値を跨いだそのフレーム（押しっぱなしでも1回だけ）
 */
export function stepHoldKey(state, down, deltaMs, thresholdMs) {
    const prev = state ?? initialHoldState();

    if (!down) {
        // 離した。長押しが発火済みならタップにはしない（長押しのつもりだったので）
        return { state: initialHoldState(), tap: prev.heldMs > 0 && !prev.fired, hold: false };
    }

    // ここは utils の純ロジックで、呼び出し側が deltaMs をクランプしてくる保証はない
    // （現状の main.js の loop() は 50ms で上限を切っているが、それはこの関数の
    // 契約ではない）。自分の入力は自分で守る。負の値だけ弾いておけば十分で、
    // 上限を設けると「長押ししたのに反応しない」ほうの事故になる
    const heldMs = prev.heldMs + Math.max(0, deltaMs);
    // 発火は跨いだ1フレームだけ。毎フレーム発火させると、しきい値ごとに
    // 解除と再開を往復してしまう
    const hold = !prev.fired && heldMs >= thresholdMs;
    return { state: { heldMs, fired: prev.fired || hold }, tap: false, hold };
}
