/**
 * 武器の発射音。
 *
 * 以前は弾もミサイルも巡航ミサイルも、自機のマシンガンまでが同じ
 * playEnemyFire を鳴らしていた。武器ごとに関数を増やすと似た合成コードが
 * 並ぶので、爆発を playBlast にまとめたのと同じ形にしてある。
 * 音の違いは WEAPON_SOUNDS の表だけに現れ、合成の手順は1つ。
 *
 * 部品は3つで、どれも省略できる。
 *   hiss  掃引するローパスノイズ。発砲の空気、噴射のシュー音
 *         hold を与えると、その間は満音量を保ってから減衰する（尾を引く）
 *   tone  音程のある成分。銃口の芯、推進のうなり
 *         hiss と同じく hold を取れる。余韻（「ーン」）を作るのに使う
 *   puffs 短い破裂の連なり。低く柔らかい。ホーミングの頭の「プ」
 *   clicks 硬く短い打撃の連なり。共鳴を鋭くし、整数倍でない成分を重ねて
 *         金属らしさを出す。リロードの「ガチャリ」
 *   voice  合成音声。声帯パルス（ノコギリ波）を3本のバンドパスに通し、
 *         母音を滑らせて音節にする。補給完了の「レディ」
 */

/**
 * @typedef {object} WeaponProfile
 * @property {{from:number,to:number,dur:number,gain:number,hold?:number}} [hiss]
 *   ノイズを通すローパスを from から to へ掃引する。
 *   hold（秒）を与えると、その間は減衰させずに保つ
 * @property {{type:string,from:number,to:number,dur:number,gain:number,hold?:number}} [tone]
 * @property {{count:number,gap:number,freq:number,dur:number,gain:number,bright?:number}} [puffs]
 *   gap 秒おきに count 回、freq を頂点とする破裂を置く。
 *   bright はローパスの開始位置（freq の何倍か）。大きいほど破裂が硬く鳴る
 * @property {{count:number, gap:number|number[], freq:number|number[],
 *   dur:number, gain:number|number[], step?:number, Q?:number,
 *   metal?:number, fade?:number}} [clicks]
 *   金属の打撃。gap / freq / gain は配列で1打撃ごとに変えられる。
 *   等間隔・単調変化だと機械の動きに聞こえないので、不揃いにするのが要点。
 *   freq が数値のときだけ step（打撃ごとの音程の倍率）が効き、
 *   gain が数値のときだけ fade（打撃ごとに音量を落とす割合）が効く。
 *   fade は負の値で逆に持ち上がる（低い音程は通る帯域が狭く痩せるため）。
 *   metal は重ねる非整数倍の比
 * @property {{f0:number, f0End?:number, gain:number, Q?:number,
 *   levels?:number[], segments:{f:number[], dur:number, gain?:number,
 *   closure?:number}[]}} [voice]
 *   合成音声。segments が音節の並び。f はフォルマント3本の周波数、
 *   closure（秒）を与えるとその音節の前に無音の間（子音の閉鎖）を挟む。
 *   時間の設計は voiceBreakpoints() に集約してある
 */

