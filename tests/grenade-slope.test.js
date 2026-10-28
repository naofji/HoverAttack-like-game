// グレネードが坂と面取りの斜辺で法線の向きへ跳ね返り、坂を転がり落ちることのテスト（段3 Task 5）。
// 坂の地図は tests/player-slope.test.js と同じ（列 10〜19 が 45度で上る。上面 y = 30T − x）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Grenade } from '../src/js/entities/Grenade.js';
import { CombatActions } from '../src/js/systems/CombatActions.js';
import { makeMap, makeGame } from './helpers/enemy-world.js';
import { TILE_SIZE as T, GRENADE_LIFETIME, GRENADE_BOUNCE, GRENADE_GRAVITY } from '../src/js/utils/Constants.js';

function rampRows() {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 40; c++) {
            let floor = 20;
            if (c >= 10 && c <= 19) floor = 29 - c;
            else if (c >= 20 && c <= 29) floor = 10;
            s += r >= floor ? '#' : '.';
        }
        rows.push(s);
    }
    return rows;
}

// 谷: 列 10〜19 が右へ下り、列 21〜30 が右へ上る。底は列 20 の平らな1タイル（row 20）
function valleyRows() {
    const rows = [];
    for (let r = 0; r < 24; r++) {
        let s = '';
        for (let c = 0; c < 40; c++) {
            const floor = c >= 10 && c <= 30 ? 20 - Math.abs(c - 20) : 10;
            s += r >= floor ? '#' : '.';
        }
        rows.push(s);
    }
    return rows;
}

function world(rows) {
    const map = makeMap(rows, null, { tileShape: 'snowSlope' });
    map.width = map.cols * T;
    map.height = map.rows * T;
    map.destroyArea = () => [];
    return makeGame(map);
}

const surface = (x) => 30 * T - x;

/** 寿命を切らさずに frames だけ動かし、岩の中に入ったフレームを数える */
function roll(game, g, frames, onFrame = () => {}) {
    let inRock = 0;
    for (let f = 0; f < frames; f++) {
        g.lifetime = 1e9;
        g.update();
        if (game.map.isSolidPoint(g.x, g.y)) inRock++;
        onFrame(g, f);
    }
    return inRock;
}

test('斜辺へ真下に落ちたグレネードは、坂の下り側へ流れる', () => {
    const game = world(rampRows());
    const x = 15 * T + 4;
    const g = new Grenade(game, x, surface(x) - 30, Math.PI / 2, 0);
    let touched = false;
    const inRock = roll(game, g, 60, (gr) => { if (!touched && gr.vx !== 0) touched = true; });
    assert.ok(touched, '斜辺に触れていない');
    assert.ok(g.x < x, `下り側（左）へ流れていない x=${g.x}`);
    assert.equal(inRock, 0);
});

test('坂の上に置いたグレネードは、岩に入らずに転がり落ちて坂の下の平らな床で止まる', () => {
    const game = world(rampRows());
    const x = 15 * T;
    const g = new Grenade(game, x, surface(x) - 1, 0, 0);
    const inRock = roll(game, g, 1500);
    assert.equal(inRock, 0, `岩の中に入った: ${inRock} フレーム`);
    assert.ok(g.x < 10 * T, `坂の下まで転がっていない x=${g.x}`);
    assert.ok(Math.abs(g.vx) < 0.05, `止まっていない vx=${g.vx}`);
    assert.ok(g.y > 20 * T - 2 && g.y < 20 * T, `床の上にいない y=${g.y}`);
});

test('谷の底で止まったグレネードは、震えない', () => {
    const game = world(valleyRows());
    const x = 14 * T;
    const g = new Grenade(game, x, (20 - 6) * T - 20, 0, 0);
    const inRock = roll(game, g, 1500);
    assert.equal(inRock, 0, `岩の中に入った: ${inRock} フレーム`);
    const x0 = g.x, y0 = g.y;
    roll(game, g, 60);
    assert.ok(Math.abs(g.x - x0) < 0.01 && Math.abs(g.y - y0) < 0.01, `動き続けている (${x0}, ${y0}) → (${g.x}, ${g.y})`);
    assert.ok(g.x > 19 * T && g.x < 22 * T, `谷の底にいない x=${g.x}`);
});

