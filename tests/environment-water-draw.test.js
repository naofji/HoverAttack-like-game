import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeCtx } from './helpers/fake-ctx.js';
import { TILE_SIZE, WATER_WAVE_AMPLITUDE, WATER_RIPPLE_DECAY } from '../src/js/utils/Constants.js';
import { makeWaterMap } from './helpers/water-map.js';

before(() => {
  globalThis.document = {
    createElement: () => {
      const ctx = makeFakeCtx();
      return { width: 0, height: 0, getContext: () => ctx, _ctx: ctx };
    },
  };
});

// 行7が液面、行8が水中の落ち着いた水たまり（列2..5）。床は行9。
// 以前はここで water[] と waterSurface[] を手で組み立てていたが、種別と液面は
// waterQuery が water[] から導くようになったので、共通ヘルパーに寄せた。
// 底を満水にしてあるのは、上下とも満水未満だと「落下中の水柱」と判定されて
// 水たまりにならないため（滝の判定ルールC）。
function mapWithPool() {
  return makeWaterMap(`
    ..........
    ..........
    ..........
    ..........
    ..........
    ..........
    ..........
    ..1111....
    ..8888....
    ##########
  `);
}

test('surface wave stays within the amplitude and ripples decay', async () => {
  const { surfaceOffset } = await import('../src/js/world/environment/water.js');
  for (let x = 0; x < 500; x += 7) {
    for (let t = 0; t < 200; t += 13) {
      assert.ok(Math.abs(surfaceOffset(x, t, [])) <= WATER_WAVE_AMPLITUDE + 1e-9);
    }
  }
  const ripples = [{ x: 100, strength: 4 }];
  const near = Math.abs(surfaceOffset(100, 0, ripples));
  const far = Math.abs(surfaceOffset(400, 0, ripples));
  assert.ok(near > far);
});

test('world pass transfers the water cache once and draws one surface path', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  const ctx = makeFakeCtx();
  env.update();
  env.drawOverWorld(ctx, 0, 0);
  assert.equal(ctx.calls.filter((c) => c.name === 'drawImage').length, 1);
  assert.equal(ctx.calls.filter((c) => c.name === 'stroke').length, 1);
  assert.equal(ctx.calls.filter((c) => c.name === 'createLinearGradient' || c.name === 'createRadialGradient').length, 0);
});

test('ripples fade every update', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  env.renderer.addRipple(50, 4);
  const s0 = env.renderer.ripples[0].strength;
  env.update();
  assert.ok(Math.abs(env.renderer.ripples[0].strength - s0 * WATER_RIPPLE_DECAY) < 1e-9);
});

test('surface line is thin and the wave is fine', async () => {
  const { WATER_WAVE_LENGTH, WATER_WAVE_AMPLITUDE, WATER_SURFACE_LINE_WIDTH } = await import('../src/js/utils/Constants.js');
  // 実機の指摘: 波は細かく、線は細く淡く。設計時の 48 / 2.5 / 2 から下げた値を固定する
  assert.ok(WATER_WAVE_LENGTH <= 24, `wave length ${WATER_WAVE_LENGTH}`);
  assert.ok(WATER_WAVE_AMPLITUDE <= 1.5, `amplitude ${WATER_WAVE_AMPLITUDE}`);
  assert.equal(WATER_SURFACE_LINE_WIDTH, 1);

  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  const ctx = makeFakeCtx();
  env.drawOverWorld(ctx, 0, 0);
  const widths = ctx.calls.filter((c) => c.name === 'set:lineWidth').map((c) => c.args[0]);
  assert.deepEqual(widths, [WATER_SURFACE_LINE_WIDTH]);
});

test('drawBehindTerrain transfers the behind water cache once', async () => {
  const { StageEnvironment } = await import('../src/js/world/StageEnvironment.js');
  const game = { map: mapWithPool(), enemies: [], projectiles: [], enemyBullets: [], particles: [], player: null, carrier: null };
  const env = new StageEnvironment(game, 3);
  const ctx = makeFakeCtx();
  env.drawBehindTerrain(ctx, 0, 0);
  assert.equal(ctx.calls.filter((c) => c.name === 'drawImage').length, 1);
});