/** @type {Record<string, WeaponProfile>} */
export const WEAPON_SOUNDS = {
    // --- マシンガン ---
    // 連射するので短く軽く。長いと重なって濁る。
    playerMg: {
        hiss: { from: 3000, to: 800, dur: 0.06, gain: 0.079 },
        tone: { type: 'square', from: 220, to: 90, dur: 0.04, gain: 0.04 },
    },
    // 自機より鈍く低い。撃たれている側だと分かるように。
    enemyMg: {
        hiss: { from: 1900, to: 500, dur: 0.07, gain: 0.09 },
        tone: { type: 'square', from: 170, to: 70, dur: 0.05, gain: 0.045 },
    },

    // --- ミサイル ---
    // 点火の一撃 → 噴射が尾を引く、という順で組み立てる。
    //
    // 以前はローパスを 700→2600Hz と開く向きに掃引していたが、包絡が頭から
    // 減衰するため「暗いところだけ鳴って終わる」音になっていた（実測で
    // 発音直後の重心 350Hz、明るくなる 1900Hz 付近では既に無音）。これが
    // 「ボゥン」と鈍く聞こえる正体だった。
    // 明るいところから始めて hold で保つと、噴射が前に出て迫力が出る。
    playerMissile: {
        hiss: { from: 3200, to: 1000, dur: 0.50, hold: 0.14, gain: 0.049 },
        tone: { type: 'sawtooth', from: 200, to: 60, dur: 0.20, gain: 0.040 },
        puffs: { count: 1, gap: 0.04, freq: 500, dur: 0.04, gain: 0.089, bright: 8 },
    },
    // 同じ組み立てで帯域を一段下げる。撃たれている側だと分かるように。
    enemyMissile: {
        hiss: { from: 2400, to: 800, dur: 0.50, hold: 0.14, gain: 0.049 },
        tone: { type: 'sawtooth', from: 150, to: 45, dur: 0.20, gain: 0.040 },
        puffs: { count: 1, gap: 0.04, freq: 400, dur: 0.04, gain: 0.089, bright: 7 },
    },

    // --- ホーミングミサイル「プシュー」---
    // 頭の「プ」と、尾を引く「シュー」の2つで出来ている。
    //   プ   = 短くて強い一撃。puffs を1発だけ、ノイズの倍以上の大きさで
    //          置く。bright を上げて硬く鳴らすと、大きさを足すより
    //          「プ」らしく立つ（同じ音量でも頭が前に出る）。
    //   シュー = 高い帯域のノイズ。hold で満音量を保ってから減衰させる。
    //          保たずに減衰させると頭で消えて「シュッ」と切れてしまう。
    homing: {
        hiss: { from: 5200, to: 1300, dur: 0.42, hold: 0.20, gain: 0.040 },
        puffs: { count: 1, gap: 0.04, freq: 360, dur: 0.035, gain: 0.092, bright: 6 },
    },

    // --- 巡航ミサイル ---
    // 太く長い。射出そのものが事件なので他より目立ってよい。
    cruise: {
        hiss: { from: 380, to: 1400, dur: 0.60, gain: 0.15 },
        tone: { type: 'sawtooth', from: 70, to: 26, dur: 0.55, gain: 0.10 },
        puffs: { count: 2, gap: 0.09, freq: 150, dur: 0.12, gain: 0.10 },
    },

    // --- リロード「ガチャリ」---
    // 弾倉が入って遊底が閉じる、という機構の音。打撃を3つ、間隔を不揃いに
    // 置いて「ガチャ」＋「リ」にする。等間隔だと拍に聞こえて機械的すぎる。
    //
    // 音程は「低 → 中 → 超低」。最後がいちばん低く、重い部品が落ち着く。
    // 単調に上げると軽い機構、単調に下げるとただの減速に聞こえるので、
    // 一度上げてから底へ落とす形にした。
    //
    // ゲインは打撃ごとに指定する。バンドパスを通る帯域は中心周波数に比例して
    // 広がるため、同じゲインだと低い打撃ほど痩せる。240Hz の打撃に 1.03 と
    // 大きな値が要るのはそのため。実測した効率から逆算して、聞こえる強さが
    // 0.95 / 1.00 / 0.85 に揃うようにしてある。
    reload: {
        clicks: {
            count: 3,
            gap: [0.045, 0.085],
            freq: [520, 640, 240],
            gain: [0.956, 0.626, 1.025],
            dur: 0.055, Q: 7, metal: 2.76,
        },
    },

    // --- 反射ビームキャノン（7面） ---
    // 母艦レーザー（playLaserFire）とは別の音。跳ね回るぶん耳につきやすいので、
    // 高い成分を抑えて低く唸らせる。周波数を下げ切る形にして「撃った」ことだけを
    // 伝え、飛んでいる間は鳴らさない
    reflectBeam: {
        tone: { type: 'sawtooth', from: 520, to: 120, dur: 0.22, gain: 0.10 },
        hiss: { from: 2600, to: 700, dur: 0.10, gain: 0.05 },
    },

    // --- 反射ビームの被弾「ジュッ」---
    // 「当たっても地味で判りづらい」への対応の音側。発射音（低く唸る）と
    // 対になるよう、**高い帯域から素早く落とす**。同じ音色だと「撃たれた」のか
    // 「当たった」のかが音で区別できない。
    // 4600Hz なのは、ホーミング(5200Hz)が「どの武器よりも高いところから始まる」
    // という既存の取り決めを崩さないため（tests/weapon-sounds.test.js が縛って
    // いる。最初に 5200 を置いて同値で落ちた）。
    // 当たるとビーム自体が消えるので1発1回・連射でも0.4秒離れた2回まで＝
    // 鳴り続けないため、爆発音を避けた発射音ほど神経質に抑えなくてよい。
    // それでも発射音より控えめにしてあるのは、被弾と同時に閃光とスパークが
    // 出て視覚の手がかりが十分にあるため。
    // 実測: reflectBeam 比 -5.0dB、敵マシンガン比 0.0dB
    //（テストで発射音比 -10〜-2dB に縛ってある。最初に置いた gain 0.085/0.030 は
    //  -2.5dB で枠の縁だったので、0.75倍して余裕を持たせた値がこれ）
    beamHit: {
        hiss: { from: 4600, to: 900, dur: 0.09, gain: 0.064 },
        tone: { type: 'square', from: 880, to: 260, dur: 0.06, gain: 0.022 },
    },

    // --- 周回シールドの跳弾（6面以降の敵基地）---
    // 「当たったが効いていない」を音だけで伝える。ミサイルもグレネードも MG も
    // 同じこれが鳴るので、着弾の音（grenade の低い一撃）と混ざらないよう
    // 高く硬い金属の一撃にしてある。metal 比はリロードや装填と同じ 2.76 で、
    // 同じ機構の金属が鳴っていると感じられるように揃えた。
    // hiss は打撃だけだと痩せる高域を補うぶんだけ。
    // hiss の上端を 5000Hz に抑えてあるのは、「どの武器よりも高いところから
    // 始まるのは homing(5200Hz)」という既存の取り決めを崩さないため
    // （beamHit が踏んだのと同じ落とし穴。最初に 6000 を置いて
    //  tests/weapon-sounds.test.js が落ちた）。
    // 実測: beamHit 比 -2.5dB、波形のピーク 0.044（テストで ±6dB に縛ってある）。
    // 最初に置いた gain 0.20/0.030 は -4.0dB でやや引っ込んだので 1.26倍した
    shieldDeflect: {
        clicks: { count: 1, gap: 0, freq: 1800, dur: 0.045, gain: 0.252, Q: 12, metal: 2.76 },
        hiss: { from: 5000, to: 1600, dur: 0.06, gain: 0.038 },
    },

    // --- 装甲の跳弾「カン！」（artillery に MG が当たったとき）---
    // shieldDeflect（完全に弾く）と違い、こちらはダメージが**入っている**
    // ので、同じ音にすると意味が混ざる。一段高くして短く切ることで
    // 「効いてはいるが通りが悪い」を伝える。
    // hiss を持たないのは、homing(5200Hz)より高い hiss を置けないという
    // 既存の取り決めに引っかからないため。打撃1発だけで足りる。
    // 0.2秒に1回まで間引いても連続で鳴るので shieldDeflect より控えめ。
    // 実測: shieldDeflect 比 -5.6dB、波形のピーク 0.017（テストで -12〜-2dB に縛ってある）。
    // 最初に置いた gain 0.20 は -2.7dB で枠の縁だったので 0.685倍して余裕を持たせた
    armorRicochet: {
        clicks: { count: 1, gap: 0, freq: 2600, dur: 0.030, gain: 0.137, Q: 14, metal: 2.76 },
    },

    // --- グレネード ---
    // 撃つのではなく放り出すので、抜けの良い短い一撃。
    grenade: {
        hiss: { from: 1200, to: 300, dur: 0.10, gain: 0.08 },
        tone: { type: 'triangle', from: 300, to: 110, dur: 0.09, gain: 0.06 },
    },

    // --- 煙幕「プシューッ」---
    // ホーミングの噴射と同じ組み立てだが、帯域を一段下げて hold を長く取る。
    // 明るいまま長く伸ばすと発射音に聞こえて「撃たれた」と誤解するので、
    // 上を 2600Hz に抑えてある（homing は 5200Hz）。
    // 頭の puffs は発射弁が開く一撃。これが無いと、どこから煙が出たのか
    // 分からないまま画面が白くなる。
    //
    // gain は設計時の初期値のままで通った。実測: 基準比 -7.2dB
    // （-14〜+3dB の枠内）、振幅ピーク 0.076（0.02〜0.6 の枠内）。
    smoke: {
        hiss: { from: 2600, to: 700, dur: 0.55, hold: 0.26, gain: 0.042 },
        puffs: { count: 1, gap: 0.04, freq: 300, dur: 0.05, gain: 0.070, bright: 5 },
    },

    // --- 補給の装填 ---
    // ドッキング中に弾が1発入るたびに鳴る。1発＝1打撃。
    // リロードと同じ metal 比にして、同じ機構が動いている音に揃える。
    // ミサイルは薬室に入る軽い「カチッ」、グレネードは重い「コツン」。
    // 低い打撃ほど通る帯域が狭くて痩せるので、グレネードの gain は大きい。
    //
    // 2026-08-12 に実機の判断で「もう少し大きく、もう少し低く」調整した。
    // 音程 1150→850 / 430→320Hz、聞こえる大きさは実測 A特性で +3.0dB
    // （リロード比 -6.3dB → -3.3dB）。gain を上げただけでは音程を下げたぶん
    // 痩せて相殺されるので、目標のA特性から二分探索して逆算した値が入っている。
    // 2種の音程比は 2.66 倍で、聞き分けの下限（2倍）は保っている。
    ammoMissile: {
        clicks: { count: 1, gap: 0, freq: 850, dur: 0.030, gain: 0.227, Q: 9, metal: 2.76 },
    },
    ammoGrenade: {
        clicks: { count: 1, gap: 0, freq: 320, dur: 0.045, gain: 0.590, Q: 8, metal: 2.76 },
    },

    // --- オーバードライブ起動 ---
    // heavy のレア版キットを拾った瞬間の「動力が上がる」合図。
    // 他が「減衰する打撃」なのに対して、これだけは**上へ開いて保つ**形にした。
    // 掃引の途中で音量が落ちると上がりきる前に消えて、力が抜けた音になる
    // （最初 hold 無しで試して実際にそうなった）ので、hold で dur の手前まで
    // 満音量を保ってから切っている。
    // tone を鋸波にしたのは倍音が要るため。矩形波では細く、機械の唸りにならない。
    // 音量は最初 hiss 0.030 / tone 0.055 で組んだが、実測すると基準比 +2.3dB で
    // 表の中で最も大きく、自機ミサイル(-5.0dB)を 7dB 上回っていた。0.667倍して
    // -1.1dB（実測ピーク 0.051）。同じ「稀に鳴る報せ」であるレディの声(-0.8dB)と
    // 揃えてある。
    overdrive: {
        hiss: { from: 700, to: 5200, dur: 0.42, hold: 0.30, gain: 0.020 },
        tone: { type: 'sawtooth', from: 180, to: 900, dur: 0.40, hold: 0.32, gain: 0.037 },
    },

    // --- 補給完了の「レディ」---
    // 合成音声。声帯パルス（ノコギリ波）を3本のバンドパスに通し、
    // 母音を e → i へ滑らせて2音節にする。f0 をほとんど動かさないので
    // 人ではなく機械が喋っているように聞こえる。
    // closure は d の閉鎖。ここを無音にしないと「レーイ」と繋がる。
    //
    // 実機で「聞こえにくい」と指摘され、gain を 0.16 → 0.26 に上げた
    // （A特性で実測 +4.2dB）。波形のピークは 0.075 で、他の武器音と比べても
    // 余裕があり歪みは出ない。
    readyVoice: {
        voice: {
            f0: 150, f0End: 132, gain: 0.26, Q: 9,
            segments: [
                { f: [520, 1650, 2500], dur: 0.11, gain: 1.0 },                  // レ（e）
                { f: [330, 2200, 2900], dur: 0.17, gain: 0.85, closure: 0.035 }, // ディ（i）
            ],
        },
    },
};

