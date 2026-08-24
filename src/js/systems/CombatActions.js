// ============================================
// Combat Actions
// ============================================
//
// 自機側の「操作に直接ぶら下がる行動」——母艦へのドッキングと補給、
// 武器の発射、グレネードの投擲軌道の計算と表示。main.js から切り出した。
//
// 毎フレームの更新（_updatePlaying 以下）とは別にまとめてある。あちらは
// 「世界を1ステップ進める」手順で、こちらは「入力を1つの行動に変える」手順。
// 混ざっていると、入力の受け方を変えたいときに読む場所が絞れなかった。
//
// settingsFlow.js と同じく **Object.assign で Game に混ぜる前提**の
// オブジェクトリテラルで、`this` は Game を指す。

import {
    GRENADE_SPEED_MIN, GRENADE_SPEED_MAX, GRENADE_SPEED_MAX_DIST,
    MISSILE_MAX_ON_SCREEN, PLAYER_MG_BURST_DELAY, PLAYER_MG_SPREAD,
} from '../utils/Constants.js';
import { Missile } from '../entities/Missile.js';
import { Grenade } from '../entities/Grenade.js';
import { PlayerBullet } from '../entities/PlayerBullet.js';
import { REPAIR_KIT_HEAL } from '../entities/RepairKit.js';
import { audioManager } from '../audio/AudioManager.js';

