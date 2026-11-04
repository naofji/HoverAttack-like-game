// Wall of Fame の週ブロックが、週の数にかかわらず画面の内側に収まるか。
// 中央寄せは「左右に半分ずつ」で計算していたのに、並べるほうは左の列を1列の上限（6週）まで
// 埋めてから右へ移っていたので、8週で左の列が下へ伸びて最後の週が画面の下端で切れた（実機の指摘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { ScreenRenderer } from '../src/js/ui/ScreenRenderer.js';
import { SPACE } from '../src/js/ui/theme.js';

const W = 1366, H = 768;

function weeks(n) {
  return Array.from({ length: n }, (_, i) => ({
    weekId: `2026-W${String(50 - i).padStart(2, '0')}`,
    entries: [0, 1, 2].map((r) => ({ name: `PLAYER${r}`, score: 123456 - r, country: 'JP', tries: 1 })),
  }));
}

function render(n) {
  const ctx = makeFakeCtx();
  new ScreenRenderer({ canvas: { width: W, height: H } }).drawWallOfFame(ctx, weeks(n));
  // 点滅する案内文は画面の決まった場所に出るもので、ブロックではない
  return ctx.calls.filter((c) => c.name === 'fillText' && c.args[0] !== 'PRESS ENTER FOR MENU')
    .map((c) => ({ text: String(c.args[0]), x: c.args[1], y: c.args[2] }));
}

for (let n = 1; n <= 14; n++) {
  test(`${n}週: どの行も表示域（下端から ${SPACE.xl}px 上まで）に収まり、週が左右に均等に分かれる`, () => {
    const texts = render(n);
    const bottom = H - SPACE.xl;
    for (const t of texts) assert.ok(t.y <= bottom, `「${t.text}」が y=${t.y} で下端 ${bottom} を越えた`);

    const heads = texts.filter((t) => /^2026-W\d\d$/.test(t.text));
    assert.equal(heads.length, Math.min(n, 12), '表示される週の数が違う');
    const xs = [...new Set(heads.map((h) => h.x))].sort((a, b) => a - b);
    const left = heads.filter((h) => h.x === xs[0]).length;
    const right = heads.length - left;
    assert.ok(left - right >= 0 && left - right <= 1, `左 ${left}・右 ${right} で均等でない`);
  });
}