/** 減衰の下限。exponentialRamp は 0 を受け付けない。 */
const FLOOR = 0.0008;

/** 音節の立ち上がり／消え際／母音が移り終わる位置（区間長に対する割合）。 */
const VOICE_ATTACK = 0.012;
const VOICE_RELEASE = 0.020;
const VOICE_GLIDE = 0.5;

/**
 * `voice` の時間変化を折れ線で返す。
 *
 * WebAudio 版とオフラインの測定版で同じ音にするために、時間の設計は
 * ここ1箇所だけに置く。前者は折れ線をそのまま linearRamp で予約し、
 * 後者はサンプルごとに線形補間する。
 *
 * @param {object} voice プロファイルの voice パーツ
 * @returns {{env: [number, number][], formants: [number, number[]][], total: number}}
 *   時刻は音の先頭からの秒数
 */
export function voiceBreakpoints(voice) {
    const { gain = 1, segments } = voice;
    const env = [[0, 0]];
    const formants = [[0, segments[0].f]];
    let t = 0;
    for (const seg of segments) {
        const closure = seg.closure || 0;
        // 閉鎖の間は 0 のまま保つ。ここで折らないと閉鎖を横切って持ち上がる
        if (closure > 0) env.push([t + closure, 0]);
        t += closure;

        const g = gain * (seg.gain ?? 1);
        env.push([t + VOICE_ATTACK, g], [t + seg.dur - VOICE_RELEASE, g], [t + seg.dur, 0]);
        // 母音は区間の前半で移り終え、残りは保つ
        formants.push([t + seg.dur * VOICE_GLIDE, seg.f], [t + seg.dur, seg.f]);
        t += seg.dur;
    }
    return { env, formants, total: t };
}

