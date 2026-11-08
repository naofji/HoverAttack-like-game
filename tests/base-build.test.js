// 7面の基地の建物（world/town/fortressBase.js）と色（palette.js の FORTRESS_BASE_*）と表の行（themes.js の BASE_THEME）。
// 設計: docs/superpowers/specs/2026-11-08-stage7-base-facilities-design.md
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import {
  buildFortressBuilding, buildFortressHut, buildFortressWall, buildFortressCeiling,
} from '../src/js/world/town/fortressBase.js';
import { FORTRESS_BASE_COLORS, FORTRESS_BASE_DETAIL_COLORS, FACTORY_COLORS } from '../src/js/world/town/palette.js';
import { BASE_THEME } from '../src/js/world/town/themes.js';
import { MAT_METAL } from '../src/js/world/town/chunks.js';
import { STAGE_PALETTES } from '../src/js/utils/Constants.js';
import { luminance } from '../src/js/utils/color.js';

function partsInside(b) {
  for (const p of b.parts) {
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= b.w && p.y + p.h <= b.h,
      `${b.kind} の部品 ${JSON.stringify(p)} が ${b.w}x${b.h} からはみ出す`);
  }
}
/** かけらになる材料。描くだけの部品は looseMat（rectWithLoose）で数える */
const matOf = (p) => p.mat || p.looseMat || 0;

function floorCases(build) {
  const rng = new SeededRNG(7);
  const out = [];
  for (let i = 0; i < 600; i++) {
    const maxW = 12 + Math.floor(rng.next() * 70);
    const maxH = 12 + Math.floor(rng.next() * 90);
    const b = build(rng, { maxW, maxH });
    if (b) out.push({ b, maxW, maxH });
  }
  return out;
}

test('床の建物は上限を守り、部品は外接矩形に収まる', () => {
  for (const build of [buildFortressBuilding, buildFortressHut]) {
    const cases = floorCases(build);
    assert.ok(cases.length > 100);
    for (const { b, maxW, maxH } of cases) {
      assert.ok(b.footW <= maxW, `${b.kind} 足元 ${b.footW} > ${maxW}`);
      assert.ok(b.h <= maxH, `${b.kind} 高さ ${b.h} > ${maxH}`);
      assert.ok(b.footX >= 0 && b.footX + b.footW <= b.w);
      partsInside(b);
    }
  }
});

test('広い所・狭い所それぞれで4種類とも出る（フェンスと研究室はユーザーの追加）', () => {
  const kinds = (build) => new Set(floorCases(build).map(({ b }) => b.kind));
  assert.deepEqual([...kinds(buildFortressBuilding)].sort(), ['commandTower', 'hangar', 'lab', 'radarDish']);
  assert.deepEqual([...kinds(buildFortressHut)].sort(), ['barracks', 'commTower', 'fence', 'generator']);
});

/** すべての build 関数の出力を集める */
function allBuilt() {
  const out = floorCases(buildFortressBuilding).concat(floorCases(buildFortressHut)).map((c) => c.b);
  const rng = new SeededRNG(3);
  for (let i = 0; i < 200; i++) {
    for (const style of ['K', 'H']) {
      const w = buildFortressWall(style, rng, { maxReach: 8 + Math.floor(rng.next() * 90) });
      if (w) out.push(w);
      const c = buildFortressCeiling(style, rng, { room: Math.floor(rng.next() * 160), maxHang: 8 + Math.floor(rng.next() * 60) });
      if (c) out.push(c);
    }
  }
  return out;
}

test('かけらになる部品はすべて金属（コンクリート・木・爆発物が無い。ユーザー「全体的にメタリック」「爆発物は無し」）', () => {
  for (const b of allBuilt()) {
    for (const p of b.parts) {
      assert.equal(matOf(p), MAT_METAL, `${b.kind} の部品の材料 ${matOf(p)}`);
    }
  }
});

