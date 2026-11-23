// 面ごとの壊せる背景と仕掛け（4面の植物・5面の雪の木とつらら・2面の Orb）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
import { TILE_SIZE } from './core.js';

// --- 4面の植物（苔とシダ）---
// 3面の町の仕組み（world/town/）に、燃えない・誘爆しない壊せる植物を載せる。絵は world/town/plants.js、
// 置き場所は world/town/generatePlants.js。STAGE_ENVIRONMENTS の props: 'ferns' の面だけに置く。
// 弾の止まり方・欠け方・落ち方は町と同じ（TOWN_PROJECTILE_IMPACT の表、TOWN_CHIP_JAGGED など）。
// 植物は全部「厚い壁」にした: 弾がすり抜けるのに欠けるのでは、壊れることに筋が通らない（ユーザーの指摘）。
// 床の植物の混ぜ方。tall 以外の残りが苔。自機・アタッカーの高さは 24px（PLAYER_HEIGHT）で、
// 苔は 4〜8px、低いシダは 24px 未満、高いシダは 24px を超える（絵は地面に 4px 埋まるので、見える高さは 1段ぶん引く）
export const PLANT_FLOOR_MIX = { tall: 0.15, low: 0.3 };
// 高いシダの幹の高さ（px、2px 刻み）。冠の葉が上に 20px ほど乗る。置ける高さが足りなければ幹を切り詰める
export const PLANT_TALL_TRUNK = [32, 72];
// 村（villages.js）の濃さに掛ける。1 より大きくすると詰まる
export const PLANT_FILL_SCALE = 1;
// 壁の植物は、壁の長さこれごとに1つの候補を置く。候補ごとに置く確率
export const PLANT_WALL_SPACING = 6;
export const PLANT_WALL_CHANCE = 0.6;
// 壁・天井に置ける最小の広さ（タイル）。町（TOWN_WALL_MIN_* / TOWN_CEIL_*）は大きな家を掛けるので
// 壁 4 タイル・天井の空き 8 タイルを要るが、植物は小さいので緩める。町と同じ値では 4面の天井に
// 2 本、壁に 2 つしか置けなかった（実測）。KEEP_BELOW は垂らした先と床のあいだに残す空き
export const PLANT_WALL_MIN_RUN = 3;
export const PLANT_WALL_MIN_REACH = 2;
export const PLANT_CEIL_MIN_RUN = 3;
export const PLANT_CEIL_MIN_DROP = 3;
export const PLANT_CEIL_KEEP_BELOW = 1;
// 天井の垂れ下がりの候補は、連続した天井の 1 タイルごとに、この確率 × 村の濃さ（密集の中心で 1）
export const PLANT_CEIL_CHANCE = 0.35;
// 当たったとき・落ちた破片が砕けたときに出す葉の粒の数（画面の中だけ）
export const PLANT_LEAF_PARTICLES_HIT = 4;
export const PLANT_LEAF_PARTICLES_FALL = 8;