test('collectBorderBlocks は水に接する岩を集めるが、液面より上の岩は集めない', async () => {
  const { collectBorderBlocks } = await import('../src/js/world/environment/water.js');
  // 3x3 のマップ: 中央 (1,1) が満水、(0,0) と (1,0) が岩ブロック
  const map = makeWaterMap(`
    #..
    #8.
    ...
  `);
  const border = collectBorderBlocks(map, [[1, 1]]);
  // (1,0) は水と同じ行なので背後を埋める必要がある。(0,0) は水面(y=16)より
  // 完全に上のタイルなので、面取りの隙間は水の外＝埋めてはいけない
  assert.deepEqual(border.map(([r, c]) => `${r},${c}`).sort(), ['1,0']);
});

test('waterBackdropTopY は隣の水の液面から下だけを埋める（水際の岩が黒く抜けない）', async () => {
  const { waterBackdropTopY } = await import('../src/js/world/environment/water.js');
  const { TILE_SIZE } = await import('../src/js/utils/Constants.js');
  // 4x4。列2が水で、液面は行1の途中 y=26（行1のタイルは 16..32。水量3 → 32 - 3/8×16）
  const map = makeWaterMap(`
    ##.#
    ##3#
    ##8#
    ##.#
  `);
  assert.equal(map.waterSurfaceY[1 * map.cols + 2], 26, '前提: 液面は y=26');
  // 水際の岩 (1,1): 液面 26 から下だけ。以前はここが「隣が満水でない」として
  // 1ドットも塗られず、面取りの角が黒く抜けていた（実機の指摘）
  assert.equal(waterBackdropTopY(map, 1, 1), 26);
  // 水中の岩 (2,1): 液面はタイルより上なのでタイルの上辺から
  assert.equal(waterBackdropTopY(map, 2, 1), 2 * TILE_SIZE);
  // 液面より完全に上の岩 (0,1): 埋めない
  assert.equal(waterBackdropTopY(map, 0, 1), -1);
  // 水から離れた岩: 埋めない
  assert.equal(waterBackdropTopY(map, 3, 0), -1);
});

test('滝の帯は岩の背後を埋める根拠にしない（帯は細いので周りは水ではない）', async () => {
  const { waterBackdropTopY } = await import('../src/js/world/environment/water.js');
  const map = makeWaterMap(`
    #.#
    #2#
    #.#
  `);
  assert.ok(map.isWaterfallCell(1, 1), '前提: (1,1) は滝');
  assert.equal(waterBackdropTopY(map, 1, 0), -1);
});

test('隣の水が抜けたら、岩の背後の水も消える（本番と同じく onWaterChanged → 描画で塗り直す）', async () => {
  const { MAX_WATER_MASS } = await import('../src/js/utils/Constants.js');
  // 3x3 マップ: 中央 (1,1) だけが満水で、周りは全部岩
  const map = makeWaterMap(`
    ###
    #${MAX_WATER_MASS}#
    ###
  `);
  const { renderer, fore, behind } = await rendererWithTops(map);
  map.game = { env: { renderer } };
  assert.equal(behind.get('1,0'), TILE_SIZE, '前提: 岩 (1,0) の背後はタイル全体に敷いてある');

  map.water[1 * 3 + 1] = 0;
  await assertRepaintMatchesFresh(map, renderer, fore, behind, [[1, 1]]);
  assert.equal(behind.has('1,0'), false, '岩 (1,0) の背後の水が消える');
  assert.equal(fore.has('1,1'), false, '(1,1) の前景の水が消える');
});