export const CombatActions = {
    // ==========================================
    // DOCKING LOGIC
    // ==========================================
    _handleDocking() {
        const player = this.player;
        const carrier = this.carrier;
        if (!player || !carrier || !player.alive || !carrier.alive) return;

        // Dock
        if (this.input.isKeyPressed('KeyS') && !player.docked && carrier.canDock(player)) {
            player.docked = true;
            audioManager.playDock();
            player.vx = 0;
            player.vy = 0;
            player.resupply();
            // 設定が ON のときだけミサイルへ持ち替える。既定は OFF＝現行どおり
            // 持ち替えない（リスポーン時に missile へ戻すのは respawn() の仕事で、
            // こちらはプレイ中のドッキング）
            if (this.settings?.autoSwitchMissile) player.currentWeapon = 'missile';
            player.x = carrier.x + carrier.width / 2 - player.width / 2;
            player.y = carrier.y - player.height;

            // リペアキットを消費してキャリアを修理
            while (player.repairKits > 0) {
                if (carrier.hp < carrier.maxHp) {
                    carrier.hp = Math.min(carrier.maxHp, carrier.hp + REPAIR_KIT_HEAL);
                } else {
                    carrier.lives++;
                }
                player.repairKits--;
            }
        }

        // Undock — check head clearance before launching
        if (this.input.isKeyPressed('KeyW') && player.docked) {
            const checkY = player.y - 4;
            const headClear = !this.map.isSolidAtPixel(player.x + 2, checkY) &&
                !this.map.isSolidAtPixel(player.x + player.width - 2, checkY);
            if (headClear) {
                player.docked = false;
                audioManager.stopCarrierEngine();
                audioManager.stopRepairHum();
                player.vy = -3;
                player.walkFrame = 2;
            }
        }
    },

    // ==========================================
    // SHOOTING LOGIC
    // ==========================================
    _handleShooting() {
        const player = this.player;
        if (!player || !player.alive || player.docked) return;
        if (player.crouching || player.stunTimer > 0) return;

        // 照準が指している点（グレネードの投擲と軌道プレビューはこちらを使う。
        // 放物線で飛行時間も長いため、直進弾用の偏差を当てても正しくない）
        const targetWorld = this.autoAimTarget || this.input.getTargetWorld(this.camera);
        // 直進弾が狙う点。Auto Aim 中は着弾予定地点、それ以外は照準と同じ
        const fireWorld = this.autoAimLeadPoint || targetWorld;

        const px = player.x + player.width / 2;
        const py = player.y + player.height / 2;
        const angle = Math.atan2(targetWorld.y - py, targetWorld.x - px);
        const fireAngle = Math.atan2(fireWorld.y - py, fireWorld.x - px);

        // 左クリックが離されたら通常兵器の抑制を解除する
        if (!this.input.mouse.left) {
            this.leftClickSuppress = false;
        }

        // Primary fire（長押し中および左クリック抑制中は通常兵器を抑制）
        if (!this.leftClickSuppress && !this.grenadeWasHeld && (this.input.mouse.left || this.input.isKeyDown('Space'))) {
            if (player.currentWeapon === 'missile') this._fireMissile(player, px, py, fireAngle);
            else if (player.currentWeapon === 'mg') this._fireMachineGun(player, px, py, fireAngle);
        }

        // Secondary fire: Grenade（距離に応じた投擲強度）
        // ★ 短押し/長押しの区別は「押した瞬間」には不可能なため、判定はリリース時に行う
        // 長押し閾値: 10フレーム（約0.17秒）
        const GRENADE_HOLD_THRESHOLD = 10;

        if (this.input.isRightClickHeld() && Math.floor(player.grenades) > 0) {
            const grenadeSpeed = this._grenadeSpeedFor(targetWorld, px, py);

            if (this.input.rightHoldFrames >= GRENADE_HOLD_THRESHOLD) {
                // 長押し確定: 軌道プレビューを表示（毎フレーム更新）
                this._grenadeHeldAngle = angle;
                this._grenadeHeldSpeed = grenadeSpeed;
                this._grenadeHeldPx = px + Math.cos(angle) * 10;
                this._grenadeHeldPy = py + Math.sin(angle) * 10;
                this.grenadeWasHeld = true;
                this.grenadeTrajectory = this._calcGrenadeTrajectory(
                    this._grenadeHeldPx, this._grenadeHeldPy,
                    angle, grenadeSpeed
                );

                // 長押し中に左クリックで投擲
                if (this.input.isLeftClickPressed()) {
                    this.projectiles.push(new Grenade(
                        this,
                        this._grenadeHeldPx, this._grenadeHeldPy,
                        this._grenadeHeldAngle, this._grenadeHeldSpeed
                    ));
                    player.consumeGrenade();
                    audioManager.playWeapon('grenade', px, py);
                    this._clearGrenadeHold();

                    // 通常兵器の誤射を避けるため、左クリックを離すまで通常射撃を抑制するフラグを立てる
                    this.leftClickSuppress = true;
                }
            }
            // 閾値未満の間は何もしない（まだ短押しか長押しか判断できない）

        } else {
            // 右クリックを離した瞬間
            if (this.input.isRightClickReleased() && Math.floor(player.grenades) > 0) {
                if (!this.grenadeWasHeld) {
                    // 短押し確定（閾値未満でリリース）: 投擲
                    const grenadeSpeed = this._grenadeSpeedFor(targetWorld, px, py);
                    this.projectiles.push(new Grenade(this, px + Math.cos(angle) * 10, py + Math.sin(angle) * 10, angle, grenadeSpeed));
                    player.consumeGrenade();
                    audioManager.playWeapon('grenade', px, py);
                }
                // 長押しのリリースはキャンセル（左クリックせずに離した場合）
            }
            this._clearGrenadeHold();
        }
    },

    /**
     * グレネードの初速。狙った点が遠いほど強く投げる。
     * 短押しと長押しの両方から呼ぶので、式はここだけに置く
     * （以前は2箇所に同じ3行があり、片方だけ触ると投げ分けが狂う）。
     */
    _grenadeSpeedFor(targetWorld, px, py) {
        const dist = Math.hypot(targetWorld.x - px, targetWorld.y - py);
        const ratio = Math.min(dist / GRENADE_SPEED_MAX_DIST, 1.0);
        return GRENADE_SPEED_MIN + ratio * (GRENADE_SPEED_MAX - GRENADE_SPEED_MIN);
    },

    /** 長押し中に溜めていた投擲の情報を捨てる（投げ終わり・キャンセルの両方から）。 */
    _clearGrenadeHold() {
        this.grenadeTrajectory = null;
        this.grenadeWasHeld = false;
        this._grenadeHeldAngle = null;
        this._grenadeHeldSpeed = null;
        this._grenadeHeldPx = null;
        this._grenadeHeldPy = null;
    },


    _fireMissile(player, px, py, angle) {
        if (Math.floor(player.missiles) <= 0) {
            player.currentWeapon = 'mg';
            audioManager.playSwitch();
            return;
        }
        if (player.missileCooldown > 0) return;

        const active = this.projectiles.filter(p => p instanceof Missile && p.isPlayerOwned).length;
        if (active >= MISSILE_MAX_ON_SCREEN) return;

        this.projectiles.push(new Missile(this, px + Math.cos(angle) * 12, py + Math.sin(angle) * 12, angle, true));
        player.consumeMissile();
        player.missileCooldown = 15;
        audioManager.playWeapon('playerMissile', px, py);

        if (Math.floor(player.missiles) <= 0) {
            player.currentWeapon = 'mg';
            audioManager.playSwitch();
        }
    },

    _fireMachineGun(player, px, py, angle) {
        if (player.mgReloadTimer > 0 || player.mgFireTimer > 0) return;

        const finalAngle = angle + (Math.random() - 0.5) * PLAYER_MG_SPREAD;
        this.projectiles.push(new PlayerBullet(this, px + Math.cos(angle) * 12, py + Math.sin(angle) * 12, finalAngle));

        player.mgFireTimer = PLAYER_MG_BURST_DELAY;
        // 減算そのものは Player 側。オーバードライブ中に減らさない判定を
        // consumeMissile と同じ場所に寄せてある
        player.consumeMGRound();
    },
    /**
     * グレネードの物理軌道を事前シミュレーションして計算する
     * @returns {{ points: {x,y}[], landX: number, landY: number }}
     */
    _calcGrenadeTrajectory(startX, startY, angle, speed) {
        const TRAJ_GRAVITY = 0.20;
        const TRAJ_MAX_FALLING_SPEED = 6;
        const TRAJ_BOUNCE = 0.2;
        const TRAJ_FRICTION = 0.9;
        const TRAJ_LIFETIME = 90;

        const map = this.map;
        const points = [];
        let x = startX, y = startY;
        let vx = Math.cos(angle) * speed;
        let vy = Math.sin(angle) * speed;
        let landX = x, landY = y;

        for (let i = 0; i < TRAJ_LIFETIME; i++) {
            vy += TRAJ_GRAVITY;
            if (vy > TRAJ_MAX_FALLING_SPEED) vy = TRAJ_MAX_FALLING_SPEED;

            let nextX = x + vx;
            let nextY = y + vy;

            if (map.isSolidAtPixel(nextX, y)) {
                vx *= -TRAJ_BOUNCE;
                nextX = x + vx;
            }
            x = nextX;

            if (map.isSolidAtPixel(x, nextY)) {
                if (Math.abs(vy) > 0.5) {
                    vy *= -TRAJ_BOUNCE;
                } else {
                    vy = 0;
                    vx *= TRAJ_FRICTION;
                }
                nextY = y + vy;
            }
            y = nextY;

            // 3フレームおきに軌跡の点を記録
            if (i % 3 === 0) {
                points.push({ x, y });
            }

            landX = x;
            landY = y;

            // マップ外に出たら終了
            if (x < 0 || x > map.width || y < 0 || y > map.height) break;
        }

        return { points, landX, landY };
    },

    /**
     * グレネード軌道プレビューを赤い点線と×マークで描画する
     */
    _drawGrenadeTrajectory(ctx, trajectory) {
        const { points, landX, landY } = trajectory;
        if (points.length < 2) return;

        ctx.save();

        // 細い赤い点線で軌道を描画
        ctx.strokeStyle = 'rgba(255, 60, 60, 0.85)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();

        // 爆発位置に×マークを描画
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(255, 40, 40, 1.0)';
        ctx.lineWidth = 1.5;
        const s = 5;
        ctx.beginPath();
        ctx.moveTo(landX - s, landY - s);
        ctx.lineTo(landX + s, landY + s);
        ctx.moveTo(landX + s, landY - s);
        ctx.lineTo(landX - s, landY + s);
        ctx.stroke();

        // 薄い円でわかりやすくする
        ctx.strokeStyle = 'rgba(255, 80, 80, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(landX, landY, 8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    },
};