test('壁・天井のものは寸法の上限を守る（壁は x 0〜4 が埋まる、天井は上端 4px が埋まる）', () => {
  const rng = new SeededRNG(5);
  const kinds = new Set();
  for (let i = 0; i < 400; i++) {
    const style = i % 2 ? 'K' : 'H';
    const maxReach = 8 + Math.floor(rng.next() * 90);
    const w = buildFortressWall(style, rng, { maxReach });
    if (w) { kinds.add(w.kind); assert.ok(w.w <= maxReach + 4, `${w.kind} 奥行き ${w.w} > ${maxReach}`); partsInside(w); }
    const room = Math.floor(rng.next() * 160), maxHang = 8 + Math.floor(rng.next() * 60);
    const c = buildFortressCeiling(style, rng, { room, maxHang });
    if (c) {
      kinds.add(c.kind);
      assert.ok(c.h <= maxHang, `${c.kind} 垂れ ${c.h} > ${maxHang}`);
      if (c.kind === 'duct') assert.ok(c.w <= room, `ダクト ${c.w} > ${room}`);
      partsInside(c);
    }
  }
  for (const k of ['watchPost', 'wallPipes', 'lamp', 'camera', 'duct']) assert.ok(kinds.has(k), `${k} が出ない`);
});

test('フェンスは低く横に長い（外接矩形 = 足元。張り出しが無い）', () => {
  const fences = floorCases(buildFortressHut).map((c) => c.b).filter((b) => b.kind === 'fence');
  assert.ok(fences.length > 0);
  for (const f of fences) {
    assert.ok(f.h <= 32, `高い ${f.h}`);
    assert.ok(f.w >= 2 * f.h, `短い ${f.w}x${f.h}`);
    assert.equal(f.footX, 0);
    assert.equal(f.w, f.footW);
  }
});

test('色: 本体は7面の岩より明るく、弾の黄色より十分暗い。研究室は本体で一番明るい（ユーザー「研究室」＝白っぽい金属）', () => {
  const rock = luminance(STAGE_PALETTES[6].fill);
  let brightestOther = 0;
  for (const [name, list] of Object.entries(FORTRESS_BASE_COLORS)) {
    assert.ok(list.length > 0);
    for (const hex of list) {
      const l = luminance(hex);
      assert.ok(l > rock * 1.2, `${name} ${hex} が暗い (${l.toFixed(1)})`);
      assert.ok(l <= 170, `${name} ${hex} が明るすぎる (${l.toFixed(1)})`);
      if (name !== 'lab') brightestOther = Math.max(brightestOther, l);
    }
  }
  for (const hex of FORTRESS_BASE_COLORS.lab) assert.ok(luminance(hex) > brightestOther, `研究室 ${hex} が一番明るくない`);
  for (const [name, hex] of Object.entries(FORTRESS_BASE_DETAIL_COLORS)) {
    assert.ok(luminance(hex) <= 150, `差し色 ${name} ${hex} が明るすぎる`);
  }
});

test('色: 6面の基地（FACTORY_COLORS）と同じ色は使わない（見分けがつくように）', () => {
  const six = new Set(Object.values(FACTORY_COLORS).flat());
  for (const hex of Object.values(FORTRESS_BASE_COLORS).flat()) assert.ok(!six.has(hex), `${hex} は6面と同じ`);
});

test('BASE_THEME: 系統は K / H、爆発物の列が無い、天井の吊るす数は1倍', () => {
  assert.equal(BASE_THEME.wide, 'K');
  assert.equal(BASE_THEME.narrow, 'H');
  assert.equal(BASE_THEME.explosive, undefined);
  const rng = new SeededRNG(9);
  const kinds = new Set();
  for (let i = 0; i < 200; i++) {
    for (const style of ['K', 'H']) {
      const f = BASE_THEME.floor(style, rng, { maxW: 64, maxH: 80 });
      if (f) kinds.add(`${style}:${f.kind}`);
    }
  }
  assert.ok([...kinds].some((k) => k.startsWith('K:lab')), 'K で研究室が出ない');
  assert.ok([...kinds].some((k) => k.startsWith('H:fence')), 'H でフェンスが出ない');
  assert.ok(![...kinds].some((k) => k === 'K:fence' || k === 'H:lab'), '系統が入れ違っている');
});
