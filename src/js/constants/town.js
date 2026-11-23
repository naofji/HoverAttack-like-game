// 3面の町並み（建物・壊れ方・火・爆発物と誘爆・音）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
import { LANDMINE_KNOCKBACK_VX, LANDMINE_KNOCKBACK_VY } from './enemies.js';
import { GRENADE_BLAST_RADIUS, GRENADE_BLOCK_DAMAGE, GRENADE_DAMAGE, GRENADE_DAMAGE_RADIUS, GRENADE_EXPLOSION_COUNT, GRENADE_KNOCKBACK_VX, GRENADE_KNOCKBACK_VY } from './player.js';

// --- 3面の町並み（props: 'town'）---
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md
// 段1（置いて描く）の数値。初期値で、実機で見て詰める。
// かけらの大きさは地形の一番細かい描き込み（4px）に揃える。
export const TOWN_CHUNK = 4;
// 床から天井までの空きがこれ未満の区間には建てない（タイル）。小屋の最小の高さ 24px に
// 天井との空き TOWN_CEILING_CLEARANCE を足すと 3.5 タイル要る
export const TOWN_MIN_HEADROOM = 4;
// 建物の一番上と天井のあいだに必ず空けるタイル数。天井にくっついて見えないように
export const TOWN_CEILING_CLEARANCE = 2;
// 土台を床の岩に埋める深さ（px）。町は機体より手前に描くが、建物の矩形の範囲だけ地形を
// 描き直して重ねる（Map.drawTerrainOver）ので、埋めた分は岩の縁に隠れて「建っている」に見える。浮いて見える隙間を作らないためのもの
export const TOWN_FOUNDATION_SINK = 4;
// 町（3〜5面の建物・植物・雪の木・つらら）は機体より手前に描く（建物に入ると陰に隠れて見える。
// 当たり判定は前から「重なる建物が外からの弾を止める」なので、見た目をそれに揃えた）。
// 自機・母艦・敵・落ちているアイテム・地雷が重なっている建物は丸ごとこの不透明度まで薄くして、
// 中の機体を見失わないようにする。初期値 0.35 は薄すぎて隠れた感じが無く、実機を見たユーザーが 0.80 にした（2026-11-06）
export const TOWN_OCCLUDE_ALPHA = 0.80;
// 薄くする・戻すときの 1 tick あたりの不透明度の変化。0.08 で 1 → 0.80 が約3 tick（1 → 0.35 なら約8 tick）。
// 一瞬で切り替えると、建物の縁を出入りするたびにチカチカする
export const TOWN_OCCLUDE_FADE_STEP = 0.08;
// 5面: 支えのかけらが形の岩に「触れている」とみなす距離（px。town/chunks.js の chunkTouchesRock）。
// 隣のブロックが壊れて根元のタイルが坂・面取りに削れたとき、これより離れた木は倒れ、つららは落ちる。
// 0（かけらの縁まで見る）だと、45度の坂で根元の角が 0.5〜2px 離れただけの、見た目は床に着いている木まで
// 倒れた（seed 1・2 で根元の隣を壊した 1102 例のうち倒れた 266 本の 167 本が隙間 2px 以下）。2 だと倒れるのは
// 88 本で、どれも隙間 4px 超。立っている木の隙間は 2.5px まで
export const TOWN_SHAPE_SUPPORT_REACH = 2;
// この段差（タイル）までの床はつないで1本の区間にする（placement.js の chainFloors）。
// 洞窟の床は細かい段だらけで、つながないと広い部屋でも幅1タイルの区間ばかりになり塔が建たない。
// 低いほうの床を地面にするので、高い段の上では土台がこの高さぶん岩に隠れる。
// 2 にすると小屋（壁 12〜20px）の戸口まで隠れるので 1
export const TOWN_FLOOR_STEP_MAX = 1;
// 村（villages.js）。床の区間を左から歩くとき、そこに建てる確率を近くの村で変える。
// 最初は面全体で一律 0.75（TOWN_FLOOR_FILL）にしていたが、実機で「建物が想定より多い、
// まばらな所と密集した所の村があっていい」と言われ、村の中心からの距離で決める形にした。
// 面を TOWN_VILLAGE_GRID_COLS × _ROWS の升に分け、升ごとに村を1つ置くか決める
// （面全体に散らばる。縦の列ごとに少なくとも1つは置く）
export const TOWN_VILLAGE_GRID_COLS = 5;
export const TOWN_VILLAGE_GRID_ROWS = 2;
export const TOWN_VILLAGE_DENSE_CHANCE = 0.45;   // 升に密集した村を置く確率
export const TOWN_VILLAGE_SPARSE_CHANCE = 0.35;  // まばらな集落を置く確率（残りは村なし）
// 3つの確率は実機で 0.9 / 0.3 / 0.05 から今の値へ（ユーザー調整、2026-10-11。8種の平均 202 棟）
export const TOWN_VILLAGE_DENSE_FILL = 0.8;      // 密集した村の中心で建てる確率
export const TOWN_VILLAGE_SPARSE_FILL = 0.4;     // まばらな集落の中心で建てる確率
export const TOWN_VILLAGE_OUTSIDE_FILL = 0.1;   // どの村にも入らない所（ぽつんと1軒くらい）
// 半径（タイル）の範囲。中心から半径の半分までは村の密度のまま、縁で村の外の密度まで下がる。
// 棟数（8種の平均）で決めた: [12,22]/[16,28] は 96棟、[18,30]/[22,34] は 150棟、
// この値で 195棟（一律 0.75 のときの 411棟の約半分）。広げると村どうしがつながって差が薄れる
export const TOWN_VILLAGE_RADIUS_DENSE = [22, 36];
export const TOWN_VILLAGE_RADIUS_SPARSE = [26, 40];
// 最後の敵基地の周り（タイル、基地の中心から）。INNER 以内には何も建てず、OUTER までで村の密度に戻る。
// 実機で「敵基地の周辺には街がない方が自然」と言われた。基地の部屋だけ避けていたときは、
// 部屋の壁のすぐ外まで家が並んでいた。基地は面の右端にあるので、右端の小部屋は岩肌だけになる
export const TOWN_BASE_QUIET_INNER = 24;
export const TOWN_BASE_QUIET_OUTER = 40;
// 日干し煉瓦（A）の割合は、天井までの空きで決める（広い所は A、狭い所は坑道の小屋 C）
export const TOWN_ADOBE_HEADROOM_WIDE = 12;
export const TOWN_ADOBE_SHARE_WIDE = 0.8;
export const TOWN_ADOBE_HEADROOM_NARROW = 5;
export const TOWN_ADOBE_SHARE_NARROW = 0.1;
// 隣り合う塔の上の階を橋でつなぐ確率（シバームの塔は上の階どうしを橋や綱で結ぶ）
export const TOWN_TOWER_BRIDGE_CHANCE = 0.4;
// 壁に張り付く家。壁が縦にこれだけ続き、前にこれだけの空きがあるところに置く（タイル）
export const TOWN_WALL_MIN_RUN = 4;
export const TOWN_WALL_MIN_REACH = 4;
export const TOWN_WALL_SPACING = 8;        // 壁の長さこれごとに1軒の候補
export const TOWN_WALL_HOUSE_CHANCE = 0.5; // 候補ごとに建てる確率
// 天井から吊るもの。天井がこれだけ続き、下にこれだけの空きがあるところに吊る（タイル）
export const TOWN_CEIL_MIN_RUN = 6;
export const TOWN_CEIL_MIN_DROP = 8;
// 吊るしたものの下に残す空き（タイル）。自機（1.5タイル）が下をくぐれる高さ＋余裕
export const TOWN_CEIL_KEEP_BELOW = 4;