test('坂のある地図でも、照準の軌道予測は実際のグレネードと1点も違わない', () => {
    const game = Object.assign(world(rampRows()), { barriers: [] }, CombatActions);
    for (const angle of [0.3, -0.3, -1.0, 1.2]) {
        const sx = 6 * T, sy = 17 * T;
        const trajectory = game._calcGrenadeTrajectory(sx, sy, angle, 5);
        const g = new Grenade(game, sx, sy, angle, 5);
        const actual = [];
        for (let i = 0; i < GRENADE_LIFETIME; i++) {
            g.update();
            if (i % 3 === 0) actual.push({ x: g.x, y: g.y });
        }
        assert.deepEqual(trajectory.points, actual, `角度 ${angle} でずれた`);
    }
});

test('斜辺へ法線の向きに速く当たると、法線の速さは GRENADE_BOUNCE 倍で逆向きになり、斜面に沿った速さは残る', () => {
    const game = world(rampRows());
    // 右へ上る坂の法線は左上 (−1, −1)/√2。右下へ (3, 3) で斜辺の 2px 手前から当てる
    const x = 15 * T + 4;
    const g = new Grenade(game, x - 2, surface(x) - 2, Math.PI / 4, 3 * Math.SQRT2);
    const vin = { x: g.vx, y: g.vy + GRENADE_GRAVITY };     // 重力を足した後に当たる
    g.lifetime = 1e9;
    g.update();
    const n = (v) => -(v.x + v.y) / Math.SQRT2;              // 外向きの法線の成分
    const t = (v) => (v.x - v.y) / Math.SQRT2;               // 斜面に沿った成分
    const vout = { x: g.vx, y: g.vy };
    assert.ok(n(vout) > 0, `跳ね返っていない v=(${vout.x}, ${vout.y})`);
    assert.ok(Math.abs(n(vout) - GRENADE_BOUNCE * -n(vin)) < 1e-9, `法線の速さ ${n(vout)}（入射 ${n(vin)}）`);
    assert.ok(Math.abs(t(vout) - t(vin)) < 1e-9, '斜面に沿った速さが変わった');
});

test('坂を転がる速さは、摩擦で頭打ちになる', () => {
    const game = world(rampRows());
    const x = 19 * T;
    const g = new Grenade(game, x, surface(x) - 1, 0, 0);
    let maxSpeed = 0;
    roll(game, g, 400, (gr) => { if (gr.x > 11 * T) maxSpeed = Math.max(maxSpeed, Math.hypot(gr.vx, gr.vy)); });
    assert.ok(maxSpeed > 0.5, `転がっていない ${maxSpeed}`);
    // 毎フレーム、重力の斜面方向の成分 0.2/√2 が足され、GRENADE_FRICTION 0.9 が掛かる。
    // 釣り合う速さは 0.9 × 0.1 / 0.1 × √2 ≈ 1.27。摩擦が無いと 8 タイルで 3px/フレームを超える
    assert.ok(maxSpeed < 1.5, `坂で加速し続けた ${maxSpeed}`);
});

// 段3の最終レビュー I1: 決定13 の前は、ブロックが壊れると坂だったタイルが小さい面取りに戻って岩が
// 増えた（坂の下の段を壊すと、その上の坂の削れていた所が岩になる）。中にいたグレネード・反射ビームは
// 岩の中で動けなくなった。今は壊れて岩が増えないが、岩の外へ出す備えを、壊れた後の地図に差し替えて縛る
function rampRowsWithout(r0, c0) {
    return rampRows().map((s, r) => (r === r0 ? s.slice(0, c0) + '.' + s.slice(c0 + 1) : s));
}

test('転がっている坂の下の段が壊れて岩が増えても、グレネードは岩の外へ出て転がり続ける', () => {
    const game = world(rampRows());
    const x = 13 * T + 8;
    const g = new Grenade(game, x, surface(x) - 0.5, 0, 0);
    roll(game, g, 3);
    // (17,12) を壊した地図。(16,13) は坂から面取りに戻り、グレネードのいる所が岩になる
    const broken = world(rampRowsWithout(17, 12)).map;
    assert.equal(broken.isSolidPoint(g.x, g.y), true, '前提: 壊れた後はグレネードの位置が岩');
    game.map = broken;
    const inRock = roll(game, g, 120);
    assert.ok(inRock <= 1, `岩の中に ${inRock} フレーム残った`);
    assert.equal(broken.isSolidPoint(g.x, g.y), false);
});
