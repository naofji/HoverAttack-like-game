// ============================================
// EnemyAttacker - 脚
// ============================================
//
// 型ごとの脚の見た目と、関節（腰・膝・足）の座標の計算。
// EnemyAttacker.js から切り出した。**外部の import を1つも必要としない**
// ── 定数と、それを使う計算がここで閉じている。
//
// **関節の座標を出すのはここだけ。** 描画側（_drawLegs / _drawArtilleryLegs）も
// 当たり判定も同じ _legJoints() を通す。以前は歩行と描画で別々に角度を出していて
// 食い違ったことがあり、tests/leg-joints-single-source.test.js がそれを縛っている。
//
// **EnemyAttacker.prototype へ Object.assign で混ぜる前提**のオブジェクト
// リテラルで、`this` は EnemyAttacker のインスタンスを指す。関数化して
// attacker を第一引数に取る形にしなかったのは、テストが
// `a._legJoints(...)` のようにインスタンス経由で呼んでいるため。

/**
 * 型別の脚描画パラメータ（描画専用なので Constants.js には置かない）。
 * rival は「プレイヤーと対等な好敵手」なので standard = プレイヤーと同じ値を共有する。
 */
const LEG_STYLES = {
    standard: {
        hipFar: 7, hipNear: 10, lineWidth: 3,
        footW: 5, footH: 2, strideScale: 1,
        maxSwing: Math.PI / 4, phaseOffset: 0.2,
        crouchSpread: 3, thighPlate: false,
    },
    rival: {
        hipFar: 7, hipNear: 10, lineWidth: 3,
        footW: 5, footH: 2, strideScale: 1,
        maxSwing: Math.PI / 4, phaseOffset: 0.2,
        crouchSpread: 3, thighPlate: false,
    },
    heavy: {
        hipFar: 6, hipNear: 11, lineWidth: 4,
        footW: 6, footH: 3, strideScale: 0.7,
        maxSwing: Math.PI / 6, phaseOffset: 0.15,
        crouchSpread: 5, thighPlate: true,
    },
    artillery: {
        hipFar: 7, hipNear: 10, lineWidth: 3,
        footW: 4, footH: 2, strideScale: 1,
        maxSwing: (25 * Math.PI) / 180, phaseOffset: 0.2,
        crouchSpread: 3, thighPlate: false,
        // 腿は赤、下腿は腿より太く（手前脚/奥脚で明度を変えて奥行きを出す）
        shinWidth: 4,
        thighNear: '#DD3322', thighFar: '#992222',
    },
};

/** 歩行4フレーム → 手前脚/奥脚のポーズ番号（Player の WALK_POSES と同じ割り当て）。 */
const WALK_FRAME_POSES = [
    { near: 0, far: 1 },
    { near: 2, far: 3 },
    { near: 2, far: 2 }, // 直立・停止時
    { near: 3, far: 2 },
];

/**
 * ポーズ番号 → 股関節からの相対座標（膝 kdx/kdy、足首 fdx/fdy）。
 * Player._drawSingleLeg の switch から移植したもの。
 */
const LEG_POSES = [
    { kdx: 2, kdy: 3, fdx: 4, fdy: 6 },
    { kdx: -3, kdy: 3, fdx: -5, fdy: 4 },
    { kdx: 0, kdy: 3, fdx: 0, fdy: 6 },
    { kdx: 4, kdy: 1, fdx: 3, fdy: 3 },
];

/** 空中で股関節を中心に回転させる基準ポーズ（Player._drawSingleLeg 準拠）。 */
const AIR_BASE_POSE = {
    near: { kdx: 1, kdy: 3, fdx: 0, fdy: 6 },
    far: { kdx: -1, kdy: 3, fdx: -2, fdy: 6 },
};

/**
 * artillery の4脚。並びは [手前前脚, 奥前脚, 手前後脚, 奥後脚]。
 * group A = 手前前脚 + 奥後脚 / group B = 奥前脚 + 手前後脚 の対角トロット。
 * reach は股関節からの足先の水平到達距離（前脚が正、後脚が負）。
 */
const SPIDER_LEGS = [
    { hipX: 14, reach: 5, isNear: true, group: 0 },
    { hipX: 11, reach: 4, isNear: false, group: 1 },
    { hipX: 7, reach: -4, isNear: true, group: 1 },
    { hipX: 4, reach: -5, isNear: false, group: 0 },
];

