// 7面の要塞（区画・格納塔・施設エリア・電磁パルスのバリア・電流の床）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
// --- 7面の要塞区画（terrain: 'fortress'）---
// 設計: docs/superpowers/specs/2026-09-06-stage7-fortress-design.md
// 洞窟を掘り終えたあとに矩形の区画を選び、中を「直線の廊下の格子」で書き潰す。
// 7面は 150x300 タイル、画面は 86x48 タイル。区画を 26〜35 x 18〜25 にすると
// 画面の 1/3 ほどになり、「入った」と分かる大きさになる。
export const FORTRESS_ZONE_COUNT = 4;      // 上限。置けなければ少なくてよい
export const FORTRESS_ZONE_W_MIN = 26;
export const FORTRESS_ZONE_W_RANGE = 9;    // 26〜35
// 天井高を 6 にして階のピッチが 7 になったので、区画の高さ 18〜25（内側 14〜21）では 2階が大半になった
// （3階に要る内側の高さは 20）。階が少ないと廊下の仕掛けを置く段が減るので、3階になる高さへ上げた
export const FORTRESS_ZONE_H_MIN = 24;
export const FORTRESS_ZONE_H_RANGE = 7;    // 24〜31
export const FORTRESS_ZONE_MARGIN = 3;     // 盤面の縁からこれだけ離す（BORDER_THICKNESS=2 の外側）
// 外壁の厚さ。上帯と左帯（自機が来る正面）は装甲＝掘れない、下帯と右帯（背面）は
// 硬い岩＝時間をかければ抄える。「回り込めば抄えるが、正面は口を通るしかない」に
// なる。背面が必ず掘れるので詰みは起きない
export const FORTRESS_WALL_THICKNESS = 2;
// 区画の中は「階層構造」。**縦横同じピッチの格子にしてはいけない** — このゲームは
// 横視点なので、格子は真上から見た間取り図に見えてしまう（実機の指摘）。横に長い階を
// 縦に積み、シャフトでつなぐ建物の断面にする。
// 自機は 16x24px = 1x1.5 タイル。天井高5（80px）は「幅3の廊下が若干窮屈」という
// 実機の指摘を受けた値。区画の高さ 18〜25 から外壁2層を引くと 2〜3階になる
export const FORTRESS_CEILING_H = 6;   // 室の天井高（タイル）。5 → 6: 廊下を4に下げたとき、室との差を1行でなく2行にするため
// 床は**金属1層**（= METAL_BLOCK_HP = 6発）。硬い岩1層（3発）では掘るほうが速すぎて
// シャフトの意味が薄く、金属2層（12発）にしたら重すぎた。6発が実機で決めた着地点で、
// 「シャフトのほうが速いが、掘るのも現実的」という線に置いてある
export const FORTRESS_FLOOR_H = 1;     // 床の厚さ。階のピッチは 5+1=6
export const FORTRESS_SHAFT_W = 4;     // 階をつなぐ縦穴の幅
// 階の中は「室 → 廊下 → 室」。設計書 §7 の元案（廊下の交点＝室）を、格子ではなく断面で実現する
// （格子は真上から見た間取り図に見えた）。交点は、シャフトが階に着く・階から出る所、入り口、お宝の奥。
// そこを天井高のまま残した「室」にして、室と室のあいだは天井に金属の梁を足して「廊下」にする。
// 廊下の高さは自機（1.5タイル）に余裕のある 4。3 は「若干窮屈」と実機で言われた
export const FORTRESS_CORRIDOR_H = 4;
export const FORTRESS_ROOM_MARGIN = 2;     // シャフト・入り口の縦穴の左右に、室をこれだけ広げる
export const FORTRESS_ROOM_W = 8;          // 入り口の室とお宝の室の幅（縦穴を持たないので幅で決める）
// 室と室のあいだがこれより狭いと廊下ではなく切り欠きに見えるので、室を併合して1つの広間にする
export const FORTRESS_CORRIDOR_MIN_W = 4;
// バリアの列から左右にこれだけは敵を湧かせない。バリアの中に砲台が居ると、
// 開ける前に一方的に撃たれるうえ、撃ち返した弾はバリアに吸われて届かない
export const FORTRESS_BARRIER_CLEARANCE = 2;
// 入り口の大きさ（タイル）。左辺・上辺とも同じ。3 → 5 に戻した（実機の指摘）。
// 3では狭かった。5でも「壁が崩れている」に見えないのは、**開口の上下に守衛の
// タレットを置いて「守られた門」だと分かるようにした**から（下の GATE_GUARD）
export const FORTRESS_GATE_SIZE = 5;
// 入り口を守るタレット。開口の上端（天井付け）と下端（床置き）に1基ずつ。
// **ノーマル（gun）に固定する** — 7面はビーム砲台が混ざる面なので、放っておくと
// 入り口の守衛がビームになり、入る前に削られて理不尽になる
export const FORTRESS_GATE_GUARD_TYPE = 'gun';
export const FORTRESS_GATE_GUARD_INSET = 1;   // 開口から内側へ何タイル入れるか
// 開口から区画の外の空洞まで掘るトンネルの最大長。7面は空洞が 42% あるので
// 数タイルで当たる。当たらないまま尽きたらそこで止める（掘った穴は残る）
export const FORTRESS_OPENING_TUNNEL_MAX = 24;
// 区画の奥（最下階の右端）に置くお宝。オーバードライブキットは今までアタッカーの
// 撃破ドロップでしか出ない稀少品なので、要塞の奥という置き場所が意味を持つ
export const FORTRESS_TREASURE_COUNT = 3;

