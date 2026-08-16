// ============================================
// 途中セーブと面セレクトの進捗。localStorage の 1 キーに JSON でまとめる。
//
// 設定（utils/settings.js）と同居させていないのは**寿命が違う**ため。
// 設定は週をまたいで永続、こちらは週が変われば丸ごと捨てる。1キーに混ぜると
// 週のロールオーバーで設定まで飛ぶ。
//
// storage を引数で受け取るのは、node --test に localStorage が無いから。
// 呼び出し側は既定値（globalThis.localStorage）のまま使えばよい。
// ============================================

import { SAVE_COST } from './Constants.js';
import { MODE_ORDER } from './modes.js';

export const PROGRESS_STORAGE_KEY = 'hoverattack_progress';

const MAX_STAGE = 7;

/** 何も無いときの姿。読めない・壊れている・週が違う、はすべてこれに落ちる。 */
function emptyProgress() {
    return { save: null, reached: 0 };
}

/**
 * 読んだ save を検証する。1つでも欠けたら null。
 * 部分的に直して使わないのは、中途半端な進捗で再開すると
 * スコアやタイムの辻褄が合わなくなるため。
 */
function sanitizeSave(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const missionsCompleted = num(raw.missionsCompleted);
    const score = num(raw.score);
    const totalTime = num(raw.totalTime);
    const tries = num(raw.tries);
    // 「非空文字列」だけでは、壊れた／改竄された mode が
    // SaveManager.applyContinue() の MODES[next.mode].gameSpeed で
    // TypeError になる（ScreenRenderer._drawSaveHints() は MODES[s.mode] ?
    // ... : s.mode で守っているため「行は出るのに C を押すと落ちる」という
    // 最悪の見え方になる）。既知のモード名だけを通し、外れたら未知の形として
    // save ごと捨てる。
    if (typeof raw.mode !== 'string' || !MODE_ORDER.includes(raw.mode)) return null;
    if (missionsCompleted === null || missionsCompleted < 1 || missionsCompleted >= MAX_STAGE) return null;
    if (score === null || score < 0) return null;
    if (totalTime === null || totalTime < 0) return null;
    if (tries === null || tries < 1) return null;
    if (!Array.isArray(raw.stageResults)) return null;
    return {
        mode: raw.mode,
        missionsCompleted: Math.floor(missionsCompleted),
        score: Math.floor(score),
        totalTime,
        stageResults: raw.stageResults.slice(),
        tries: Math.floor(tries),
    };
}

/**
 * 今週の進捗を読む。週IDが違えば丸ごと捨てる（面の中身が週で変わるので、
 * 続きも解放も意味を失う）。壊れた値・localStorage が使えない環境では既定値。
 * @param {string} weekId 今週のID
 * @param {Storage} [storage]
 */
export function loadProgress(weekId, storage = globalThis.localStorage) {
    let raw = null;
    try {
        raw = storage && storage.getItem(PROGRESS_STORAGE_KEY);
    } catch (e) { /* プライベートブラウジングでは getItem が投げる */ }
    if (raw == null) return emptyProgress();

    let parsed = null;
    try {
        parsed = JSON.parse(raw);
    } catch (e) {
        return emptyProgress();
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyProgress();
    if (parsed.weekId !== weekId) return emptyProgress();

    const reached = Number(parsed.reached);
    return {
        save: sanitizeSave(parsed.save),
        reached: Number.isFinite(reached) ? Math.min(MAX_STAGE, Math.max(0, Math.floor(reached))) : 0,
    };
}

/** 進捗を書く。保存できなくてもゲームは続くので黙って諦める。 */
export function writeProgress(weekId, progress, storage = globalThis.localStorage) {
    try {
        if (!storage) return;
        storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({
            weekId,
            save: progress && progress.save ? progress.save : null,
            reached: progress && Number.isFinite(progress.reached) ? progress.reached : 0,
        }));
    } catch (e) { /* 容量超過・プライベートブラウジング */ }
}

/** そのスコアでセーブ代を払えるか。ちょうど SAVE_COST なら払える（残 0）。 */
export function canSave(score) {
    return Number.isFinite(score) && score >= SAVE_COST;
}

/**
 * セーブを作る。**コストを引いた後のスコアを持たせる。**
 * 引く前の値を保存すると、再開してセーブし直すたびに得をする穴になる。
 */
export function makeSave({ mode, missionsCompleted, score, totalTime, stageResults }) {
    return {
        mode,
        missionsCompleted,
        score: score - SAVE_COST,
        totalTime,
        stageResults: Array.isArray(stageResults) ? stageResults.slice() : [],
        tries: 1,
    };
}

/** 再挑戦のたびに呼ぶ。元を書き換えないのは、保存に失敗しても状態が壊れないように。 */
export function bumpTries(save) {
    return { ...save, tries: save.tries + 1 };
}