// --- 3面の町並み 段2（壊れ方）---
// 爆発で欠ける半径 = K × √(粒の数)。マシンガンの着弾 4粒 → 約7px、ミサイル 36粒 → 約20px、
// グレネード 150粒 → 約40px（spec 2章）
export const TOWN_BLAST_RADIUS_K = 3.3;
// 穴の縁のぎざぎざの幅（px）。かけらごとに ±半分だけ半径を揺らす
export const TOWN_CHIP_JAGGED = 3;
// 残ったかけらがこの割合を下回ったら崩壊する
export const TOWN_COLLAPSE_FRACTION = 0.4;
// 崩壊で残す土台の深さ（支えのかけらから何かけら＝4px 何段ぶんまで）。3 で 12px ＝ A の1階ぶん。
// spec の「下の1〜2段」を、床・壁・天井のどれにも同じ規則で効くよう「支えからの距離」で言い直した
export const TOWN_RUIN_DEPTH = 3;
// 崩壊の粒の数（createExplosion の count。ミサイルの爆発 36 より小さく、着弾 4 より大きい）
export const TOWN_COLLAPSE_PARTICLES = 24;
// 同時に落ちている破片の上限。超えたら古いものから土煙になって消える（spec 2章）
export const TOWN_FALLING_MAX = 24;
// 落ちる破片の動き。重力は Grenade（GRENADE_GRAVITY）と同じ桁。回りは 1 フレーム最大 0.05rad
export const TOWN_FALL_GRAVITY = 0.25;
export const TOWN_FALL_MAX_SPEED = 7;     // 1 tick に 7px。描画補間の瞬間移動の閾値 64px より十分小さい
export const TOWN_FALL_SPIN_MAX = 0.05;
export const TOWN_FALL_DRIFT_MAX = 0.3;   // 横へ流れる初速（±px/tick）
// 落ちる破片が下の建物を欠かせる半径（px）。1棟1回
export const TOWN_FALL_CHIP_RADIUS = 6;
// 砕けたときの粒（破片の色の欠片＋土煙）の数
export const TOWN_SHATTER_PARTICLES = 10;
// 瓦礫の山の高さの上限（px）。重なるたびに 1px ずつ高くなる
export const TOWN_RUBBLE_MAX_H = 10;
// 弾の種類ごとの、建物への当たり方（spec 2章の表）。弾のクラスが townKind でここの行を選ぶ。
//   chip:   当たった所を欠かせる半径（px）。ミサイル・グレネードの欠けは、爆発（blast）の側で大きく開く
//   thin:   細い部品（厚い壁の印の無いかけら）に当たったら 'chip'＝1棟1回欠かせて飛び続ける / 'pass'＝すり抜ける
//   pierce: 厚い壁も貫通する（反射ビーム）
//   bounce: 厚い壁（建物・木・植物・つらら）で止まらず、地形と同じ式で跳ね返る（グレネード。
//           grenadePhysics.bounceOffTown）。面の向きはかけらの並びから推定する（surfaceNormal。
//           三角形の木の斜面を縦横の軸に丸めない）。欠かさず爆発もしない。欠けるのは爆風（town.blast）で、
//           爆発するのは寿命が尽きたときと、岩や地形に当たって爆発する条件のときだけ
//           （ユーザー指定 2026-10-31。素通り→跳ね返りに考え直した。以前は厚い壁で爆発した）
//   ignite: 当たった所に、かけらの材料の bulletIgnite の確率で火をつける（段3）
// 厚い壁で止まったときの反応は、弾ごとの onTownWall(x, y)（岩に当たったときと同じ。岩は壊さない）
export const TOWN_PROJECTILE_IMPACT = {
    bullet: { chip: 4, thin: 'chip', ignite: true },
    missile: { chip: 4, thin: 'chip', ignite: true },
    grenade: { chip: 0, thin: 'pass', bounce: true },
    beam: { chip: 6, thin: 'chip', pierce: true },
};
// 弾の通り道を調べる刻み（px）。かけら 4px と同じにして、速い弾が薄い壁をすり抜けないように
export const TOWN_SWEEP_STEP = 4;
// グレネードが町の厚い壁で跳ね返るときの、面の向き（法線）を推定する半径（px）。かけら 2 つぶん。
// 実測（円錐の針葉樹に真上から落とし、法線の傾きを見た）: 8px だと左右の斜面が約 ±56〜67° で対称、
// 頂点の近くは真上（約 6°）。12px 以上だと頂点が ±40〜50° にぼやけ、16px では根元の端で
// 下向き（約 100°）にずれた。小さすぎる（4px）と階段の段差に引きずられる
export const TOWN_BOUNCE_NORMAL_RADIUS = 8;

