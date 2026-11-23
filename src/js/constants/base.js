// 敵基地（コア・周回シールド・旗・レーザー・追加の武器・緊急防衛・破壊のフィナーレ）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
import { CANVAS_WIDTH } from './core.js';
import { ENEMY_DRONE_GRENADE_CHANCE } from './enemies.js';

// --- Enemy Main Base (Win Condition) ---
export const ENEMY_BASE_SCORE = 10000;
export const ENEMY_BASE_WIDTH = 24;
export const ENEMY_BASE_HEIGHT = 32;
export const ENEMY_BASE_SHIELDS = 3;            // Layers of defense
export const ENEMY_BASE_HP = 1;                 // Final core HP
// 基地の武器と守りが加わる面。1面の基地は何もしない
export const BASE_TURRET_MISSION = 1;           // 2面から レーザー砲台
export const BASE_EMERGENCY_MISSION = 1;        // 2面から 撃たれると緊急防衛（守備隊を呼び戻す）
export const BASE_MISSILE_MISSION = 3;          // 4面から ミサイル
export const BASE_HOMING_MISSION = 5;           // 6面から 追尾ミサイルの斉射
export const BASE_CRUISE_MISSION = 6;           // 7面から 巡航ミサイル
// 基地の部屋の足場（壊せない台）。砲台はこの台の上に置く（mapgen/spawns.js の _findEnemyTurretPositions）
export const BASE_ROOM_MID_PLATFORM_MISSION = 2;    // 3面から 真ん中の床の台
export const BASE_ROOM_SIDE_PLATFORMS_MISSION = 3;  // 4面から 左右の床の台
// 構造物の描画が当たり判定の箱より下へはみ出す量 px。
//
// 基地の絵はコアを中心に上下 28px（合わせて 56px）で描いてあるのに、箱は
// 32px しかない。素直に「箱の下端＝床の表面」で置くと、はみ出す下12px＝
// 土台の支柱と締め具がまるごと床タイルの中に埋まる（実機で「土台がブロックに
// めり込んでいる」と見えていたのがこれ）。Map はこのぶん基地を持ち上げて置く。
// 値は _drawStructure の一番下（coreY + 22 の締め具、高さ6）から来ている。
// tests/base-sits-on-floor.test.js が実際の描画と突き合わせて縛っている
export const ENEMY_BASE_DRAW_OVERHANG = 12;

// --- 周回シールド（6面以降。むき出しになったコアだけを守る） ---
// リング3枚（ENEMY_BASE_SHIELDS）は今までどおり削れる。3枚目が割れて
// コアが露出した瞬間にコアの中心から羽根がせり出し、鉛直軸まわりを回り始める。
// 羽根が軌道の左右の端＝プレイヤーとコアのあいだに入っている間だけ弾く。
// 幾何は utils/orbitShield.js。
//
// 難易度は SPEED（チャンスの間隔）と GUARD_HALF（ガード窓の広さ）の2つで動く。
export const BASE_ORBIT_SHIELD_MISSION = 5;     // 6面以降 = missionsCompleted 5 以上
export const BASE_ORBIT_SHIELD_PANELS = 2;      // 180°対向。左右が同時に閉じ、同時に開く
// 半径はコアの実体(8〜11)より十分外に取る。16 では羽根がコアに貼り付いて見えて
// 「周回している」感じが出なかったので 30 まで広げた。最内リング(25)より外だが、
// 羽根が出るのはリングが全部割れた後なので重ならない。
// ガード判定は dx の符号しか見ない（orbitShield.guardBlocks）ため、
// ここを動かしても難易度は変わらない
export const BASE_ORBIT_SHIELD_RADIUS = 30;
export const BASE_ORBIT_SHIELD_SPEED = 0.030;   // rad/frame。半周 π/0.030 ≈ 105 frame ≈ 1.75秒
export const BASE_ORBIT_SHIELD_GUARD_HALF = 0.70; // ガード窓の半角 rad(≈40°)。全体の約44%が防御中
// 羽根の基準の縦の長さ px。手前に来た羽根はこれの (1 + ORBIT_PANEL.perspective)
// 倍まで伸びる（36 → 46.8）。基地は下端が床タイルの表面にぴったり乗っているので、
// 伸びた羽根が床にめり込まないよう、羽根の縦の中心は EnemyBase 側で
// 「一番大きい羽根の下端が床に接する高さ」に置いている。
// ここを大きくすると羽根は**上へ**伸びる
export const BASE_ORBIT_SHIELD_HEIGHT = 36;
// 展開のあいだは角度に関係なく完全無敵。ここが 0 だと、最後のリングを割った
// 勢いのミサイル連打でシールドが一度も仕事をしないまま基地が落ちる
export const BASE_ORBIT_SHIELD_DEPLOY = 30;     // frames(約0.5秒)

// --- Flag (Capture Condition) ---
export const FLAG_WIDTH = 12;
export const FLAG_HEIGHT = 20;
export const FLAG_SCORE = 5000;