// --- 5面の雪の木 ---
// 4面の植物（上）と同じ Town の仕組み（燃えない・誘爆しない・壊せる・弾が止まる）に、雪をかぶった木を載せる。
// 絵は world/town/snowTrees.js、置き場所は world/town/generateSnowTrees.js。STAGE_ENVIRONMENTS の props: 'snow' の面だけ（つららと同じ面）。
// 高さは「見える高さ」（根元の 4px は地面に埋まる）。ユーザー指定（2026-10-11）: 機体（PLAYER_HEIGHT 24px）の
// 8割（19.2px → 4px 刻みで 20）から 3倍（72px）まで。4面のシダ（見える高さ 24〜約 90px、半分以上は 24px 未満の
// 苔と低いシダ）より背の高い木が中心になる。枯れ木は枝が横に張って背が伸びないので、上限を低く取る
export const SNOWTREE_HEIGHT = { fir: [20, 72], bare: [20, 56] };
// 床に立てるときに枯れ木になる割合。残りは針葉樹（雪の面らしい絵が針葉樹なので多めに）
export const SNOWTREE_BARE_SHARE = 0.25;
// 村（villages.js）の濃さに掛ける。1 より大きくすると詰まる。隣と重なる所には置かない（placer.js）ので、
// 詰めても重ならず、置ける足場が埋まるだけ。最初は 1・間隔 4〜24px で、今週の5面で 232 本（床 100 タイルあたり 8.6 本）
// しかなく、ユーザーに「もっとたくさん木があった方がいい」と言われた（村の外は 10% しか置かないため）。
// 実測（今週の5面、床 2,702 タイル）: 濃さ 2 → 369 本、3 → 456 本、3＋間隔 0〜8 → 534 本（19.8 本）、5＋間隔 0〜8 → 648 本。
// 5 は足場がほぼ埋まるので、森に見える 3 と間隔 0〜8 にした。
// その後、木を前景に描く試し（feat/town-foreground）で、ユーザー指定で 2 に減らした（2026-11-06）。
// 今週の5面（seed 1216405141）で木 579 → 503 本（つららは 161 本のまま）
export const SNOWTREE_FILL_SCALE = 2;
// 隣の木との間隔（px、4px 刻みで引く）。木の幅に足す
export const SNOWTREE_GAP = [0, 8];
// 木 1 本の幅の上限（px）。20000 通りの乱数で測った最大は針葉樹 56・枯れ木 52（tests/snowtrees-build.test.js が超えないことを縛る）。
// 床に置くとき、この幅ぶんの列の天井までの空きを測る（枝の先が天井に刺さらないように）
export const SNOWTREE_MAX_WIDTH = 56;
// 雪の木の倒壊。幹が切れて切り離された塊は、根元（切れ目の中心）を軸に傾きながら倒れる（ユーザー指定:
// 「傾きながら下に落ちていく様な感じで倒壊する」。それまでは根元で切れた塊が落ち始めた最初のコマで床に触れ、
// その場で雪の粒になって消えていた）。傾きの角加速度は ACCEL × (sinθ + SEED): 真っ直ぐ立った状態から始まるので
// SEED が最初の傾きの種。実測（tools の数値実験）: ACCEL 0.005・SEED 0.2 で 90° まで 41 tick（0.68秒。15° まで 21 tick
// とゆっくり傾き始め、45° で 32 tick、70° で 38 tick と加速する）。0.01・0.3 だと 25 tick で、ぱたんと倒れて重みが出なかった
export const SNOWTREE_TOPPLE_ACCEL = 0.005;
export const SNOWTREE_TOPPLE_SEED = 0.2;
// 倒れきった（床に横たわった）あと、薄れて消えるまでの tick。この間に雪の粒を PUFFS 回、木の長さに沿って出す
export const SNOWTREE_TOPPLE_LIE_TICKS = 30;
export const SNOWTREE_TOPPLE_PUFFS = 3;
export const SNOWTREE_TOPPLE_PUFF_PARTICLES = 10;
// これより小さい塊（かけらの数）は倒れず、ふつうの破片として落ちて砕ける（枝先の欠片が90°倒れるのは不自然）
export const SNOWTREE_TOPPLE_MIN_CELLS = 8;
// 倒れる向きは、撃たれた位置と塊の真ん中の x の差が DEADZONE（px）以上あれば撃たれた側と反対、未満なら（幹をまっすぐ撃った）
// 位置から決めた向き
export const SNOWTREE_TOPPLE_LEAN_DEADZONE = 1;
// 雪の木が欠ける・倒れるときに舞う雪（SnowFlurryParticle。ユーザー指定: 「木が倒れたり削れたりするときに雪が舞う様に」）。
// それまでは葉と同じ短命（20〜40 tick）の小さな粒がぱっと散るだけだった。舞う雪は、出た勢いで飛んだあと
// 空気抵抗で止まり、ゆっくり左右に揺れながら落ちて、地面に触れたら消える（ホバーの粉雪 SnowMistParticle と同じ消え方）。
// 最初は全部「上半分の向きへ 0.5〜2.2px/tick で飛ばす」で、実機で「やや舞い上がりすぎ。弾が当たって欠けるときはもう少し控えめに。
// 木が倒れるときは雪が振り落とされて、倒れた後に雪が舞うのが理想」と言われた。出来事ごとに動きを分ける（MODES）:
//   hit   弾・爆風が欠かした。少なく（HIT 5 粒）、勢いも弱い（飛ぶ高さは puff の約 1/3）
//   shake 木が倒れ始めた（START 14 粒。木が雪を振るい落とす）・倒れているあいだ TRICKLE_EVERY tick ごとに木に沿って（TRICKLE 3 粒）。
//         下へ向けて、ほとんど勢い無しに落ちる（地面に触れたら消える）
//   puff  横たわったとき（PUFF_PARTICLES を PUFFS 回）と、そのあと消えるまで LIE_EVERY tick ごとに（LIE_PARTICLES）。倒れた木から
//         舞い上がる主役。勢いは最初の版と同じ桁で、上半分の向き
// 1 本が倒れきるまでに合わせて約 110 粒、寿命は 50〜90 tick。角度は画面座標の rad（真上 = -π/2、真下 = +π/2）
// 5面で弾が雪の積もった上面に当たったときに舞う雪（ユーザー提案 2026-11-22「マシンガンの弾が地面に当たった際にも
// 積もった雪が舞い上がる方が自然」）。雪面かどうかは Map.snowSurfaceY（描画の積雪の帯と同じ定義）。粒と動きは
// 雪の木が欠けたとき（MODES.hit）と同じ。自機・敵どちらの弾でも出す（ユーザー承認）。MG は連射で、1 発ごとに
// 木の欠け（HIT 5 粒）と同じだけ出すと雪だらけになるので少なめの 3 粒から。SPREAD は出る位置の散らばり（px）。
// どちらも出発点で、実機で見て調整する
export const SNOW_BULLET_PUFF_COUNT = 3;
export const SNOW_BULLET_PUFF_SPREAD = 2;
// 爆発（spawnExplosion を通るもの全部）が雪面を叩いたときに舞う雪。爆心の真下 REACH（px）までの雪面を、爆心の x から
// COLUMN_STEP（px）おきに左右 COLUMNS 本ずつ（計 5 列）探し、見つかった列で総数を分ける（雪面が爆心の真下だけでなく横に広がって
// 見えるように）。総数 = min(MAX, round(size × PER_SIZE))。size は爆発の粒の数（BLAST_PROFILES の blast.count など）で、
// MIN_SIZE 未満は出さない: MG が敵に当たった mgHit（4）・巡航ミサイルの火花 cruiseSpark（5）は連射・多発するので除き、
// 敵ミサイルの着弾 enemyMissileHit（8）からは出す。地形への着弾（36）で 22 粒、グレネード級は上限 40。
// 動きは倒れた木から舞い上がる MODES.puff（弾の hit より強く上へ）。散らばりは SPREAD（px）。どれも出発点で、実機で見て調整する
export const SNOW_BLAST_MIN_SIZE = 8;
export const SNOW_BLAST_PER_SIZE = 0.6;
export const SNOW_BLAST_MAX = 40;
export const SNOW_BLAST_COLUMNS = 2;
export const SNOW_BLAST_COLUMN_STEP = 8;
export const SNOW_BLAST_REACH = TILE_SIZE * 2;
export const SNOW_BLAST_PUFF_SPREAD = 4;
export const SNOWTREE_FLURRY_HIT = 5;
export const SNOWTREE_FLURRY_START = 14;
export const SNOWTREE_FLURRY_TRICKLE_EVERY = 3;
export const SNOWTREE_FLURRY_TRICKLE = 3;
export const SNOWTREE_FLURRY_LIE_EVERY = 6;
export const SNOWTREE_FLURRY_LIE_PARTICLES = 4;
export const SNOWTREE_FLURRY_LIFE = [50, 90];
// size は [ふつうの粒, 大きい粒（BIG_SHARE の割合）]（px）。倒れる木の雪（shake / puff）は、ユーザー指定「木が倒れた際の雪の粒子を
// 小さめに」で 2px / 3px から 1px / 2px にした。欠けたとき（hit）は 2px / 3px のまま
export const SNOWTREE_FLURRY_MODES = {
    hit: { speed: [0.2, 0.7], angle: [-Math.PI * 0.8, -Math.PI * 0.2], size: [2, 3] },     // 上向きの扇。勢いは puff の約 1/3（空気抵抗で飛ぶのは最大でも約 14px）
    shake: { speed: [0.05, 0.4], angle: [Math.PI * 0.1, Math.PI * 0.9], size: [1, 2] },    // 下向き。ほぼ勢い無し
    puff: { speed: [0.6, 2.0], angle: [-Math.PI, 0], size: [1, 2] },                       // 上半分すべて
};
export const SNOWTREE_FLURRY_DRAG = 0.95;            // 毎 tick 速度に掛ける。落ちる速さは GRAVITY / (1 - DRAG) = 0.4px/tick に収まる
export const SNOWTREE_FLURRY_GRAVITY = 0.02;         // ホバーの粉雪（0.02）と同じ軽さ
export const SNOWTREE_FLURRY_SWAY = 0.3;             // 左右に揺れる幅（px/tick）
export const SNOWTREE_FLURRY_SWAY_FREQ = 0.14;       // 揺れの速さ（rad/tick。周期約 45 tick）
export const SNOWTREE_FLURRY_NEEDLE_EVERY = 6;       // 6 粒に 1 粒は、雪ではなく針葉の欠片（暗い緑）
// 出る位置の散らばり（px。出来事の点から上へ、横へはこの幅で）。上だけにしたのは、点が床の線にある（横たわった木・床で砕けた欠片）と
// 下に散った粒が岩の中で生まれ、最初の更新で消えたため（実測: 20 本を切って 819 粒のうち 139 粒＝17% が即死）
export const SNOWTREE_FLURRY_SPREAD = { hit: 4, trickle: 5, puff: 6 };
// 倒れ始めの雪を出す高さ（倒れる塊の上端から、塊の高さの何割下か）
export const SNOWTREE_FLURRY_START_HEIGHT = 0.4;
// 倒れているあいだにこぼれる位置を、木の長さの何割の所にするか。毎回この割合ずつ進めて 1 で折り返す（黄金比 0.382:
// 木の上を満遍なく行き来して、同じ位置に何度も出ない。乱数を使わずに位置を散らす）
export const SNOWTREE_FLURRY_TRICKLE_STEP = 0.382;
// 大きい粒（MODES の size の大きい方）の割合。残りは小さい方
export const SNOWTREE_FLURRY_BIG_SHARE = 0.25;