// --- 3面の町並み 段3（火）---
// 燃え進みを計算する間隔（フレーム）。燃料・確率はこの1回ごとに数える（spec 3章）
export const TOWN_FIRE_TICK = 6;
// 面全体で同時に燃える火元の上限と、1棟あたりの上限。上限のあいだは新しく火がつかない
export const TOWN_FIRES_MAX = 60;
export const TOWN_FIRES_PER_BUILDING = 4;
// 材料ごとの燃え方（spec 3章の表）。キーはかけらの材料の番号（chunks.js の MAT_*）。
//   burns:        燃えるか（金属は燃えない。熱で焦げるだけで、燃え移りを中継しない）
//   bulletIgnite: マシンガンの弾が当たって火がつく確率（spec の初期値 木 15%・土 3%）
//   spread:       燃え進みの1回に、隣のかけらへ火が進む確率
//   catch:        別の建物の燃えているかけらから TOWN_FIRE_JUMP_RANGE 以内のとき、燃え進みの1回に燃え移る確率
//   fuel:         火元の燃料（フレーム）。spec の初期値 木 12〜20秒・土 5〜8秒
//   crumble:      燃えている建物の焦げたかけらが、燃え進みの1回に崩れて抜ける確率
// 爆発物（4）は段3b で爆発の規則を足すまで木と同じに燃やす
export const TOWN_MATERIALS = {
    1: { burns: true, bulletIgnite: 0.03, spread: 0.1, catch: 0.02, fuel: [300, 480], crumble: 0.004 },
    2: { burns: true, bulletIgnite: 0.15, spread: 0.5, catch: 0.25, fuel: [720, 1200], crumble: 0.02 },
    3: { burns: false, bulletIgnite: 0, spread: 0, catch: 0, fuel: [0, 0], crumble: 0 },
    4: { burns: true, bulletIgnite: 0.15, spread: 0.5, catch: 0.25, fuel: [720, 1200], crumble: 0.02 },
    // 植物（苔・シダ。4面）。燃えない・火を中継しない（金属と同じ行）。ユーザーの指定: 誘爆も延焼もしない
    5: { burns: false, bulletIgnite: 0, spread: 0, catch: 0, fuel: [0, 0], crumble: 0 },
    // つらら（5面）。燃えない・火を中継しない（植物と同じ行）
    6: { burns: false, bulletIgnite: 0, spread: 0, catch: 0, fuel: [0, 0], crumble: 0 },
    // コンクリート（6面の倉庫・工場棟の壁）。燃えにくさは日干し煉瓦（1）と同じ行。材料の番号を分けたのは
    // 瓦礫・破片の色（palette.js の TOWN_RUBBLE_COLORS）を土の茶色ではなく灰色にするため
    7: { burns: true, bulletIgnite: 0.03, spread: 0.1, catch: 0.02, fuel: [300, 480], crumble: 0.004 },
};
// 火が隣へ進むとき、元の火元を残したまま新しい火元を増やす確率（それ以外は火元が移る）。
// 増やしすぎると 1棟の上限 4 にすぐ届く
export const TOWN_FIRE_BRANCH = 0.15;
// 別の建物へ燃え移る距離（px。spec 3章）
export const TOWN_FIRE_JUMP_RANGE = 8;
// 燃えている火元の隣の金属が熱で焦げる確率（燃え進みの1回）。焦げるだけで火元にはならない
export const TOWN_METAL_SCORCH = 0.2;
// 6面の金属が撃たれて赤く焼けた縁が、暗い焼け色へ冷めきるまでのフレーム数（Town の metalHeat）。
// 90 = 実時間でおよそ 1.5 秒（固定タイムステップ 60/s）。撃ち続けている間は赤い縁が点々と残り、
// 手を止めるとすぐ冷めて「撃った跡」だけになる長さとして置いた初期値。実機で見て調整する
export const FACTORY_HEAT_COOL = 90;
// 7面の基地の建物の硬さ。弾・ミサイル・ビームで欠ける半径（TOWN_PROJECTILE_IMPACT の chip）に掛ける倍率。
// 0.75 で弾・ミサイルの半径 4px → 3px（欠ける面積はおよそ半分強）。ユーザー「6面より若干硬め」の初期値。
// 爆風・落ちてくる破片には掛けない（Town の chipScale）。実機で見て調整する
export const BASE_TOWN_CHIP_SCALE = 0.75;
// 7面の基地を建てる村の濃さ（施設エリアの中心に1つずつ置く村の peak）。3面の密集した村（TOWN_VILLAGE_DENSE_FILL 0.8）と同じ
// 初期値。施設エリアは基地なので建物が並んで見えるように密にする。実機で見て調整する
export const BASE_TOWN_VILLAGE_PEAK = 0.8;
// 6面の工場が建つ地面をメタル（BLOCK_METAL）にする範囲（world/town/factoryGround.js。ユーザーの指定 2026-11-07）。
// MARGIN: 建物の外接矩形から左右に広げるタイル数。DEPTH: 床の上面から何段をメタルに（1段だと撃って1枚剥がすと
// すぐ岩が出る）。GAP: 同じ高さの床でこのタイル数以内のすき間はつなぐ（建物の並ぶ所が1枚の床に見えるように）
export const FACTORY_GROUND_MARGIN = 1;
export const FACTORY_GROUND_DEPTH = 2;
export const FACTORY_GROUND_GAP = 3;
// 6面のクレーンの荷（コンテナ・鉄骨）が落ちて機体に当たったときのダメージ（ユーザーの指定 2026-11-07）。
// 5面のつらら（ICICLE_DAMAGE 15〜35）と同じ仕組み・同じくらいの重さ。コンテナは大きく重いので、つららの重いほうに近く。
// 落ちる塊に荷のかけらが1つでも入っていれば当たる（ワイヤーが切れて荷だけ・桁ごと全体のどちらでも）。1塊1機体1回
export const FACTORY_LOAD_DAMAGE = { container: 30, beam: 20 };
export const FACTORY_LOAD_KNOCK_VY = 2;   // 当たった機体を下へ押す速さ（つららの ICICLE_KNOCK_VY と同じ）
// 残り火（燃え尽きた所・燃えて砕けた破片の所）が細い煙と火の粉を出し続けるフレーム数と、同時の上限
export const TOWN_EMBER_FRAMES = 480;   // 8秒
export const TOWN_EMBERS_MAX = 40;
// 炎・煙の粒。燃え進みの1回に火元1つから出す数と、同時の上限（画面の中の火だけが出す）
export const TOWN_FLAMES_PER_FIRE = 2;
export const TOWN_FLAMES_MAX = 360;
export const TOWN_SMOKE_EVERY = 3;      // 燃え進み何回に1回、火元から煙を1つ出すか
export const TOWN_SMOKE_MAX = 60;
export const TOWN_SMOKE_ALPHA = 0.35;   // 煙幕（SmokeScreen）より薄く。町の煙は見通しを遮らない
export const TOWN_EMBER_SMOKE_EVERY = 40; // 残り火が細い煙を出す間隔（フレーム）

