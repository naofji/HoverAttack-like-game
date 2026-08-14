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

// 図に添える短い語。長い説明をそのまま置くと図が読めなくなる
test('全行に図用の短いラベルがある', () => {
    for (const row of CONTROLS_ROWS) {
        assert.ok(row.short, `${row.key} に short が無い`);
        assert.ok(row.short.length <= 16, `${row.key} の short が長すぎる: ${row.short}`);
    }
});

// ---- キーの並びが実際のキーボードと一致すること ----
// ここがずれると、図にした意味（手の置き場所が分かる）が失われる

test('W は S の真上にある', () => {
    assert.equal(capAt('W').gx, capAt('S').gx);
    assert.equal(capAt('W').gy, capAt('S').gy - 1);
});

test('ホームポジションは A S D F の順に並ぶ', () => {
    const home = ['A', 'S', 'D', 'F'].map(capAt);
    for (const k of home) assert.equal(k.gy, home[0].gy, 'A S D F が同じ段にない');
    for (let i = 1; i < home.length; i++) {
        assert.equal(home[i].gx, home[i - 1].gx + 1, `${home[i].cap} の位置が隣ではない`);
    }
});

// R は QWERTY 段（W と同じ段）の右寄り。ミニマップが押しやすい位置にあることが
// 図から読めるようにする
test('R は W と同じ段の右側にある', () => {
    assert.equal(capAt('R').gy, capAt('W').gy);
    assert.ok(capAt('R').gx > capAt('W').gx);
});

test('SHIFT はホームポジションの下の段の左端にある', () => {
    assert.equal(capAt('SHIFT').gy, capAt('A').gy + 1);
    assert.equal(capAt('SHIFT').gx, 0);
    assert.ok(capAt('SHIFT').w >= 2, 'SHIFT が長いキーとして描かれていない');
});

// Space が左手の親指で届く位置にあることが、これが左クリックの代わりになる理由
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

test('図に短いラベルが添えられる', () => {
    const { texts } = drawDiagram();
    const drawn = texts.map((t) => t.text).join('\n');
    for (const row of CONTROLS_ROWS) {
        assert.ok(drawn.includes(row.short), `${row.key} の short「${row.short}」が出ていない`);
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

// タップ/長押しの違いは図では表せない。図で手の位置を掴み、細部は下で読む
test('図では表せない差は詳細行として全文が出る', () => {
    const { texts } = drawDiagram();
    const drawn = texts.map((t) => t.text);
    const details = CONTROLS_ROWS.filter((r) => r.detail);
    assert.ok(details.length > 0, 'detail の行が1つも無い');
    for (const row of details) {
        assert.ok(drawn.includes(row.action), `${row.key} の詳細が出ていない`);
    }
});

// 渡した幅の中に収める。パネルの幅は画面ごとに違う（HOW TO PLAY 800 / 設定 720）
test('図は渡した幅の内側に収まる', () => {
    const ctx = makeFakeCtx();
    drawControlsDiagram(ctx, 100, 100, 640);
    for (const t of extractTextsWithFont(ctx.calls)) {
        assert.ok(t.x >= 100, `左へはみ出す: ${t.text} (${t.x})`);
        assert.ok(t.x + t.width <= 100 + 640, `右へはみ出す: ${t.text} (${Math.round(t.x + t.width)})`);
    }
    for (const c of ctx.calls.filter((c) => c.name === 'fillRect')) {
        assert.ok(c.args[0] >= 100 && c.args[0] + c.args[2] <= 740,
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
        assert.ok(howTo.includes(row.short), `HOW TO PLAY に ${row.key} のラベルが無い`);
        assert.ok(settings.includes(row.short), `設定画面に ${row.key} のラベルが無い`);
    }
});
