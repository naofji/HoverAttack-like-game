// 面の環境（雪の滑りと坂・霧・降雪・ホバーで舞う雪と水滴・積雪の帯・雪の階段）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
import { TILE_SIZE } from './core.js';

// 雪の地上で入力を離したときの速度の残存率（陸上は 0 = 即停止）。
export const ICE_SLIDE = 0.94;  // 実機: もう少し滑る（0.9 → 0.94。止まるまでの距離が約1.7倍）
export const ICE_MAX_SLIDE_SPEED = 3.0;    // 斜面で加速し続けても超えない
export const SLOPE_DOWNHILL_ACCEL = 0.06;  // 斜面に立っているあいだ毎フレーム下り方向へ
export const SLOPE_UPHILL_SCALE = 0.6;     // 上り方向の入力の最高速の倍率
// タイル形状つき当たり判定（docs/superpowers/specs/2026-10-27-tile-shape-collision-design.md）の坂。
// 坂を上る・下るとき、1フレームに体を上下へ動かしてよい量は「横の移動量 + この余裕」。45度の坂は
// 横に動いた分だけ高さが変わるので、余裕 1px で坂には吸い付き、8px の面取りの先の垂直な落差には届かない
export const SLOPE_CLIMB_MARGIN = 1;
// 縦に動いていて斜辺に当たったとき、縦の速さのうち斜辺に沿った横の速さへ移す割合。
// 45度の斜辺へ速度を射影すると縦の速さの半分が横に残るので 0.5（初期値。実機で調整する）
export const SLOPE_DEFLECT = 0.5;
// 霧で索敵の横半径に掛ける倍率（縦は SIGHT_ASPECT 経由で同じ比率で縮む）。敵5種・敵基地・自機の Auto Aim に効く。
// 0.5 → 0.9（ユーザー指定 2026-11-05）。0.5 では6面の敵基地の武器（レーザー砲台・ミサイル・追尾ミサイル。
// どれも BASE_LASER_RANGE で探す）の届く範囲が横 751→375px に半減し、ボス戦だけが目に見えて楽だった。
// 霧の絵は「そこまで見にくいわけではない」ので、縮みも控えめにした（0.9 で横 675px）
export const FOG_SIGHT_SCALE = 0.9;