test('水塊の塗りの上端は、どの列でも水面の線と一致する（塗りが段々にならない）', async () => {
  // 実機のスクリーンショットの指摘。液面をひとつに揃えても、塗りが各セルの
  // タイルの中でしか描けないと、水面が1段下にある列で上端がタイルの上辺で
  // 頭打ちになり「線は平らなのに塗りが段々」になっていた（線 73px に対し
  // 塗り 80px）。液面は水塊にひとつなので、水量が届いていない列でも
  // 液面まで塗る。
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');

  // 左半分は水面が行5、右半分は水が1段多くて水面が行4。つながった1つの水たまり
  const map = makeWaterMap(`
    ##############
    #............#
    #............#
    #............#
    #.......88888#
    #.8888888888.#
    ##############
  `);

  const fills = [];
  const origCreateElement = globalThis.document.createElement;
  globalThis.document.createElement = () => {
    const ctx = makeFakeCtx();
    const orig = ctx.fillRect.bind(ctx);
    ctx.fillRect = (x, y, w, h) => { fills.push({ x, y, w, h }); return orig(x, y, w, h); };
    return { width: 0, height: 0, getContext: () => ctx };
  };
  try {
    createWaterRenderer({ game: { map } });
  } finally {
    globalThis.document.createElement = origCreateElement;
  }

  // 列ごとの塗りの上端
  const topByCol = new Map();
  for (const f of fills) {
    if (f.h <= 0) continue;
    const c = Math.floor(f.x / TILE_SIZE);
    const cur = topByCol.get(c);
    if (cur === undefined || f.y < cur) topByCol.set(c, f.y);
  }

  for (let c = 2; c <= 12; c++) {
    let lineY = null;
    for (let r = 0; r < map.rows; r++) {
      if (map.isWaterSurface(r, c)) { lineY = map.getSurfaceY(r, c); break; }
    }
    assert.notEqual(lineY, null, `列 ${c} に水面があるはず`);
    assert.equal(topByCol.get(c), lineY,
      `列 ${c}: 塗りの上端 ${topByCol.get(c)} が水面の線 ${lineY} と違う（塗りが段になっている）`);
  }
});

test('浮いた岩の真下の浅い水は、実際の水量ぶんだけ浅く塗る（水面が岩に吸い付かない）', async () => {
  // 実機のスクリーンショットの指摘。浅い湖の途中に浮いた岩（下は水でつながっている）
  // があると、その真下のセルは「天井付き＝水面を持たない」扱いになり、実際の
  // 水量に関わらずタイル全体を塗っていた。浅い湖（水量4/8）で水面が半分の高さ
  // なのに、岩の真下だけタイル全体まで塗られ、水面が岩に吸い付いたように見える。
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');

  // 行4が水面の行。列4-7に浮いた岩(行0-3)があり、その真下(行4)もつながった
  // 同じ浅い水たまり（水量4=半分）。行5以降は満水。
  const map = makeWaterMap(`
    ............
    ....####....
    ....####....
    ....####....
    44444444444.
    88888888888.
  `);

  const fills = [];
  const origCreateElement = globalThis.document.createElement;
  globalThis.document.createElement = () => {
    const ctx = makeFakeCtx();
    const orig = ctx.fillRect.bind(ctx);
    ctx.fillRect = (x, y, w, h) => { fills.push({ x, y, w, h }); return orig(x, y, w, h); };
    return { width: 0, height: 0, getContext: () => ctx };
  };
  try {
    createWaterRenderer({ game: { map } });
  } finally {
    globalThis.document.createElement = origCreateElement;
  }

  // 列ごとの、行4のタイル内での塗りの上端
  const topByCol = new Map();
  for (const f of fills) {
    if (f.h <= 0) continue;
    if (f.y < 4 * TILE_SIZE || f.y >= 5 * TILE_SIZE) continue; // 行4のタイル範囲だけ見る
    const c = Math.floor(f.x / TILE_SIZE);
    const cur = topByCol.get(c);
    if (cur === undefined || f.y < cur) topByCol.set(c, f.y);
  }

  // 水面(列0-3)の塗りの上端
  const surfaceTop = topByCol.get(1);
  assert.notEqual(surfaceTop, undefined, '水面側に塗りがあるはず');
  assert.ok(surfaceTop > 4 * TILE_SIZE, '前提: 水量4/8なので満タンより浅いはず');

  // 岩の真下(列4-7、水量は同じ4)も、同じ高さから塗られるべき
  for (let c = 4; c <= 7; c++) {
    assert.equal(topByCol.get(c), surfaceTop,
      `列${c}(岩の真下)の塗りの上端 ${topByCol.get(c)} が水面側 ${surfaceTop} と違う（吸い付いている）`);
  }
});

