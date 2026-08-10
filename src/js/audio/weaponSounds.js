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
 * @property {{count:number,gap:number|number[],freq:number,dur:number,gain:number,
 *   step?:number,Q?:number,metal?:number,fade?:number}} [clicks]
 *   金属の打撃。gap は配列で1回ごとに変えられる（等間隔だと機械的すぎる）。
 *   step は打撃ごとの音程の倍率、metal は重ねる非整数倍の比。
 *   fade は打撃ごとに音量を落とす割合。負の値を与えると逆に持ち上がる
 *   （音程を下げると通る帯域が狭まって痩せるので、その補正に使う）
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
    // 打撃ごとに音程を下げる（1000 → 720 → 518Hz）。上げていくと軽い機構に
    // 聞こえる。下げて重い部品が収まる形にした。
    // ただし低いほどバンドパスを通る帯域が狭まって痩せるので、fade を負に
    // して持ち上げ、最後の低い一撃が先頭の 70% の強さで残るようにしてある。
    reload: {
        clicks: {
            count: 3, gap: [0.045, 0.085], freq: 1000, step: 0.72,
            // 鋭い共鳴はノイズのエネルギーの大半を捨てるので、他の音と同じ
            // 感覚の 0.115 では -16dB まで落ちる。実測から決めた補正込みの値
            dur: 0.055, gain: 0.398, Q: 7, metal: 2.76, fade: -0.12,
        },
    },

    // --- グレネード ---
    // 撃つのではなく放り出すので、抜けの良い短い一撃。
    grenade: {
        hiss: { from: 1200, to: 300, dur: 0.10, gain: 0.08 },
        tone: { type: 'triangle', from: 300, to: 110, dur: 0.09, gain: 0.06 },
    },
};

/** 減衰の下限。exponentialRamp は 0 を受け付けない。 */
const FLOOR = 0.0008;

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

        let t = t0;
        for (let i = 0; i < count; i++) {
            const fade = 1 - i * fadeStep;
            const f = freq * Math.pow(step, i);

            // 芯の共鳴と、整数倍でない共鳴。後者が金属らしさを作る
            for (const [center, q, levelScale] of [[f, Q, 1], [f * metal, Q * 1.5, 0.45]]) {
                const noise = ctx.createBufferSource();
                noise.buffer = noiseBuffer;

                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = center;
                filter.Q.value = q;

                const g = ctx.createGain();
                g.gain.setValueAtTime(gain * levelScale * level * fade, t);
                g.gain.exponentialRampToValueAtTime(FLOOR, t + dur);

                noise.connect(filter);
                filter.connect(g);
                g.connect(out);
                noise.start(t);
                noise.stop(t + dur);
            }

            t += Array.isArray(gap) ? (gap[i] ?? gap[gap.length - 1]) : gap;
        }
    }
}
