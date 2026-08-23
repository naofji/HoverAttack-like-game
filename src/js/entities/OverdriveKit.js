import { OVERDRIVE_DURATION, OVERDRIVE_MAX_DURATION } from '../utils/Constants.js';
import { MissileKit } from './MissileKit.js';
import { ITEM_SIZE } from './PickupItem.js';
import { audioManager } from '../audio/AudioManager.js';

/**
 * オーバードライブキット。heavy が落とすミサイル補給の**レア版**。
 *
 * MissileKit を継承しているのは、満タン補給という土台がそのまま要るのと、
 * 同じ `game.missileKits` 配列に入れて拾得の判定・更新・描画をまるごと
 * 共用するため（配列を1本増やすと main.js の更新順に手を入れることになる）。
 * 足しているのは時限バフ1つと見た目だけ。
 *
 * 効果の中身は Player 側（consumeMissile / consumeMGRound）にある。
 */
export class OverdriveKit extends MissileKit {
    onPickup(player) {
        super.onPickup(player); // まず満タン。切れた後に弾が無いと詰む
        player.overdriveTimer = Math.min(
            player.overdriveTimer + OVERDRIVE_DURATION,
            OVERDRIVE_MAX_DURATION,
        );
        // バーの分母は「そのとき持っていた最大」。上限に固定すると1個拾った
        // だけではバーが半分しか溜まらず、損をしたように見える
        player.overdriveMaxTimer = Math.max(player.overdriveMaxTimer, player.overdriveTimer);
        // 拾得音（PickupItem 側）に重ねる「動力が上がった」合図。
        // 通常のキットと同じ音のままだと、レア版を拾ったことに気づかない
        audioManager.playWeapon('overdrive', this.x, this.y);
    }

    // 時間ものなので Auto Aim と同じ速さで急かす
    get pulseSpeed() { return 0.12; }

    get glowColor() { return '#FFDD22'; }

    bodyColor(pulse) {
        // 赤い通常キットに対して、金色。拾う前に遠目でも見分けられる
        const g = Math.floor(150 + pulse * 70);
        return `rgb(255, ${g}, 30)`;
    }

    /** 稲妻（電力の記号）。ミサイルの形とは別物だと一目で分かる。 */
    drawIcon(ctx, x, y, pulse) {
        const cx = x + ITEM_SIZE / 2;
        ctx.fillStyle = this.iconWhite(pulse);
        ctx.beginPath();
        ctx.moveTo(cx + 2, y + 2);
        ctx.lineTo(cx - 4, y + 9);
        ctx.lineTo(cx - 0.5, y + 9);
        ctx.lineTo(cx - 2, y + 14);
        ctx.lineTo(cx + 4, y + 7);
        ctx.lineTo(cx + 0.5, y + 7);
        ctx.fill();
    }
}
