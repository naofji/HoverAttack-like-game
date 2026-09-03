import test from 'node:test';
import assert from 'node:assert';

import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { stageRankingView } from '../src/js/systems/StageRankingManager.js';
import { STAGE_PALETTES } from '../src/js/utils/Constants.js';

/**
 * 面別ランキングは「上段＝この端末のローカル記録／下段＝世界のグローバル記録」の
 * 2段。オンラインは常時つながっている前提の Web ゲームなので、どちらか一方を
 * 選んで出すのではなく両方並べる。
 *
 * ここで縛るのは3つ:
 *   1. どちらのデータがどちらの段に行くか（取り違えると嘘の記録を見せる）
 *   2. 空欄の文言の出し分け（まだ誰も出していない / 通信できていない）
 *   3. 2段にして縦がはみ出していないこと
 */

const CANVAS = { width: 1366, height: 768 };

function renderer() {
    return new ScreenRenderer({ canvas: CANVAS });
}

/** fillText の呼び出しを {text, x, y} に均す。 */
function texts(ctx) {
    return ctx.calls
        .filter((c) => c.name === 'fillText')
        .map((c) => ({ text: String(c.args[0]), x: c.args[1], y: c.args[2] }));
}

/** 先頭一致で1件引く（名前は国旗が後ろに付くので完全一致では引けない）。 */
function find(ctx, prefix) {
    const hit = texts(ctx).find((t) => t.text.startsWith(prefix));
    assert.ok(hit, `"${prefix}" で始まる文字が描かれていない`);
    return hit;
}

function countText(ctx, text) {
    return texts(ctx).filter((t) => t.text === text).length;
}

const LOCAL = {
    time: [{ name: 'LOCALT', timeMs: 83400, country: 'JP' }],
    score: [{ name: 'LOCALS', score: 45200, country: 'JP' }],
};
const GLOBAL = {
    time: [{ name: 'GLOBT', timeMs: 71000, country: 'US' }],
    score: [{ name: 'GLOBS', score: 61800, country: 'US' }],
};

// --- stageRankingView（純ロジック） ---

test('stageRankingView: その面のオンライン記録とローカル記録を両方返す', () => {
    const onlineData = { stageRankings: [{ stage: 2, time: GLOBAL.time, score: GLOBAL.score }] };
    const view = stageRankingView(onlineData, 2, LOCAL);

    assert.deepStrictEqual(view.local, LOCAL);
    assert.deepStrictEqual(view.global.time, GLOBAL.time);
    assert.deepStrictEqual(view.global.score, GLOBAL.score);
    assert.strictEqual(view.online, true);
});

test('stageRankingView: オンライン未取得なら online:false で下段は空', () => {
    const view = stageRankingView(null, 2, LOCAL);

    assert.deepStrictEqual(view.local, LOCAL);
    assert.deepStrictEqual(view.global, { time: [], score: [] });
    assert.strictEqual(view.online, false);
});

test('stageRankingView: 取得できていてその面の記録が無いだけなら online:true', () => {
    const view = stageRankingView({ stageRankings: [{ stage: 5, time: [], score: [] }] }, 2, LOCAL);

    assert.deepStrictEqual(view.global, { time: [], score: [] });
    assert.strictEqual(view.online, true);
});

// --- 描画 ---

test('ローカルは上段・グローバルは下段に描かれる', () => {
    const ctx = makeFakeCtx();
    renderer().drawStageRankings(ctx, 0, { local: LOCAL, global: GLOBAL, online: true }, STAGE_PALETTES[0]);

    const localTime = find(ctx, 'LOCALT');
    const localScore = find(ctx, 'LOCALS');
    const globalTime = find(ctx, 'GLOBT');
    const globalScore = find(ctx, 'GLOBS');

    assert.ok(localTime.y < globalTime.y, `タイム列: ローカル(${localTime.y}) がグローバル(${globalTime.y}) より下にある`);
    assert.ok(localScore.y < globalScore.y, `スコア列: ローカル(${localScore.y}) がグローバル(${globalScore.y}) より下にある`);
    // 同じ段の2列は同じ行に並ぶ
    assert.strictEqual(localTime.y, localScore.y);
    assert.strictEqual(globalTime.y, globalScore.y);
    // タイムが左列・スコアが右列
    assert.ok(localTime.x < localScore.x);
    assert.ok(globalTime.x < globalScore.x);
});

test('段の見出しは LOCAL が上・GLOBAL が下', () => {
    const ctx = makeFakeCtx();
    renderer().drawStageRankings(ctx, 0, { local: LOCAL, global: GLOBAL, online: true }, STAGE_PALETTES[0]);

    const local = texts(ctx).find((t) => t.text.includes('LOCAL'));
    const global = texts(ctx).find((t) => t.text.includes('GLOBAL'));
    assert.ok(local && global, '段の見出しが無い');
    assert.ok(local.y < global.y);
});

test('オンライン未取得の下段は OFFLINE、記録が無いだけの上段は NO RECORDS YET', () => {
    const ctx = makeFakeCtx();
    const empty = { time: [], score: [] };
    renderer().drawStageRankings(ctx, 0, { local: empty, global: empty, online: false }, STAGE_PALETTES[0]);

    // 下段の2列が OFFLINE、上段の2列が NO RECORDS YET
    assert.strictEqual(countText(ctx, 'OFFLINE'), 2);
    assert.strictEqual(countText(ctx, 'NO RECORDS YET'), 2);
    const offline = texts(ctx).filter((t) => t.text === 'OFFLINE');
    const noRecords = texts(ctx).filter((t) => t.text === 'NO RECORDS YET');
    assert.ok(Math.min(...offline.map((t) => t.y)) > Math.max(...noRecords.map((t) => t.y)),
        'OFFLINE は下段（グローバル）に出るはず');
});

test('取得できていて記録が0件なら下段も NO RECORDS YET（OFFLINE ではない）', () => {
    const ctx = makeFakeCtx();
    const empty = { time: [], score: [] };
    renderer().drawStageRankings(ctx, 0, { local: empty, global: empty, online: true }, STAGE_PALETTES[0]);

    assert.strictEqual(countText(ctx, 'OFFLINE'), 0);
    assert.strictEqual(countText(ctx, 'NO RECORDS YET'), 4);
});

test('4つの表が満杯でも画面からはみ出さない', () => {
    // 2段にすると縦が足りなくなるのがこの変更の一番の危険。
    // 開始ヒント（canvas.height - 20）より下に何も描かれないことで縛る。
    const five = (make) => Array.from({ length: 5 }, (_, i) => make(i));
    const full = {
        time: five((i) => ({ name: `NAME${i}`, timeMs: 80000 + i * 1000, country: 'JP' })),
        score: five((i) => ({ name: `NAME${i}`, score: 50000 - i * 1000, country: 'JP' })),
    };
    const ctx = makeFakeCtx();
    renderer().drawStageRankings(ctx, 0, { local: full, global: full, online: true }, STAGE_PALETTES[0]);

    const maxY = Math.max(...texts(ctx).map((t) => t.y));
    assert.ok(maxY <= CANVAS.height - 20,
        `開始ヒント(${CANVAS.height - 20})より下に文字が出ている: ${maxY}`);
});
