// 定数は constants/ の系統ごとのファイルに分けてあり、使う側は入口の utils/Constants.js
// からだけ import する（2026-11-24 に 3000行の1ファイルから分けた）。新しい系統のファイルを
// 作って入口に `export *` を足し忘れると、そのファイルの定数は Constants.js から見えない。
// 名前で import している側は読み込みエラーで気づけるが、`import * as C` で読んでいる側は
// 黙って undefined になる。ここで全部が入口から同じ値で見えることを縛る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import * as Entry from '../src/js/utils/Constants.js';

const dir = new URL('../src/js/constants/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.js')).sort();

test('constants/ にファイルがある（分割が消えていない）', () => {
    assert.ok(files.length >= 10, `files: ${files.join(', ')}`);
});

for (const f of files) {
    test(`constants/${f} の export はすべて Constants.js から同じ値で見える`, async () => {
        const mod = await import(new URL(f, dir));
        const names = Object.keys(mod);
        assert.ok(names.length > 0, `${f} が何も export していない`);
        for (const name of names) {
            assert.ok(name in Entry, `${name}（${f}）が Constants.js から見えない`);
            assert.equal(Entry[name], mod[name], `${name} の値が入口と違う`);
        }
    });
}

test('Constants.js の export はどれかの constants/ のファイルから来ている（入口に直書きしない）', async () => {
    const owned = new Set();
    for (const f of files) Object.keys(await import(new URL(f, dir))).forEach((n) => owned.add(n));
    const stray = Object.keys(Entry).filter((n) => !owned.has(n));
    assert.deepEqual(stray, []);
});
