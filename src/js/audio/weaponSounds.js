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

    // --- グレネード ---
    // 撃つのではなく放り出すので、抜けの良い短い一撃。
    grenade: {
        hiss: { from: 1200, to: 300, dur: 0.10, gain: 0.08 },
        tone: { type: 'triangle', from: 300, to: 110, dur: 0.09, gain: 0.06 },
    },

    // --- 補給完了の「レディ」---
    // 合成音声。声帯パルス（ノコギリ波）を3本のバンドパスに通し、
    // 母音を e → i へ滑らせて2音節にする。f0 をほとんど動かさないので
    // 人ではなく機械が喋っているように聞こえる。
    // closure は d の閉鎖。ここを無音にしないと「レーイ」と繋がる。
    readyVoice: {
        voice: {
            f0: 150, f0End: 132, gain: 0.16, Q: 9,
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
