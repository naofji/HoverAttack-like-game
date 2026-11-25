// 復活（respawn）した自機は、作ったばかりの自機と同じ状態から始まる（決まった違いを除く）。
// 2026-11-26 まで constructor と respawn() に同じ初期化が約40行ずつ書かれていて、一時状態を足すたびに
// 両方へ書く必要があった（今は _resetLifeState() の1つ）。constructor にだけ足すと、前の命の値
// （糸の絡まり・反動など）が復活後に残るので、全項目をでたらめにしてから復活させて比べる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../src/js/entities/Player.js';
import { PLAYER_RESPAWN_INVINCIBLE_FRAMES } from '../src/js/utils/Constants.js';

// 作るときと復活とで違ってよいもの
const DIFFERENT = {
    docked: true,                                         // 復活は母艦の中から
    invincibleTimer: PLAYER_RESPAWN_INVINCIBLE_FRAMES,    // 復活の直後だけ無敵
};
// 復活では戻さないもの（機体の寸法＝変わらない、毎フレーム決め直す、前の命から引き継ぐ、復活が今の資源から決める）
const KEPT = ['game', 'width', 'height', 'onTerrain', 'motion', 'facingRight', 'lives', 'maxHp', '_dockAllFull'];

test('復活した自機は、作ったばかりの自機と同じ値に戻る（決まった違いを除く）', () => {
    const game = { input: null, particles: [], settings: {} };
    const fresh = new Player(game, 300, 400);
    const p = new Player(game, 100, 200);
    for (const k of Object.keys(p)) {
        if (KEPT.includes(k)) continue;
        const v = p[k];
        if (typeof v === 'number') p[k] = Number.isFinite(v) ? v + 7.5 : 12345;   // Infinity（mgSinceShot）も変える
        else if (typeof v === 'boolean') p[k] = !v;
        else if (typeof v === 'string') p[k] = 'junk';
    }
    p.respawn(300, 400);
    const stale = [];
    for (const k of Object.keys(fresh)) {
        if (KEPT.includes(k)) continue;
        const want = k in DIFFERENT ? DIFFERENT[k] : fresh[k];
        if (!Object.is(p[k], want)) stale.push(`${k}: ${p[k]}（作った直後は ${want}）`);
    }
    assert.deepEqual(stale, []);
});