// 降雪。板（オフスクリーン）を層ごとにスクロールする。粒を個別に描かないのは
// 縮尺（タイル16px）に見合う 1〜2px の粒を数千出したいから。
export const SNOW_SHEET_SIZE = 512;
// 実機: 3px の粒は大きすぎて雪に見えなかったので廃止。代わりに 2px を2枚重ね、
// 落下速度と横揺れだけを「若干」変えて奥行きを出す（1.5倍を超えると大きさが同じぶん
// 速さの差だけが目について2枚に見える）。板は層ごとに別のシードで撒かれ、横揺れの
// 位相も層番号でずれるので、同じ大きさでも模様が重ならない（snow.js の buildSheet と sway）。
//
// 2枚目は**手前ではなく「遠い」と「中」の間**に置く（実機の指摘）。手前に置くと
// 一番速い層が2枚あることになって騒がしく、欲しいのは奥行きの中途半端な段だった。
// speed 1.15 の層はこれで無くなり、全体がゆっくり降るようになる。
export const SNOW_LAYERS = [
    { count: 320, size: 1, speed: 0.5,  sway: 0.25, alpha: 0.55 }, // 遠い
    { count: 90,  size: 2, speed: 0.7,  sway: 0.38, alpha: 0.62 }, // 中途半端（遠いと中の間）
    { count: 180, size: 2, speed: 0.9,  sway: 0.5,  alpha: 0.7 },  // 中
];
// 実機: 岩の奥（遠景と地形の間）に降るので弾とは層が違う。暗すぎたので明るくした（輝度 143 → 190。白 255 には寄せない）
export const SNOW_COLOR = '#B6BFCB';
// 足元で舞う雪。手前で短時間しか出ないので、降る雪より明るくする（輝度 220）。実機の指摘
export const SNOW_KICK_COLOR = '#D5DDE8';
// 舞う雪。既存の TrailParticle と同じ fillRect 1回の粒。
export const SNOW_KICK_WALK = 1;     // 雪の地上を動いているあいだ、毎フレーム
export const SNOW_KICK_LAND = 10;    // 着地
export const SNOW_KICK_SLIDE = 3;    // 斜面を滑っているあいだ、毎フレーム
// 敵が雪を蹴り始める速さ。自機は |vx| > 0.1 で蹴るが、敵は巡回で微速のまま
// 長く動くので、同じ値だと画面内の敵全員が常時撒き続けることになる
export const ENEMY_SNOW_KICK_MIN_SPEED = 0.4;
// 機体ごとの滑りやすさ（床の滑りに掛ける）。戦車は履帯なので雪でも滑らない。
// 滑らせたら実機で「坂を上れない」となった ── _applySnowSlope の下り加速
// (-0.06/frame) が、以前は毎フレーム巡回速度で上書きされて消えていたのに、
// 速度追従を入れたことで前フレームへ持ち越され、約 -0.94px/frame の定常
// ドリフトになって上り速度(0.5)を食い潰していた。
// **雪煙は別物**（床の性質なので floorSlide が決める）。滑らないが煙は上がる
export const ENEMY_TANK_SLIDE_SCALE = 0;
export const SNOW_KICK_LIFETIME = 30;
// ホバーで雪面の少し上を漂っているときに地表で舞う粉雪（SNOW_KICK とは別の粒。
// 接地していないので「蹴る」のではなく「舞い上がる」見た目にする）。
// 0.5〜3ブロック上空 = TILE_SIZE*0.5(8) 〜 TILE_SIZE*3(48)px。それより低ければ普通の
// SNOW_KICK（着地・滑走）の対象になり、高ければただ飛んでいるだけに見える
// （実機の指摘: 1〜2ブロック(16〜32px)は範囲が狭すぎたので緩めた）
// 下限は 0（足元から雪面まで 0〜48px なら出す。2026-10-11 ユーザー指定「雪が舞う条件のアタッカーと地面の距離の下限を0に」）。
// 以前は半タイル（8px）で、バーストで飛び立つとき（最初の 1 フレームで足元から 6px 上がる）の噴射が雪面を叩く瞬間が
// 条件の外だった。接地中（onTerrain）は SNOW_KICK の担当のまま変わらない（下限を 0 にしても、歩いているあいだは出ない）。
// キャリアは元から下限なし（Carrier._kickHoverSnowMistSide）
export const HOVER_SNOW_MIST_MIN_ALT = 0;
export const HOVER_SNOW_MIST_MAX_ALT = TILE_SIZE * 3;
// 発生間隔(F)。歩行の SNOW_KICK_WALK と違い滞空は何秒も続きうるので、毎フレーム
// 撒くと粒が多すぎる。4F(≈0.07秒 @60fps) おきにまとめて
// （実機の指摘: 自機ほどの図体を持ち上げるスラスターなので、もっと派手に巻き上げていい。
// 初期値の8F/2粒は控えめすぎた）
export const HOVER_SNOW_MIST_INTERVAL = 4;
// 地面との当たり判定を付けたぶん、下向きに飛んだ粒の半分近くが着地直後に
// 吸収されて消える（実機の指摘: 見た目の量が半減した）。その分を見込んで増量
export const HOVER_SNOW_MIST_COUNT = 12;
// バースト（自機のバーストジャンプ・敵アタッカーのジャンプ）で飛び立つ瞬間に、足元の雪面へ出す粉雪の数。
// ホバー中は INTERVAL(4F) おきの間引きで、バーストの 1 フレーム目に当たるかは位相次第だった（実測: 4 通りの位相で最初の粉雪が
// 0〜3 フレーム目にばらけた）。水面の水滴は「バーストの直後は出す」（HOVER_WATER_MIST_BURST_FRAMES）が、雪面にも同じことを
// 求められ、飛び立つ瞬間に必ず 1 回出す形にした。ホバーの粉雪（12）の 1.5 倍を出発点にした。実機で見て調整する
export const HOVER_SNOW_MIST_BURST_COUNT = 18;
export const HOVER_SNOW_MIST_LIFETIME = 75;
// SNOW_KICK より少し暗めにして重ならず見分けやすく（実測ではなく既存の雪色からの派生）
export const HOVER_SNOW_MIST_COLOR = '#C7D2DF';

