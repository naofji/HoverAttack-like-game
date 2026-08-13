/**
 * BGM 音量の刻みと保存。
 *
 * 音を鳴らす処理からは切り離してある。段の計算と localStorage の扱いは
 * DOM もオーディオも要らないので、ここだけを単体で試せるようにするため。
 */
import {
    VOLUME_STEP_COARSE, BGM_VOLUME_DEFAULT, BGM_VOLUME_STORAGE_KEY,
} from './Constants.js';

/** 0〜1 に丸める。段の境界で 0.30000000000000004 にならないよう桁も落とす。 */
export function clampVolume(v) {
    if (!Number.isFinite(v)) return BGM_VOLUME_DEFAULT;
    return Math.round(Math.max(0, Math.min(1, v)) * 1000) / 1000;
}

/**
 * 1段上げ下げした音量を返す。
 * @param {number} current 現在の音量（0〜1）
 * @param {number} direction +1 で上げ、-1 で下げ
 * @param {number} [step] 1段の幅。既定は -/+ キー用の粗いほう
 */
export function stepVolume(current, direction, step = VOLUME_STEP_COARSE) {
    return clampVolume(clampVolume(current) + Math.sign(direction) * step);
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

/** 音量を保存する。保存できなくてもゲームは続くので黙って諦める。 */
export function saveBgmVolume(v, storage = globalThis.localStorage) {
    try {
        if (storage) storage.setItem(BGM_VOLUME_STORAGE_KEY, String(clampVolume(v)));
    } catch (e) { /* 容量超過・プライベートブラウジング */ }
}