test('沈んだ岩の真下は、水量が満タンに届いていなくてもタイル全体を塗る', async () => {
  // 上のテストの裏返し。浮いた岩（上が空気）の下は水量ぶんだけ浅く塗るのが
  // 正しいが、**沈んだ岩**（上にも水がある）の下をそれでやると、量子化で
  // 1つ足りないだけのセルに透明な帯が残り、岩の真下に黒い線が見える。
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');

  const map = makeWaterMap(`
    ............
    88888888888.
    8888####888.
    88887777888.
    88888888888.
  `);

  const fills = [];
  const origCreateElement = globalThis.document.createElement;
  globalThis.document.createElement = () => {
    const ctx = makeFakeCtx();
    const orig = ctx.fillRect.bind(ctx);
    ctx.fillRect = (x, y, w, h) => { fills.push({ x, y, w, h }); return orig(x, y, w, h); };
    return { width: 0, height: 0, getContext: () => ctx };
  };
  try {
    createWaterRenderer({ game: { map } });
  } finally {
    globalThis.document.createElement = origCreateElement;
  }

  for (let c = 4; c <= 7; c++) {
    const inTile = fills.filter((f) => f.h > 0
      && Math.floor(f.x / TILE_SIZE) === c
      && f.y >= 3 * TILE_SIZE && f.y < 4 * TILE_SIZE);
    assert.ok(inTile.length > 0, `列${c} の行3 に塗りが無い`);
    const top = Math.min(...inTile.map((f) => f.y));
    assert.equal(top, 3 * TILE_SIZE,
      `列${c}(沈んだ岩の真下, 水量7/8) の塗りがタイル上辺から始まっていない: ${top}`);
  }
});

test('沈んだ浅いセルの隣の岩は、前景の塗りと同じ高さ（タイルの上辺）から背後を埋める', async () => {
  // 塗り（paint）は「沈んでいる＝覆う岩の上にも水がある」セルをタイル全体で塗るのに、
  // 背後の水（waterBackdropTopY）は沈み判定を持たず水量ぶんの高さから敷いていた。
  // 水量7だと 2px ずれて、面取りの角が黒く抜ける。塗りの上端の決め方を1つにする
  const { waterBackdropTopY } = await import('../src/js/world/environment/water.js');
  const { TILE_SIZE } = await import('../src/js/utils/Constants.js');
  const map = makeWaterMap(`
    #...#
    #888#
    #####
    ##7##
    #####
  `);
  assert.equal(map.waterSurfaceY[3 * map.cols + 2], -1, '前提: (3,2) は液面を持たない（天井付き）');
  // (3,1) の岩にとって、水に接しているのは (3,2) だけ
  assert.equal(waterBackdropTopY(map, 3, 1), 3 * TILE_SIZE);
});

// タイルごとに「いま塗られている上端 Y」だけを覚える canvas。clearRect で消え、fillRect で
// いちばん上の Y を残す。差分で塗り直したキャッシュと、同じ状態を最初から塗ったキャッシュを
// 突き合わせるのに使う（fillRect の呼び出し列は塗り直しの経路で変わるので比べられない）
// tops.counts にはタイルごとの fillRect の回数も覚える。泡のマスの粒は上端を変えないので、
// 上端だけでは粒の描き漏れが見えない
function tileTopCanvas() {
  const tops = new Map();
  tops.counts = new Map();
  const ctx = makeFakeCtx();
  ctx.clearRect = (x, y, w, h) => {
    for (let ty = Math.floor(y / TILE_SIZE); ty < Math.ceil((y + h) / TILE_SIZE); ty++) {
      for (let tx = Math.floor(x / TILE_SIZE); tx < Math.ceil((x + w) / TILE_SIZE); tx++) {
        tops.delete(`${ty},${tx}`);
        tops.counts.delete(`${ty},${tx}`);
      }
    }
  };
  ctx.fillRect = (x, y, w, h) => {
    if (w <= 0 || h <= 0) return;
    const key = `${Math.floor(y / TILE_SIZE)},${Math.floor(x / TILE_SIZE)}`;
    tops.set(key, Math.min(tops.get(key) ?? Infinity, y));
    tops.counts.set(key, (tops.counts.get(key) ?? 0) + 1);
  };
  return { width: 0, height: 0, getContext: () => ctx, tops };
}

/** 前景・背後のキャッシュを覗ける描画を作る（createWaterRenderer は前景→背後の順に canvas を作る） */
async function rendererWithTops(map) {
  const { createWaterRenderer } = await import('../src/js/world/environment/water.js');
  const made = [];
  const origCreateElement = globalThis.document.createElement;
  globalThis.document.createElement = () => { const cv = tileTopCanvas(); made.push(cv); return cv; };
  try {
    const renderer = createWaterRenderer({ game: { map } });
    return { renderer, fore: made[0].tops, behind: made[1].tops };
  } finally {
    globalThis.document.createElement = origCreateElement;
  }
}