// --- 3面の町並み 段3b（爆発物と誘爆）---
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（3b章）
// 床の建物何棟に1つ、脇に爆発物を置こうとするか。置けない所（盤面の端・段の岩・隣の建物の足元）が
// 約4割あるので、8 だと実際は 13 棟に1つ（40週の実測 547 / 7234）。spec の「8 棟に1つくらい」に合わせて 5
export const TOWN_EXPLOSIVE_EVERY = 5;
// 機体へのダメージは地雷（LANDMINE_DAMAGE / LANDMINE_BLAST_RADIUS）と同じから始める。
// グレネード（80）より弱い。別に持つのは、実機で町の爆発物だけを詰められるように（spec 3b章）
export const TOWN_EXPLOSIVE_DAMAGE = 25;
export const TOWN_EXPLOSIVE_RADIUS = 50;   // 機体へのダメージと誘爆の届く半径（px）
// 爆発の粒の数。町を欠かせる半径は K×√80 ≒ 30px（ミサイル 36粒の 20px とグレネード 150粒の 40px のあいだ）
export const TOWN_EXPLOSIVE_BLAST_COUNT = 80;
// 火が届いてから爆発するまで（フレーム）。燃えているのが見えてから爆発する（spec 3b章）。0.75秒
export const TOWN_EXPLOSIVE_COOKOFF = 45;
// 爆発物の爆発の種類（建物の blast。world/town/explosives.js）。誘爆の届く半径はどれも TOWN_EXPLOSIVE_RADIUS。
//   look: 閃光と粒（entities/destruction.js の BLAST_PROFILES のキー）、count: 粒の数（町を欠かせる半径も決まる）
//   radius / damage / knockVy / knockVx: 機体へのダメージ（敵味方どちらにも）
//   blockRadius / blockDamage: 地形を壊す半径（タイル）とダメージ。0 なら岩は壊さない
// town: 3面の町（spec 3b章「岩は壊さない」）。factory: 6面の工場。ユーザーの指定（2026-11-07「工場は可燃物が多いので、
// タンクなどの爆発はもっと派手に。グレネードと同様で周囲にダメージあり」）でグレネードの値をそのまま使う
export const TOWN_EXPLOSIVE_PROFILES = {
    town: {
        look: 'townExplosive', count: TOWN_EXPLOSIVE_BLAST_COUNT,
        radius: TOWN_EXPLOSIVE_RADIUS, damage: TOWN_EXPLOSIVE_DAMAGE,
        knockVy: LANDMINE_KNOCKBACK_VY, knockVx: LANDMINE_KNOCKBACK_VX,
        blockRadius: 0, blockDamage: 0,
    },
    factory: {
        look: 'grenade', count: GRENADE_EXPLOSION_COUNT,
        radius: GRENADE_DAMAGE_RADIUS, damage: GRENADE_DAMAGE,
        knockVy: GRENADE_KNOCKBACK_VY, knockVx: GRENADE_KNOCKBACK_VX,
        blockRadius: GRENADE_BLAST_RADIUS, blockDamage: GRENADE_BLOCK_DAMAGE,
    },
};
// 爆風の中の別の爆発物が爆発するまで 8〜15 フレーム。一斉に爆発させず、連鎖が見えるように
export const TOWN_CHAIN_DELAY_MIN = 8;
export const TOWN_CHAIN_DELAY_RANGE = 7;
// 60 フレームあたりの爆発物の爆発の上限。超えた分は消さずに後ろへずらす
// （消すと「撃ったのに爆発しない」に見える）
export const TOWN_EXPLOSIONS_PER_SECOND = 6;