// --- 5面のつらら ---
// 設計: docs/superpowers/specs/2026-10-11-stage5-icicles-design.md
// 3面の町の仕組み（world/town/）に、天井に吊るした「もろい」建物として載せる。絵は world/town/icicles.js、
// 置き場所は generateIcicles.js、落ちる塊は IcicleFall.js。STAGE_ENVIRONMENTS の props: 'snow' の面だけ。
// 数値は spec の初案で、実機で見て調整する前提の出発点（ユーザー決定: 震えて落ちる約 0.4 秒・ダメージは大きさに比例 15〜35・
// 開始の部屋と基地の部屋を避けて面全体の天井）。
// 見える長さ・根元の幅（px。長さは 4px 刻み）
// 最初は長さ [24, 64]・幅 [8, 12] で、実機で「つららの最大サイズをもう少し小さく」と言われて [24, 48]・[8, 10] にした
export const ICICLE_LENGTH = [24, 48];
export const ICICLE_WIDTH = [8, 10];
// ダメージ [最短, 最長]。長さに比例（短い → 長い）。自機・母艦・敵に同じ数値。参考: 自機 HP 100、敵アタッカー 15〜45、地雷 25
export const ICICLE_DAMAGE = [15, 35];
// 当たってから落ちるまで（tick。0.4 秒）。震えている間の追加の当たりは時間を延ばさない。揺れる幅（px。描画だけ）
export const ICICLE_SHAKE_TICKS = 24;
export const ICICLE_SHAKE_AMPLITUDE = 1;
// 当たった機体の vy を、少なくともこの値（下向き）にする。vx は変えない（applyKnockback は vx を上書きするので使わない）
export const ICICLE_KNOCK_VY = 2;
// 村（villages.js）の濃さに掛ける。1 より大きくすると詰まる
export const ICICLE_FILL_SCALE = 1;
// 天井の空きから、床まで残す余白（タイル）。吊るす長さは (空き - この値) × タイルまで
export const ICICLE_KEEP_BELOW = 3;
// 隣のつららとの間隔（px、4px 刻みで引く）。つららの幅に足す
export const ICICLE_GAP = [4, 20];
// 震えているあいだ、先から水滴の粒を 1 つ落とす間隔（tick。予兆）
export const ICICLE_DRIP_EVERY = 6;
// 氷の粒の数。hit: 当たって震え始めるとき、land: 落ちて砕けるとき
export const ICICLE_SHARDS = { hit: 4, land: 14 };
// 落ちている間、つららの体から粉雪を舞わせる間隔（tick）と 1 回の粒数（実機で「落ちるときに粉雪が舞う方がいい」と言われて足した。
// 小さい粒がほとんど動かずに残り、落ちたつららの跡が粉雪の筋になる）
export const ICICLE_TRAIL_EVERY = 2;
export const ICICLE_TRAIL_COUNT = 2;
// 先が床に触れたら、消えずに先からめり込んでいく（実機で「いきなり消えるのではなくて、先からめり込んでいって大きめの粉雪に変わる方がいい」
// と言われた）。めり込む速さ（px/tick。重力は使わない）。全体が地面の線の下に入るまで（長さ 48px で約 0.35 秒）。
// 最初は 1.5（約 0.6 秒）で、実機で「めり込む速度をもう少し速く」と言われて 2.5 にした
export const ICICLE_SINK_SPEED = 2.5;
// 地面の線から出る大きめの粉雪の数。land: 触れた瞬間、sink: めり込んでいる間の毎 tick、end: 潜りきって消えるとき。
// 大きさ [最小, 最大]（px。落ちている間の粉雪や木の雪より大きめ。大きい方は ICICLE_POWDER_BIG_SHARE の割合）
export const ICICLE_POWDER = { land: 8, sink: 2, end: 6 };
export const ICICLE_POWDER_SIZE = [2, 4];
export const ICICLE_POWDER_BIG_SHARE = 0.4;