// --- 格納塔（お宝を入れておく塔。設計 2026-10-31-stage7-storage-towers-design.md）---
// むき出しのお宝は着いた時点で中身が全部見えた。塔に入れて「何かあるのは分かるが中身は分からない」にする。
// 大きさは自機（PLAYER_WIDTH × PLAYER_HEIGHT）と同じ（ユーザー指定）
export const STORAGE_TOWER_W = 16;
export const STORAGE_TOWER_H = 24;
// ミサイル（PLAYER_MISSILE_DAMAGE 15）ちょうど1発（ユーザー指定「ミサイル1発程度」）。
// 機関砲（PLAYER_MG_DAMAGE 3）なら5発、グレネード（80）なら爆風の内側で1発
export const STORAGE_TOWER_HP = 15;
// 絵（ユーザー指定「黄白色っぽい円筒形のタンクが足台の上に載った形、オレンジの横縞の光が明滅」）。
// 色は面ごとに変えない: ほかの面（雪・水・霧）に置いても目立つように
export const STORAGE_TOWER_BODY_COLOR = '#E8DFB0';       // 円筒の地（黄白色）
export const STORAGE_TOWER_LIGHT_COLOR = '#FAF4D8';      // 円筒の中央寄りの照り（丸みを出す）
export const STORAGE_TOWER_SHADE_COLOR = '#A89E74';      // 円筒の左右の端・ふた（暗い黄土色）
export const STORAGE_TOWER_STAND_COLOR = '#4A4E56';      // 足台（暗い金属。要塞のパネルと同じ系統）
export const STORAGE_TOWER_STAND_H = 5;                  // 足台の高さ（px）。下の数 px を脚と横板にする
export const STORAGE_TOWER_STRIPE_COLOR = '#FF8A1E';     // 横縞の光（オレンジ）
// 横縞の上下に1pxずつ接する暗い帯（明滅しない）。黄白色の地の上ではオレンジが沈んで明滅が分かりにくかった
// （実機の指摘）。暗い縁で挟むと、消え際でも帯の位置が読め、光ったときの差がはっきりする（ユーザー案）
export const STORAGE_TOWER_STRIPE_EDGE_COLOR = '#5C4A2A';
// 帯は太い1本。2px の細い縞3本では明滅が分かりにくく、上下に暗い縁を足すとしましまが多すぎて
// 汚く見えた（実機の指摘2回）。1本にして、暗い縁で挟む（ユーザー案）
export const STORAGE_TOWER_STRIPE_COUNT = 1;
export const STORAGE_TOWER_STRIPE_H = 2;                 // 帯の太さ（px）。4px は太すぎた（ユーザー判断）
// 帯を円筒のまん中からこれだけ上げる（px）。まん中では低く見えた（ユーザー判断「もう少しだけ高めに」）
export const STORAGE_TOWER_STRIPE_LIFT = 2;
export const STORAGE_TOWER_BLINK_PERIOD = 60;            // 明滅の周期（フレーム、約1秒）
export const STORAGE_TOWER_STRIPE_ALPHA_MIN = 0.25;      // 消え際でも縞が分かる程度に残す
export const STORAGE_TOWER_STRIPE_ALPHA_MAX = 1.0;
// 位相を1タイルあたりこれだけずらす（周期に対する割合）。お宝は2タイルおきなので隣とは 0.34 周ずれ、
// 3本が同時に点滅せず林立して見える。位置から決めるので乱数を使わない
export const STORAGE_TOWER_PHASE_STEP = 0.17;

