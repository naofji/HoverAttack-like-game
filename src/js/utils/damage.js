// ============================================
// 被弾の共通処理
// ============================================

/**
 * 敵機の標準的な被弾。HP を削り、火花を散らし、0 以下になったら die() を呼ぶ。
 *
 * アタッカー・ドローン・タンク・砲台の4クラスがこの7行を1文字違わず
 * 持っていた。これらは共通の親を持たない（構造も動き方もばらばらな）
 * クラスなので、継承ではなく関数に切り出して各クラスから委譲する。
 *
 * 火花は HP が尽きる一撃でも散らす。撃破の瞬間に被弾の手応えが消えると、
 * 当たったのか当たっていないのか分からなくなるため。
 *
 * 敵基地はこの形に当てはまらない（シールドを先に削り、被弾が増援の
 * 呼び出しを兼ねる）ので、自前の takeDamage を持っている。
 *
 * @param {{alive:boolean, hp:number, x:number, y:number, width:number,
 *          height:number, game:object, die:Function}} entity
 * @param {number} amount 与ダメージ
 */
export function applyDamage(entity, amount) {
    if (!entity.alive) return;

    entity.hp -= amount;
    entity.game.spawnSparks(
        entity.x + entity.width / 2,
        entity.y + entity.height / 2,
    );

    if (entity.hp <= 0) entity.die();
}
