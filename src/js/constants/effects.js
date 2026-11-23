// 演出（粒子・薬莢・着弾の閃光・破壊の破片）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
import { GRAVITY } from './core.js';

// --- Particles ---
export const PARTICLE_LIFETIME = 40; // frames
export const EXPLOSION_PARTICLE_COUNT = 36;

// マシンガンの薬莢。当たり判定を持たない純粋な演出で、DebrisPart と同じく
// 地形は無視して落下するが、水中かどうかだけは motionFor で見てゆっくり沈める
// （水面をまたいだ瞬間のしぶきは isDebris フラグに乗せて StageEnvironment に任せる）。
export const CASING_COLOR = '#D4A537';      // 真鍮色
export const CASING_LENGTH = 3;             // 排出方向を向く長辺
export const CASING_WIDTH = 1.5;
export const CASING_GRAVITY = 0.18;         // DebrisPart(0.1〜)より軽い金属片なので少し強め
export const CASING_MAX_FALL_SPEED = 4;
// 転がりながら落ちる回転の幅（rad/frame）。実際の回転は ±半分＝ ±0.5 rad/frame。
// 以前は 0.5 と書かれていたが使われておらず、Particle.js が幅 1.0 を直書きしていた。
// 見た目を変えないよう、実際に使われていた 1.0 に合わせて配線した（2026-11-04）
export const CASING_SPIN = 1.0;
export const CASING_LIFETIME = 50;          // 約0.83秒でフェードアウトしながら消える
// 地形に当たったときの跳ね返り。GRENADE_BOUNCE と同じ考え方（速度を反転させつつ減衰）
// だが薬莢は軽い金属片なのでより弾む（0.5弱→0.55）。何度か跳ねてから転がって止まる見た目にする
export const CASING_BOUNCE = 0.55;
export const CASING_FRICTION = 0.6;         // 地面に着いてから転がる速度の残存率（毎フレーム）
export const CASING_FADE_START = 0.6;       // 経過60%(DebrisPartのDEBRIS_FADE_STARTと同じ考え方)からフェード開始
// 排出口は発射角の右直角（実銃の排出方向）。EJECT_SPREAD でばらつかせる
export const CASING_EJECT_SPREAD = 0.9;
export const CASING_EJECT_SPEED_MIN = 1.2;
export const CASING_EJECT_SPEED_MAX = 2.6;
// 排出方向は狙いの角度ではなく自機の向き（facingRight）基準。真上から
// この角度だけ背中側へ傾けた方向へ飛ぶ（実機の指摘: 狙いの角度に追従すると
// 上を向いて撃ったときに変な方向へ飛ぶ。自機の左右反転にだけ追従してほしい）
export const CASING_EJECT_ANGLE_FROM_UP = Math.PI / 4; // 45°: 右斜め上後方 / 左斜め上後方

// --- 着弾の閃光 ---
// createExplosion が入れる FlashParticle は柔らかいグラデーションで、粒子に紛れて
// 「命中した」瞬間が読み取りにくい。輪郭のはっきりした小さな閃光を別に重ねる。
export const IMPACT_FLASH_LIFETIME = 8;   // 短く。爆発本体を邪魔しない
export const IMPACT_FLASH_RADIUS = 18;    // ミサイル着弾。マシンガンとの差が出る大きさ
export const IMPACT_FLASH_RADIUS_MG = 6;  // マシンガンなど軽い着弾用

// 機体の破壊時は、ミサイル着弾と同じくらいの閃光を時間差で連ねて瞬かせる。
// 1発の大きな光より、複数が次々に走るほうが「誘爆している」感じが出る。
export const DEATH_FLASH_STAGGER = 4;     // 1つあたりの遅延の刻み（tick）

// --- Destruction Debris ---
// 破片は当たり判定を持たない純粋な演出。ただし薬莢(CasingParticle)と同じく、
// 地形には Grenade 相当の2Dバウンスで跳ね返り、水中では motionFor の
// gravity 倍率でゆっくり沈む（実機の指摘: 薬莢と同じように障害物・水の
// 影響を受けてほしい）。game.map が無い（テストのスタブ等）ときは
// CasingParticle と同じく素通りするフォールバックにしてある。
export const DEBRIS_GRAVITY = GRAVITY / 6; // 通常の1/6。吹き飛んで舞う時間を長く取る
export const DEBRIS_MAX_FALL_SPEED = 4;    // 落下速度の上限。これ以上は速くならない
export const DEBRIS_DRAG = 0.985;          // 毎フレーム vx に乗算する空気抵抗
// 跳ね返り。薬莢(CASING_BOUNCE=0.55)より重く大きいパーツなので、
// より多くの運動エネルギーを失う想定で弱めにしてある
export const DEBRIS_BOUNCE = 0.4;
export const DEBRIS_FRICTION = 0.5;        // 地面に着いてから転がる速度の残存率（毎フレーム）
export const DEBRIS_LIFETIME = 55;         // frames
export const DEBRIS_LIFETIME_JITTER = 20;  // 寿命に加算する乱数の幅
// 回転は爆風のトルクから決める。破片の長辺が爆心方向となす角が45度のとき最大。
// この値がそのときの角速度（rad/tick）。
export const DEBRIS_SPIN_TORQUE = 0.38;
export const DEBRIS_SPEED_JITTER = 0.45;   // 初速に加える乱数の幅
// 1機あたりの破片数は 32〜81 片（最多は artillery の4脚型）。
// 上限 800 はおよそ10機ぶんで、地雷の誘爆による同時多数撃破でも足りる。
export const DEBRIS_MAX_ACTIVE = 800;      // 同時に存在できる破片の上限
export const DEBRIS_FLASH_COLOR = '#FFFFFF'; // ホールド中の白熱色
export const DEBRIS_FADE_START = 0.75;     // 寿命のこの割合を過ぎたら alpha を落とし始める

