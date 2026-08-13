// ============================================
// settings - ユーザー設定の既定値・読み書き・刻み
// ============================================
//
// 音を鳴らす処理からも描画からも切り離してある。値の解釈と localStorage の
// 扱いは DOM もオーディオも要らないので、ここだけを単体で試せるようにするため
// （既存の utils/bgmVolume.js と同じ立ち位置）。
//
// 保存は1キーに JSON でまとめる。項目を足すたびに localStorage のキーが
// 増えていくのを避けるため。

import {
    SETTINGS_STORAGE_KEY, BGM_VOLUME_STORAGE_KEY,
    BGM_VOLUME_DEFAULT, VOLUME_STEP_FINE,
} from './Constants.js';
import { clampVolume } from './bgmVolume.js';

/**
 * 既定値は**すべて「今の挙動」**に合わせてある。設定を触らない人にとって
 * この変更が何も変わらないようにするため。
 * - masterVolume / seVolume 1.0 … 今は音量を絞る手段が無い
 * - autoSwitchMissile false  … 今はドッキングで持ち替えない
 * - mgAutoReload true        … 今は残弾50%以下＋引き金を離すと自動装填する
 */
export const DEFAULT_SETTINGS = Object.freeze({
    masterVolume: 1.0,
    bgmVolume: BGM_VOLUME_DEFAULT,
    seVolume: 1.0,
    autoSwitchMissile: false,
    mgAutoReload: true,
});

/** 値の型。読み込みのときの検証と、A/D の扱いの両方がこれを見る。 */
const KINDS = {
    masterVolume: 'volume',
    bgmVolume: 'volume',
    seVolume: 'volume',
    autoSwitchMissile: 'flag',
    mgAutoReload: 'flag',
};

/** 掛け算の丸め。0.3*0.3 が 0.09000000000000001 になるのを避ける。 */
function round3(v) {
    return Math.round(v * 1000) / 1000;
}

/** 1項目ぶんの検証。壊れていれば既定値を返す（例外は投げない）。 */
function coerce(key, value) {
    const kind = KINDS[key];
    if (kind === 'volume') {
        return Number.isFinite(value) ? clampVolume(value) : DEFAULT_SETTINGS[key];
    }
    if (kind === 'flag') {
        return typeof value === 'boolean' ? value : DEFAULT_SETTINGS[key];
    }
    return DEFAULT_SETTINGS[key];
}

/**
 * 保存した設定を読む。壊れた値・未知のキー・localStorage が使えない環境では
 * 黙って既定値に落とす（プライベートブラウジングでは getItem が例外を投げる）。
 * @param {Storage} [storage]
 */
export function loadSettings(storage = globalThis.localStorage) {
    const out = { ...DEFAULT_SETTINGS };
    let raw = null;
    try {
        raw = storage && storage.getItem(SETTINGS_STORAGE_KEY);
    } catch (e) { /* プライベートブラウジング */ }

    if (raw == null) {
        // 新しいキーがまだ無いときだけ、-/+ で保存していた旧キーを引き継ぐ。
        // 引き継がないと、この変更を入れた瞬間に音量が既定へ戻ってしまう。
        try {
            const old = storage && storage.getItem(BGM_VOLUME_STORAGE_KEY);
            if (old != null) {
                const v = Number.parseFloat(old);
                if (Number.isFinite(v)) out.bgmVolume = clampVolume(v);
            }
        } catch (e) { /* 同上 */ }
        return out;
    }

    let parsed = null;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        return out;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (Object.hasOwn(parsed, key)) out[key] = coerce(key, parsed[key]);
    }
    return out;
}

/**
 * 設定を保存する。保存できなくてもゲームは続くので黙って諦める。
 * **旧キー（BGM_VOLUME_STORAGE_KEY）は消さない。** この変更を戻したときに
 * 以前の音量が残るようにするため。
 */
export function saveSettings(settings, storage = globalThis.localStorage) {
    try {
        if (!storage) return;
        const out = {};
        for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = coerce(key, settings[key]);
        storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(out));
    } catch (e) { /* 容量超過・プライベートブラウジング */ }
}

/**
 * マスターを掛けた実効音量。
 *
 * BGM と効果音は別々の経路で出ている（効果音は seFade→seMaster→コンプレッサ、
 * BGM は BGMManager が自前の音量を持つ）ので、両方の上に1つノードを差し込む
 * 配線変更はせず、適用時に掛ける。音の配線に手を入れないので、実測で詰めてきた
 * 既存の音量バランスに影響しない。
 * @returns {{bgm: number, se: number}}
 */
export function effectiveVolumes(settings) {
    const m = clampVolume(settings.masterVolume);
    return {
        bgm: round3(m * clampVolume(settings.bgmVolume)),
        se: round3(m * clampVolume(settings.seVolume)),
    };
}

/**
 * 1項目を1段動かした設定を返す（元は書き換えない）。
 *
 * ON/OFF は「反転」ではなく**向きで決める**（A で OFF、D で ON）。反転にすると
 * 連打したときにどちらになるか画面を見ないと分からない。
 * @param {object} settings
 * @param {string} key
 * @param {number} direction +1 / -1
 * @param {number} [step] 音量の刻み。既定は設定画面用の細かいほう
 */
export function stepSetting(settings, key, direction, step = VOLUME_STEP_FINE) {
    const kind = KINDS[key];
    if (!kind) return settings;
    if (kind === 'volume') {
        const next = clampVolume(clampVolume(settings[key]) + Math.sign(direction) * step);
        return { ...settings, [key]: next };
    }
    return { ...settings, [key]: direction > 0 };
}