/**
 * 水量を変えたセルだけを本番と同じく onWaterChanged で知らせ、描画を1回通したあとの
 * キャッシュが、同じ水の状態を最初から塗ったものと一致することを確かめる。
 * 最初から塗る前に全列を作り直す。差分で作り直した塗りの上端（waterPaintTopY）が古いと、
 * 最初から塗る描画も同じ古い値を読んで一致してしまい、取りこぼしが見えない
 * （液面のはみ出した先を計算し直さない壊し方で、このテスト群が1本も落ちなかった）
 */
async function assertRepaintMatchesFresh(map, renderer, fore, behind, changedCells) {
  map.onWaterChanged(changedCells);
  renderer.drawBehindTerrain(makeFakeCtx(), 0, 0);
  renderer.drawOverWorld(makeFakeCtx(), 0, 0);
  const incremental = Int16Array.from(map.waterPaintTopY);
  map.refresh();
  const staleTops = [];
  for (let k = 0; k < incremental.length; k++) {
    if (incremental[k] !== map.waterPaintTopY[k]) {
      staleTops.push(`${Math.floor(k / map.cols)},${k % map.cols}: ${incremental[k]} / ${map.waterPaintTopY[k]}`);
    }
  }
  assert.deepEqual(staleTops, [], '塗りの上端が全列作り直しと食い違う（差分 / 全列）');
  const fresh = await rendererWithTops(map);
  const diff = (a, b) => [...new Set([...a.keys(), ...b.keys()])]
    .filter((k) => a.get(k) !== b.get(k)).map((k) => `${k}: ${a.get(k)} / ${b.get(k)}`);
  assert.deepEqual(diff(fore, fresh.fore), [], '前景の塗りが古いまま残っている（差分 / 塗り直し）');
  assert.deepEqual(diff(fore.counts, fresh.fore.counts), [], '前景の塗りの回数が違う＝泡の粒が古い（差分 / 塗り直し）');
  assert.deepEqual(diff(behind, fresh.behind), [], '岩の背後の塗りが古いまま残っている（差分 / 塗り直し）');
}

/** 行2の左4セルが水量4、行3が満水の池。右の行3の真上の空セルは液面の高さで薄く塗られる
 * （水量4なのは、幅の広い池でも液面の平均が行3の上辺より上に来るように） */
function poolWithShallowLeft(width) {
  const inner = width - 2;
  return makeWaterMap(`
    ${'#'.repeat(width)}
    #${'.'.repeat(inner)}#
    #4444${'.'.repeat(inner - 4)}#
    #${'8'.repeat(inner)}#
    ${'#'.repeat(width)}
  `);
}

test('水が抜けて液面が下がったら、水量0のまま液面だけで塗っていたセルの塗りも消える', async () => {
  // 実機の指摘（水圧で池の水が一気に移った後、水面の上に平らな水の四角が残る）。
  // 行2の左は水量4の水面、右は行3の満水の上の空セル。左右は斜めにつながった1つの水面で
  // 液面（平均）が行3の上辺より上に来るので、右の空セルも液面の高さで薄く塗られる。
  // 左の水が抜けると液面は行3の上辺へ下がり、右の空セルの液面は消える。
  // 水量が変わったのは左の4セルだけなので、それだけを塗り直すと右の空セルの塗りが残った
  // （4面 seed 30 で掘り抜くと、高い方の池の水面の行に24マス残った）
  const map = poolWithShallowLeft(14);
  const { renderer, fore, behind } = await rendererWithTops(map);
  map.game = { env: { renderer } };
  assert.ok(map.waterSurfaceY[2 * map.cols + 8] >= 0, '前提: 右の空セル (2,8) は液面の高さで塗られている');
  assert.ok(fore.has('2,8'), '前提: (2,8) に塗りがある');

  for (let c = 1; c <= 4; c++) map.water[2 * map.cols + c] = 0;
  await assertRepaintMatchesFresh(map, renderer, fore, behind, [[2, 1], [2, 2], [2, 3], [2, 4]]);
});

