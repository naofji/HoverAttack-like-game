// ============================================
// Auto Aim
// ============================================
//
// Auto Aim（拾うと一定時間、マウスに近い敵へ照準が吸い付く）の毎ティックの更新——
// 残り時間の減算、解除の判定、ロック対象の選び方、偏差射撃の着弾予定地点。main.js から切り出した。
// ひとまとまりの機能なのに main 本体の約130行を占めていて、ループの手順が読みにくかったため。
//
// 照準の状態（autoAimTarget / autoAimLeadPoint / autoAimLockedEnemy / aimLead）は
// Game の持ち物のまま main.js に置いている。ここは手順だけ。描画は ui/Crosshair.js。
//
// CombatActions.js と同じく **Object.assign で Game に混ぜる前提**の
// オブジェクトリテラルで、`this` は Game を指す。

import {
    AUTO_AIM_SNAP_RADIUS, AUTO_AIM_CANCEL_THRESHOLD_DEFAULT,
    AUTO_AIM_LEAD_MAX_TICKS, AUTO_AIM_LEAD_STRENGTH,
    MISSILE_SPEED, PLAYER_MG_SPEED,
} from '../utils/Constants.js';
import { predictLeadPoint } from '../utils/aimLead.js';
import { isEnemyConcealed } from '../utils/concealment.js';
import { sightScaleFor } from '../world/StageEnvironment.js';

export const AutoAim = {
    _updateAutoAim() {
        const player = this.player;
        this.autoAimTarget = null;
        this.autoAimLeadPoint = null;

        // 常にマウス位置を記録しておく（ピックアップ直後に古い位置と比較して即キャンセルされるのを防ぐ）
        const mx = this.input.mouse.x;
        const my = this.input.mouse.y;
        const dx = Math.abs(mx - (this._prevMouseX ?? mx));
        const dy = Math.abs(my - (this._prevMouseY ?? my));
        this._prevMouseX = mx;
        this._prevMouseY = my;

        if (!player || !player.alive || player.autoAimTimer <= 0) {
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        // 残り時間は「実際に効いているか」と無関係に減る。ドック中も Shift で
        // 解除している間も減らすのは、Auto Aim を温存して使い回す立ち回りを
        // 作らないため（解除は節約手段ではなく「今は手動で狙いたい」ための操作）。
        //
        // **この減算が _simulationTick() の内側にあることが要件。** 設定画面を
        // 開いている間にタイマーが止まるのは、gameState === 'settings' の間
        // _updatePlaying() ごと呼ばれず、ここに到達しないため。update() 直下など
        // 外へ出すとポーズ中も減り始める
        player.autoAimTimer--;

        // 尽きた時点で解除状態も消す。通常状態に戻ったのに「解除中」が残ると、
        // 次に拾ったときの挙動が「いつ切ったか」で決まってしまう
        if (player.autoAimTimer <= 0) {
            player.autoAimPaused = false;
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        // ドック中と解除中は吸い付かない（タイマーは上で減らし済み）
        if (player.docked || player.autoAimPaused) {
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        // マウスを動かしている間はスナップを抑制してロックも解除（タイマーは継続）。
        // しきい値を設定から取るのは、canvas の拡大率で物理的なマウスの体感が
        // 変わるため（Constants 側のコメント参照）。環境ごとの正解が1つに決まらない
        const releaseThreshold = this.settings?.autoAimRelease ?? AUTO_AIM_CANCEL_THRESHOLD_DEFAULT;
        if (dx + dy > releaseThreshold) {
            this.autoAimLockedEnemy = null;
            this.aimLead.reset();
            return;
        }

        // ロック中の敵が生存していればそのまま追跡
        if (this.autoAimLockedEnemy && this.autoAimLockedEnemy.alive) {
            // 煙に隠れたらロックを落とす。見えていないのに追尾し続けると、
            // 煙を張られた意味が無くなる
            if (isEnemyConcealed(this.autoAimLockedEnemy, this.smokeScreens)) {
                this.autoAimLockedEnemy = null;
                this.aimLead.reset();
                return;
            }
            this._lockOnEnemy(this.autoAimLockedEnemy);
            return;
        }

        // ロック対象なし: マウスのワールド座標に最も近い敵を新規検索
        const mouseWorld = this.input.getMouseWorld(this.camera);
        let bestEnemy = null;
        // 霧では Auto Aim の索敵も縮む（敵の索敵と同じ倍率）
        let bestDist = AUTO_AIM_SNAP_RADIUS * sightScaleFor(this);
        for (const enemy of this.enemies) {
            if (!enemy.alive) continue;
            if (isEnemyConcealed(enemy, this.smokeScreens)) continue;  // 煙の中は見えない
            const ex = enemy.x + (enemy.width || 0) / 2;
            const ey = enemy.y + (enemy.height || 0) / 2;
            const d = Math.hypot(ex - mouseWorld.x, ey - mouseWorld.y);
            if (d < bestDist) {
                bestDist = d;
                bestEnemy = enemy;
            }
        }
        if (bestEnemy) {
            this.autoAimLockedEnemy = bestEnemy;
            this._lockOnEnemy(bestEnemy);
        } else {
            this.aimLead.reset();
        }
    },

    /**
     * ロック対象の照準位置と着弾予定地点を更新する。
     *
     * 照準（autoAimTarget）は敵の中心に据えたままにする。着弾予定地点まで
     * 照準ごと動かすと、敵から外れた場所に照準が浮いて目障りになるため。
     * 予測位置は autoAimLeadPoint として別に持ち、戦闘機の HUD のように
     * 破線とリードサークルで示す（描画は Crosshair）。射撃はそちらを狙う。
     */
    _lockOnEnemy(enemy) {
        const cx = enemy.x + (enemy.width || 0) / 2;
        const cy = enemy.y + (enemy.height || 0) / 2;
        this.autoAimTarget = { x: cx, y: cy };
        this.autoAimLeadPoint = this._leadPointFor(enemy, cx, cy);
    },

    /**
     * ロック中の敵に対する着弾予定地点。
     * 自機の武器は直進弾なので、敵の現在位置を狙うと動く敵には当たらない。
     */
    _leadPointFor(enemy, cx, cy) {
        const player = this.player;
        const v = this.aimLead.measure(enemy);

        return predictLeadPoint({
            shooterX: player.x + player.width / 2,
            shooterY: player.y + player.height / 2,
            targetX: cx,
            targetY: cy,
            targetVx: v.vx,
            targetVy: v.vy,
            // 装備中の武器の弾速で予測する（ミサイルとマシンガンで偏差が変わる）
            projectileSpeed: player.currentWeapon === 'missile' ? MISSILE_SPEED : PLAYER_MG_SPEED,
            maxLeadTicks: AUTO_AIM_LEAD_MAX_TICKS,
            strength: AUTO_AIM_LEAD_STRENGTH,
        });
    },
};
