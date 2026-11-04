// ============================================
// 地形の上を歩く機体の共通の手順（自機・敵アタッカーに混ぜる）
// ============================================
//
// 自機（Player.js）と敵アタッカー（attacker/collision.js）は横→縦の同じ手順で地形を解いていて、
// そのうち「1段の乗り上げ」「壁への吸着」「着地と天井」「足元 1px 下の探り」の4つは文まで同じ
// コピーだった（2026-11-04 の調査で 約50行）。坂の対応を入れたときも両方へ同じ行を足していて、
// 片方だけ直して食い違う危うさがあったので、ここへ寄せた。
//
// 機体ごとに違うところは呼んだ側に残してある。
//   - 自機: 硬着地のスタン、天井に当たったらホバーを許す、足元に地形が無ければ敵の頭を探す
//   - アタッカー: 壁で跳ぶ・折り返す（_reactToWall）、崖の判定
//
// 寄せる前後で、本物のマップ（3シード×7面）を走らせた体の状態の指紋が一致することを
// tools/trace-walkers.mjs で確かめてある。
//
// **Player.prototype / EnemyAttacker.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` はインスタンス。坂の部品（slopeBody.js の _landOnSlope / _hitCeilingSlope /
// _glueDownSlope / _settleOnSlope / _undoSnapIntoRock）をいっしょに混ぜてあることが前提。

import { TILE_SIZE } from '../utils/Constants.js';
import { collidesWithTerrain, wallSnapX } from '../utils/Physics.js';

export const WalkerBody = {
    _collidesWithMap() {
        return collidesWithTerrain(this, this.game.map);
    },

    /**
     * 横に動いて壁に当たったとき、接地していればまず1タイル上へ乗り上げてみる。
     * 乗り上げた先が空いていれば上げたまま true、駄目なら元の高さへ戻して false。
     * （段差で跳ばずに歩いて上がるため。上限が1タイルなのは母艦・戦車と同じ）
     */
    _tryStepUp() {
        if (this.onGround && Math.abs(this.vx) > 0) {
            const originalY = this.y;
            this.y -= TILE_SIZE;
            if (!this._collidesWithMap()) return true;
            this.y = originalY;
        }
        return false;
    },

    /**
     * 壁の面へ吸着する。動く前の位置から求めると、2px/フレームより速いと1タイル離れる
     * （utils/Physics.js の wallSnapX）。吸着した先が岩の中なら、このフレームの横の移動を取り消す。
     * vx は呼んだ側が止める（アタッカーは止めたうえで跳ぶか折り返すかを決めるため）。
     *
     * 寄せる前は vx が 0 のときに `this.x -= this.vx * speed` を通っていたが、引くのは 0 なので
     * 何もしていなかった。ここでは書いていない
     */
    _snapToWall(xBefore) {
        if (this.vx !== 0) this.x = wallSnapX(this.x, this.width, this.vx);
        this._undoSnapIntoRock('x', xBefore);
    },

    /**
     * 縦に動いて地形に当たったときの着地と天井。坂なら斜辺へ（slopeBody.js）。
     * 当たっていれば vy を 0 にする。
     * @returns {'land'|'ceiling'|'stop'|null} 何が起きたか（'stop' は vy が 0 で当たっていたとき）。
     *   当たっていなければ null
     */
    _resolveVerticalMapHit() {
        if (!this._collidesWithMap()) return null;
        const yBefore = this.y - this.vy * this.motion.speed;
        let hit = 'stop';
        if (this.vy > 0) {
            if (!this._landOnSlope()) {
                this.y = Math.floor((this.y + this.height) / TILE_SIZE) * TILE_SIZE - this.height;
                this._undoSnapIntoRock('y', yBefore);
            }
            this.onGround = true;
            this.onTerrain = true;
            this.walkFrame = 2; // 直立に戻す
            hit = 'land';
        } else if (this.vy < 0) {
            if (!this._hitCeilingSlope()) {
                this.y = Math.ceil(this.y / TILE_SIZE) * TILE_SIZE + 0.01;
                this._undoSnapIntoRock('y', yBefore);
            }
            hit = 'ceiling';
        }
        this.vy = 0;
        return hit;
    },

    /**
     * 足元 1px 下を左右の足で探る。止まっている・ゆっくり落ちているときに「接地していない」と
     * 1フレームおきに揺れるのを防ぐため。上へ動いているとき（vy < 0）に探すと、ゆっくりした
     * ホバーが床に貼り付くので探さない。坂を下るときは落下を待たずに斜辺へ下ろす（slopeBody.js）。
     * @returns {'glued'|'landed'|'missed'|null} 坂へ下ろした・床に立った・探したが床が無かった・探さなかった
     */
    _probeFeet() {
        if (this._glueDownSlope(this._prevOnTerrain)) return 'glued';
        // 寄せる前の条件をそのまま否定する（ド・モルガンで書き換えると vy が NaN のときに食い違う）
        if (!(!this.onGround && this.vy >= 0 && this.vy < 0.5)) return null;
        const map = this.game.map;
        const probeY = this.y + this.height + 1;
        const leftFoot = map.isSolidPoint(this.x + 4, probeY);
        const rightFoot = map.isSolidPoint(this.x + this.width - 4, probeY);
        if (!leftFoot && !rightFoot) return 'missed';
        this.onGround = true;
        this.onTerrain = true;
        this.vy = 0;
        // 坂の上ではタイルの上端は床ではないので斜辺へ合わせる（slopeBody.js）
        if (!this._settleOnSlope()) {
            this.y = Math.floor(probeY / TILE_SIZE) * TILE_SIZE - this.height;
        }
        return 'landed';
    },
};
