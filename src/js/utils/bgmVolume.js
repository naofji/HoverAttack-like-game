/**
 * BGM 音量の丸めと、旧キー（hoverAttack.bgmVolume）の読み込み。
 *
 * 音量の上げ下げと保存は設定画面（utils/settings.js の stepSetting / saveSettings）に移った。
 * 以前ここにあった -/+ キー用の stepVolume と、旧キーへ書く saveBgmVolume は、呼び出し元が
 * 無くなったので 2026-11-04 に消した。旧キーは前回の設定を引き継ぐために読むだけ。
 *
 * 音を鳴らす処理からは切り離してある。段の計算と localStorage の扱いは
 * DOM もオーディオも要らないので、ここだけを単体で試せるようにするため。
 */
import {
    BGM_VOLUME_DEFAULT, BGM_VOLUME_STORAGE_KEY,
} from './Constants.js';

/** 0〜1 に丸める。段の境界で 0.30000000000000004 にならないよう桁も落とす。 */
export function clampVolume(v) {
    if (!Number.isFinite(v)) return BGM_VOLUME_DEFAULT;
    return Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;
}

/** 表示用のパーセント（0〜100の整数）。 */
export function volumePercent(v) {
    return Math.round(clampVolume(v) * 100);
}

/**
 * 保存した音量を読む。壊れた値や localStorage が使えない環境では既定値。
 * プライベートブラウジングでは getItem が例外を投げることがある。
 */
export function loadBgmVolume(storage = globalThis.localStorage) {
    try {
        const raw = storage && storage.getItem(BGM_VOLUME_STORAGE_KEY);
        if (raw == null) return BGM_VOLUME_DEFAULT;
        const v = Number.parseFloat(raw);
        return Number.isFinite(v) ? clampVolume(v) : BGM_VOLUME_DEFAULT;
    } catch (e) {
        return BGM_VOLUME_DEFAULT;
    }
}