// --- 施設エリア（区画の外の地形をメタルパネルにする。設計 2026-10-31-stage7-facility-metal-design.md）---
// 要塞の区画（最大4つ）の外は洞窟の岩のままで、基地らしさが薄かった。区画の外に矩形の「施設」を置き、
// 中の岩を絵だけパネルにする（硬さはそのまま）。縁の1層の岩と金属の斜面だけ本物の金属（ユーザー判断）。
// 個数・大きさは実測で決めた（8シードの平均。割合は区画の外の空でないタイルのうち施設エリアに入ったもの）:
//   8個・10〜20×8〜14 → 1.0%（部屋の空洞の中に収まって、壁も床もほとんど含まない。浮いた板と階段だけになった）
//   8個・24〜40×16〜26 → 6.0% / 16個 → 10.8%（置けたのは 14.8 個）
//   12個・32〜48×20〜30 → 14.5%（置けたのは 10.6 個）← 採用。部屋の周りの壁・床まで含み、洞窟の岩もまだ大半残る
//   20個・同 → 14.8%（置ける場所が尽きて増えない）
// 本物の金属になる縁の帯は 1 面あたり平均 617 タイル（1 エリア約 58）
// → エリア同士を接しないようにした後（帯が2層にならない）: 置けたのは 9.1 個、割合 12.5%、帯 519 タイル、斜面 97 枚
export const FACILITY_AREA_COUNT = 12;     // 上限。置けなければ少なくてよい
export const FACILITY_AREA_W_MIN = 32;
export const FACILITY_AREA_W_RANGE = 16;   // 32〜48 タイル
export const FACILITY_AREA_H_MIN = 20;
export const FACILITY_AREA_H_RANGE = 10;   // 20〜30 タイル
// 施設エリアの中に盛る金属の階段。洞窟の地形には1段ずつの段がほとんど無く、盛らないと斜面が出ない。
// 段は本物の金属（6発）なので、5面の雪の階段（5〜9段）より短くして、掘り進む重さを抑える
export const FACILITY_STAIRS_COUNT = 8;
export const FACILITY_STAIRS_LENGTH_MIN = 3;
export const FACILITY_STAIRS_LENGTH_RANGE = 3;  // 3〜6段
// 区画に追加で湧かせる守備隊。実機で「敵がもう少しいてもいい」と出た指摘への対応で、
// 7面だけに効く。既存の湧きに足す形なので、面全体の上限（maxTurrets など）は触らない
export const FORTRESS_GARRISON_TURRETS = 2;
export const FORTRESS_GARRISON_TANKS = 2;