/**
 * 参照フレーム → 足先の前後スイープ量。
 * 半周期ずらすと符号が反転する（sweep[(p+2)%4] === -sweep[p]）ので、
 * group A / B が常に逆位相になる。frame 2 は両グループとも 0 = 停止時の中立ポーズ。
 */
const SPIDER_SWEEP = [0, 2, 0, -2];

/**
 * 参照フレーム → 遊脚相の足上げ量。
 * group A は walkFrame 3、group B は walkFrame 1 で持ち上がり、同時には浮かない
 * （＝常に2本以上が接地する）。
 */
const SPIDER_LIFT = [0, 0, 0, 2];

/** 膝の跳ね上げ量（股関節より上）と足首の下がり量。 */
const SPIDER_KNEE_RISE = 4;
const SPIDER_FOOT_DROP = 6;

export const AttackerLegs = {
    /**
     * artillery の4脚クモ歩行。
     * 膝を胴体より上へ跳ね上げた逆へ字シルエットで、対角の2本ずつを
     * 半周期ずらして動かす（常に2本以上が接地する）。
     */
    _drawArtilleryLegs(ctx, crouchOffset = 0) {
        this._drawJointsWithPaint(ctx, crouchOffset, (isNear, style) => this._spiderPaint(isNear, style));
    },

    /** 脚1本ぶんの塗り設定（手前脚は bodyColor、奥脚は headColor）。 */
    _spiderPaint(isNear, style) {
        return {
            legColor: isNear ? this.config.bodyColor : this.config.headColor,
            footColor: isNear ? this.config.headColor : this.config.bodyColor,
            lineWidth: style.lineWidth,
            footW: style.footW,
            footH: style.footH,
            shinWidth: style.shinWidth,
            thighColor: isNear ? style.thighNear : style.thighFar,
        };
    },

    // ------------------------------------------
    // 脚の関節座標
    //
    // 描画（_drawLegs / _drawArtilleryLegs）と破片生成（_collectLegPoses）は
    // どちらも同じ関節座標を必要とする。以前は両者が同じ式をそれぞれ書いて
    // いて、片方だけ触ると「破片だけ別のポーズで飛び散る」という形で壊れた。
    // 座標を決めるのはここだけにして、描画は色を、破片は太さを足すだけにする。
    // ------------------------------------------

    /**
     * いまのポーズの関節座標を、描く順（奥脚→手前脚）で返す。
     * @param {number} hipY 股関節の縦位置。draw() は crouchOffset ぶん
     *   平行移動した後なので 16 - crouchOffset を、破片生成は絶対位置の 16 を渡す
     * @param {object} style _legStyle() の型別スタイル
     * @param {boolean} isCrouching しゃがみ姿勢か。描画側は draw() が決めた
     *   crouchOffset から、破片生成側は状態そのものから渡す。実機では
     *   crouchOffset = isCrouching ? 4 : 0 なので両者は必ず一致するが、
     *   判定の出どころは呼び出し側に残しておく（描画だけを単体で呼べる）
     * @returns {Array<{isNear:boolean, hipX:number, hipY:number,
     *   kneeX:number, kneeY:number, footX:number, footY:number,
     *   footRotation?:number}>}
     */
    _legJoints(hipY, style, isCrouching) {
        const spider = this.config.name === 'artillery';

        if (isCrouching) {
            return spider ? this._spiderCrouchJoints(hipY, style)
                          : this._bipedCrouchJoints(hipY, style);
        }
        if (!this.onGround) {
            return spider ? this._spiderAirJoints(hipY, style)
                          : this._bipedAirJoints(hipY, style);
        }
        return spider ? this._spiderWalkJoints(hipY, style)
                      : this._bipedWalkJoints(hipY, style);
    },

    /** 4脚・接地時: 対角トロット。group 0 は walkFrame、group 1 は半周期ずれ。 */
    _spiderWalkJoints(hipY, style) {
        return SPIDER_LEGS.map((leg) => {
            const phase = leg.group === 0 ? this.walkFrame : (this.walkFrame + 2) % 4;
            const sweep = SPIDER_SWEEP[phase];
            const lift = SPIDER_LIFT[phase];
            return {
                isNear: leg.isNear,
                hipX: leg.hipX, hipY,
                kneeX: leg.hipX + (leg.reach + sweep) * 0.5,
                kneeY: hipY - SPIDER_KNEE_RISE,
                footX: leg.hipX + leg.reach + sweep,
                footY: hipY + SPIDER_FOOT_DROP - lift,
            };
        });
    },

    /** 4脚・空中: 脚を丸めつつ、横速度に応じて股関節中心に振れる。 */
    _spiderAirJoints(hipY, style) {
        const angle = this._hoverSwing() * style.maxSwing;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return SPIDER_LEGS.map((leg) => {
            // グループごとに縮み量を変えて非対称にする（クモが落下時に脚を縮める挙動）
            const curl = leg.group === 0 ? 0.6 : 0.8;
            const rot = (dx, dy) => ({
                x: leg.hipX + (dx * cos - dy * sin),
                y: hipY + (dx * sin + dy * cos),
            });
            const knee = rot(leg.reach * 0.5 * curl, -SPIDER_KNEE_RISE * curl);
            const foot = rot(leg.reach * curl, SPIDER_FOOT_DROP * curl);
            return {
                isNear: leg.isNear,
                hipX: leg.hipX, hipY,
                kneeX: knee.x, kneeY: knee.y,
                footX: foot.x, footY: foot.y,
                footRotation: angle / 1.5,
            };
        });
    },

    /** 4脚・しゃがみ（狙撃姿勢）: 膝を大きく跳ね上げ、足を広く張って車高を下げる。 */
    _spiderCrouchJoints(hipY, style) {
        const spread = style.crouchSpread;
        return SPIDER_LEGS.map((leg) => {
            const dir = leg.reach >= 0 ? 1 : -1;
            return {
                isNear: leg.isNear,
                hipX: leg.hipX, hipY,
                kneeX: leg.hipX + dir * spread * 0.5,
                kneeY: hipY - SPIDER_KNEE_RISE - 2,
                footX: leg.hipX + leg.reach + dir * spread,
                footY: hipY + SPIDER_FOOT_DROP,
            };
        });
    },

    /** 2足・接地時: 4フレームの歩行サイクル。奥脚を先に返す（手前脚が上に重なる）。 */
    _bipedWalkJoints(hipY, style) {
        const frame = WALK_FRAME_POSES[this.walkFrame] || WALK_FRAME_POSES[2];
        const s = style.strideScale;

        return [[false, frame.far], [true, frame.near]].map(([isNear, poseIndex]) => {
            const hipX = isNear ? style.hipNear : style.hipFar;
            const p = LEG_POSES[poseIndex];
            return {
                isNear, hipX, hipY,
                kneeX: hipX + p.kdx * s, kneeY: hipY + p.kdy,
                footX: hipX + p.fdx * s, footY: hipY + p.fdy,
            };
        });
    },

    /** 2足・空中: 横速度に比例して股関節を中心に脚が振れる。 */
    _bipedAirJoints(hipY, style) {
        const swing = this._hoverSwing();
        // 奥脚は位相をずらし、左右がぴったり揃わないようにする
        const swings = [[false, swing * 0.8 - style.phaseOffset], [true, swing]];

        return swings.map(([isNear, amount]) => {
            const hipX = isNear ? style.hipNear : style.hipFar;
            const base = isNear ? AIR_BASE_POSE.near : AIR_BASE_POSE.far;
            const angle = amount * style.maxSwing;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rot = (dx, dy) => ({
                x: hipX + (dx * cos - dy * sin),
                y: hipY + (dx * sin + dy * cos),
            });
            const knee = rot(base.kdx, base.kdy);
            const foot = rot(base.fdx, base.fdy);
            return {
                isNear, hipX, hipY,
                kneeX: knee.x, kneeY: knee.y,
                footX: foot.x, footY: foot.y,
                footRotation: angle / 1.5,
            };
        });
    },

    /** 2足・しゃがみ（バースト射撃時）: 膝を外に折って車高を下げる。 */
    _bipedCrouchJoints(hipY, style) {
        const spread = style.crouchSpread;
        return [[false, -1], [true, 1]].map(([isNear, dir]) => {
            const hipX = isNear ? style.hipNear : style.hipFar;
            return {
                isNear, hipX, hipY,
                kneeX: hipX + dir * (spread + 2), kneeY: hipY + 4,
                footX: hipX + dir * spread, footY: hipY + 6,
            };
        });
    },

    /**
     * 死亡時の脚の関節座標を集める（描画はしない）。
     * 破片生成が「今どんなポーズだったか」を知るための唯一の入口。
     * 座標そのものは _legJoints() が決める（描画と同じ値）。
     * @returns {Array<{isNear:boolean,hipX:number,hipY:number,kneeX:number,kneeY:number,footX:number,footY:number,lineWidth:number}>}
     */
    _collectLegPoses() {
        const style = this._legStyle();
        const isCrouching = this.crouching || this.burstCount > 0;
        // hipY は draw() の平行移動込みで見た絶対位置に合わせる
        return this._legJoints(16, style, isCrouching).map((j) => ({
            isNear: j.isNear,
            hipX: j.hipX, hipY: j.hipY,
            kneeX: j.kneeX, kneeY: j.kneeY,
            footX: j.footX, footY: j.footY,
            lineWidth: style.lineWidth,
        }));
    },

    /** 関節座標に色を乗せて実際に描く。2足型・4脚型で塗り分けだけが違う。 */
    _drawJointsWithPaint(ctx, crouchOffset, paintFor) {
        const style = this._legStyle();
        // draw() が既に crouchOffset ぶん下へ平行移動しているので、
        // 股関節を同じだけ上げると足の接地位置が変わらない。
        for (const j of this._legJoints(16 - crouchOffset, style, crouchOffset > 0)) {
            this._drawJointedLeg(ctx, { ...j, ...paintFor(j.isNear, style) });
        }
    },

    /** 2足型（standard / rival / heavy）の脚。 */
    _drawLegs(ctx, crouchOffset = 0) {
        this._drawJointsWithPaint(ctx, crouchOffset, (isNear, style) => this._legPaint(isNear, style));
    },

    /** 脚1本ぶんの共通オプションを組み立てる。 */
    _legPaint(isNear, style) {
        return {
            legColor: isNear ? this.config.bodyColor : this.config.headColor,
            footColor: isNear ? this.config.headColor : this.config.bodyColor,
            lineWidth: style.lineWidth,
            footW: style.footW,
            footH: style.footH,
            thighPlate: style.thighPlate,
        };
    },

    /** 型別の脚スタイルを引く。未知の型は standard にフォールバック。 */
    _legStyle() {
        return LEG_STYLES[this.config.name] || LEG_STYLES.standard;
    },

    /**
     * 空中の振り子量を -1..+1 で返す。
     * 進行方向ローカルの横速度を、その機体の最高速で正規化する。
     * 型ごとに最高速が 2.4 倍違う（heavy 0.5 / rival 1.20）ため、
     * プレイヤーのような固定定数ではなく this.maxSpeed を分母にする。
     */
    _hoverSwing() {
        const localVx = this.facingRight ? this.vx : -this.vx;
        const max = this.maxSpeed;
        const clamped = Math.max(-max, Math.min(max, localVx));
        return clamped / max;
    },

    /**
     * 脚1本を描く唯一のプリミティブ。
     * ポーズの決定（歩行フレーム→座標、振り子回転、脚上げ）は呼び出し側の責務で、
     * ここは渡された座標をそのまま描くだけの純粋な描画関数。
     */
    _drawJointedLeg(ctx, opts) {
        const {
            hipX, hipY, kneeX, kneeY, footX, footY,
            legColor, footColor, lineWidth, footW, footH,
            footRotation = 0, thighPlate = false,
            thighColor = null, shinWidth = null,
        } = opts;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (thighColor !== null || shinWidth !== null) {
            // 腿と下腿を別々に描く（artillery: 赤い腿＋太い下腿）。
            // 腿を先に描き、下腿を上に重ねて膝の関節を下腿側で締める。
            ctx.strokeStyle = thighColor !== null ? thighColor : legColor;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            ctx.lineTo(kneeX, kneeY);
            ctx.stroke();

            ctx.strokeStyle = legColor;
            ctx.lineWidth = shinWidth !== null ? shinWidth : lineWidth;
            ctx.beginPath();
            ctx.moveTo(kneeX, kneeY);
            ctx.lineTo(footX, footY);
            ctx.stroke();
        } else {
            // 股関節 → 膝 → 足首 を1本のポリラインで
            ctx.strokeStyle = legColor;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            ctx.moveTo(hipX, hipY);
            ctx.lineTo(kneeX, kneeY);
            ctx.lineTo(footX, footY);
            ctx.stroke();
        }

        // 腿の装甲板（heavy のバルク感）
        if (thighPlate) {
            ctx.fillStyle = footColor;
            ctx.fillRect((hipX + kneeX) / 2 - 2, (hipY + kneeY) / 2 - 1, 4, 3);
        }

        // 足裏
        ctx.save();
        ctx.translate(footX, footY);
        if (footRotation !== 0) ctx.rotate(footRotation);
        ctx.fillStyle = footColor;
        ctx.fillRect(-Math.floor(footW / 2), 0, footW, footH);
        ctx.restore();
    },
};