// --- Enemy Base Laser ---
export const BASE_LASER_RANGE = CANVAS_WIDTH * 0.55;
export const BASE_LASER_CHARGE_TIME = 40; // frames
export const BASE_LASER_COOLDOWN = 90;  // frames
export const BASE_LASER_SPEED = 12;
// 15 と書かれていたが読まれておらず、実際に当たっていたのは 50。
// 自機(100HP)なら2発、母艦(120HP)なら3発で落ちる強さ
export const BASE_LASER_DAMAGE = 50;

// --- Enemy Base Additional Weapons ---
export const ENEMY_BASE_TURRET_COOLDOWN = 120;
export const ENEMY_BASE_TURRET_BURST_COUNT = 5;
export const ENEMY_BASE_TURRET_BURST_DELAY = 10;
export const ENEMY_BASE_MISSILE_COOLDOWN = 180;
export const ENEMY_BASE_HOMING_COOLDOWN = 240;

// --- Enemy Base Emergency Defense Mode ---
export const EMERGENCY_DEFENSE_BASE_RADIUS = 120;
export const EMERGENCY_DEFENSE_SPEED_MULT = 1.15;
export const EMERGENCY_DEFENSE_SIGHT_RANGE = 250;

// 総攻撃中の「見境なしの発砲」。緊急防衛に入ると敵は基地の周囲へ向かう return
// 状態になるが、_handleShooting() は chase のときしか撃たないので、**通路が無くて
// 基地に辿り着けない敵は壁の前で足踏みしたまま一発も撃たない置物になっていた**
// （実機で頻発するとの報告）。自機を見つけていなくても基地の方向へ撃たせる。
//
// 基地の方向へ撃たせるのは絵のためだけではない。**敵のミサイルも地形を壊す**
// （Missile.js の damageBlock() は自機の弾かどうかを見ていない）ので、
// 足止めされた敵が自分で壁を掘り、やがて基地へ近づけるようになる。
// 「通路が無くて近寄れない」という根本原因そのものが時間とともに解消される。
export const EMERGENCY_WILD_FIRE_SPREAD = 20 * Math.PI / 180;  // ±20度
// 発射間隔の倍率。1.0 = 交戦中と同じペース。ユーザーの判断は「その頃には敵の数も
// 減っているはずなので通常と同じかそれ以上の頻度でよい」。**下げると頻度が上がる。**
// 逆に実機で弾が多すぎる／重い場合は、まずここを上げて間引く
export const EMERGENCY_WILD_FIRE_INTERVAL_MULT = 1.0;

// 総攻撃中のドローンのグレネード率。**通常時と同じに戻してある。**
//
// もとの狙いはこうだった: ドローンは飛ぶので「通路が無くて基地に辿り着けない」
// ことは起きない。代わりに総攻撃中はグレネードを落としやすくして、上空から壁を
// 開ける役をやらせる（グレネードは map.destroyArea() で面＝半径2タイルを
// 吹き飛ばすので、1タイルずつしか削れない単発ミサイルより効率が桁違いに高い）。
//
// これを 0.35（通常の3.5倍。1回の攻撃 = ENEMY_DRONE_BURST_COUNT(5) 発ごとに
// 抽選するので期待値 0.5個 → 1.75個）にしたところ、実機で**マップが壊れて
// 足場が無くなり、進めなくなった**（2026-08-23 ユーザー報告）。
// 面で消える攻撃を総攻撃の密度で降らせると、「壁を開ける」を通り越して床まで
// 消える。壁を掘る役は地上ユニットの流れ弾（EMERGENCY_WILD_FIRE_*）に任せ、
// ドローンは弾幕だけに戻す。
//
// 定数と分岐は残してある。上げたくなったら 0.15 あたりから試すこと。
// tests/emergency-wild-fire.test.js が「通常時と同率」を縛っているので、
// 上げるならテストの意図ごと書き換えることになる（＝この判断を踏み直せる）
export const EMERGENCY_DRONE_GRENADE_CHANCE = ENEMY_DRONE_GRENADE_CHANCE;

// --- 敵基地破壊のフィナーレ演出 ---
// 閃光 → 集中線 → 衝撃波リング の順に効き、寿命もこの順に長くなる。
export const FINALE_FLASH_LIFETIME = 5;    // 閃光（爆発の起点を作る）
export const FINALE_FLASH_RADIUS = 90;     // 閃光の最大半径
export const FINALE_LINE_COUNT = 40;       // 集中線の本数
export const FINALE_LINE_LIFETIME = 10;    // 集中線
export const FINALE_LINE_INNER_MIN = 40;   // 線の内側の始点までの距離（下限）
export const FINALE_LINE_INNER_MAX = 140;  // 同（上限）。1本ずつばらつかせる
export const FINALE_RING_MAX_RADIUS = 320; // 衝撃波リングの到達半径
export const FINALE_RING_LIFETIME = 30;    // 衝撃波リング
export const FINALE_RING_WIDTH = 9;        // リングの初期の線幅（細くなっていく）
export const FINALE_SHAKE_INTENSITY = 20;  // 小爆発の shake(8,3) より明確に強く
export const FINALE_SHAKE_DURATION = 24;
