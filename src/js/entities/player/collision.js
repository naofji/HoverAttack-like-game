// ============================================
// Player - 当たり（動いて、マップ・母艦・敵から押し戻す）
// ============================================
//
// 速度を位置へ反映し、ぶつかったものから押し戻す手順。入力・タイマー・武装は Player.js、
// 地形の解き方（段差の乗り上げ・壁への吸着・着地と天井・足元の探り）は walkerBody.js と
// slopeBody.js（敵アタッカーと共通）にあり、ここは自機だけの相手（母艦・敵の側面と頭）と
// 自機だけの反応（硬着地のスタン・天井でホバー許可）を受け持つ。
// 1056行のうち約285行がこの手順で、毎フレームの更新の流れと混ざって見通しが悪かったので
// 分けた（2026-11-24、中身は動かしただけ。player/draw.js と同じ切り方）。
//
// **Player.prototype へ Object.assign で混ぜる前提**のオブジェクトリテラルで、
// `this` はインスタンスを指す（理由は attacker/legs.js の冒頭）。
// 呼ぶ順は _moveAndCollide が唯一の記述（下のコメント）。

import { PLAYER_STUN_FALL_SPEED, PLAYER_STUN_DURATION } from '../../utils/Constants.js';

export const PlayerCollision = {
    /**
     * 速度を位置へ反映し、ぶつかったものから押し戻す。
     *
     * **手順の順番そのものが仕様。** 横をすべて解決してから縦へ入る、
     * マップを見てから母艦・敵を見る、最後に足元を1px 探る ── どれか1つでも
     * 入れ替えると、壁際で母艦に押し込まれたり接地がちらついたりする。
     * 各段は下の private に分けてあるが、**呼ぶ順はここが唯一の記述**。
     *
     * 以前は1メソッド215行で、このリポジトリで唯一の200行超だった。
     * 分けたのは読む範囲を絞るためで、判定そのものは1行も変えていない。
     */
    _moveAndCollide() {
        this._frameStartX = this.x; // 坂の吸着の届く距離（slopeBody.js の _glueDownSlope）
        // --- 横 ---
        const hitHMap = this._moveHorizontalIntoMap();
        if (!hitHMap) this._pushOutOfCarrierHorizontally();
        this._pushOutOfEnemiesHorizontally();

        // --- 縦 ---
        this.y += this.vy * this.motion.speed;
        this.onGround = false;
        this._prevOnTerrain = this.onTerrain;
        // 接地面の種別。地形が接地させたときだけ立てる（甲板・敵の頭では立てない）。
        // 鉄板の上で滑る・雪が舞うのはおかしい、という実機の指摘への対応
        this.onTerrain = false;
        this._landOnMapOrHitCeiling();
        this._landOnCarrier();
        this._liftCarrierFromBelow();
        this._landOnEnemy();
        this._probeGroundBelowFeet();
    },


    /**
     * 横方向。マップにぶつかったら、まず1タイルの段差を乗り上げてみて、
     * 駄目ならタイル境界へ吸着して止まる。
     * @returns {boolean} マップに当たって止まったか（母艦の押し出しを飛ばす判断に使う）
     */
    _moveHorizontalIntoMap() {
        const xBefore = this.x;
        this.x += this.vx * this.motion.speed;

        let hitHMap = false;
        if (this._collidesWithMap()) {
            // 坂（形のあるタイル）なら、まず斜辺の外へ上下に押し出す（slopeBody.js）
            if (this._slideAlongSlopeHorizontally()) return false;
            // 1段なら乗り上げ、駄目なら壁の面へ吸着して止まる（walkerBody.js、敵アタッカーと共通）
            if (!this._tryStepUp()) {
                hitHMap = true;
                this._snapToWall(xBefore);
                this.vx = 0;
            }
        }
        return hitHMap;
    },


    /**
     * 横方向。母艦の側面に当たったら押し出される。母艦が動いてぶつかる場合も含む。
     * **マップに当たって止まったフレームは呼ばない**（_moveAndCollide 側で判断）。
     * 押し出した先が岩の中なら、敵の押し出し（_pushOutOfEnemiesHorizontally）と同じく
     * このフレームの横の移動を取り消す（壁際で母艦に押されて壁に入った）。
     *
     * 左右の入力で母艦の側面へ進んでいるなら、母艦をその向きへ押す（Carrier.pushFrom）。母艦が敵の
     * 射線に入っているのにドッキングする間が無いとき、横へずらすため（ユーザーの要望）。自機はここで
     * 母艦の縁に止められ、次のフレームに母艦が動いたぶん進むので、母艦と同じ速さで一緒に進む
     */
    _pushOutOfCarrierHorizontally() {
        const carrier = this.game.carrier;
        const xBefore = this.x;
        if (carrier && carrier.alive) {
            // If the player overlaps the carrier horizontally AND vertically
            if (this.x < carrier.x + carrier.width &&
                this.x + this.width > carrier.x &&
                this.y < carrier.y + carrier.height &&
                this.y + this.height > carrier.y) {

                // We hit the side of the carrier
                // Push out appropriately
                // どちら側から来たかは動く前の位置で見る（4px leeway）。速度の向きだけで分岐を選ぶと、
                // 右側から左へ押して母艦が左へ動き出した（carrier.vx < 0）とたん「左から当たった」側に入り、
                // そこの条件で弾かれて押し出しも押すのも止まった
                const fromLeft = this.x + this.width - this.vx <= carrier.x + 4;
                const fromRight = this.x - this.vx >= carrier.x + carrier.width - 4;
                if ((this.vx > 0 || carrier.vx < 0) && fromLeft) {
                    // Moving right into carrier OR carrier moving left into us
                    this.x = carrier.x - this.width;
                    this.vx = 0;
                    if (this.heldDir === 1) carrier.pushFrom(1);
                } else if ((this.vx < 0 || carrier.vx > 0) && fromRight) {
                    // Moving left into carrier OR carrier moving right into us
                    this.x = carrier.x + carrier.width;
                    this.vx = 0;
                    if (this.heldDir === -1) carrier.pushFrom(-1);
                }
            }
        }
        this._undoPushIntoRock(xBefore);
    },

    /**
     * 母艦・敵の押し出しで横に置き直した先が岩の中なら、このフレームの横の移動を取り消す（相手に
     * 阻まれて止まる）。押し出す前の位置へ戻すだけだと、相手と重なったまま歩き続けてすり抜けた
     * （段の脇の戦車で。tests/environment-land-invariance.test.js の台本）。動く前の位置も岩に掛かる
     * とき（乗り上げで y が変わった）は押し出す前の位置へ戻す
     * @param {number} xBefore 押し出す前の x
     */
    _undoPushIntoRock(xBefore) {
        if (this.x === xBefore || !this._collidesWithMap()) return;
        this.x = this._frameStartX;
        if (this._collidesWithMap()) this.x = xBefore;
    },


    /**
     * 横方向。敵の側面に当たったら押し出される。敵の向こう側の縁へ置くので、ノックバックで深く重なると
     * 向こうの壁に入った（実機の指摘）。置き直した先が岩なら _undoPushIntoRock で取り消す
     */
    _pushOutOfEnemiesHorizontally() {
        for (const enemy of this.game.enemies) {
            if (!enemy.alive) continue;
            // Check horizontal overlap (assuming vertical is overlapping)
            if (this.x < enemy.x + enemy.width &&
                this.x + this.width > enemy.x &&
                this.y < enemy.y + enemy.height &&
                this.y + this.height > enemy.y) {

                const xBefore = this.x;
                if (this.vx > 0) { // Moving right into enemy
                    this.x = enemy.x - this.width;
                    this.vx = 0;
                } else if (this.vx < 0) { // Moving left into enemy
                    this.x = enemy.x + enemy.width;
                    this.vx = 0;
                }
                this._undoPushIntoRock(xBefore);
            }
        }
    },


    /** 縦方向。マップへの着地（強い落下ならスタン）と天井への衝突。 */
    _landOnMapOrHitCeiling() {
        // 着地・天井の位置合わせは walkerBody.js（敵アタッカーと共通）。ここに残すのは自機だけの反応
        const vyAtHit = this.vy;
        const hit = this._resolveVerticalMapHit();
        if (hit === 'land') {
            // 硬着地のスタン。位置合わせ（_landOnSlope など）はスタンを読まないので、後から立てても同じ
            if (vyAtHit > PLAYER_STUN_FALL_SPEED) this.stunTimer = PLAYER_STUN_DURATION;
        } else if (hit === 'ceiling') {
            // 天井に当たったらバースト後のクールダウンを解除する。
            //
            // 解除しないと、天井の低い場所では「バースト → 数フレームで
            // 天井 → vy=0 → クールダウンが残っていてホバーに入れない →
            // 落ちて着地 → W を押しっぱなしなのでまたバースト」という
            // 跳ね返りのループになる（実機フィードバック。テストで再現
            // させると200フレームで8回バーストしていた）。
            // プレイヤーの期待は「天井に当たったらそこからホバリングが
            // 始まって張り付く」なので、当たった時点でホバーを許す。
            // ホバーの推力(-0.50)は重力(0.30)を上回るので、W を押している
            // 間は天井に押し付けられ続け、燃料が尽きれば落ちる。
            this.hoverCooldown = 0;
        }
    },


    /** 縦方向。母艦の甲板に着地する。乗っている間は母艦と一緒に横へ動く。 */
    _landOnCarrier() {
        if (!this.onGround && this.vy > 0) {
            const carrier = this.game.carrier;
            if (carrier && carrier.alive) {
                // Check if player's bottom edge crosses the carrier's platform
                const pBottom = this.y + this.height;
                const pPrevBottom = pBottom - this.vy; // Where were we last frame?
                const cPlatformY = carrier.y; // Carrier logical top is roughly its y

                const pLeft = this.x;
                const pRight = this.x + this.width;
                const cPlatformLeft = carrier.x + carrier.platformLeft - 4; // slight leeway
                const cPlatformRight = carrier.x + carrier.platformRight + 4; // slight leeway

                // If player is horizontally within platform, and vertically falling *onto* it
                if (pRight > cPlatformLeft && pLeft < cPlatformRight) {
                    // Check if we just crossed the platform boundary, or if we are embedded in it while falling
                    if (pPrevBottom <= cPlatformY + 4 && pBottom >= cPlatformY) {
                        // Land on carrier。乗った先で頭が天井に入るなら乗らない（敵の頭と同じ。_landOnEnemy）
                        const xBefore = this.x, yBefore = this.y;
                        this.y = cPlatformY - this.height;
                        // Move with carrier horizontally if standing on it
                        this.x += carrier.vx;
                        if (this._collidesWithMap()) {
                            this.x = xBefore;
                            this.y = yBefore;
                            return;
                        }
                        if (this.vy > PLAYER_STUN_FALL_SPEED) { // Hard landing threshold
                            this.stunTimer = PLAYER_STUN_DURATION;
                        }
                        this.onGround = true;
                        this.walkFrame = 2; // Reset to standing straight
                        this.vy = 0;
                    }
                }
            }
        }
    },


    /** 縦方向。真下から母艦の底面を押し上げる。 */
    _liftCarrierFromBelow() {
        if (!this.docked && this.vy < 0) {
            const carrier = this.game.carrier;
            if (carrier && carrier.alive) {
                const cBottom = carrier.y + carrier.height;
                const hOverlap = this.x + this.width > carrier.x && this.x < carrier.x + carrier.width;
                // 頭がキャリア底面に入り込み、かつ足はまだ底面以下にある（真下からの衝突）
                if (hOverlap && this.y < cBottom && this.y + this.height >= cBottom) {
                    // 頭を底面に合わせると足が床に入るなら、押し下げも持ち上げもしない（母艦が床すれすれで、
                    // 床から上がり始めた自機の頭が底に入ったとき。他の押し出しと同じ規則）
                    const yBefore = this.y;
                    this.y = cBottom;           // 頭をキャリア底面にスナップ（プレイヤーはキャリアに追従）
                    if (this._collidesWithMap()) {
                        this.y = yBefore;
                        return;
                    }
                    carrier.vy = this.vy * 0.5; // キャリアは重いので半分の速度で持ち上がる
                    carrier.vx = this.vx;       // 持ち上げ中はプレイヤーの左右移動に追従
                }
            }
        }
    },


    /** 縦方向。敵の頭の上に着地する。乗っている間は敵と一緒に横へ動く。 */
    _landOnEnemy() {
        if (!this.onGround && this.vy > 0) {
            for (const enemy of this.game.enemies) {
                if (!enemy.alive) continue;

                const pBottom = this.y + this.height;
                const pPrevBottom = pBottom - this.vy;
                const eTop = enemy.y;

                if (this.x + this.width > enemy.x && this.x < enemy.x + enemy.width) {
                    // Falling onto the enemy
                    if (pPrevBottom <= eTop + 4 && pBottom >= eTop) {
                        // 乗った先で頭が天井に入るなら乗らない（横の押し出しと同じ理由）
                        const xBefore = this.x, yBefore = this.y;
                        this.y = eTop - this.height;
                        // Move with enemy horizontally if standing on it
                        this.x += enemy.vx || 0;
                        if (this._collidesWithMap()) {
                            this.x = xBefore;
                            this.y = yBefore;
                            continue;
                        }
                        this.onGround = true;
                        this.walkFrame = 2;
                        this.vy = 0;
                        break; // Landed on one enemy, no need to check others
                    }
                }
            }
        }
    },


    _probeGroundBelowFeet() {
        // 足元 1px 下の地形を探す手順は walkerBody.js（敵アタッカーと共通）。
        // 地形が無かったときだけ、自機は敵の頭の上に立っていないかも探す
        if (this._probeFeet() !== 'missed') return;
        const probeY = this.y + this.height + 1;
        for (const enemy of this.game.enemies) {
            if (!enemy.alive) continue;
            if (this.x + this.width > enemy.x && this.x < enemy.x + enemy.width) {
                if (Math.abs(probeY - enemy.y) < 2) {
                    this.onGround = true;
                    this.vy = 0;
                    this.y = enemy.y - this.height;
                    break;
                }
            }
        }
    },
};