test('作り直した列から遠く離れた列の空セルの塗りも消える（液面の区間がはみ出した先）', async () => {
  // 作り直すのは水量が変わった列の左右 SEGMENT_LOOKUP_RANGE 列までだが、液面の区間は
  // その外まで続き、外の列の液面も書き換わる。外の列は書き換える直前の値と比べて拾う
  // （この経路を外すと、20週×撃ち抜き12回の総当たりで 56 回の点検に古い塗りが残った）
  const { SEGMENT_LOOKUP_RANGE } = await import('../src/js/world/waterQuery.js');
  const width = SEGMENT_LOOKUP_RANGE * 2 + 12;
  const map = poolWithShallowLeft(width);
  const { renderer, fore, behind } = await rendererWithTops(map);
  map.game = { env: { renderer } };
  const far = width - 3;
  assert.ok(far > 4 + SEGMENT_LOOKUP_RANGE, '前提: 列 far は作り直す列の範囲の外');
  assert.ok(fore.has(`2,${far}`), `前提: (2,${far}) に塗りがある`);

  for (let c = 1; c <= 4; c++) map.water[2 * map.cols + c] = 0;
  await assertRepaintMatchesFresh(map, renderer, fore, behind, [[2, 1], [2, 2], [2, 3], [2, 4]]);
});

test('1つ下の行の水の液面が岩の行まで上がっているとき、その液面が動いたら岩の背後も塗り直す', async () => {
  // (3,1) は滝 (2,1) の受け口の水面で、右の行2の水面と1つの区間。液面（平均）は行2の
  // タイルの中にあるので、(3,1) 自身の塗りはタイルの上辺で頭打ち＝液面が動いても変わらない。
  // ところが左上の岩 (2,0) の背後は (3,1) の液面の高さから敷くので、液面が動くと変わる。
  // 「自分の塗りが変わるか」だけで塗り直しを絞ると、岩の背後が 2px 古いまま残った
  // （20週×撃ち抜き12回の総当たりで2件）
  const map = makeWaterMap(`
    .......
    .......
    #4888..
    #7888..
    #######
  `);
  const { renderer, fore, behind } = await rendererWithTops(map);
  map.game = { env: { renderer } };
  assert.ok(map.isWaterfallCell(2, 1), '前提: (2,1) は滝');
  const before = map.waterSurfaceY[3 * map.cols + 1];
  assert.ok(before >= 2 * TILE_SIZE && before < 3 * TILE_SIZE, `前提: (3,1) の液面は行2のタイルの中 (${before})`);

  map.water[2 * map.cols + 4] = 4;
  await assertRepaintMatchesFresh(map, renderer, fore, behind, [[2, 4]]);
  assert.notEqual(map.waterSurfaceY[3 * map.cols + 1], before, '前提: 液面が動いた');
});

test('厚い岩の上の水が減って沈んでいなくなったら、岩の下の天井付きの水も水量ぶんの高さに塗り直す', async () => {
  // (3,1) は岩2段の下の水量6の横穴。岩の上 (0,1) が満水のあいだは「沈んでいる」のでタイル全体を
  // 塗る（isSubmergedFromAbove）。上の水が2に減ると沈んでいなくなり、水量ぶん（下から12px）に
  // 変わる。種別（水中）も液面（無し）も変わらないので、種別と液面の変化だけを見る塗り直しでは
  // 拾えず、水量が変わったセルの上下1行だけを塗る invalidate も岩2段の下には届かなかった
  const map = makeWaterMap(`
    #8#
    ###
    ###
    #6#
    ###
  `);
  const { renderer, fore, behind } = await rendererWithTops(map);
  map.game = { env: { renderer } };
  assert.equal(fore.get('3,1'), 3 * TILE_SIZE, '前提: 沈んでいるあいだはタイル全体を塗る');

  map.water[0 * map.cols + 1] = 2;
  await assertRepaintMatchesFresh(map, renderer, fore, behind, [[0, 1]]);
  assert.equal(fore.get('3,1'), 4 * TILE_SIZE - 12, '水量6ぶんの高さに塗り直される');
});

// ---- 泡のマス ----
// 落下（4フレームに1回・最大2）は横の流れ（毎フレーム最大4）の1/8しかないので、棚から棚へ流れ落ちる
// 水は「満水のセルの真下がほとんどいつも空気」という階段になる。満水のセルは種別では水面なので、
// 宙に浮いた水の四角が線つきで市松模様に並んで見えた（実機の指摘）。真上が滝でない水で、真下が水か岩の
// 空気は、泡の多い水として塗る（20週×撃ち抜き12回で、浮いた四角 498 のうち 494 の真下がこれに当たる）