// --- 電磁パルスのバリア（要塞の各階に1本）---
// 天井と床の2基のユニットが対で立ち、その間に縦のバリアが張られる。**両方**壊すと
// 消える。壁を壊して進むのではなく装置を倒して進む形にすることで、横視点の遊びとして
// 成立させる（真上から見た間取り図に見える、という実機の指摘への答えでもある）。
// ユニットの硬さ。**ミサイル2発、マシンガン5発**で壊れるように置いてある（実機の指定）。
// 30 = PLAYER_MISSILE_DAMAGE(15) x 2 = PLAYER_MG_DAMAGE(3) x BARRIER_UNIT_MG_MULT(2) x 5。
// マシンガンに倍率を掛けているのは、素の 3 だと10発かかって「撫でて壊す」には
// 長すぎるため。敵の mgDamageMult と同じ考え方（あちらは装甲で減らす向き）
export const BARRIER_EMITTER_HP = 30;
export const BARRIER_UNIT_MG_MULT = 2;
export const BARRIER_UNIT_W = 12;            // ユニットの見た目の幅（px）
export const BARRIER_UNIT_H = 8;             // 同、高さ
export const BARRIER_FIELD_W = 6;            // バリアの幅（px）。細いほど「すり抜けられそう」に見えない程度
// 接触時。**ダメージだけでは強行突破できてしまう**ので押し戻しとセットにする。
// 押し戻しは「来た方向へ」返す（貫通しかけて向こう側に出るのを防ぐ）
export const BARRIER_TOUCH_DAMAGE = 6;       // 毎フレーム。触れ続けると一気に減る
export const BARRIER_KNOCKBACK_VX = 4;
export const BARRIER_KNOCKBACK_VY = -2;
// **敵はダメージを受けない。** 守備隊が自分のバリアに触れて自滅すると、
// 「開けた瞬間に出てくる」という狙いが成立しなくなる。押し戻すだけにする
export const BARRIER_PULSE_PERIOD = 24;      // 明滅の周期（フレーム）
export const BARRIER_COLOR = '#7FD8FF';      // 電磁パルスの芯
export const BARRIER_GLOW_COLOR = 'rgba(127, 216, 255, 0.35)';
// **被弾対象であることを色で明示する**（実機の指摘）。地形の金属（#383e51 など）に
// 埋もれない白っぽさにして、「これは撃つものだ」と分かるようにする。
// 輝度 186 に抑えてあるのは、ランプ（#7FD8FF・輝度194）が本体より明るく見える
// ようにするため。真っ白（#D6DEE8・221）にすると点灯のほうが暗くなって逆転する
export const BARRIER_UNIT_COLOR = '#AEBCCB';
// ランプ。**鮮やかな空色に戻した**（実機の指摘。一度 #3FC8FF に濃くしたが、
// 以前のほうが印象が良かった）。本体の輝度を 221 → 186 に下げることで、
// この色が本体より明るく見えるようにしてある。消灯は暗いスレートで、
// 暗→シアンの点滅として読ませる
export const BARRIER_UNIT_LAMP_COLOR = '#7FD8FF';
export const BARRIER_UNIT_LAMP_OFF_COLOR = '#4A5A6B';
// バリアの音。**細く高い持続音**にする。最初は 72Hz の低い唸り＋矩形波の倍音で
// 作ったが、実機で「うざい」と出た（低い唸りは常時鳴ると圧が強く、母艦エンジンとも
// 帯域が近い）。三角波1本に絞って高い方へ寄せ、ローパスも上げて細くしてある。
// AM も浅く遅くして「ジジジ」を弱め、蛍光灯の唸りくらいの存在感に留める
export const BARRIER_HUM_FREQ = 320;         // 芯（Hz）。低い唸りをやめて高い方へ
export const BARRIER_HUM_HARMONIC = 0;       // 倍音の矩形波は廃止（0 で無効）
export const BARRIER_HUM_FILTER = 1800;      // ローパス。芯より上に置いて角を丸める程度に
export const BARRIER_HUM_AM_HZ = 7;          // 振幅変調。11 → 7 で落ち着かせる
export const BARRIER_HUM_AM_DEPTH = 0.25;    // 0.45 → 0.25。揺れを浅く
export const BARRIER_HUM_GAIN = 0.032;       // A特性で -48.1dB。回復ハムより 6dB 低い（実機の「うざい」への対応）       // 満音量のときの gain
// 弾を吸ったときの単発。短いノイズのバースト＋落ちるブリップ
export const BARRIER_ABSORB_FILTER = 2200;
export const BARRIER_ABSORB_DECAY = 0.07;
export const BARRIER_ABSORB_GAIN = 0.27;     // A特性で -43.7dB。唸りより 4dB 上（狭いバンドパスで捨てたぶんを補正した値）
// 2基目のユニットが壊れてバリアが落ちたときの合図。電源が落ちる下降音
export const BARRIER_DOWN_FREQ_FROM = 420;
export const BARRIER_DOWN_FREQ_TO = 55;
export const BARRIER_DOWN_TIME = 0.38;
export const BARRIER_DOWN_GAIN = 0.20;       // A特性で -37.4dB。唸りより 4dB 上げて、開いたことが分かるように
// 吸収の見た目。**弾が消えるだけだとバグに見える**（実機の指摘）。当たった高さに
// 光の輪を残し、バリアが受け止めたことを見せる。輪は横に広がりながら薄くなる
// **爆発とは向きが逆**でなければならない（実機の指摘）。爆発は外へ撒くが、吸収は
// 内へ吸い寄せる。粒はバリアの周りから中心へ集まって消え、光の輪は広がるのではなく
// 縮んでいく。ここを逆にすると「弾が爆発した」に見えて吸収に読めない
export const BARRIER_FLARE_FRAMES = 14;      // 輪が消えるまで
export const BARRIER_FLARE_WIDTH = 26;       // 輪の**最初**の横幅（px）。ここから縮む
export const BARRIER_FLARE_HEIGHT = 5;       // 同、縦の厚み
export const BARRIER_SUCK_COUNT = 6;         // 吸い寄せられる粒の数
export const BARRIER_SUCK_RADIUS = 20;       // どれだけ外から集まってくるか（px）
export const BARRIER_SUCK_FRAMES = 9;        // 集まりきるまで。短いほど「吸われた」が鋭く出る
export const BARRIER_SUCK_SIZE = 2;
// 片方のユニットを壊すと、残った1基が**空中が続く限りバリアを伸ばす**（実機の案）。
// 半端に壊すと危険が増すので「両方壊せ」の圧になる。**床は硬い岩＝自機が壊せる**ので、
// 先に床へ穴を開けてから片方を壊すと、その穴を通って上下の階まで塞がる。
// だから長さは毎フレーム地形から測り直す（固定にすると穴を開けても伸びない）
export const BARRIER_EXTEND_MAX = 40;        // 伸びる上限（タイル）。暴走の歯止め

