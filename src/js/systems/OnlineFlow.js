// ============================================
// Online / Ranking Flow
// ============================================
//
// 週間ランキングの取得と送信、名前入力画面、そして「この面はトップ5に
// 入るか」の判定。main.js から切り出した。
//
// 面別ランクインの判定をオンラインとローカルの2経路に分けているのは、
// オンラインが落ちていても名前入力の入口を閉ざさないため
// （_wouldStageRank がその分岐を1箇所にまとめている）。
//
// settingsFlow.js と同じく **Object.assign で Game に混ぜる前提**の
// オブジェクトリテラルで、`this` は Game を指す。

import { getCountryCode } from '../utils/geo.js';
import { formatClock } from '../utils/formatTime.js';
import { audioManager } from '../audio/AudioManager.js';

export const OnlineFlow = {
    async _refreshOnline() {
        if (!this.onlineLeaderboard || !this.onlineLeaderboard.url) {
            this.onlineStatus = 'offline';
            return;
        }
        this.onlineStatus = 'loading';
        const res = await this.onlineLeaderboard.fetchData();
        if (res.ok) {
            this.onlineData = res;
            this.onlineStatus = 'ok';
        } else {
            this.onlineStatus = 'offline';
        }
    },

    async _submitOnline(name, score, mission, clearTime, country, tries) {
        if (!this.onlineLeaderboard || !this.onlineLeaderboard.url) return;
        // weekId はマップ生成に使った週（init() で1回だけ決まる this.week）をそのまま送る。
        // サーバー受信時刻から週を計算すると、週境界をまたいでクリアしたとき
        // 「遊んだ地形の週」と「記録される週」がずれるため。
        const res = await this.onlineLeaderboard.submit({ name, score, mission, clearTime, country, tries, weekId: this.week.weekId });
        if (res.ok) {
            this.globalRankIndex = res.rank;
            await this._refreshOnline();
        }
    },

    _updateRankingEntry() {
        const chars = this.input.getTypedChars();
        for (const c of chars) {
            if (c === 'Backspace') {
                this.playerNameInput = this.playerNameInput.slice(0, -1);
            } else if (c === 'Enter') {
                if (this.playerNameInput.trim().length === 0) this.playerNameInput = 'AAA';
                const displayMission = Math.min(7, this.missionsCompleted + 1);
                const formattedTime = this.missionsCompleted >= 7 ? formatClock(this.totalTime) : null;
                const country = getCountryCode();
                // Overall weekly ranking: only recorded when it's an actual high score.
                // (A stage-only qualifier reaches naming to save per-stage records, but
                // must not be inserted into the overall ranking.)
                this.globalRankIndex = -1; // clear until this submission's own rank comes back (avoids stale highlight)
                // 面セレクトのランは週スコアへ登録しない（送信もしない）。
                // 判定側(_tryGoToRanking)だけを塞ぐと、面別で名前入力に来たときに
                // ここが通ってしまう
                if (!this.stageSelectRun && this.highScoreManager.isHighScore(this.score)) {
                    this.localRankIndex = this.highScoreManager.addScore(
                        this.playerNameInput, this.score, displayMission, formattedTime, country, this.runTries
                    );
                    this._submitOnline(this.playerNameInput, this.score, displayMission, formattedTime, country, this.runTries);
                } else {
                    this.localRankIndex = -1;
                }
                // Persist this run's per-stage results locally (and online in Task 6).
                for (const r of this.stageResults) {
                    this.stageRankingManager.addStageResult(r.stage, {
                        name: this.playerNameInput,
                        timeMs: r.timeMs,
                        score: r.score,
                        country,
                    });
                }
                if (this.stageResults.length > 0 && this.onlineLeaderboard && this.onlineLeaderboard.url) {
                    this.onlineLeaderboard.submitStages({
                        name: this.playerNameInput,
                        country,
                        stages: this.stageResults.map((r) => ({ stage: r.stage, timeMs: r.timeMs, score: r.score })),
                        weekId: this.week.weekId,
                    });
                }
                this._restoreFullscreen();
                this.gameState = 'local_ranking_display';
                this.stateTimer = 0;
                audioManager.playTitleBGM();
            } else if (this.playerNameInput.length < 10) {
                this.playerNameInput += c.toUpperCase();
            }
        }
    },
    _onlineStageEntry(stage) {
        const sr = this.onlineData && this.onlineData.stageRankings;
        if (!Array.isArray(sr)) return null;
        return sr.find((e) => e.stage === stage) || null;
    },

    /**
     * その記録が面別トップ5に入るか。オンラインの記録が取れていればそれで、
     * 取れていなければ手元の記録で判定する。
     *
     * タイムとスコアは「短いほど良い／高いほど良い」が逆なだけで手順は同じ
     * なので、良し悪しの比較だけを betterThanLast で受け取る。
     *
     * @param {number} stage 面番号（1..7）
     * @param {'time'|'score'} kind どちらの順位表か
     * @param {(worstEntry: object) => boolean} betterThanLast 5位より良ければ true
     * @param {() => boolean} localFallback オンラインが無いときの手元判定
     */
    _wouldStageRank(stage, kind, betterThanLast, localFallback) {
        const online = this._onlineStageEntry(stage);
        if (online) {
            const list = online[kind] || [];
            return list.length < 5 || betterThanLast(list[list.length - 1]);
        }
        return this.stageRankingManager ? localFallback() : false;
    },

    _wouldStageRankTime(stage, timeMs) {
        return this._wouldStageRank(
            stage, 'time',
            (worst) => timeMs < worst.timeMs,
            () => this.stageRankingManager.wouldRankTime(stage, timeMs),
        );
    },

    _wouldStageRankScore(stage, score) {
        return this._wouldStageRank(
            stage, 'score',
            (worst) => score > worst.score,
            () => this.stageRankingManager.wouldRankScore(stage, score),
        );
    },
    /** Navigate to ranking entry if high score, otherwise return to title */
    _tryGoToRanking() {
        // Eligible to name if the overall run is a high score OR any cleared stage
        // would make its per-stage top 5 (so partial runs can still leave a record).
        // **面セレクトのランは週スコアに出さない**ので、週ハイスコアの側は見ない。
        // 単独の1面だけを遊んだ記録が通しランと同じ表に並ぶのは筋が通らないため。
        const weeklyEligible = !this.stageSelectRun && this.highScoreManager.isHighScore(this.score);
        const eligible = weeklyEligible || this._anyStageWouldRank();
        if (eligible) {
            this.gameState = 'ranking_entry';
            this.playerNameInput = "";
            audioManager.playRankingBGM();
        } else {
            // 全クリアからここへ来る経路があるので、タイトルへは
            // _enterDemoState を通す（効果音を落とすのはそちらの仕事）
            this._enterDemoState('title');
        }
    },

    /** True if any buffered stage result would rank top 5 (by time or score). */
    _anyStageWouldRank() {
        for (const r of this.stageResults) {
            if (this._wouldStageRankTime(r.stage, r.timeMs) || this._wouldStageRankScore(r.stage, r.score)) {
                return true;
            }
        }
        return false;
    },
};
