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
 *   puffs 短い破裂の連なり。ホーミングの「ボボッ」
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
}