// --- 要塞の電流の床（廊下の床を走る放電。設計 2026-10-29-stage7-fortress-hazards-design.md）---
// 置き場所: 各階の廊下は1本ずつで、そこにはもうバリアが立っている（実測で全階）。別の廊下を探すと
// 置ける所が無いので、**バリアのある廊下の、長いほうの側の床**に敷く。
// 8シード（99階）で試した置き方の比較: バリアから3列離し端も1列空けると20本（5シードにしか無い）、
// 2列離して端を空けないと53本（全シードに有、1シード平均6.6本、長さ平均4.2タイル）。後者にした。
// 2列離す = バリアの支柱（幅12px）の両隣に1タイルの空きが残るので、放電と支柱が重ならない。
export const ELECTRIC_FLOOR_BARRIER_GAP = 2;   // バリアの列から、床の一番近いタイルまでの列数
export const ELECTRIC_FLOOR_MIN_LEN = 3;       // これより短い床は敷かない（1〜2タイルでは「踏まない」だけで罠にならない）
// 周期は 予兆 → 放電 → 休み。予兆は火花だけでダメージは無く、「次に来る」を読ませる。
// 休みを放電より長く取り、通り抜けるタイミングを待てるようにする（低い所を這う必要が出ないように）
export const ELECTRIC_FLOOR_WARN_FRAMES = 30;
export const ELECTRIC_FLOOR_ACTIVE_FRAMES = 50;
export const ELECTRIC_FLOOR_REST_FRAMES = 70;
export const ELECTRIC_FLOOR_H = 20;            // 放電の高さ（px）。自機（24px）が床に降りていれば必ず触れ、
                                               // 廊下の高さ 64px の3割なので、上を飛べば避けられる
export const ELECTRIC_FLOOR_TOUCH_DAMAGE = 5;  // 1回あたり。バリアの毎フレーム6と違い、離れなくても刻みで入る
export const ELECTRIC_FLOOR_HIT_INTERVAL = 15; // 同じ相手に入る間隔（フレーム）。放電50フレームの中で最大4回=20
export const ELECTRIC_FLOOR_KICK_VY = -3;      // 触れたときに上へ弾く速さ。居座りづらくする（バリアの押し戻しの床版）
export const ELECTRIC_FLOOR_COLOR = '#FFE066';       // 放電の芯。バリアの水色と取り違えない黄
export const ELECTRIC_FLOOR_CORE_COLOR = '#FFFBE0';       // 放電の芯（ほぼ白）
export const ELECTRIC_FLOOR_GLOW_COLOR = 'rgba(255, 210, 80, 0.28)';
export const ELECTRIC_FLOOR_ELECTRODE_COLOR = '#6B7686';   // 床に埋めた電極の頭
export const ELECTRIC_FLOOR_ELECTRODE_LAMP = '#FFB000';    // 予兆・放電中に点く
export const ELECTRIC_FLOOR_ELECTRODE_LAMP_OFF = '#3A4553';
// 放電が始まる瞬間の「バチッ」。バリアの吸収音（ジッ）と区別できるよう高めの帯域・長めの減衰
export const ELECTRIC_ZAP_FILTER = 3400;
export const ELECTRIC_ZAP_DECAY = 0.14;
export const ELECTRIC_ZAP_GAIN = 0.2;           // A特性で -42.0dB。吸収音（-43.7dB）より 1.7dB 上げて、床の放電が聞き分けられるように
