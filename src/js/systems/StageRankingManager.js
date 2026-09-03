// ============================================
// StageRankingManager - per-stage weekly rankings (local)
// Two lists per stage: fastest time (asc) and high score (desc), top 5 each.
// ============================================

const STAGE_KEY = 'hoverattack_stage_rankings';
export const STAGE_TOP = 5;
export const STAGE_COUNT = 7;

function emptyStages() {
    // posted: このスロットへ addStageResult で取り込んだ (name, timeMs, score) の
    // 組み合わせを覚えておくための重複排除用リスト。time/score には出さない
    // (表示に使うのは time/score だけ)。
    return Array.from({ length: STAGE_COUNT }, () => ({ time: [], score: [], posted: [] }));
}

/**
 * 面別ランキング画面に渡す1面ぶんのデータ。**ローカルとグローバルを両方返す。**
 *
 * 以前は「オンラインに記録があればオンライン、無ければローカル」と片方だけを
 * 選んで出していたが、ブラウザで遊ぶゲームである以上つながっているのが普通なので、
 * 実質いつもグローバルしか見えず、自分の記録が画面から消えていた。上下2段に
 * 並べれば画面を増やさずに両方見せられる。
 *
 * `online` は「取得できたか」であって「記録があるか」ではない。空欄の文言を
 * OFFLINE と NO RECORDS YET で出し分けるために要る（記録が0件なのと通信できて
 * いないのとでは、プレイヤーが取る行動が違う）。
 *
 * @param {{stageRankings?: Array}|null} onlineData - game.onlineData（未取得なら null）
 * @param {number} stage - 1..7
 * @param {{time:Array, score:Array}} localData - StageRankingManager.getStage(stage)
 * @returns {{local:{time:Array,score:Array}, global:{time:Array,score:Array}, online:boolean}}
 */
export function stageRankingView(onlineData, stage, localData) {
    const list = onlineData && Array.isArray(onlineData.stageRankings) ? onlineData.stageRankings : null;
    const entry = list ? list.find((e) => e && e.stage === stage) : null;
    return {
        local: localData || { time: [], score: [] },
        global: {
            time: (entry && Array.isArray(entry.time)) ? entry.time : [],
            score: (entry && Array.isArray(entry.score)) ? entry.score : [],
        },
        online: !!onlineData,
    };
}

export class StageRankingManager {
    constructor(weekId) {
        this.weekId = weekId;
        this.stages = emptyStages();
        this._load();
    }

    _load() {
        let stored = null;
        try {
            const data = localStorage.getItem(STAGE_KEY);
            stored = data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Failed to load stage rankings:', e);
            stored = null;
        }
        if (stored && stored.weekId === this.weekId && Array.isArray(stored.stages) && stored.stages.length === STAGE_COUNT) {
            this.stages = stored.stages.map((s) => ({
                time: Array.isArray(s.time) ? s.time : [],
                score: Array.isArray(s.score) ? s.score : [],
                // 旧バージョンの保存データには posted が無い。無ければ空扱い
                // (古いローカルデータでは重複排除が効かないが、実害は小さい)
                posted: Array.isArray(s.posted) ? s.posted : [],
            }));
        } else {
            this.stages = emptyStages();
            this._save();
        }
    }

    _save() {
        try {
            localStorage.setItem(STAGE_KEY, JSON.stringify({ weekId: this.weekId, stages: this.stages }));
        } catch (e) {
            console.error('Failed to save stage rankings:', e);
        }
    }

    _slot(stage) {
        const idx = stage - 1;
        if (idx < 0 || idx >= STAGE_COUNT) return null;
        return this.stages[idx];
    }

    addStageResult(stage, { name, timeMs, score, country }) {
        const slot = this._slot(stage);
        if (!slot) return;
        const nm = (name || 'AAA').toUpperCase().substring(0, 10);
        const co = country || '';
        // コンティニューはセーブ地点より前の面の stageResults を丸ごと復元するので、
        // 死ぬたびに同じ面の記録が何度もここへ来る。投稿側(呼び出し元)は止めない
        // ――「復元した stageResults は投稿済み」と印を付ける案だと、セーブ後に
        // 一度も投稿せずブラウザを閉じたときセーブ前の面の記録が永久に失われる
        // (今の挙動からの退行)。timeMs はミリ秒精度なので、正当な再挑戦が
        // name+timeMs+score まで完全一致することは実質起こらない。
        if (!Array.isArray(slot.posted)) slot.posted = [];
        const isDuplicate = slot.posted.some((p) => p.name === nm && p.timeMs === timeMs && p.score === score);
        if (isDuplicate) return;
        slot.posted.push({ name: nm, timeMs, score });
        slot.time.push({ name: nm, timeMs, country: co });
        slot.time.sort((a, b) => a.timeMs - b.timeMs);
        slot.time = slot.time.slice(0, STAGE_TOP);
        slot.score.push({ name: nm, score, country: co });
        slot.score.sort((a, b) => b.score - a.score);
        slot.score = slot.score.slice(0, STAGE_TOP);
        this._save();
    }

    getStage(stage) {
        const slot = this._slot(stage);
        return slot ? { time: slot.time, score: slot.score } : { time: [], score: [] };
    }

    wouldRankTime(stage, timeMs) {
        const slot = this._slot(stage);
        if (!slot) return false;
        if (slot.time.length < STAGE_TOP) return true;
        return timeMs < slot.time[slot.time.length - 1].timeMs;
    }

    wouldRankScore(stage, score) {
        const slot = this._slot(stage);
        if (!slot) return false;
        if (slot.score.length < STAGE_TOP) return true;
        return score > slot.score[slot.score.length - 1].score;
    }
}