// --- 5面のつららの音（段 2）---
// 設計: docs/superpowers/specs/2026-10-11-stage5-icicles-design.md（音の節）。部品の並びは audio/sounds/icicleSounds.js の純関数、
// オフライン再現と A特性の実測は tools/render-icicle-sounds.mjs（tests/icicle-sounds.test.js が音量を爆発との相対 dB で縛る）。
// 震え（きしみ）・落下（風を切る）・床に刺さる（ザクッ＋サーッ）の 3 つ。数値は最初の出発点で、実機で聴いて調整する前提
// 同じ種類の音が MERGE_MS 以内に重なったら 1 つだけ鳴らす（グレネードで十数本が同時に震えても 1 回）
export const ICICLE_SOUND_MERGE_MS = 80;
// 震え: 高い帯域の小さなクリックを spread 秒（震えの 0.4 秒より少し短く）のあいだに clicks 回ばらまく。
// freq はバンドパスの中心（下限〜上限）、dur は 1 回の長さ（最短〜最長）
export const ICICLE_SOUND_SHAKE = { clicks: 4, spread: 0.34, gain: 0.018, freq: [2800, 4800], Q: 4, dur: [0.012, 0.024] };
// 落下: 帯域を絞ったノイズの下降（風を切る）
export const ICICLE_SOUND_FALL = { gain: 0.014, dur: 0.26, from: 3600, to: 1400, Q: 4 };
// 床に刺さる: crunch（ザクッ。ローパスのノイズの一撃）と swish（サーッ。めり込む時間に合わせた粉雪のノイズ）
export const ICICLE_SOUND_SINK = {
    crunch: { gain: 0.021, dur: 0.09, from: 3500, to: 700 },
    swish: { gain: 0.0085, dur: 0.35, from: 2400, to: 1100, Q: 1.5 },
};