/** 画面に引いた水面の線の、各折れ線の始点の y */
function surfaceLineStarts(renderer) {
  const ctx = makeFakeCtx();
  renderer.drawOverWorld(ctx, 0, 0);
  return ctx.calls.filter((c) => c.name === 'moveTo').map((c) => c.args[1]);
}

test('階段の段の上の満水のセルの真下の隙間（下が岩）は、タイル全体を泡の多い水で塗る', async () => {
  const map = makeWaterMap(`
    ....
    .8..
    ....
    ####
  `);
  const { renderer, fore } = await rendererWithTops(map);
  assert.equal(map.isWaterFoam(2, 1), true, '(2,1) は泡のマス');
  assert.equal(fore.get('2,1'), 2 * TILE_SIZE, '泡のマスはタイル全体を塗る');
  assert.equal(map.isWaterFoam(1, 0), false, '真上に水の無い空気は泡にしない');
  assert.equal(fore.has('2,0'), false);
  // 段の一番上の満水のセルの上は本物の水面なので、線は残す
  assert.ok(surfaceLineStarts(renderer).some((y) => Math.abs(y - TILE_SIZE) <= 2), '一番上の段の線は残る');
});

test('縦に積まれた満水のセルのあいだの隙間は泡にし、その真下の水面の線は引かない', async () => {
  const map = makeWaterMap(`
    ...
    .8.
    ...
    .8.
    ...
    ###
  `);
  const { renderer, fore } = await rendererWithTops(map);
  assert.equal(map.isWaterFoam(2, 1), true, '(2,1) は上下を水に挟まれた泡のマス');
  assert.equal(map.isWaterFoam(4, 1), true, '(4,1) は満水と岩に挟まれた泡のマス');
  assert.equal(fore.get('2,1'), 2 * TILE_SIZE);
  assert.ok(map.isWaterSurface(3, 1), '前提: 種別では (3,1) は水面のまま（当たり判定は変えない）');
  const starts = surfaceLineStarts(renderer);
  assert.ok(starts.some((y) => Math.abs(y - TILE_SIZE) <= 2), '一番上 (1,1) の線は残る');
  assert.ok(!starts.some((y) => Math.abs(y - 3 * TILE_SIZE) <= 2), '泡の真下の (3,1) には線を引かない');
});

test('滝の水滴の切れ目の空気は泡にしない（細い滝が泡の四角の列にならない）', async () => {
  // (0,1) は水量2で真下が空気＝滝。(1,1) は上下が水だが、真上が滝なので泡ではない
  // （この形は総当たりで延べ12,480マスあった）
  const map = makeWaterMap(`
    .2.
    ...
    .8.
    ###
  `);
  const { fore } = await rendererWithTops(map);
  assert.ok(map.isWaterfallCell(0, 1), '前提: (0,1) は滝');
  assert.equal(map.isWaterFoam(1, 1), false);
  assert.equal(fore.has('1,1'), false);
});

test('下の満水が抜けて泡のマスができたら、差分の塗り直しでも泡で塗る', async () => {
  // 塗り直しの対象は作り直しで塗りの上端か泡かが変わったセル。空気のまま変わらないセルを飛ばす
  // 近道が、真上に水が来て泡になったセルまで飛ばさないことを確かめる
  const map = makeWaterMap(`
    ...
    .8.
    .8.
    ###
  `);
  const { renderer, fore, behind } = await rendererWithTops(map);
  map.game = { env: { renderer } };
  assert.equal(map.isWaterFoam(2, 1), false, '前提: 最初は泡のマスは無い');

  map.water[2 * map.cols + 1] = 0;
  await assertRepaintMatchesFresh(map, renderer, fore, behind, [[2, 1]]);
  assert.equal(map.isWaterFoam(2, 1), true);
  assert.equal(fore.get('2,1'), 2 * TILE_SIZE);
});

// ---- 泡の粒 ----
// 泡のマスは1か所に続かない（362回のうち343回が3フレーム以下で、1〜3フレームでまた出る。落下が
// 4フレームに1回なので「2〜3フレーム泡、1フレーム水」をくり返す）。マスに粒を描くと白い粒が
// 15Hz で点滅するだけなので、泡のマスからは粒を生むだけにして、粒はマスが消えても昇り続けさせる

