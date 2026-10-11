import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportedMask, detachedGroups } from '../src/js/world/town/structure.js';

// 文字の絵から表を作る。'#' がかけら、'.' が空
function grid(rows) {
    const ch = rows.length, cw = rows[0].length;
    const cells = new Uint8Array(cw * ch);
    rows.forEach((row, j) => [...row].forEach((v, i) => { if (v === '#') cells[j * cw + i] = 1; }));
    return { cells, cw, ch };
}
const kept = (mask) => [...mask].map((v, k) => (v ? k : -1)).filter((k) => k >= 0);

test('支えにつながっていれば全部残り、落ちる塊は無い', () => {
    const { cells, cw, ch } = grid(['#', '#', '#', '#', '#']);
    const mask = supportedMask(cells, cw, ch, [4]);
    assert.deepEqual(kept(mask), [0, 1, 2, 3, 4]);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), []);
});

test('中ほどを抜くと、上だけが1つの塊として落ちる', () => {
    const { cells, cw, ch } = grid(['#', '#', '.', '#', '#']);
    const mask = supportedMask(cells, cw, ch, [4]);
    assert.deepEqual(kept(mask), [3, 4]);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), [[0, 1]]);
});

test('支えが無ければ全部が落ちる', () => {
    const { cells, cw, ch } = grid(['##', '##']);
    const mask = supportedMask(cells, cw, ch, []);
    assert.deepEqual(kept(mask), []);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), [[0, 1, 2, 3]]);
});

test('離れた2つの塊は別々に落ちる。斜めはつながりとみなさない', () => {
    const { cells, cw, ch } = grid([
        '#.#',
        '.#.',
        '...',
    ]);
    const mask = supportedMask(cells, cw, ch, []);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), [[0], [2], [4]]);
});

test('空のかけらや、もう無いかけらの支えは数えない', () => {
    const { cells, cw, ch } = grid(['#', '.']);
    const mask = supportedMask(cells, cw, ch, [1]);
    assert.deepEqual(kept(mask), []);
});

test('maxDepth: 支えから何歩までを残すか（崩壊で土台だけ残す）', () => {
    const { cells, cw, ch } = grid(['#', '#', '#', '#', '#', '#']);
    const mask = supportedMask(cells, cw, ch, [5], 2);
    assert.deepEqual(kept(mask), [3, 4, 5]);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), [[0, 1, 2]]);
    assert.deepEqual(kept(supportedMask(cells, cw, ch, [5], 0)), [5]);
});

test('横につながる L 字も1つの塊', () => {
    const { cells, cw, ch } = grid([
        '###',
        '#..',
        '...',
        '#..',
    ]);
    const mask = supportedMask(cells, cw, ch, [9]);
    assert.deepEqual(detachedGroups(cells, cw, ch, mask), [[0, 1, 2, 3]]);
});

test('支えは上下左右どちらへも伝わる（右端・左端・上端の支えから全部残る）', () => {
    // 壁の家は横の壁に、吊るしものは天井に支えられるので、下からだけ広がると落ちてしまう
    const bar = grid(['###']);
    assert.deepEqual(kept(supportedMask(bar.cells, bar.cw, bar.ch, [2])), [0, 1, 2]);
    assert.deepEqual(kept(supportedMask(bar.cells, bar.cw, bar.ch, [0])), [0, 1, 2]);
    const col = grid(['#', '#', '#']);
    assert.deepEqual(kept(supportedMask(col.cells, col.cw, col.ch, [0])), [0, 1, 2]);
});
