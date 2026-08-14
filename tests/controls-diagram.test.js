import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx, extractTextsWithFont } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import {
    CONTROLS_ROWS, LEFT_HAND_KEYS, MOUSE_BUTTONS, OFF_MOUSE_KEYS,
} from '../src/js/ui/controlsList.js';
import { drawControlsDiagram, DIAGRAM_COLORS } from '../src/js/ui/controlsDiagram.js';
import { DEFAULT_SETTINGS } from '../src/js/utils/settings.js';

/**
 * 操作一覧は「キー名と説明の対応表」では手の置き場所が読み取れなかったので、
 * 左手のキー配置とマウスを図にした。図とリストが別々の文言を持つと片方が
 * 古くなるため、どちらも CONTROLS_ROWS から出す。
 */

function drawDiagram() {
    const ctx = makeFakeCtx();
    drawControlsDiagram(ctx, 100, 100, 700);
    return { ctx, texts: extractTextsWithFont(ctx.calls) };
}

const rowFor = (key) => CONTROLS_ROWS.find((r) => r.key === key);
const capAt = (cap) => LEFT_HAND_KEYS.find((k) => k.cap === cap);

// ---- 表と図の対応（片方に足し忘れると落ちる） ----

// 図のどこにも出ないキーがあると、一覧としては嘘になる
test('表の全行が図のいずれかの群に現れる', () => {
    const covered = new Set([
        ...LEFT_HAND_KEYS.map((k) => k.rowKey),
        ...MOUSE_BUTTONS.map((b) => b.rowKey),
        ...OFF_MOUSE_KEYS,
    ]);
    for (const row of CONTROLS_ROWS) {
        assert.ok(covered.has(row.key), `${row.key} が図のどの群にも属していない`);
    }
});

test('図の群が参照する行は必ず表にある', () => {
    for (const rowKey of [
        ...LEFT_HAND_KEYS.map((k) => k.rowKey),
        ...MOUSE_BUTTONS.map((b) => b.rowKey),
        ...OFF_MOUSE_KEYS,
    ]) {
        assert.ok(rowFor(rowKey), `${rowKey} に対応する行が表に無い`);
    }
});

// 説明はキーごとに1行だけ。以前は図の短ラベルと下の詳細で二重に出していて、
// 同じキーの説明が2箇所にある状態が「ごちゃごちゃする」と指摘された
test('全行に1つだけ説明があり、1行に収まる長さである', () => {
    for (const row of CONTROLS_ROWS) {
        assert.ok(row.label, `${row.key} に label が無い`);
        assert.ok(row.label.length <= 32, `${row.key} の label が長すぎる: ${row.label}`);
        assert.equal(row.short, undefined, `${row.key} に古い short が残っている`);
        assert.equal(row.action, undefined, `${row.key} に古い action が残っている`);
    }
});

// ---- キーの並びが実際のキーボードと一致すること ----
// ここがずれると、図にした意味（手の置き場所が分かる）が失われる

test('W は S の真上にある', () => {
    assert.equal(capAt('W').ux, capAt('S').ux);
    assert.equal(capAt('W').gy, capAt('S').gy - 1);
});

test('ホームポジションは A S D F の順に並ぶ', () => {
    const home = ['A', 'S', 'D', 'F'].map(capAt);
    for (const k of home) assert.equal(k.gy, home[0].gy, 'A S D F が同じ段にない');
    for (let i = 1; i < home.length; i++) {
        assert.equal(home[i].ux, home[i - 1].ux + 1, `${home[i].cap} の位置が隣ではない`);
    }
});

// R は QWERTY 段（W と同じ段）の右寄り。ミニマップが押しやすい位置にあることが
// 図から読めるようにする
test('R は W と同じ段の右側にある', () => {
    assert.equal(capAt('R').gy, capAt('W').gy);
    assert.ok(capAt('R').ux > capAt('W').ux);
});

// 実機の指摘: Shift は A の**左下**にある。段が下がるほど右へずれる格子として
// 描くと A より右から始まってしまい、実物と逆になる（Shift・Caps・Ctrl は
// キーボードの左端で揃っていて、字のキーのほうが右へ寄っている）
test('SHIFT は A の左下から始まる', () => {
    assert.equal(capAt('SHIFT').gy, capAt('A').gy + 1);
    assert.ok(capAt('SHIFT').ux < capAt('A').ux,
        `SHIFT(${capAt('SHIFT').ux}) が A(${capAt('A').ux}) より左から始まっていない`);
    assert.ok(capAt('SHIFT').w >= 2, 'SHIFT が長いキーとして描かれていない');
});