/**
 * プロファイルどおりに音を組み立てて鳴らす。
 *
 * @param {BaseAudioContext} ctx
 * @param {AudioNode} out 接続先（パンナーや効果音バス）
 * @param {WeaponProfile} profile
 * @param {AudioBuffer} noiseBuffer 共有のホワイトノイズ
 * @param {number} level 0〜1。距離で決まる音量
 * @param {number} t0 開始時刻
 */
export function renderWeaponSound(ctx, out, profile, noiseBuffer, level, t0) {
    if (profile.hiss) {
        const { from, to, dur, gain, hold = 0 } = profile.hiss;
        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(from, t0);
        filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);

        const g = ctx.createGain();
        g.gain.setValueAtTime(gain * level, t0);
        // hold の間は保ってから落とす。すぐ落とすと頭だけの音になる
        if (hold > 0) g.gain.setValueAtTime(gain * level, t0 + hold);
        g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);

        noise.connect(filter);
        filter.connect(g);
        g.connect(out);
        noise.start(t0);
        noise.stop(t0 + dur);
    }

    if (profile.tone) {
        const { type, from, to, dur, gain, hold = 0 } = profile.tone;
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t0);
        osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);

        const g = ctx.createGain();
        g.gain.setValueAtTime(gain * level, t0);
        if (hold > 0) g.gain.setValueAtTime(gain * level, t0 + hold);
        g.gain.exponentialRampToValueAtTime(FLOOR, t0 + dur);

        osc.connect(g);
        g.connect(out);
        osc.start(t0);
        osc.stop(t0 + dur);
    }

    if (profile.puffs) {
        const { count, gap, freq, dur, gain, bright = 3 } = profile.puffs;
        for (let i = 0; i < count; i++) {
            const t = t0 + i * gap;
            // 後ろの破裂ほど僅かに小さく低くして、連なりに方向を持たせる
            const fade = 1 - i * 0.12;

            const noise = ctx.createBufferSource();
            noise.buffer = noiseBuffer;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(freq * bright * fade, t);
            filter.frequency.exponentialRampToValueAtTime(freq * 0.8, t + dur);
            const ng = ctx.createGain();
            ng.gain.setValueAtTime(gain * level * fade, t);
            ng.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
            noise.connect(filter);
            filter.connect(ng);
            ng.connect(out);
            noise.start(t);
            noise.stop(t + dur);

            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * fade, t);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur);
            const og = ctx.createGain();
            og.gain.setValueAtTime(gain * level * 0.7 * fade, t);
            og.gain.exponentialRampToValueAtTime(FLOOR, t + dur);
            osc.connect(og);
            og.connect(out);
            osc.start(t);
            osc.stop(t + dur);
        }
    }

    if (profile.clicks) {
        const {
            count, gap, freq, dur, gain, step = 1, Q = 7, metal = 2.76, fade: fadeStep = 0.18,
        } = profile.clicks;

        /** 配列なら i 番目、足りなければ最後の値。数値ならそのまま。 */
        const at = (v, i) => (Array.isArray(v) ? (v[i] ?? v[v.length - 1]) : v);

        let t = t0;
        for (let i = 0; i < count; i++) {
            const fade = Array.isArray(gain) ? 1 : 1 - i * fadeStep;
            const f = Array.isArray(freq) ? at(freq, i) : freq * Math.pow(step, i);
            const g0 = at(gain, i);
            // 0 以下だと exponentialRamp が発散して出力全体が NaN になる
            if (!(g0 > 0)) { t += at(gap, i); continue; }

            // 芯の共鳴と、整数倍でない共鳴。後者が金属らしさを作る
            for (const [center, q, levelScale] of [[f, Q, 1], [f * metal, Q * 1.5, 0.45]]) {
                const noise = ctx.createBufferSource();
                noise.buffer = noiseBuffer;

                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = center;
                filter.Q.value = q;

                const g = ctx.createGain();
                g.gain.setValueAtTime(g0 * levelScale * level * fade, t);
                g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);

                noise.connect(filter);
                filter.connect(g);
                g.connect(out);
                noise.start(t);
                noise.stop(t + dur);
            }

            t += at(gap, i);
        }
    }

    if (profile.voice) {
        const { f0, f0End = f0, Q = 9, levels = [1, 0.5, 0.25] } = profile.voice;
        const { env, formants, total } = voiceBreakpoints(profile.voice);

        // 声帯パルス。高さをほとんど動かさないのがロボットらしさ
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f0, t0);
        osc.frequency.linearRampToValueAtTime(f0End, t0 + total);

        // 音節の包絡。閉鎖の間は 0 に落ちる
        const eg = ctx.createGain();
        eg.gain.setValueAtTime(env[0][1] * level, t0);
        for (let i = 1; i < env.length; i++) {
            eg.gain.linearRampToValueAtTime(env[i][1] * level, t0 + env[i][0]);
        }
        osc.connect(eg);

        // 3本のフォルマント。母音の違いはここに出る
        for (let k = 0; k < 3; k++) {
            const bp = ctx.createBiquadFilter();
            bp.type = 'bandpass';
            bp.Q.value = Q;
            bp.frequency.setValueAtTime(formants[0][1][k], t0);
            for (let i = 1; i < formants.length; i++) {
                bp.frequency.linearRampToValueAtTime(formants[i][1][k], t0 + formants[i][0]);
            }
            const fg = ctx.createGain();
            fg.gain.value = levels[k];
            eg.connect(bp); bp.connect(fg); fg.connect(out);
        }

        osc.start(t0);
        osc.stop(t0 + total);
    }
}
