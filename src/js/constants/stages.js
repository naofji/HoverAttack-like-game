// 面（面の数・面ごとのブロックの色・面ごとの環境の表・硬い岩の割合）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
// --- 何面から出るか ---
// `*_MISSION` の定数はどれも「missionsCompleted がこの値以上なら有効」（0 = 1面、6 = 7面）。
// 周回シールド（BASE_ORBIT_SHIELD_MISSION）・オーバードライブの後半（OVERDRIVE_LATE_MISSION）と同じ約束。
// 以前は各ファイルに `missionsCompleted < 3` のような数字で直に書いてあった（2026-11-05 にここへ集めた。
// 値はどれもそのまま）。敵アタッカーの型ごとの解禁は ENEMY_ATTACKER_TYPES の firstMission 列。

// 面の数。ステージ別ランキング・セーブ・クリア判定・表示がこれを読む
export const STAGE_COUNT = 7;

// --- Per-stage block palettes (stage 1..7、STAGE_COUNT 面ぶん) ---
// Shared by Map rendering and the stage-ranking attract screen so each stage shows in its own colour.
export const STAGE_PALETTES = [
    { fill: '#8B4513', border: '#5c2e0b' }, // 1: Brown
    { fill: '#A0522D', border: '#70381d' }, // 2: Sienna
    { fill: '#B8860B', border: '#825e07' }, // 3: DarkGoldenrod
    { fill: '#2E8B57', border: '#1e5c39' }, // 4: SeaGreen
    { fill: '#4682B4', border: '#2e5677' }, // 5: SteelBlue
    { fill: '#4B3621', border: '#2b1e12' }, // 6: Cafe Noir
    { fill: '#483D8B', border: '#2e2759' }, // 7: DarkSlateBlue
];

// --- 面ごとの環境（霧・雪・地底湖） ---
// 設計: docs/superpowers/specs/2026-09-04-stage-environments-design.md
// 面に固定する（面別ランキングがタイムアタックなので、同じ面は常に同じ条件）。
// kind = 動きと画面に重ねる描画、backdrop = 遠景の装飾（kind から導けない行がある:
// 7面は動きは今のままで遠景だけ機械）、terrain = 地形の生成規則
// （'fortress' は Map._generateFortress() が読む。設計:
//  docs/superpowers/specs/2026-09-06-stage7-fortress-design.md）。
// props = 地形の上に置く飾り（'town' は3面の壊せる町並み。設計:
//  docs/superpowers/specs/2026-10-11-stage3-town-design.md。'ferns' は4面の苔とシダ、'snow' は5面の雪をかぶった木と
//  天井のつらら。設計: docs/superpowers/specs/2026-10-11-stage5-snowtrees-design.md ・ 2026-10-11-stage5-icicles-design.md）、
//  'factory' は6面の工場と基地（3面と同じ置き方を world/town/themes.js の FACTORY_THEME の絵柄で。設計:
//  docs/superpowers/specs/2026-11-07-stage6-factory-design.md）。無ければ置かない。
// tileShape = タイルの形を決める規則（utils/tileShape.js の computeTileShape）。'snowSlope' は5面の
//  段を45度の坂に、角を面取りにする（絵と当たり判定が同じ形を共有する。設計:
//  docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md）。無ければ 'square'（今までどおり四角）。
//  'caveSlope' は2面の、雪の無い同じ幾何（設計 docs/superpowers/specs/2026-11-01-stage2-orb-design.md）。
// stairs = 盛る長い坂の種類（STAIRS_PROFILES のキー）。無ければ盛らない。
// orbs = 置く Orb（押せて転がる壊せない鉱物）の数。無ければ置かない（設計 2026-11-01-stage2-orb-design.md）。
export const ENV_KINDS = ['none', 'water', 'snow', 'fog'];
export const ENV_BACKDROPS = ['cave', 'wet', 'snow', 'fog', 'machine'];
export const STAGE_ENVIRONMENTS = [
    { kind: 'none',  backdrop: 'cave',    terrain: 'cave' }, // 1
    { kind: 'none',  backdrop: 'cave',    terrain: 'cave', tileShape: 'caveSlope', stairs: 'cave', orbs: 5 }, // 2: 坂と、転がる鉱物 Orb
    { kind: 'none',  backdrop: 'cave',    terrain: 'cave', props: 'town' }, // 3: 洞窟の町（壊せる町並み）
    { kind: 'water', backdrop: 'wet',     terrain: 'cave', props: 'ferns' }, // 4: 地底湖（苔とシダ）
    { kind: 'snow',  backdrop: 'snow',    terrain: 'cave', props: 'snow', tileShape: 'snowSlope', stairs: 'snow' }, // 5: 雪と氷（雪をかぶった木・天井のつらら）
    { kind: 'fog',   backdrop: 'fog',     terrain: 'cave', props: 'factory' }, // 6: 霧（砲兵の煙幕と見分けにくくする）・工場と基地
    { kind: 'none',  backdrop: 'machine', terrain: 'fortress', tileShape: 'metalSlope', props: 'base' }, // 7: 洞窟を改造した要塞（施設エリアの金属の斜面・基地の建物）
];

// --- 面ごとの硬い岩（BLOCK_HARD。灰色・HARD_BLOCK_HP 発で壊れる）の割合 ---
// _placeHardBlocks() が破壊可能タイル1つごとに引く確率。STAGE_ENVIRONMENTS と同じ7行で、
// missionLevel は剰余で丸める（debugStartMission で面数を超えた値が来るため）。
// 前半3面は元の一律 0.06 のまま据え置き（序盤の手応えを変えない）。4面から立ち上げ、
// **5面だけ特別に8割**（雪の岩山。掘って抜けるより地形を読んで飛ぶ面にする）、6→7で更に上げる。
//
// なぜ増やすのか（ユーザーの動機。数値を動かす前にここを読むこと）:
// 後半ほど敵のミサイルが増え、**足場そのものが撃ち崩されて遊べなくなる**。
// 敵のミサイルとホーミングはブロックへのダメージが 1 なので、通常岩（HP 1）は
// 被弾1発で消えるが、硬い岩（HARD_BLOCK_HP = 3）は3発耐える。つまりこの表は
// 「後半の面の足場が何発もつか」の表でもある。
// **5面が突出しているのは雪で滑るため。** 足場が減ると滑って立て直せず、
// 他の面より遊びづらさが跳ね上がるので思い切って上げてある（6・7面より高い）。
//
// 効かない相手: グレネードと巡航ミサイルは destroyArea() で3ダメージなので、
// 硬い岩も一撃で消える。そちらまで耐えさせたいなら HARD_BLOCK_HP を 4 に上げる
// （自機が掘るコストも上がる）。
// 注意: 割合を変えても rng の消費数は変わらない（確率に関係なく必ず1回引くため）ので、
// 週次の決定性（同じ週なら同じ敵配置）は壊れない。tests/hard-block-ratio.test.js が縛る。
// 行は数値か **[左端, 右端] の対**。対のときは列で線形に補間する（7面だけ）。
// 7面は「マップの右に進むに従って硬い岩が増える」（実機の指摘）。基地は右下に
// あるので、近づくほど地形が固くなる＝要塞の外郭に踏み込んだ感じが出る。
// 平均は 0.55 で、一律だった 0.40 からの底上げも兼ねている
export const HARD_BLOCK_CHANCE_BY_STAGE = [0.06, 0.06, 0.10, 0.18, 0.80, 0.28, [0.35, 0.75]];
// 硬い岩の耐久。1発では壊れず、途中経過はひび割れの本数で見せる（Map._drawTile）
export const HARD_BLOCK_HP = 3;
