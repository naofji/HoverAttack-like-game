import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SeededRNG } from '../src/js/utils/SeededRNG.js';
import { buildAdobeTower, buildAdobeWallHouse, buildHangingBridge } from '../src/js/world/town/adobe.js';
import { rasterizeParts, SOLID } from '../src/js/world/town/chunks.js';
import { TOWN_DETAIL_COLORS } from '../src/js/world/town/palette.js';

function partsInside(b) {
    for (const p of b.parts) {
        assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= b.w && p.y + p.h <= b.h,
            `${b.kind} の部品 ${JSON.stringify(p)} が ${b.w}x${b.h} からはみ出す`);
    }
}

test('塔は幅と高さの上限を守り、部品は外接矩形の中に収まる', () => {
    const rng = new SeededRNG(7);
    for (let i = 0; i < 300; i++) {
        const maxW = 20 + Math.floor(rng.next() * 60);
        const maxH = 28 + Math.floor(rng.next() * 160);
        const b = buildAdobeTower(rng, { maxW, maxH });
        if (!b) continue;
        assert.ok(b.footW <= maxW, `足元 ${b.footW} > ${maxW}`);
        assert.ok(b.h <= maxH, `高さ ${b.h} > ${maxH}`);
        assert.ok(b.footX + b.footW <= b.w);
        partsInside(b);
    }
});

test('細い塔は低くする（壁の高さは足元の幅の 3.5 倍まで。棒に見えないように）', () => {
    // 幅 16px で 9 階（108px）の塔が、PNG で見ると建物ではなく棒に見えた。
    // シバームの塔は幅の 3〜4 倍ほどの高さ
    const rng = new SeededRNG(13);
    for (let i = 0; i < 400; i++) {
        const b = buildAdobeTower(rng, { maxW: 16 + Math.floor(rng.next() * 50), maxH: 200 });
        if (!b) continue;
        const wall = b.insets.length * 4;
        assert.ok(wall <= b.footW * 3.5, `${b.kind} 幅 ${b.footW} に壁の高さ ${wall}`);
    }
});

test('狭すぎる・低すぎるところには建てない', () => {
    const rng = new SeededRNG(1);
    assert.equal(buildAdobeTower(rng, { maxW: 12, maxH: 200 }), null);
    assert.equal(buildAdobeTower(rng, { maxW: 60, maxH: 20 }), null);
});

test('塔の一番下の段は足元の幅いっぱいに厚い壁がある（床に埋まって支えになる）', () => {
    const rng = new SeededRNG(3);
    for (let i = 0; i < 50; i++) {
        const b = buildAdobeTower(rng, { maxW: 56, maxH: 120 });
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        const j = ch - 1;
        for (let x = b.footX + 2; x < b.footX + b.footW; x += 4) {
            assert.ok(cells[j * cw + Math.floor(x / 4)] & SOLID, `${b.kind} の最下段 x=${x} が空`);
        }
    }
});

test('上の階ほど窓が多い（シバーム）', () => {
    const rng = new SeededRNG(11);
    let upper = 0, lower = 0;
    for (let i = 0; i < 300; i++) {
        const b = buildAdobeTower(rng, { maxW: 56, maxH: 140 });
        if (!b) continue;
        for (const p of b.parts) {
            const isWindow = p.w === 3 && p.h === 4
                && (p.color === TOWN_DETAIL_COLORS.winLit || p.color === TOWN_DETAIL_COLORS.winDark);
            if (!isWindow) continue;
            if (p.y < b.h / 2) upper++; else lower++;
        }
    }
    assert.ok(upper > lower * 1.2, `上 ${upper} / 下 ${lower}`);
});

test('同じ絵の塔はほとんど出ない（単純な繰り返しにしない）', () => {
    const rng = new SeededRNG(5);
    const seen = new Set();
    let n = 0;
    for (let i = 0; i < 100; i++) {
        const b = buildAdobeTower(rng, { maxW: 56, maxH: 140 });
        if (!b) continue;
        n++;
        seen.add(JSON.stringify(b.parts));
    }
    assert.ok(seen.size >= n - 3, `${n} 棟中 ${seen.size} 種類`);
});

test('同じ乱数なら同じ塔（週の決定性）', () => {
    const a = buildAdobeTower(new SeededRNG(9), { maxW: 56, maxH: 140 });
    const b = buildAdobeTower(new SeededRNG(9), { maxW: 56, maxH: 140 });
    assert.deepEqual(a, b);
});

test('崖の家は壁側の 4px が埋まり、厚い壁を持つ', () => {
    const rng = new SeededRNG(2);
    for (let i = 0; i < 50; i++) {
        const b = buildAdobeWallHouse(rng, { maxReach: 96 });
        partsInside(b);
        const { cells, cw, ch } = rasterizeParts(b.parts, b.w, b.h);
        let wallCol = 0;
        for (let j = 0; j < ch; j++) if (cells[j * cw]) wallCol++;
        assert.ok(wallCol > 0, '壁に埋まる列が空');
        assert.ok(cells.some((v) => v & SOLID), '厚い壁が無い');
    }
});

test('吊り橋は天井に結ばれ（上端の段が埋まる）、弾を止める部品を持たず、吊る高さを守る', () => {
    const rng = new SeededRNG(4);
    let built = 0;
    for (let i = 0; i < 80; i++) {
        // 低い天井（36〜）も混ぜる。高い天井だけだと吊る深さの上限 40 に先に当たり、
        // 「maxHang からたわみのぶんを引く」を外しても差が出ない
        const maxHang = 36 + Math.floor(rng.next() * 64);
        const b = buildHangingBridge(rng, { span: 64 + Math.floor(rng.next() * 96), maxHang });
        if (!b) continue;
        partsInside(b);
        assert.ok(b.h <= maxHang, `${b.h} > ${maxHang}`);
        const { cells, cw } = rasterizeParts(b.parts, b.w, b.h);
        assert.ok(cells[0] && cells[cw - 1], '両端の綱が天井の段に無い');
        assert.ok(!cells.some((v) => v & SOLID), '吊り橋は細い部品だけ');
        built++;
    }
    assert.ok(built >= 40, `吊り橋ができたのは ${built} 回`);
});