// パーツはさらに 2x2 に割って飛ばす。「飛びながら砕ける」ように、4片は
// 元パーツの速度を共有したうえで、パーツ中心から外向きへわずかに開く。
// 4片が同じ動きをすると単調に見えるので、分割片ごとに散らしを効かせる。
// 散らすのは速度と角速度だけで、初期位置には乗せない（飛び出しの瞬間は
// 元のパーツのかたちを保ち、飛びながらばらけて見せるため）。
// パーツは「長い辺をランダムな比率で割る」を繰り返して砕く（ギロチン分割）。
// 均等な格子と違って大きさがまちまちになり、かつ元のパーツを隙間なく埋める。
export const DEBRIS_SPLIT_PIECES = 8;      // 1パーツを最大この数まで割る

// 切るたびに軸を選ぶ。長い辺を割ると正方形へ寄り、短い辺を割ると細長くなる。
// パーツ単位で決めるとそのパーツが全部同じ形になってしまうので、1回ごとに選ぶ。
export const DEBRIS_SLAT_CHANCE = 0.4;     // 短い辺を割る（＝細長くする）確率
export const DEBRIS_SLAT_SPIN_BOOST = 2.4; // 細長い破片は回りやすい

// 破片の飛ぶ向き。機体中心からの放射だけで決めると、機体の輪郭に沿って
// 平たく広がる（横長の母艦だと横一直線になる）。等方なランダム方向を混ぜて
// 球状に散らす。0で放射のみ、1で完全にランダム。
export const DEBRIS_ISOTROPIC_MIX = 0.55;

// 爆発なので上へ吹き上がる。方向ベクトルの y に足してから正規化する。
export const DEBRIS_UPWARD_BIAS = 0.3;   // 上向き約75%。上げすぎると放射に見えなくなる

// 初速のばらつき。全部が同じ速さで飛ぶと単調に見える。
// 1 を中心に ±SPEED_VARY/2 の倍率がかかる。
export const DEBRIS_SPEED_VARY = 0.9;
export const DEBRIS_SPLIT_MIN_SIZE = 1.4;  // これ以下の辺になる分割はしない（点にならないように）
export const DEBRIS_SPLIT_RATIO_JITTER = 0.5; // 分割位置の比率 0.5±JITTER/2（大きさのばらつき）
export const DEBRIS_SPLIT_SPREAD = 0.55;   // 分割片がパーツ中心から離れる初速（基準値）
export const DEBRIS_SPLIT_SPREAD_JITTER = 0.7; // 上の倍率のばらつき幅（1±JITTER/2 倍）
export const DEBRIS_SPLIT_JITTER = 0.5;    // 分割片ごとに速度へ加える等方な散らし
export const DEBRIS_SPLIT_SPIN_JITTER = 0.16;  // トルクが立たない向きの破片が完全に止まって見えないための最低限

// 爆発の広がり。本物のパーツ破片を撒く機体では、爆発が破片を覆い隠さないよう
// 粒子の初速と中央フラッシュを縮める（粒子数は減らさないので密度は保たれる）。
export const EXPLOSION_SPREAD_WITH_DEBRIS = 0.6;

// 自機の死だけは別格に扱う。全機体で最小(15)だったうえ広がりも 0.6 倍だったため、
// 中央フラッシュが自機(16x24px)より小さくなり、破片の白熱シルエットに埋もれて
// 「爆発が無い」ように見えていた。死亡ホールドで90tick見せる作りとも釣り合わない。
export const PLAYER_DEATH_EXPLOSION_COUNT = 45;   // 他機体の最大(36)より多い
export const PLAYER_DEATH_EXPLOSION_SPREAD = 0.9; // 破片は隠さないが確実に見える広さ

// 母艦も同じ理由で別格。しかも自機より深刻だった — 64x32px と最大の機体なのに
// 粒子25・フラッシュ半径9.8px で、船体を囲む円(35.8px)の 0.27 倍しかなかった。
// 自機と母艦だけが死亡ホールドで90tick寄りで見せられるので、この2つは体格に見合わせる。
export const CARRIER_DEATH_EXPLOSION_COUNT = 100;
export const CARRIER_DEATH_EXPLOSION_SPREAD = 1.3;
