// 層の向きの見張り: utils/ は純ロジックのいちばん下の層で、constants/（数値だけ）と utils/ 自身しか import しない。
//
// 2026-11-26 まで utils/surface.js と utils/grenadePhysics.js が world/StageEnvironment.js を import していて、
// 純関数を読むだけで霧・水・雪の描画まで 26 モジュールが付いてきていた（値と純関数を utils/motion.js へ移して解消）。
// 同じ逆向きの依存がまた入ったら、ここで止める。
//
// CLAUDE.md は「ソース文字列を grep するテスト」を避けるよう求めているが、あれは**挙動**の有無を文字列で見ると
// 到達不能でも通ってしまうから。ここで見るのは import の向きという**構造そのもの**で、import 文がすべてなので、
// 文字列を読むのが正しい見方になる。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src/js');
const ALLOWED = ['utils', 'constants'];

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    return d.isDirectory() ? jsFiles(p) : d.name.endsWith('.js') ? [p] : [];
  });
}

/** import / export ... from '...' と import('...') の参照先（相対パスだけ） */
function importTargets(file) {
  const src = readFileSync(file, 'utf8');
  const specs = [
    ...src.matchAll(/\b(?:import|export)\s[^;]*?\bfrom\s*['"]([^'"]+)['"]/g),
    ...src.matchAll(/\bimport\s*['"]([^'"]+)['"]/g),
    ...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);
  return specs.filter((s) => s.startsWith('.')).map((s) => resolve(dirname(file), s));
}

/** src/js から見た最初のディレクトリ名（utils / constants / world / ...） */
const layerOf = (abs) => relative(SRC, abs).split(sep)[0];

test('utils/ は constants/ と utils/ 自身しか import しない', () => {
  const bad = [];
  for (const file of jsFiles(join(SRC, 'utils'))) {
    for (const target of importTargets(file)) {
      if (!ALLOWED.includes(layerOf(target))) bad.push(`${relative(SRC, file)} → ${relative(SRC, target)}`);
    }
  }
  assert.deepEqual(bad, [], `utils/ から上の層への import:\n${bad.join('\n')}`);
});

test('constants/ は constants/ 自身しか import しない（数値だけの層。系統のファイルどうしで値を引くのは可）', () => {
  const bad = [];
  for (const file of jsFiles(join(SRC, 'constants'))) {
    for (const target of importTargets(file)) {
      if (layerOf(target) !== 'constants') bad.push(`${relative(SRC, file)} → ${relative(SRC, target)}`);
    }
  }
  assert.deepEqual(bad, [], `constants/ からの import:\n${bad.join('\n')}`);
});

test('見張りが本当に import を拾えている（utils/Constants.js の再 export と surface.js → motion.js）', () => {
  // 拾えていなければ上の2つは何も見ずに通ってしまうので、既知の参照が見えることを確かめる
  const constantsTargets = importTargets(join(SRC, 'utils/Constants.js')).map(layerOf);
  assert.ok(constantsTargets.includes('constants'), 'Constants.js の export * from を拾えていない');
  assert.ok(importTargets(join(SRC, 'utils/surface.js')).includes(join(SRC, 'utils/motion.js')),
    'surface.js の import を拾えていない');
});