// 左端は Shift。ここより左に出るキーがあると、左端が揃って見えない
test('SHIFT がクラスタの左端にある', () => {
    assert.equal(Math.min(...LEFT_HAND_KEYS.map((k) => k.ux)), capAt('SHIFT').ux);
});

// Space は左手の親指で届く位置にある。左手の説明として独立した行を持たせる
// （L-CLICK の説明に括弧書きで添えていたが、左手の絵にキーがあるのに説明が
// 右の列にある状態になっていた）
test('SPACE は左手の行として説明を持つ', () => {
    const space = capAt('SPACE');
    assert.equal(space.rowKey, 'SPACE', 'SPACE のキーが自分の行を指していない');
    const row = rowFor('SPACE');
    assert.ok(row, '表に SPACE の行が無い');
    assert.match(row.label, /FIRE|L-CLICK/, 'SPACE が発射だと読めない');
});

test('SPACE は一番下の段にある長いキー', () => {
    const space = capAt('SPACE');
    assert.equal(space.gy, Math.max(...LEFT_HAND_KEYS.map((k) => k.gy)));
    assert.ok(space.w >= 2, 'SPACE が長いキーとして描かれていない');
});

// M / P / -/+ は左手のクラスタに入らない。**入らないこと自体が情報**で、
// 押すときはマウスから手を離す必要があると伝わる
test('M・P・音量はクラスタではなく OTHER に置く', () => {
    for (const key of ['M', 'P', '- / +']) {
        assert.ok(OFF_MOUSE_KEYS.includes(key), `${key} が OTHER に無い`);
        assert.equal(LEFT_HAND_KEYS.some((k) => k.rowKey === key), false,
            `${key} が左手のクラスタに入っている`);
    }
});

// ---- 描画 ----

test('図に左手のキーとマウスのボタンが描かれる', () => {
    const { texts } = drawDiagram();
    const drawn = texts.map((t) => t.text);
    for (const k of LEFT_HAND_KEYS) assert.ok(drawn.includes(k.cap), `${k.cap} が描かれていない`);
    for (const b of MOUSE_BUTTONS) assert.ok(drawn.includes(b.cap), `${b.cap} が描かれていない`);
});

test('全行が一覧に1行ずつ出る', () => {
    const { texts } = drawDiagram();
    const drawn = texts.map((t) => t.text);
    for (const row of CONTROLS_ROWS) {
        assert.equal(drawn.filter((t) => t === row.label).length, 1,
            `${row.key} の説明が1回だけ出ていない`);
    }
});

// 説明は、その手の絵の**下**に置く。左手の説明が右のマウスの横に並んでいると
// どちらの手の話か目で追えない、というのが実機での指摘だった
test('左手の説明はキーボードの下、右手と OFF-MOUSE の説明はマウスの下に出る', () => {
    const { texts } = drawDiagram();
    const at = (t) => texts.find((x) => x.text === t);
    const clusterBottom = Math.max(...LEFT_HAND_KEYS.map((k) => at(k.cap).y));
    const mouseBottom = Math.max(...MOUSE_BUTTONS.map((b) => at(b.cap).y));

    for (const key of ['W', 'A / D', 'S', 'F', 'SHIFT', 'SPACE', 'R']) {
        const line = at(rowFor(key).label);
        assert.ok(line.y > clusterBottom, `${key} の説明がキーボードの下に無い`);
        // 左手の説明はキーボードと同じ列（マウスの列へ流れていない）
        assert.ok(line.x < at(rowFor('L-CLICK').label).x,
            `${key} の説明が右の列に入っている`);
    }
    for (const key of ['L-CLICK', 'R-CLICK', 'M', 'P', '- / +']) {
        const line = at(rowFor(key).label);
        assert.ok(line.y > mouseBottom, `${key} の説明がマウスの下に無い`);
    }
});

// 色分けが凡例と食い違うと、どの群のキーなのかが判断できなくなる
// 同じ文字が別の群に現れることがある（キーボードの R と、マウスの右ボタン R）。
// 「その色で描かれたものが在る」ことを見る。誤った色だけで描かれていれば落ちる
test('左手のキーとマウスのボタンが群ごとの色で描かれる', () => {
    const { texts } = drawDiagram();
    const inColor = (cap, color) => texts.some((t) => t.text === cap && t.color === color);
    for (const k of LEFT_HAND_KEYS) {
        assert.ok(inColor(k.cap, DIAGRAM_COLORS.leftHand), `${k.cap} が左手の色で描かれていない`);
    }
    for (const b of MOUSE_BUTTONS) {
        assert.ok(inColor(b.cap, DIAGRAM_COLORS.rightHand), `${b.cap} が右手の色で描かれていない`);
    }
});

