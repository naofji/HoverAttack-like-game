// ============================================
// HighScore Manager - weekly ranking (local)
// ============================================
//
// 以前は週が替わるとき前週の上位3件をローカルの「殿堂」（hoverattack_wall_of_fame）へ
// 保存していたが、WALL OF FAME の画面はオンライン（GAS）の fame を出していて、ローカルの
// 殿堂を読む所が無かったので 2026-11-04 に消した（読み出しの getWallOfFame も）。
// 既に保存されているキーは読まずに放っておく（害は無い）

const WEEKLY_KEY = 'hoverattack_weekly_ranking';
const MAX_WEEKLY = 20;
const MIN_SCORE = 10000; // Scores must exceed this to be recordable.

export class HighScoreManager {
    constructor(weekId) {
        this.weekId = weekId;
        this.scores = [];        // this week's ranking (up to MAX_WEEKLY)
        this._load();
    }

    _load() {
        // Load this week's ranking; roll over if the stored week differs.
        let stored = null;
        try {
            const data = localStorage.getItem(WEEKLY_KEY);
            stored = data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Failed to load weekly ranking:', e);
            stored = null;
        }

        if (stored && stored.weekId === this.weekId) {
            this.scores = Array.isArray(stored.scores) ? stored.scores : [];
        } else {
            // New week: reset.
            this.scores = [];
            this._saveWeekly();
        }
    }

    _saveWeekly() {
        try {
            localStorage.setItem(WEEKLY_KEY, JSON.stringify({ weekId: this.weekId, scores: this.scores }));
        } catch (e) {
            console.error('Failed to save weekly ranking:', e);
        }
    }


    isHighScore(score) {
        if (score <= MIN_SCORE) return false;
        if (this.scores.length < MAX_WEEKLY) return true;
        return score > this.scores[this.scores.length - 1].score;
    }

    /**
     * @param {number} [tries=1] セーブ地点から何回目の挑戦か。
     *   **同点のときだけ**順位に効く（少ないほうが上）。スコアそのものは
     *   減らさない——セーブの 10000 点コストで既に払っているので二重取りにしない。
     */
    addScore(name, score, mission, clearTime = null, country = '', tries = 1) {
        const entry = {
            name: (name || 'AAA').toUpperCase().substring(0, 10),
            score: score,
            mission: mission,
            clearTime: clearTime,
            country: country || '',
            tries: Number(tries) || 1,
        };
        this.scores.push(entry);
        // 保存済みの古いエントリには tries が無いので、ここで `|| 1` して吸収する
        // （_load() で書き換えると保存データを汚すため、比較側だけで吸収する）。
        this.scores.sort((a, b) => (b.score - a.score) || ((Number(a.tries) || 1) - (Number(b.tries) || 1)));
        if (this.scores.length > MAX_WEEKLY) {
            this.scores = this.scores.slice(0, MAX_WEEKLY);
        }
        this._saveWeekly();
        return this.scores.indexOf(entry);
    }

    /** This week's ranking (up to MAX_WEEKLY entries). */
    getTop10() {
        return this.scores;
    }
}
