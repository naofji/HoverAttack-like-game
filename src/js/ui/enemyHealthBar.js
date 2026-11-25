// ============================================
// 敵のダメージバー（機体の右上に吹き出しの線つきで出す小さなバー）
// ============================================
//
// main.js から切り出した（2026-11-25、中身は動かしただけ）。どの敵に出すか・描く順番は
// main._drawWorld が決める（前景の建物より後＝最前面）。ここは1本の絵だけ。
//
// AutoAim.js と同じく **Object.assign で Game に混ぜる前提**の
// オブジェクトリテラルで、`this` は Game を指す。

export const EnemyHealthBar = {
    /** Draw HP bar only if the entity exists and is damaged */
    _drawHpBarIfDamaged(ctx, entity) {
        if (!entity || entity.hp === undefined || entity.maxHp === undefined) return;
        if (!entity.alive || entity.hp >= entity.maxHp) return;
        this._drawEnemyHealthBar(ctx, entity);
    },

    /** Draw a small callout health bar above an entity */
    _drawEnemyHealthBar(ctx, enemy) {
        if (enemy.hp <= 0) return;
        const hpRatio = enemy.hp / enemy.maxHp;

        ctx.save();
        ctx.translate(enemy.x + enemy.width - 4, enemy.y - 4);

        // Callout line: diagonal → horizontal
        ctx.strokeStyle = '#888888';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(8, -8);
        ctx.lineTo(24, -8);
        ctx.stroke();

        // HP gauge
        const barW = 16, barH = 3, bx = 8, by = -12;
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = '#00FF00';
        ctx.fillRect(bx, by, barW * hpRatio, barH);

        ctx.restore();
    },
};