test('凡例の見出しが左手と右手それぞれの色で描かれる', () => {
    const { texts } = drawDiagram();
    const left = texts.find((t) => /LEFT HAND/.test(t.text));
    const right = texts.find((t) => /RIGHT HAND/.test(t.text));
    assert.ok(left && right, '凡例が無い');
    assert.equal(left.color, DIAGRAM_COLORS.leftHand);
    assert.equal(right.color, DIAGRAM_COLORS.rightHand);
});

// 一覧のキー名は群の色で描く。絵のどのキーの話なのかを色で結びつける。
// 期待する対応はここに直接書く（実装から導くと実装を実装で検算することになる）
test('一覧のキー名が群ごとの色で描かれる', () => {
    const { texts } = drawDiagram();
    const expected = {
        leftHand: ['W', 'A / D', 'S', 'F', 'SHIFT', 'SPACE', 'R'],
        rightHand: ['L-CLICK', 'R-CLICK'],
        offMouse: ['M', 'P', '- / +'],
    };
    // 期待表が表の全行を覆っていること（行を足したらここも直す）
    assert.deepEqual(
        new Set(Object.values(expected).flat()),
        new Set(CONTROLS_ROWS.map((r) => r.key)),
    );
    for (const [group, keys] of Object.entries(expected)) {
        for (const key of keys) {
            assert.ok(texts.some((t) => t.text === key && t.color === DIAGRAM_COLORS[group]),
                `${key} が ${group} の色で描かれていない`);
        }
    }
});

// 列が近すぎると、どちらの手の話なのか目が迷う（実機での指摘）。左の列の
// いちばん長い説明の右端と、右の列の左端が十分に離れていること
test('左右の列が離れている', () => {
    const { texts } = drawDiagram();
    const at = (t) => texts.find((x) => x.text === t);
    const leftRight = Math.max(
        ...['W', 'A / D', 'S', 'F', 'SHIFT', 'SPACE', 'R']
            .map((k) => at(rowFor(k).label))
            .map((t) => t.x + t.width),
    );
    const rightLeft = Math.min(
        ...['L-CLICK', 'R-CLICK', 'M', 'P', '- / +'].map((k) => at(k).x),
    );
    assert.ok(rightLeft - leftRight >= 30,
        `列の間が狭い: ${Math.round(rightLeft - leftRight)}px`);
});

// 渡した幅の中に収める。パネルの幅は画面ごとに違う（HOW TO PLAY 800 / 設定 720）。
// 656 はいちばん狭い実際の値（設定のパネル 720 から左右の余白 32 ずつを引いたもの）
test('図は渡した幅の内側に収まる', () => {
    const ctx = makeFakeCtx();
    drawControlsDiagram(ctx, 100, 100, 656);
    for (const t of extractTextsWithFont(ctx.calls)) {
        assert.ok(t.x >= 100, `左へはみ出す: ${t.text} (${t.x})`);
        assert.ok(t.x + t.width <= 100 + 656, `右へはみ出す: ${t.text} (${Math.round(t.x + t.width)})`);
    }
    for (const c of ctx.calls.filter((c) => c.name === 'fillRect')) {
        assert.ok(c.args[0] >= 100 && c.args[0] + c.args[2] <= 756,
            `矩形が幅からはみ出す: ${JSON.stringify(c.args)}`);
    }
});

// ---- 2つの画面が同じ図を出すこと ----

function drawnTexts(fn) {
    const ctx = makeFakeCtx();
    const renderer = new ScreenRenderer({ canvas: { width: 1024, height: 768 } });
    fn(renderer, ctx);
    return extractTextsWithFont(ctx.calls).map((t) => t.text);
}

test('HOW TO PLAY と設定画面のどちらにも同じ図が出る', () => {
    const howTo = drawnTexts((r, ctx) => r.drawHowToPlay(ctx, 1));
    const settings = drawnTexts((r, ctx) => r.drawSettings(ctx, {
        settings: DEFAULT_SETTINGS, index: 0, fromPlaying: true,
        confirmingQuit: false, showingControls: true,
    }));
    for (const k of LEFT_HAND_KEYS) {
        assert.ok(howTo.includes(k.cap), `HOW TO PLAY に ${k.cap} が無い`);
        assert.ok(settings.includes(k.cap), `設定画面に ${k.cap} が無い`);
    }
    for (const row of CONTROLS_ROWS) {
        assert.ok(howTo.includes(row.label), `HOW TO PLAY に ${row.key} のラベルが無い`);
        assert.ok(settings.includes(row.label), `設定画面に ${row.key} のラベルが無い`);
    }
});