// --- 3面の町並み 段4（音）---
// 設計: docs/superpowers/specs/2026-10-11-stage3-town-design.md（4章）。音量は A特性で実測して
// tests/town-sounds.test.js が爆発・バリアの唸りとの相対 dB で縛る（tools/render-town-sounds.mjs で測れる）
// 崩れる音の大きさ k = (崩れたかけら / REF)^EXP を MIN〜1 に収める。REF は塔1棟の崩壊。
// 平方根（0.5 乗）だと 20 かけらの破片が小さい爆発とほぼ同じ大きさになる（差 0.2dB の実測）。
// 0.75 乗で小さい爆発より約 5dB 小さい
export const TOWN_COLLAPSE_SOUND_REF = 160;
export const TOWN_COLLAPSE_SOUND_EXP = 0.75;
export const TOWN_COLLAPSE_SOUND_MIN = 0.1;
export const TOWN_COLLAPSE_SOUND_MERGE_MS = 80;   // これより近く続いた崩れる音は、大きいほうだけ鳴らす
// 実測（2026-10-11、tools/render-town-sounds.mjs。ローパスの Q を dB で読む再現）: 崩壊 160 かけら -47.1dB
// （大きい爆発 -43.4dB の -3.7dB）、破片 20 かけら -62.8dB（小さい爆発 -57.3dB より小さい）
// 低い地鳴り: ローパスしたノイズを FROM → TO へ掃引しながら TIME 秒で落とす（k で長さが半分まで縮む）
export const TOWN_COLLAPSE_RUMBLE_GAIN = 0.5;
export const TOWN_COLLAPSE_RUMBLE_TIME = 1.2;
export const TOWN_COLLAPSE_RUMBLE_FROM = 400;
export const TOWN_COLLAPSE_RUMBLE_TO = 60;
// 瓦礫のガラガラ: 短いバンドパスのノイズを RATTLES 発（k 倍）、SPREAD 秒の中にばらまく
export const TOWN_COLLAPSE_RATTLES = 10;
export const TOWN_COLLAPSE_RATTLE_SPREAD = 0.6;
export const TOWN_COLLAPSE_RATTLE_GAIN = 0.15;
export const TOWN_COLLAPSE_RATTLE_FREQ_MIN = 1200;
export const TOWN_COLLAPSE_RATTLE_FREQ_RANGE = 2400;
export const TOWN_COLLAPSE_RATTLE_Q = 3;
// 炎のループ: 低いゴーッ（ノイズのループを ROAR_FILTER でローパス）＋パチパチ（まばらなクリックを並べた
// CRACKLE_SECONDS 秒のバッファをループ、CRACKLE_FILTER でハイパス）。最大でもバリアの唸り（-48dB）以下
// ゲインは最初 0.2 / 0.25 だった。WebAudio のローパス・ハイパスの Q が dB で読まれることを再現に入れたら
// 最大 -48.6dB（唸りの -0.5dB）まで詰まったので、両方 1割下げた（最終レビュー指摘）。
// 実測: 最大 -49.5dB（唸り -48.1dB の -1.4dB）。ゴーッだけ -51.6dB、パチパチだけ -53.6dB
export const TOWN_FIRE_ROAR_GAIN = 0.18;
export const TOWN_FIRE_ROAR_FILTER = 300;
export const TOWN_FIRE_CRACKLE_GAIN = 0.225;
export const TOWN_FIRE_CRACKLE_FILTER = 1800;
export const TOWN_FIRE_CRACKLE_RATE = 14;        // 1秒あたりのクリックの数
export const TOWN_FIRE_CRACKLE_SECONDS = 3.7;    // 繰り返しが耳につかない長さ（2秒だと周期が分かる）
export const TOWN_FIRE_CRACKLE_SEED = 0x7F1E;
// 炎のループの強さ = √(Σ 火元ごとの位置の音量 / FULL) を 1 で頭打ち。√ にしたのは火元1つでも聞こえるように
// （1つで -10dB）。位置の音量は positionalVolume（画面の中 1、外は下がって1画面ぶんで 0）
export const TOWN_FIRE_SOUND_FULL = 10;
