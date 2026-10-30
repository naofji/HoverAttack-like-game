import { PickupItem, ITEM_SIZE } from './PickupItem.js';
import { audioManager } from '../audio/AudioManager.js';

/**
 * 7面の要塞のお宝にだけ入る残機アイテム。拾った瞬間に自機の残機が 1 増える（キットのように手元に残らない）。
 *
 * 見た目（ユーザー判断「自機ロボットを彷彿とさせる形と色、ただし光り輝く感じ」）:
 * 他のアイテムの色は 緑＝リペア、赤＝ミサイル、橙＝Auto Aim、金＝オーバードライブで埋まっているので、
 * 自機のバイザーの青（#00AAFF）を本体の地にする。そこへ自機の配色（銀の体・頭、青いバイザー、
 * 橙のバックパック）を縮めて載せ、角に星を瞬かせて「光る」ことを足した。
 * マゼンタは目立つが自機を思わせないので採らなかった。
 */
export class ExtraLifeKit extends PickupItem {
    onPickup(player) {
        player.gainLife();
    }

    /** 共通の拾得音（3音の短いチャイム）に重ねると濁るので、専用の音だけを鳴らす */
    playPickupSound() {
        audioManager.playExtraLife();
    }

    // 他の3種より少し速く脈打たせる。稀少で、見落とされたくない
    get pulseSpeed() { return 0.14; }

    get glowColor() { return '#66E0FF'; }

    bodyColor(pulse) {
        // 脈打つほど白く近づく青。暗い側でも自機の銀が読める明るさを保つ
        const lift = Math.floor(pulse * 70);
        return `rgb(${20 + lift}, ${130 + lift}, 235)`;
    }

    draw(ctx) {
        if (!this.alive) return;
        super.draw(ctx);
        this._drawSparkles(ctx);
    }

    /** 自機ロボットを 16px の中に縮めた絵（Player._drawBody と同じ配色・同じ並び） */
    drawIcon(ctx, x, y) {
        // バックパック（奥）
        ctx.fillStyle = '#AAAAAA';
        ctx.fillRect(x + 3, y + 6, 2, 5);
        ctx.fillStyle = '#FF6600';
        ctx.fillRect(x + 3, y + 10, 2, 2);
        // 体と頭
        ctx.fillStyle = '#E8E8E8';
        ctx.fillRect(x + 5, y + 6, 6, 6);
        ctx.fillStyle = '#CCCCCC';
        ctx.fillRect(x + 5, y + 2, 6, 4);
        // バイザー（地の青より濃くして、銀の頭の上で読めるようにする）
        ctx.fillStyle = '#0077CC';
        ctx.fillRect(x + 8, y + 3, 2, 2);
        // 脚
        ctx.fillStyle = '#DDDDDD';
        ctx.fillRect(x + 5, y + 12, 2, 3);
        ctx.fillRect(x + 9, y + 12, 2, 3);
    }

    /**
     * 四隅の星。位相をずらした2つが交互に瞬く（同時に光ると点滅に見える）。
     * 星は十字の細い線で、グローは短い。本体の発光と同じ青で揃える。
     */
    _drawSparkles(ctx) {
        const x = Math.round(this.x);
        const y = Math.round(this.y);
        ctx.save();
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#66E0FF';
        ctx.fillStyle = '#FFFFFF';
        const stars = [[x + ITEM_SIZE - 2, y + 1, 0], [x + 1, y + ITEM_SIZE - 3, Math.PI]];
        for (const [sx, sy, phase] of stars) {
            const s = Math.max(0, Math.sin(this.frameCounter * 0.12 + phase)) * 4;
            if (s < 0.5) continue;
            ctx.fillRect(sx - s, sy, s * 2 + 1, 1);
            ctx.fillRect(sx, sy - s, 1, s * 2 + 1);
        }
        ctx.restore();
    }
}
