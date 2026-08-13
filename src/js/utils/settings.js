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
    MG_RELOAD_THRESHOLD_DEFAULT, MG_RELOAD_THRESHOLD_MIN, MG_RELOAD_THRESHOLD_MAX,
    AUTO_AIM_CANCEL_THRESHOLD_DEFAULT, AUTO_AIM_RELEASE_MIN, AUTO_AIM_RELEASE_MAX,
    AUTO_AIM_HOLD_TENTHS_DEFAULT, AUTO_AIM_HOLD_TENTHS_MIN, AUTO_AIM_HOLD_TENTHS_MAX,
} from './Constants.js';
import { clampVolume } from './bgmVolume.js';

/**
 * 既定値は**すべて「今の挙動」**に合わせてある。設定を触らない人にとって
 * この変更が何も変わらないようにするため。
 * - masterVolume / seVolume 1.0 … 今は音量を絞る手段が無い
 * - autoSwitchMissile false  … 今はドッキングで持ち替えない
 * - mgAutoReloadMode always  … 今は残弾がしきい値以下＋引き金を離すと自動装填する
 * - mgReloadThreshold 8      … 従来の「弾倉 16 発の 50%」と同じ
 * - autoAimRelease 4         … 従来の AUTO_AIM_CANCEL_THRESHOLD_DEFAULT と同じ
 * - autoFullscreen true      … 今もゲーム開始時に全画面へ入る
 * - autoAimHoldTenths 3      … 0.3 秒。長押しは新機能なので「取り違えない最短」を既定に
 * - autoAimResumeOnPickup true … 拾って何も起きないと壊れて見えるため
 */
export const DEFAULT_SETTINGS = Object.freeze({
    masterVolume: 1.0,
    bgmVolume: BGM_VOLUME_DEFAULT,
    seVolume: 1.0,
    autoSwitchMissile: false,
    mgAutoReloadMode: 'always',
    mgReloadThreshold: MG_RELOAD_THRESHOLD_DEFAULT,
    autoAimRelease: AUTO_AIM_CANCEL_THRESHOLD_DEFAULT,
    autoFullscreen: true,
    autoAimHoldTenths: AUTO_AIM_HOLD_TENTHS_DEFAULT,
    autoAimResumeOnPickup: true,
});

/**
 * オートリロードの発動条件。
 * - off      … 弾が尽きたときだけ装填する
 * - onSwitch … F でミサイルからマシンガンに持ち替えたときだけ装填する
 * - always   … 残弾がしきい値以下で引き金を離すと装填する（従来の ON）
 *
 * 並びは「装填が少ない順」。A/D で左右に動かしたとき、右へ行くほど手厚くなる。
 */
export const MG_AUTO_RELOAD_MODES = Object.freeze(['off', 'onSwitch', 'always']);

/**
 * 値の型。読み込みの検証と A/D の扱いの両方がこれを見る。
 * `choice` は選択肢の並びを、`int` は上下限を持つので、文字列ではなく
 * 記述子オブジェクトにしてある（設定を足すのは行を1つ足すだけで済む）。
 */
const KINDS = {
    masterVolume:      { kind: 'volume' },
    bgmVolume:         { kind: 'volume' },
    seVolume:          { kind: 'volume' },
    autoSwitchMissile: { kind: 'flag' },
    autoFullscreen:    { kind: 'flag' },
    mgAutoReloadMode:  { kind: 'choice', values: MG_AUTO_RELOAD_MODES },
    mgReloadThreshold: { kind: 'int', min: MG_RELOAD_THRESHOLD_MIN, max: MG_RELOAD_THRESHOLD_MAX },
    autoAimRelease:    { kind: 'int', min: AUTO_AIM_RELEASE_MIN, max: AUTO_AIM_RELEASE_MAX },
    autoAimResumeOnPickup: { kind: 'flag' },
    autoAimHoldTenths: { kind: 'int', min: AUTO_AIM_HOLD_TENTHS_MIN, max: AUTO_AIM_HOLD_TENTHS_MAX },
};

/** 掛け算の丸め。0.3*0.3 が 0.09000000000000001 になるのを避ける。 */
function round3(v) {
    return Math.round(v * 1000) / 1000;
}

/** 1項目ぶんの検証。壊れていれば既定値を返す（例外は投げない）。 */
function coerce(key, value) {
    const spec = KINDS[key];
    if (!spec) return DEFAULT_SETTINGS[key];
    switch (spec.kind) {
        case 'volume':
            return Number.isFinite(value) ? clampVolume(value) : DEFAULT_SETTINGS[key];
        case 'flag':
            return typeof value === 'boolean' ? value : DEFAULT_SETTINGS[key];
        case 'choice':
            return spec.values.includes(value) ? value : DEFAULT_SETTINGS[key];
        case 'int':
            // 範囲外はクランプせず既定値に落とす。保存値が範囲外になるのは
            // 「範囲の定義を変えた」か「壊れた」かのどちらかで、近い値を推測するより
            // 既定へ戻すほうが安全。音量は連続量なのでクランプが自然、という違い
            if (!Number.isInteger(value)) return DEFAULT_SETTINGS[key];
            return (value < spec.min || value > spec.max) ? DEFAULT_SETTINGS[key] : value;
        default:
            return DEFAULT_SETTINGS[key];
    }
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

    // 旧 mgAutoReload（真偽値）からの移行。既に設定を触った人の選択を捨てないため。
    // 消す処理は要らない — saveSettings は DEFAULT_SETTINGS のキーだけ書き出すので、
    // 次に保存した時点で自然に消える
    if (!Object.hasOwn(parsed, 'mgAutoReloadMode') && typeof parsed.mgAutoReload === 'boolean') {
        out.mgAutoReloadMode = parsed.mgAutoReload ? 'always' : 'off';
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
 * ON/OFF も3択も「反転」ではなく**向きで決める**（A で左、D で右）。反転や循環に
 * すると、連打したときにどこへ着くか画面を見ないと分からない。
 * @param {object} settings
 * @param {string} key
 * @param {number} direction +1 / -1
 * @param {number} [step] 音量の刻み。既定は設定画面用の細かいほう。volume 以外では使わない
 */
export function stepSetting(settings, key, direction, step = VOLUME_STEP_FINE) {
    const spec = KINDS[key];
    if (!spec) return settings;
    const dir = Math.sign(direction);
    switch (spec.kind) {
        case 'volume': {
            const next = clampVolume(clampVolume(settings[key]) + dir * step);
            return { ...settings, [key]: next };
        }
        case 'flag':
            return { ...settings, [key]: dir > 0 };
        case 'choice': {
            // 起点に coerce を通すのは、壊れた値から始めても動けるようにするため
            const cur = spec.values.indexOf(coerce(key, settings[key]));
            const next = Math.min(spec.values.length - 1, Math.max(0, cur + dir));
            return { ...settings, [key]: spec.values[next] };
        }
        case 'int': {
            const cur = coerce(key, settings[key]);
            return { ...settings, [key]: Math.min(spec.max, Math.max(spec.min, cur + dir)) };
        }
        default:
            return settings;
    }
}
