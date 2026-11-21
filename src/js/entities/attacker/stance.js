// ============================================
// EnemyAttacker - しゃがんでいるか
// ============================================
//
// 描画・脚・破片・噴射口の位置が同じ答えを読むための1か所。
// 以前は5か所に `crouching || burstCount > 0` を書いていた。連射（burstCount）は
// artillery しか使っていなかったのでそれで正しかったが、MG 持ちの standard も
// 同じ連射の仕組みを使うようになり、連射中にしゃがんでしまった。しゃがむのは
// artillery の「腰を落として撃つ」姿勢で、MG 持ちは立ったまま撃つ。
//
// 破片の生成（debris/attackerParts.js）が素のオブジェクトでも呼べるよう、
// prototype のメソッドではなく関数にしてある。

export function isCrouched(a) {
    return a.crouching || (a.burstCount > 0 && a.weapon !== 'mg');
}

/** しゃがみ（artillery の腰を落として撃つ姿勢）で体を下げる量（px）。 */
export const CROUCH_BODY_DROP = 4;
/**
 * ローラーダッシュ中に体を下げる量（px）。「若干かがむ」（実機の指摘 2026-11-22）なので
 * しゃがみの半分。足の接地位置は変えない（legs.js が股関節を同じだけ上げて相殺する）
 */
export const ROLLER_BODY_DROP = 2;

/**
 * 体を下へずらす量。描画（draw.js）と破片（debris/attackerParts.js）が同じ答えを読む。
 * 脚の形（しゃがみの股を開く形か）はこの量からではなく isCrouched から選ぶこと ──
 * 滑走中の 2px で、しゃがみの脚に切り替わってしまうため。
 * 素のオブジェクトでも呼べるよう rollerPhase を直接見る（isRollerDashing は prototype のもの）
 */
export function bodyDrop(a) {
    if (isCrouched(a)) return CROUCH_BODY_DROP;
    return a.rollerPhase != null ? ROLLER_BODY_DROP : 0;
}