// --- 2面の Orb（押せて転がる壊せない鉱物）---
// 設計: docs/superpowers/specs/2026-11-01-stage2-orb-design.md。数値はどれもたたき台（実機で調整）。
// 大きさごとの値。mass は面積比（(24/16)² = 2.25）で、押される速さ・爆風・衝突の跳ね返りに効く。
//   pushScale:   自機が平地で押すときの速さ（自機の歩きの最高速に対する倍率）。0.5 は母艦を押すときと同じ手応え
//   uphillScale: 坂を押し上げるときの速さ（平地で押す速さに対する倍率）。重力がかかるので上りはきつい（ユーザー指定）。
//                24px は「やっと進む」（設計 4.4）
export const ORB_SIZES = {
    small: { diameter: 16, mass: 1, pushScale: 0.5, uphillScale: 0.4 },
    large: { diameter: 24, mass: 2.25, pushScale: 0.3, uphillScale: 0.15 },
};
// 敵（戦車・アタッカー）が押しても Orb が動かないとき、壁に当たったときと同じ反応（戦車は折り返す、アタッカーは跳ぶ・跳べなければ折り返す）
// をさせる（2026-11-03 ユーザー指定。以前は押したままその場で歩き続けた）。押し始めから ORB_PUSH_STALL_FRAMES たっても、
// Orb が押す速さから見込む距離の ORB_PUSH_STALL_RATIO 倍も進んでいなければ「動かない」とみなす（orbInteractions の watchPushStall）。
// 坂の押し上げ（平地の uphillScale 倍。24px は 0.15）もこの比を下回るので、敵は大きい Orb を坂へ押し上げずに引き返す
export const ORB_PUSH_STALL_FRAMES = 20;
export const ORB_PUSH_STALL_RATIO = 0.25;
// 転がりの抵抗（接地中、接線の速さを毎フレームこれだけ 0 へ寄せる）。真円ではないので転がるには高低差が要る、の表現
// （ユーザー指定）。45度の坂の下り成分 GRAVITY·sin45 ≈ 0.21 より小さいので坂では転がり出し、平らな所では負けて止まる。
// 坂を6段下ると約 5.9px/フレーム、そこから平地で約 14 タイル転がって止まる見積もり
export const ORB_ROLL_RESISTANCE = 0.08;
export const ORB_STOP_SPEED = 0.05;          // これ未満の速さは 0 にする（坂の途中・平地で震え続けない）
// 1フレームの最高速。刻んで動かすのですり抜けはしないが、速すぎると避けようがない
export const ORB_MAX_SPEED = 6;
// 地形との反発係数。機体との反発（0.6）より小さくして、地面ではねすぎないようにする
export const ORB_TERRAIN_RESTITUTION = 0.3;
// これ未満の法線の速さで地形に当たったら弾まずに止める（転がっている最中の細かい跳ねを消す）
export const ORB_BOUNCE_MIN_SPEED = 1.0;
// 置き場所（Map._findOrbPositions）。「マップの上の方を初期位置に」（ユーザー指定）。上から 40% 以内の床を探し、
// 足りなければ 10% ずつ下へ広げる（40% は私の判断・実機で調整）。横に散らすため列を 20 以上離す
export const ORB_SPAWN_TOP_FRACTION = 0.4;
export const ORB_SPAWN_MIN_COL_GAP = 20;
export const ORB_SPAWN_SALT = 0x0B1A0B;      // 派生ストリームの種（game.rng を消費しない）
// 大きさの配り方。並べ替えて先頭から STAGE_ENVIRONMENTS の orbs 個を使う。
// 2026-11-01 ユーザー指定で 24px だけにした（最初は 16px 3・24px 2）。16px の値（ORB_SIZES.small）は表に残してあるので、
// 戻すときはここに 'small' を足すだけで済む
export const ORB_SIZE_MIX = ['large', 'large', 'large', 'large', 'large'];
// 石の奥の淡い紫の光が脈打つ周期（フレーム）。3秒ほど。ゆっくりでないと警告灯に見える（格納塔の縞と同じ考え）
export const ORB_GLOW_PERIOD = 180;
// 機体・Orb どうしとの反発係数。完全弾性ではなく 0.5〜0.7（ユーザー指定）の中央
export const ORB_IMPACT_RESTITUTION = 0.6;
// 機体への衝突ダメージ（設計 4.5）。Orb 自身が相手へ向かう速さがこれを超えたときだけ当たる。これ以下は押す・乗るだけ
// （ゆっくり押しているだけでダメージが入ると押す遊びが成り立たない）。自機の歩きの最高速 1.75 より少し下
export const ORB_IMPACT_MIN_SPEED = 1.5;
// ダメージ = round(係数 × mass × 速さ)。small が 4px/フレームで 16（自機ミサイル 15 と同程度）、large は 36
export const ORB_IMPACT_DAMAGE_PER_SPEED = 4;
export const ORB_IMPACT_DAMAGE_MAX = 40;     // large が最高速 6 で当たると 54 になるので頭打ち（自機の HP 100 の 4 割）
export const ORB_HIT_COOLDOWN = 30;          // 同じ Orb と同じ相手のあいだ、次のダメージまでのフレーム（連続ヒット防止）
// 当たった機体を飛ばす速さ（applyKnockback）。グレネード（vx 2・vy −3.5）より控えめ
export const ORB_KNOCK_VX = 2;
export const ORB_KNOCK_VY = -2;
// 弾が Orb に当たったときの扱い（設計 決定7・8）。キーは弾の townKind（町と同じ分類）。
//   angle:  入射角が ORB_BREAK_INCIDENCE_DEG 未満なら壊れる（onTownWall: マシンガンは火花で消え、ミサイルは爆発）、
//           以上なら鏡のように跳ね返る（ユーザー指定）
//   bounce: 角度に関係なく跳ね返る。グレネード（ユーザー指定）
//   absorb: 角度に関係なく Orb に吸収されて消える。レーザー＝反射ビーム（beam）と基地のレーザー（laser）
//           （2026-11-01 ユーザー指定「レーザーは打ち消す」。最初は反射ビームを跳ね返し、基地のレーザーは素通りさせていた）
// 基地のレーザーは townKind を持たない（町の建物は素通りする）ので、isBaseLaser を 'laser' として引く（orbInteractions）
export const ORB_PROJECTILE_IMPACT = {
    bullet: { rule: 'angle' },
    missile: { rule: 'angle' },
    grenade: { rule: 'bounce' },
    beam: { rule: 'absorb' },
    laser: { rule: 'absorb' },
};
// 跳ね返りで向きが 90度より大きく変わる＝入射角（面の法線と、入ってきた向きの逆とのなす角）が 45度未満
export const ORB_BREAK_INCIDENCE_DEG = 45;
// 爆風で Orb が動く（設計 決定6「若干移動させることもできる」）。爆心で mass 1 の Orb に足す速さ（px/フレーム）。
// 距離で線形に 0 へ弱め、重さで割る（large は 1/2.25）。「若干」なので small の最大でも歩きの速さほど
export const ORB_BLAST_RADIUS = 48;
export const ORB_BLAST_IMPULSE = 2;
// Orb の「ゴン」を鳴らす間隔の下限（実時間 ms）。転がる最中に床・機体へ細かく当たると立て続けに鳴って濁る。
// 物理ではなく耳の都合なので、ゲーム速度で伸び縮みしない実時間で見る（ricochet.js の跳弾と同じ考え）
export const ORB_SOUND_INTERVAL_MS = 120;