/** 階段の段: (1,1) が満水、(2,1) が泡のマス、行3が床 */
function stepWithFoam(width = 4) {
  return makeWaterMap(`
    ${'.'.repeat(width)}
    .8${'.'.repeat(width - 2)}
    ${'.'.repeat(width)}
    ${'#'.repeat(width)}
  `);
}

test('泡のマスから白い泡の粒が生まれ、上へ昇る', async () => {
  const map = stepWithFoam();
  const { renderer } = await rendererWithTops(map);
  assert.ok(map.isWaterFoam(2, 1), '前提: (2,1) は泡のマス');
  const seen = new Map();   // 粒 → 最初に見た y
  let rose = 0;
  for (let i = 0; i < 60; i++) {
    renderer.update();
    for (const b of renderer.bubbles) {
      assert.ok(b.x >= TILE_SIZE - 1 && b.x <= 2 * TILE_SIZE + 1, `粒は泡のマスの列の中 (x=${b.x})`);
      if (!seen.has(b)) seen.set(b, b.y);
      else if (b.y < seen.get(b) - 2) rose++;
    }
  }
  assert.ok(seen.size > 5, `粒が生まれる (${seen.size})`);
  assert.ok(rose > 0, '粒は上へ昇る');
});

test('泡の粒は水の外へ出たら消える（満水のセルの液面より上へは行かない）', async () => {
  const map = stepWithFoam();
  const { renderer } = await rendererWithTops(map);
  for (let i = 0; i < 200; i++) {
    renderer.update();
    for (const b of renderer.bubbles) assert.ok(b.y >= TILE_SIZE, `粒が水の外 (y=${b.y})`);
  }
});

test('泡のマスが水に戻っても、生まれた粒はすぐには消えない（点滅しない）', async () => {
  const map = stepWithFoam();
  const { renderer } = await rendererWithTops(map);
  for (let i = 0; i < 20; i++) renderer.update();
  const before = renderer.bubbles.length;
  assert.ok(before > 0, '前提: 粒がある');
  map.water[2 * map.cols + 1] = 8;   // 隙間に水が落ちてきた
  map.onWaterChanged([[2, 1]]);
  assert.equal(map.isWaterFoam(2, 1), false, '前提: 泡のマスは消えた');
  renderer.update();
  assert.ok(renderer.bubbles.length > 0, '粒は昇り続ける');
});

test('泡のマスが無ければ粒は生まれない', async () => {
  const map = mapWithPool();
  const { renderer } = await rendererWithTops(map);
  for (let i = 0; i < 60; i++) renderer.update();
  assert.equal(renderer.bubbles.length, 0);
});

test('泡の粒の数には上限がある', async () => {
  const { WATER_BUBBLE_MAX } = await import('../src/js/utils/Constants.js');
  // 幅60の段に満水を並べ、泡のマスを58個作る（実マップでは同時に多くて7個）
  const width = 60;
  const map = makeWaterMap(`
    ${'.'.repeat(width)}
    .${'8'.repeat(width - 2)}.
    ${'.'.repeat(width)}
    ${'#'.repeat(width)}
  `);
  const { renderer } = await rendererWithTops(map);
  let peak = 0;
  for (let i = 0; i < 120; i++) { renderer.update(); peak = Math.max(peak, renderer.bubbles.length); }
  assert.ok(peak > WATER_BUBBLE_MAX / 2, `前提: 上限に届くだけ生まれる (${peak})`);
  assert.ok(peak <= WATER_BUBBLE_MAX, `上限 ${WATER_BUBBLE_MAX} を超えない (${peak})`);
});

test('泡の粒は画面に描かれる', async () => {
  const { WATER_BUBBLE_COLOR } = await import('../src/js/utils/Constants.js');
  const map = stepWithFoam();
  const { renderer } = await rendererWithTops(map);
  for (let i = 0; i < 30; i++) renderer.update();
  const ctx = makeFakeCtx();
  renderer.drawOverWorld(ctx, 0, 0);
  let color = '', n = 0;
  for (const c of ctx.calls) {
    if (c.name === 'set:fillStyle') color = c.args[0];
    if (c.name === 'fillRect' && color === WATER_BUBBLE_COLOR) n++;
  }
  assert.equal(n, renderer.bubbles.length, '粒の数だけ泡の色で描く');
});
