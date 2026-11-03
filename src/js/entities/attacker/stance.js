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