// ホバーで水面の少し上を漂っているときに水面で舞う水滴（HOVER_SNOW_MIST の水面版）。
// 「床の性質(slide)」で判定していた雪と違い、水は env.kind === 'water' と
// waterClearance（水面までの距離）で判定する。範囲・間隔・個数は雪と同じ値を出発点にし、
// 実機で見て調整する（このファイルの他の値と同じ流儀）
// 下限は 0（足元から水面まで 0〜48px なら出す。2026-10-11 ユーザー指定）。以前は雪の値を写した
// 半タイルで、雪では「歩いている（SNOW_KICK）／浮いている」の住み分けに要ったが、水の上は歩けない
export const HOVER_WATER_MIST_MIN_ALT = 0;
export const HOVER_WATER_MIST_MAX_ALT = TILE_SIZE * 3;
export const HOVER_WATER_MIST_INTERVAL = 2; // より連続して湧き出るように間隔を短縮
// バーストジャンプ（敵アタッカーは _jump）の直後、ホバーしていなくても水滴を出すフレーム数。
// バーストの噴射も水面を叩くはず、という実機の指摘（2026-10-11）。出発点はバースト後に
// ホバーが効かない時間（HOVER_COOLDOWN_AFTER_BURST = 20）と同じ。実機で見て調整する
export const HOVER_WATER_MIST_BURST_FRAMES = 20;
export const HOVER_WATER_MIST_MIN_COUNT = 6;  // 水面から離れているとき（最遠付近）の最小粒数
export const HOVER_WATER_MIST_MAX_COUNT = 24; // 水面に最も近いときの最大粒数
// キャリアの水滴の粒の数に掛ける倍率。キャリアは浮力で水面にぴったり浮くので距離はほぼ0＝粒の数は
// いつも最大（24）になり、左・中央・右の3か所で出るので1フレームあたり36粒・同時に約1,800粒浮いて
// 派手すぎた（2026-10-11 実機の指摘「少し控えめに」）。半分から始めて実機で見て調整する
export const CARRIER_WATER_MIST_SCALE = 0.5;
// 水滴は雪の粉より重く早く落ちるので、SnowMist(75F)より短命にする
export const HOVER_WATER_MIST_LIFETIME = 50;
// SPLASH_PARTICLE と同じ水色（水しぶきと同系に見せる）
export const HOVER_WATER_MIST_COLOR = '#BFE3FF';
// 積雪の帯（地形キャッシュに焼く。生成時に露出していた上面だけ）。
export const SNOW_CAP_THICKNESS = 5;
export const SNOW_CAP_COLOR = '#EEF4FB';
// 雪の面の階段。部屋の縁に意図的に作り、滑れる長さを保証する。
export const SNOW_STAIRS_COUNT = 8;
export const SNOW_STAIRS_LENGTH_MIN = 5;
export const SNOW_STAIRS_LENGTH_RANGE = 5;  // 5〜9段
// 面ごとの長い坂（STAGE_ENVIRONMENTS の stairs が引く）。salt は派生ストリームの種（game.rng を消費しない）。
// snow の値と salt は、表にする前の5面の値そのまま（5面の階段と乱数の状態は tests/stage2-slopes.test.js が縛る）。
// cave（2面）は 3本・4〜7段（たたき台・実機で調整）。2面は 187×93 タイル（部屋28）で、5面の 300×150（部屋50）の
// 約39%しかない。5面の8本を面積で割り戻すと約3本で、部屋も小さいので段数も1〜2段短くした
// （ユーザーの指摘「2面は狭いので多い」2026-11-01）
export const STAIRS_PROFILES = {
    snow: { count: SNOW_STAIRS_COUNT, lengthMin: SNOW_STAIRS_LENGTH_MIN, lengthRange: SNOW_STAIRS_LENGTH_RANGE, salt: 0x51A1E5 },
    cave: { count: 3, lengthMin: 4, lengthRange: 3, salt: 0xCA7E51 },
};

// 霧。層は事前に描いた板を視差付きでずらすだけ。粒は出さない。
export const FOG_COLOR = '#8A96A8';
export const FOG_OVERLAY_ALPHA = 0.22;      // 全画面の薄塗り
// 板は画面（1366×768）より大きくして、継ぎ目が横方向にだけ1回入る形にする
// （drawImage が層×2回で済む。1024×512 だと横2×縦2＝層×4回になる）
export const FOG_SHEET_WIDTH = 2048;
export const FOG_SHEET_HEIGHT = 1024;
export const FOG_BLOB_COUNT = 220;          // 実機: ムラを増やす（160 → 220。雲は小さくする）
// 実機の指摘: 円を並べると幾何学的に見える。煙幕と同じ瘤の並び（SMOKE_SHAPES）で
// 雲形にし、横に押し潰して有機的に見せる
export const FOG_BLOB_RADIUS_MIN = 18;      // 実機: 小さめ（40〜130 → 18〜60）
export const FOG_BLOB_RADIUS_RANGE = 42;
export const FOG_BLOB_ASPECT = 2.0;         // 横長。円だと幾何学的に見える（実機の指摘）
export const FOG_BLOB_ALPHA_MIN = 0.05;     // 雲ごとの濃さの幅でムラを出す
export const FOG_BLOB_ALPHA_RANGE = 0.30;
export const FOG_LAYERS = [
    { speed: 0.12, alpha: 0.30 },
    { speed: 0.28, alpha: 0.22 },
];

// デモ画面（面別ランキング・面セレクト・タイトル）では文字の可読性のために薄くする。
export const DEMO_OVERLAY_ALPHA_SCALE = 0.5;
