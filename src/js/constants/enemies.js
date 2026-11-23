// 敵（地雷・戦車・敵弾・ドローン・スパイダー・タレット・反射ビームキャノン・跳弾・開始地点の安全圏・被弾の反動・迎撃）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
import { CANVAS_WIDTH, TILE_SIZE } from './core.js';

// --- Landmine (Trap) ---
export const LANDMINE_WIDTH = 12;
export const LANDMINE_HEIGHT = 6;
export const LANDMINE_DAMAGE = 25;
export const LANDMINE_KNOCKBACK_VY = -6;  // Upward launch on detonation
export const LANDMINE_KNOCKBACK_VX = 3;   // Sideways push on detonation
export const LANDMINE_BLINK_INTERVAL = 30; // frames per blink cycle
export const LANDMINE_BLAST_RADIUS = 50;   // Area of effect damage radius (~3 tiles)
export const LANDMINE_SCORE = 50;      // Player-detonated landmine
// 敵機が爆発したとき、この距離内の地雷が誘爆する。
// 地雷を起爆できるのは「自機の弾」と「敵機の爆発」だけ（敵の弾では起爆しない）。
// 敵の弾で起爆すると、地雷の爆風は game.enemies 全員に当たるので、敵が敵を巻き
// 添えにする事故が起きていた。倒した敵の爆発で誘爆するのは自機の戦果なので残す。
// 半径は地雷自身の爆風（LANDMINE_BLAST_RADIUS）と同じにしてある＝「爆風が届く
// 距離なら誘爆する」で揃えた
export const LANDMINE_DEATH_TRIGGER_RADIUS = LANDMINE_BLAST_RADIUS;
export const ITEM_PICKUP_SCORE = 200;  // Any item (repair / missile / auto-aim) pickup

// --- Enemy Tank (Hover) ---
export const ENEMY_TANK_WIDTH = 16;
export const ENEMY_TANK_HEIGHT = 12;
export const ENEMY_TANK_HP = 10;
export const ENEMY_TANK_SPEED = 0.5;
export const ENEMY_TANK_SIGHT_RANGE = CANVAS_WIDTH * 0.4;   // px - detection range for player
export const ENEMY_TANK_FIRE_INTERVAL = 90;  // frames between shots (~1.5s)
export const ENEMY_TANK_SCORE = 200;
export const ENEMY_TANK_MAX_FALLING_SPEED = 3;

// --- Enemy Bullet ---
export const ENEMY_BULLET_SPEED = 3;
export const ENEMY_BULLET_RADIUS = 2;
// 自機と母艦で同じ値。以前は PLAYER=15 / CARRIER=10 と分けて書いてあったが
// どちらも読まれておらず、実際には CollisionManager 側の 10 が両方に効いていた
export const ENEMY_BULLET_DAMAGE = 10;
// 16:9 化で伸ばした。速度 3 なので射程 540 -> 720px。
// 4:3 ではタレットの索敵 512 に対し弾 540 と 5% しか余裕が無く、手で詰めた値
// だった。16:9 のタレット索敵は横 683 なので、720 で足りる。
// なお敵のうち EnemyBullet を撃つのはタンク・タレット・ドローンと、MG 持ちの
// standard（STANDARD_MG_SHARE_BY_MISSION）。他のアタッカーは素の Missile を、
// artillery は EnemyHomingMissile を撃つ。
export const ENEMY_BULLET_LIFETIME = 240;    // frames (4s)

export const ENEMY_HOMING_MISSILE_MAX_SPEED = 3; // Matches player's MISSILE_SPEED
export const ENEMY_HOMING_MISSILE_TURN_RATE = 0.02; // Radians per frame
// 16:9 化で伸ばした。300 * 1.334 = 400.2。速度 3 なので射程 900 -> 1200px。
// artillery の索敵は横 1093 なので、これで届く（4:3 では 819 vs 900 だった）。
export const ENEMY_HOMING_MISSILE_LIFETIME = 400; // Lives longer to find target
export const ENEMY_HOMING_MISSILE_DELAY = 30;     // Frames before tracking starts
export const ENEMY_HOMING_MISSILE_ENGAGE_DISTANCE = 240; // Pixels before tracking starts

export const CRUISE_MISSILE_MAX_SPEED = 3; // Matches player's MISSILE_SPEED
export const CRUISE_MISSILE_TURN_RATE = 0.03; // Slower turn rate
export const CRUISE_MISSILE_ENGAGE_DISTANCE = 240; // Distance in pixels before active homing starts
export const CRUISE_MISSILE_LIFETIME = 1800; // Very long lifetime (30 seconds)
export const CRUISE_MISSILE_HP = 9; // 3 machine gun hits
export const CRUISE_MISSILE_WARNING_TIME = 180; // 3 seconds warning
// 撃ち落としたとき（HP を削り切ったときだけ）の得点。2026-07-18 のバランス調整で 100 → 150 に
// したが、実際の加点は CollisionManager の別の定数 SCORE_CRUISE_DESTROY = 100 のままで、
// 2026-11-04 にこの定数へ一本化するまで効いていなかった（ユーザー判断で設計どおり 150 を採用）
export const CRUISE_MISSILE_SCORE = 150;
export const CRUISE_MISSILE_MIN_DELAY = 1200; // 20 seconds at 60fps
export const CRUISE_MISSILE_MAX_DELAY = 1800; // 30 seconds at 60fps
export const CRUISE_MISSILE_ACTIVATION_RANGE = 150 * TILE_SIZE; // Engagement range in pixels

// --- Enemy Drone (Aerial) ---
export const ENEMY_DRONE_MISSION = 3;      // 4面から（基地の部屋の見張りも同じ）
export const ENEMY_DRONE_HP = 8;            // Weak armor
export const ENEMY_DRONE_SPEED = 4.0;       // Dashing speed
export const ENEMY_DRONE_SPEED_Y_MAX = 3.0; // Dashing vertical speed
export const ENEMY_DRONE_SIGHT_RANGE = CANVAS_WIDTH * 0.7; // Wide sight range
export const ENEMY_DRONE_FIRE_INTERVAL = 120; // 2 seconds
export const ENEMY_DRONE_BURST_COUNT = 5;    // Shots fired per attack
export const ENEMY_DRONE_BURST_INTERVAL = 6; // Frames between burst shots (0.1s)
export const ENEMY_DRONE_SCORE = 250;
export const ENEMY_DRONE_WIDTH = 24;
export const ENEMY_DRONE_HEIGHT = 16;
export const ENEMY_DRONE_HOVER_DIST_Y = 120; // Maintain this vertical distance from player
export const ENEMY_DRONE_HOVER_DIST_X = 180; // Maintain this horizontal distance from player
export const ENEMY_DRONE_GRENADE_CHANCE = 0.10; // 10% chance to drop grenade
export const ENEMY_DRONE_KAMIKAZE_CHANCE = 0.10;   // 10% chance to ram instead of shooting when close
export const ENEMY_DRONE_KAMIKAZE_TRIGGER_RANGE = 240; // Must be within this distance to consider ramming (hover standoff is ~216)
export const ENEMY_DRONE_KAMIKAZE_SPEED = 6.0;     // Ramming charge speed
export const ENEMY_DRONE_KAMIKAZE_DAMAGE_PLAYER = 40;
export const ENEMY_DRONE_KAMIKAZE_DAMAGE_CARRIER = 20; // Carrier (80 HP) dies in 4 hits

// --- スパイダー（6面の前半〜中盤の偵察部隊。床・壁・天井を這い、自機の頭上で破裂する弾を撃つ） ---
// 設計書 docs/superpowers/specs/2026-11-22-spider-enemy-design.md。数値はどれも初期値で、実機で調整する。
// 当たり箱の一辺。タイル（16）より小さくして、1タイルの隙間にも入れるようにした。
// 張り付く面で絵は回すが箱は回さない（正方形なら壁でも天井でも同じ箱で済む）
export const SPIDER_SIZE = 14;
// 出る面。初めは6面だけ（2026-11-22 ユーザー了承。7面は実機で手応えを見てから）、6面で調整を終えて
// 「7面にも配置して」（2026-11-23 ユーザー）で 6・7面に。*_MISSION は「この値以上で有効」の約束なので、上限も置いて両方を見る。
// スパイダーはタイル単位の岩の上を這うので、7面の金属の斜面（形のあるタイル）へは這って入らず折り返す（EnemySpider._onShapedTile）
export const SPIDER_MISSION = 5;
export const SPIDER_LAST_MISSION = 6;
// 置き方。初めは6面の後半＝マップの右半分（敵基地は右端）に置いたが、「後半ではなく偵察部隊として前半〜中盤で」
// （2026-11-23 ユーザー指定）。列の範囲をマップの幅の割合で決める。始まりは左上（母艦の湧きは列 5 から探す）なので、
// 下限 25% は一番狭いマップ（150 列）でも 37 列＝ 600px 先で、霧込みの索敵 450px の外になり、始まってすぐには撃たれない。
// 上限 60% から先は従来どおりアタッカーと砲台の面。数は設計書の目安 4〜6 の真ん中
export const SPIDER_SPAWN_COL_FROM = 0.25;
export const SPIDER_SPAWN_COL_TO = 0.6;
export const SPIDER_COUNT = 5;
export const SPIDER_SPAWN_MIN_COL_GAP = 8;      // スパイダーどうしの列の間隔（タイル）。固まって出ないように
export const SPIDER_SPAWN_SALT = 0x5D1DE5;      // 置き場所の派生ストリームの種（game.rng を消費しない）
// 耐久と得点はドローンと同じ（ユーザー指定「耐久力はドローンと同じくらい」）。参照せず別に置くのは、あとで別々に調整するため
export const SPIDER_HP = 8;
export const SPIDER_SCORE = 250;
// 這う。初めは 1.6px で 40〜140 フレーム走り続けたが、実機で「フナムシみたい。ドローンと同じようなトリッキーな動きに。
// クモの動きを思い出して」（2026-11-23）。クモの「ダッと走る → ぴたっと止まる → 急に向きを変える」に作り直した:
// 走りはドローンのダッシュ（ENEMY_DRONE_SPEED = 4）と同じ速さで短く、止まる時間はばらつかせる
export const SPIDER_CRAWL_SPEED = 4;          // px/フレーム
export const SPIDER_RUN_FRAMES = [6, 20];     // 1回の走りの長さ（24〜80px）
export const SPIDER_PAUSE_FRAMES = [8, 45];   // 止まる長さ
// 出っ張った角を回り込むフレーム数。角を軸に体の中心が半円（半径 7√2 ≈ 9.9px、弧の長さ ≈ 31px）を描き、絵は 90° 回る。
// 初めは1フレームで側面へ移していたが「いきなり側面から上面に移るのではなく、その間を回り込むように」（2026-11-23 ユーザー指定）。
// 31px を走る速さ（4）で割った 8
export const SPIDER_CORNER_FRAMES = 8;
// へこんだ角（床から壁を登るなど）で体を起こすフレーム数。こちらは箱がその場から動かない（両方の面に接したまま）ので、
// 絵だけを回す。初めは1フレームで 90° 変えていたが「へこんだ角も滑らかに回るように」（2026-11-23 ユーザー指定）。
// 走りの勢いを止めすぎないよう、出っ張った角（8）より短い 5
export const SPIDER_CONCAVE_FRAMES = 5;
// 体を起こす間に角から斜め外へ浮かせる最大の距離（px）。その場で回すと 45° で前の足先が岩へ 2px ほど入って見えた
// （足先は絵の (6, 7)、45° 回すと面から 9.2px = 箱の半分 7 を 2.2px 越える）ので、その分だけ浮かせる
export const SPIDER_CONCAVE_LIFT = 2.5;
export const SPIDER_TURN_CHANCE = 0.35;       // 自機が見えないとき、止まったあと向きを変える確率
// 走り終わりに止まらず、すぐ逆へ走り出す（クモの急な切り返し）確率
export const SPIDER_JINK_CHANCE = 0.3;
// 自機が見えたら、ドローン（ENEMY_DRONE_HOVER_DIST_X/Y）と同じく自機から間合いを取った所へ走り寄る。
// 床・天井では横に ENGAGE_DIST_X 離れた所、壁では自機より ENGAGE_DIST_Y 上（頭上へ撃ちやすい）。
// 行き先は毎回 ±JITTER/2 ずらす（同じ所に居座らない）。DEADBAND より近ければ着いたとみなし、その場で切り返す
export const SPIDER_ENGAGE_DIST_X = 160;
export const SPIDER_ENGAGE_DIST_Y = 120;
export const SPIDER_ENGAGE_JITTER = 100;
export const SPIDER_SEEK_DEADBAND = 12;
// 小ジャンプ。初めは面から真上に離れる跳び方だったが「横飛びの感じで」（2026-11-23 ユーザー指定）。
// 進む向きへ HOP_SIDE_SPEED、面から離れる向きへ HOP_SPEED で跳び、重力は張り付いている面の向き（天井なら上向き）に掛ける。
// 宙にいるのは 2 × 1.6 / 0.18 ≈ 18 フレーム、横へ ≈ 57px（3.5 タイル）、高さ ≈ 1.6² / (2 × 0.18) ≈ 7px。
// 走り終わりが前より短い間隔で来るので、確率は 0.3 → 0.2 に下げた
export const SPIDER_HOP_CHANCE = 0.2;
export const SPIDER_HOP_SPEED = 1.6;
export const SPIDER_HOP_SIDE_SPEED = 3.2;
export const SPIDER_HOP_GRAVITY = 0.18;
// 撃ったあとに横跳びで逃げる確率（ドローンの「撃ったらすぐ離れる」）。向きは左右半々
export const SPIDER_HOP_AFTER_FIRE_CHANCE = 0.5;
// 糸（床 ⇄ 天井）。床から天井へは小ジャンプで届かないので、真上へ糸を撃ってたぐって登る。
// 天井からは糸を垂らして降りる（ユーザー案、2026-11-22）。糸は切れない（見た目だけ）
// 床・天井で走り終わりに糸で移る確率（小ジャンプより先に引く）。走りを短くして走り終わりが約 3 倍の頻度で来るので、
// 0.25 → 0.08 に下げて、糸を使う頻度を前と同じくらい（10 秒に 1 回ほど）に保った
export const SPIDER_THREAD_CHANCE = 0.08;
export const SPIDER_THREAD_MAX_TILES = 10;    // 糸が届く真上・真下の面までの距離
export const SPIDER_THREAD_SHOOT_FRAMES = 8;  // 糸が伸びて届くまで（この間は止まっている）
export const SPIDER_THREAD_CLIMB_SPEED = 1.2; // たぐって登る
// 垂らして降りる（重さで降りるので登りより速い）。初めの 1.6（登りの 1.3 倍）では差が見えず、「降りるスピードは
// 登るより速くしていい」（2026-11-23 ユーザー）ので 3.0（2.5 倍）に。高さ 8 タイルの部屋で登り 95・降り 39 フレーム（前は 72）
export const SPIDER_THREAD_DESCEND_SPEED = 3.0;
// 跳び移り（壁 ⇄ 向かいの壁）。糸は真上・真下にしか張らないので、壁どうしは直線で跳ぶ
export const SPIDER_LEAP_CHANCE = 0.1;   // 糸と同じ理由で 0.25 → 0.1
export const SPIDER_LEAP_MAX_TILES = 5;
export const SPIDER_LEAP_SPEED = 4;
// 跳んでいる時間の上限。壁の小ジャンプで横向きの重力のまま面の外へ出ると戻ってこないので、超えたら普通に落とす
export const SPIDER_AIRBORNE_MAX_FRAMES = 90;
// 小ジャンプの上限。最終レビューの実測で、壁・天井の小ジャンプが面の端を越えると戻る面が無いまま 90 フレーム
// 加速し続け、最大 554px 横へ流れていた。往復に 5 フレームだけ足した値にする（縦跳びのころは 27 + 5 = 32、
// 横跳びにして往復 18 なので 23）
export const SPIDER_HOP_MAX_FRAMES = 23;
// 足場を失ったときの落下（世界の下向き）
export const SPIDER_FALL_GRAVITY = 0.25;
export const SPIDER_FALL_MAX = 6;
// 糸の色。霧の面（6面）で見えるよう白に寄せ、背景の工場の線と紛れないよう半透明にした
export const COLOR_SPIDER_THREAD = 'rgba(235, 240, 255, 0.7)';
// 撃つ。自機が見えていて（霧の倍率込み）、弧が途中で岩に当たらないとき。撃つ前に一瞬止まって予備動作を見せる
export const SPIDER_SIGHT_RANGE = 500;        // 横半径（sightScaleFor を掛ける）。弧の平地の最大到達距離 625 より内側
export const SPIDER_FIRE_INTERVAL = 180;      // 3秒（ドローンは2秒。弾1発の圧が大きいので長めにした）
export const SPIDER_FIRE_RETRY = 30;          // 撃てなかったときのやり直し
export const SPIDER_FIRE_WINDUP = 20;         // 撃つ前に止まる
export const SPIDER_MUZZLE_OFFSET = 6;        // 発射点＝体の中心から面と反対側へ何 px
// 弾（ブラグ・ザカートのような弾）。緩やかな放物線（ユーザー指定）。
// 速さは初め 8（「グレネードより速く」）→ 実機で「速すぎる。5px 程度に」→ 5 → また「速すぎる。4px 位で」→ 4（2026-11-23）。
// 速さだけ下げると平地の届く距離 v²/g が縮み、撃つ距離 500 の大半で「届かないので撃たない」になるので、
// 重力もいっしょに下げて届く距離を 600 余りに保つ（8/0.10 = 640、5/0.04 = 625、4/0.026 = 615）
export const SPIDER_SHELL_SPEED = 4;
export const SPIDER_SHELL_GRAVITY = 0.026;
// 狙う点＝自機の中心から何 px 上。弧の形を決める点で、ふつうはそこへ着く前に SPIDER_SHELL_BURST_RANGE で割れる。
// 経緯: 80（近すぎ）→ 140（遠すぎ）→ 120 と「狙いの点で割れる」高さを調整していたが、実機で
// 「狙い目は頭上 50px 位、140px まで近づいたら破裂して5発に。頭上というより少し高めの位置から射出される感じ」
// （2026-11-23 ユーザー指定）。頭の上端の 50px 上 ＝ 中心から 50 + 自機の高さの半分 12 = 62。
// 低い点なので、天井の低い通路で狙いを下げていく仕組み（以前の AIM_ABOVE_MIN / AIM_STEP）は要らなくなった
export const SPIDER_SHELL_AIM_ABOVE = 62;
export const SPIDER_SHELL_LIFETIME = 240;
// 半径。普通の敵弾（2）より大きくして、霧の中で見えるようにした。球に見せるため 4 → 5 としたが、
// 実機で「弾自体が大きすぎ」（2026-11-23）で 3.5。見た目と自機への当たりの半径（迎撃は SPIDER_SHELL_INTERCEPT_RADIUS で別）
export const SPIDER_SHELL_RADIUS = 3.5;
// 見た目は深紫の球（ユーザー指定、2026-11-22）。左上のハイライト → 地の深紫 → 影 → 暗い縁の放射グラデーションで立体に見せる。
// 初めのハイライト #C9A2FF・地 #4A1678 は「明るすぎる。もう少し暗く、立体感をしっかり」（2026-11-23）だったので、
// 全体を暗くし、地と縁の間に影の段（SHADE）を足して、光の当たる側と影の側の差をはっきりさせた
export const COLOR_SPIDER_SHELL_HIGHLIGHT = '#9E74D8';
export const COLOR_SPIDER_SHELL_BODY = '#3B0E66';
export const COLOR_SPIDER_SHELL_SHADE = '#1F0640';
export const COLOR_SPIDER_SHELL_RIM = '#07010F';
// 破裂の閃光の縁の色（割れた5発は普通の敵弾なので、この色は使わない）
export const COLOR_SPIDER_SHELL = '#9C5CFF';
// 破裂の点滅（割れる何フレーム前から）と、その色（地の深紫をこの色に入れ替えて光らせる）。
// 暗くした球に合わせて #E6D4FF → #8C52D6 に落としたが、地との明るさの比が 2.9 しかなく「明滅をもう少し目立つように」
// （2026-11-23 ユーザー）。点くときだけの色なので明るいラベンダー #C9A2FF（比 7.2）に上げ、20 → 30 フレーム前から点滅させる。
// 点いたフレームは光の輪も BLINK_GLOW_ALPHA まで明るくする（ふだんの脈打ちは GLOW_ALPHA の淡いまま＝お手玉に戻さない）
export const SPIDER_SHELL_BLINK_FRAMES = 30;
export const COLOR_SPIDER_SHELL_BLINK = '#C9A2FF';
export const SPIDER_SHELL_BLINK_GLOW_ALPHA = 0.75;
// 球の周りの光の輪（「もう少し目立つように。明滅させるもヨシ」2026-11-23 ユーザー指定）。球は暗いまま、周りを紫に光らせ、
// 明るさを GLOW_ALPHA の範囲で GLOW_PERIOD フレームごとに脈打たせる。割れる直前（BLINK_FRAMES）は 3 倍の速さで脈打つ。
// 初めの半径 11・明るさ 0.25〜0.8 は「フレアが明るすぎて、弾というよりお手玉みたい」（2026-11-23）。大きくぼんやり光る円が
// 球そのものに見えていたので、輪は球のすぐ外（半径 6 ＝ 球 3.5 の外 2.5px）にまとわせ、一番明るいときも 0.45 に抑えた
export const COLOR_SPIDER_SHELL_GLOW = '#B57CFF';
export const SPIDER_SHELL_GLOW_RADIUS = 6;
export const SPIDER_SHELL_GLOW_PERIOD = 24;
export const SPIDER_SHELL_GLOW_ALPHA = [0.1, 0.45];
// 破裂。次のどれかで割れる（2026-11-23 ユーザー指定で作り直し）:
//   1. 自機の中心から BURST_RANGE まで近づいた  2. 狙いの点に着いた  3. 地形・建物に当たった・寿命
// 1 は外から内へ入ったときだけ。撃った時点ですでに内側（壁の上など自機に近いスパイダー）なら、足元で割れないよう
// 狙いの点まで飛ばす。以前の「頭の真上（横 14px 以内）・頭上 80px 以上で割る」判定は、この距離の判定に置き換えた
export const SPIDER_SHELL_BURST_RANGE = 140;
// 割れたら5本の糸（entities/SpiderWeb.js）を自機へ向けて扇に広げる。初めは5発の普通の敵弾だったが、
// 「5発の弾よりも Web を射出してプレイヤーの動きを邪魔する方が面白い」「5発の弾を5本の糸に。点線で、
// 絡む感じが出るよう横糸も」（2026-11-23 ユーザー指定）。当たるとダメージは無く、しばらく動きが遅くなる
export const SPIDER_WEB_STRANDS = 5;
// 扇の全幅。5発の弾のころの 60° のままだと、横糸で埋まった扇は 140px 先で幅 147px になり、自機の横の速さ（1.75）では
// 糸が届く約 41 フレームの間に外へ出られない。40° なら 140px 先で幅 102px、真ん中からでも外へ出るのに約 29 フレーム
export const SPIDER_WEB_SPREAD = 40 * Math.PI / 180;
// 糸が伸びる速さ（px/フレーム）。初めは速く、伸びた長さに比例して遅くなり、伸び切る手前で END
// （2026-11-23 ユーザー指定「初速は速く、徐々に遅くなる方がそれっぽい」。それまでは 3 の一定）。
// 5 → 1 で、割れる距離 140px に届くのは 41 フレーム（一定 3 のころは 47）、伸び切る 200px までは約 80 フレーム。
// 網全体が扇の向きへ流れる（DRIFT）のを足したとき、START 5 のままだと真横で 41 → 32 フレームに早まった。
// 「今の届くまでの時間を保ちたい。あまり速いとストレスフル」（ユーザー）なので 4 に下げ、5方向とも前と ±1 フレームに戻した
// （真横 40・斜め上 32・真上 29。tests/spider-web.test.js の REACH_FRAMES）。
// 扇の真ん中から外へ逃げる約 29 フレームより長く残す（SPIDER_WEB_SPREAD のコメント）
export const SPIDER_WEB_SPEED_START = 4;
export const SPIDER_WEB_SPEED_END = 1;
export const SPIDER_WEB_MAX_LENGTH = 200;     // 伸び切る長さ。割れる距離 140 の自機に届き、その先 60px まで
export const SPIDER_WEB_RING_STEP = 24;       // 横糸の間隔（中心からの距離）
// 伸び切ってから薄れて消えるまで（薄れている間も当たる）。30 では「急に消える」（2026-11-23 ユーザー）ので、
// 沈みながらゆっくり消える 45 に
export const SPIDER_WEB_FADE_FRAMES = 45;
// 柔らかい布のように降り注ぐ見た目（2026-11-23 ユーザー指定「柔らかな布のような糸が降り注いでくる感じ」）。
// 糸はまっすぐでなく、中心からの距離の2乗で下へ垂れる（伸び切った 200px の先で DROOP、140px で約 12px）。
// 垂れるぶんは扇を少し上へ向けて打ち消す（SpiderWeb.aimAngle。打ち消さないと真ん中の糸が足元へ外れる）
export const SPIDER_WEB_DROOP = 24;
export const SPIDER_WEB_FLUTTER = 2;          // 糸に沿って揺れる波の振れ幅（先ほど大きい。px）
export const SPIDER_WEB_NODE_STEP = 12;       // 曲がった糸を折れ線にする刻み（px）。当たりと描画が同じ折れ線を使う
export const SPIDER_WEB_CROSS_SAG = 3;        // 横糸の真ん中のたるみ（px）
// 沈む速さ（px/フレーム）。割れた瞬間から起点ごと沈む（2026-11-23 ユーザー指定。初めは薄れている間だけ）。岩の中へは沈まない。
// 140px 先の自機に届くまでに約 25px 沈むので、そのぶん扇を上へ向ける（SpiderWeb.aimAngle）＝上から降り注ぐ
export const SPIDER_WEB_SINK_SPEED = 0.6;
// 網全体が扇の向き（自機へ）へ流れる勢い（2026-11-23 ユーザー指定「扇の方向に慣性が働きつつ、下方向に sink する方が自然」）。
// 割れた瞬間 DRIFT_SPEED px/フレームで、毎フレーム DRIFT_DECAY 倍に弱まる（合計で約 21px 前へ流れて止まる）。
// 投げた網は全体が前へ進みながら広がる。流れを足す前は起点が割れた点から真下へ落ちるだけで、網の後ろが宙に留められて見えた
export const SPIDER_WEB_DRIFT_SPEED = 1.5;
export const SPIDER_WEB_DRIFT_DECAY = 0.93;
// 自機に当たったら消さずに、機体へ覆い被さるように縮んで消える（ユーザー指定）。その間に自機の側の糸が育つ
export const SPIDER_WEB_WRAP_FRAMES = 16;
// 機体にまとわりつく糸（player/draw.js の _drawWeb）。中心から放射状の SPOKES 本と輪。
// 半径は残り時間に比例して CLING_RADIUS から CLING_MIN_RADIUS まで縮む（振りほどくほど小さく。ユーザー指定）
export const SPIDER_WEB_CLING_RADIUS = 18;    // 機体 16×24 の対角の半分 14.4 を少し越えて覆う
export const SPIDER_WEB_CLING_MIN_RADIUS = 6;
export const SPIDER_WEB_CLING_SPOKES = 6;
export const SPIDER_WEB_CLING_DRAG = 2;       // 動いた向きの反対へ糸の先が引きずられる量（速さ1あたり px）
export const SPIDER_WEB_JOLT_FRAMES = 8;      // 揺さぶった瞬間に糸がはねる長さ
// 揺さぶって振りほどくたびに、糸の切れ端（SpiderWeb.js の WebScrap）が機体のまわりから飛び散る（2026-11-23 ユーザー指定）。
// 外へ SCRAP_SPEED で飛び、空気に押されてすぐ遅くなり（DRAG）、軽くふわっと落ちながら（GRAVITY）薄れて消える
export const SPIDER_WEB_SCRAPS = 4;           // 1回の揺さぶりで飛ぶ切れ端の数
export const SPIDER_WEB_SCRAP_SPEED = 2.2;
export const SPIDER_WEB_SCRAP_DRAG = 0.93;
export const SPIDER_WEB_SCRAP_GRAVITY = 0.05;
export const SPIDER_WEB_SCRAP_LENGTH = 7;     // 切れ端の長さ（px）
export const SPIDER_WEB_SCRAP_LIFETIME = 36;
export const SPIDER_WEB_DASH = [3, 3];        // 点線（ユーザー指定）の線と隙間
export const COLOR_SPIDER_WEB = 'rgba(235, 240, 255, 0.85)';   // 糸（COLOR_SPIDER_THREAD）と同じ白、少し濃く
// 絡まった自機。横の速さと上へ昇る速さを SLOW 倍に抑える（ダメージは無い）。左右の入力の向きを変えるたびに
// SHAKE_FRAMES ずつ早く取れる（もがいてほどく）。もう一度当たると最初からやり直し（足し算はしない）
export const SPIDER_WEB_ENTANGLE_FRAMES = 150;
export const SPIDER_WEB_SLOW = 0.4;
export const SPIDER_WEB_SHAKE_FRAMES = 20;
export const SPIDER_SHELL_BURST_FLASH_RADIUS = 14;
// 撃ち落とし。MG は跳ね返す（壊れない）、自機のミサイル・グレネードで壊れる（ユーザー指定）。
// 当たりの距離² は誘導ミサイルの迎撃と同じ流儀。点は誘導ミサイルの撃ち落とし（HOMING_INTERCEPT_SCORE）と同じ
export const SPIDER_SHELL_INTERCEPT_RADIUS_SQ = 100;
export const SPIDER_SHELL_SCORE = 20;

// --- Enemy Turret (Stationary) ---
export const ENEMY_TURRET_HP = 30;              // About 2 missiles
export const ENEMY_TURRET_WIDTH = 24;
export const ENEMY_TURRET_HEIGHT = 24;
export const ENEMY_TURRET_SIGHT_RANGE = CANVAS_WIDTH * 0.5;
export const ENEMY_TURRET_SCORE = 200;
export const ENEMY_TURRET_BURST_COUNT = 5;      // Bullets per burst
export const ENEMY_TURRET_BURST_DELAY = 10;     // Ticks between burst shots
export const ENEMY_TURRET_COOLDOWN = 120;       // Ticks between bursts (2 seconds)
export const ENEMY_TURRET_MISSION = 2;          // 3面から
// 砲身を回す速さ（ラジアン／フレーム）。以前は自機を見つけた瞬間に砲身が跳んでいたのを、
// 今の向きから一定の速さで回してから撃つようにした（ユーザー指定 2026-11-05）。
// 0.04 = 約2.3度／フレーム。真横から真横へ（半回転）で約79フレーム＝newtype で約1.3秒。
// 自機が 300px 先にいれば 1フレームに 12px ぶん追えるので、自機の最高速（3.5px 前後）なら置いていかれない
export const ENEMY_TURRET_TURN_SPEED = 0.04;
// 反射ビーム砲の砲身。まずは機関砲と同じ値（別々に調整できるよう定数は分けておく）
export const REFLECT_BEAM_TURN_SPEED = 0.04;
// 撃ち始めてよい砲身のずれ（ラジアン）。0.05 = 約3度。これより外れている間は回すだけで撃たない
export const ENEMY_TURRET_AIM_TOLERANCE = 0.05;
// 5面からは機関砲の砲台だけ1回に8発（反射ビームの砲台は常に単発 = spec.burst）
export const ENEMY_TURRET_LATE_BURST_MISSION = 4;
export const ENEMY_TURRET_LATE_BURST_COUNT = 8;
// 7面からは砲台の並びの偶数番目を反射ビームに差し替える（SpawnManager.spawnEnemies）
export const BEAM_TURRET_MISSION = 6;

// --- 反射ビームキャノン（7面。タレットの半分を差し替える） ---
// 母艦レーザー（BASE_LASER_*）とは別物。あちらは速度12の直線で地形を貫通する。
// こちらは遅く跳ね返るのが主眼で、見てから避けられる速さにしてある。

// 実機で「遅い」と言われて 4 → 5。タイル16px に対して3.2倍の余裕があるので
// 1フレームで壁を飛び越すことはない
export const REFLECT_BEAM_SPEED = 5;

// 帯は「節を積み上げ、節ごとに寿命で消える」形にしてある。固定長で切り出す
// 方式だと、節が反射の折れ点をまたいだときに角をショートカットする直線になり、
// 反射のたびに帯が角でがたついて見えた（実機で指摘された）
export const REFLECT_BEAM_SEGMENT_FRAMES = 2;  // 1節を閉じるまでのフレーム数。速度5なので1節=10px
export const REFLECT_BEAM_SEGMENT_LIFE = 16;   // 1節の寿命。80px(8節)ぶん生きる

// 1回の攻撃を2連弾にする。当初は同時に扇型（±15度）で2本撃っていたが、
// ユーザーから「いきなり2本同時ではなく2連弾にして、2発目は撃つ時点の自機の
// 位置へ狙い直してほしい」と指示された。_updateAiming() が毎フレーム
// currentAngle = targetAngle（即時照準）で自機を向いているので、間隔を空けて
// 撃つだけで2発目は自動的にその瞬間の自機の位置を向く。角度の違いは
// 「狙い直し」から生まれるので、固定の扇（SPREAD）はもう要らない
export const REFLECT_BEAM_SHOT_COUNT = 2;  // 扇の本数ではなく連射数（EnemyTurret の burst）

// 2連弾の間隔。自機が意味のある距離を動ける長さにする。短すぎると2発目が
// ほぼ同じ方向になり「狙い直している」感じが出ず、長すぎると2連弾に聞こえない。
// gun 型の連射間隔（ENEMY_TURRET_BURST_DELAY = 10）より意図的に長い
export const REFLECT_BEAM_BURST_DELAY = 24;  // 0.4秒

export const REFLECT_BEAM_WIDTH = 5;            // 母艦レーザーは6

// 実質「制限しない」。地形の隙間に挟まって動けなくなったときの安全弁
// （反射を繰り返しても抜けられない場合）としては、20回＝20フレームぶん粘って
// から消えることになるが、上限があること自体は変わらないので破綻はしない
export const REFLECT_BEAM_MAX_BOUNCES = 20;

// 寿命はフレーム数で決める。以前は距離（進んだpx数）で決めていて、
// 「速度5なら240フレーム、速度8なら150フレーム」のように**速度を上げると
// 寿命（生きている時間）まで短くなり、1つの値が2つの意味（速さと寿命）を
// 持っていた**。ticks なら速度を変えても生きている時間は変わらず、届く距離
// だけが変わるので、調整するときに値の意味が1つに戻る
export const REFLECT_BEAM_MAX_TICKS = 240;      // 4秒
export const REFLECT_BEAM_DAMAGE = 20;          // 敵弾10・ホーミング20。自機HP100で5発
export const REFLECT_BEAM_MUZZLE_FLASH_FRAMES = 12; // 0.2秒
// 砲身の先端から広がる光の半径。ビームの根元に隠れない大きさが要る
export const REFLECT_BEAM_MUZZLE_FLASH_RADIUS = 18;

// 芯が白っぽい紫、外へ向かって暗紫。母艦レーザー（エメラルド #00FFAA）と
// 一目で区別できるようにする。**hex で書くこと**（lerpColor が parseInt する）
export const COLOR_REFLECT_BEAM_CORE = '#F2E6FF';
export const COLOR_REFLECT_BEAM_MID = '#B266FF';
export const COLOR_REFLECT_BEAM_EDGE = '#3B0F6B';

// 被弾スパーク。「レーザーに当たったときの反応が地味で判りづらい」という
// 実機フィードバックへの対応。ビーム本体と同じ色域にして、何に当たったのかが
// 一目で分かるようにする（通常被弾の黄色系スパークと取り違えないため）
// 実機で「もっと明るいスパークの方が良い」と指摘され、3色とも明度を上げた
// （旧: #F2E6FF / #C77DFF / #B266FF）。いちばん暗かった #B266FF は暗い地形の
// 上では沈んで見えなかった。白を1色混ぜて芯の明るさを出しつつ、残り2色で
// 紫であること（＝ビームに当たった）は保つ
// これは**出た瞬間**の色。時間が経つと COLOR_BEAM_SPARK_FADE へ寄っていく
export const BEAM_SPARK_COLORS = ['#FFFFFF', '#FBF0FF', '#F0DDFF'];
// 寿命の終わりに落ち着く色。「拡がるにつれて紫色になっていく」という指定への
// 対応で、出た瞬間は白く熱く、離れるにつれて冷めてビームの紫になる、という
// 見立て。始点の3色を白寄りに振り直したのはこの移り変わりの幅を取るため
// （始点が既に紫だと、どこで紫になったのか読めない）
export const COLOR_BEAM_SPARK_FADE = '#A64DFF';
// 粒の一辺。通常のスパークは 2。明るさは色だけでなく面積でも決まる。
// 3 から更に「もう少し大きめに」という指定で 4。破片(DebrisPart)は最小辺 1.4px
// から数十pxまで幅があるので大きさだけでは区別できないが、破片は回転する
// 多角形で色も機体色なので、紫の正方形とは取り違えない
export const BEAM_SPARK_SIZE = 4;

// --- 装甲に弾かれた跳弾（artillery のように mgDamageMult を持つ敵に MG が当たったとき）---
// 「効いていない感」を音と光で伝えるための演出。ダメージは別に入っている
// （0 ではない）ので、完全に弾く周回シールドの shieldDeflect とは分けてある。
//
// 初回の実装（2本・8px・太さ1.5）は実機で「地味すぎる」と言われた。
// 反射ビームの被弾でまったく同じ指摘を受けたときの手当てをそのまま持ってきて、
// 本数・長さ・太さを上げたうえで**命中点の閃光**を足してある。線は散らばって
// 視界の端では拾えないが、1点で光る閃光は拾えるため。
export const RICOCHET_STREAK_COUNT = 4;      // 1回の命中で走る光の本数（2 → 4）
export const RICOCHET_STREAK_LENGTH = 8;     // 線の長さ px（8 → 14 → 8 に差し戻し。長いと尾を引いて見えた）
export const RICOCHET_STREAK_SPEED = 5;      // 飛ぶ速さ px/frame（3.5 → 5）
export const RICOCHET_STREAK_LIFETIME = 9;   // frames。一瞬で消えないと火花に見える
export const RICOCHET_STREAK_WIDTH = 2;      // 線の太さ px（1.5 → 2.5 → 2）
export const RICOCHET_SPREAD = 1.1;          // 跳ね返る向きのばらつき rad
export const COLOR_RICOCHET = '#FFFFFF';     // 出た瞬間（白く熱い）
export const COLOR_RICOCHET_FADE = '#FFD11A'; // 冷めた先（黄。#FFE066 だと白に近すぎた）
// 命中点の閃光。ImpactFlash を使い回す（反射ビームの被弾と同じ部品）。
// 反射ビームの 14 より大きいのは、あちらが1発ずつなのに対しこちらは
// 連射の中の1発で、周りに MG の弾道が走っていて埋もれやすいため
export const RICOCHET_FLASH_RADIUS = 18;
export const COLOR_RICOCHET_FLASH_CORE = '#FFFFFF';
export const COLOR_RICOCHET_FLASH_RING = '#FFC400';
// 音の間引き。MG は PLAYER_MG_BURST_DELAY(4フレーム) ごとに1発＝毎秒15発なので、
// 当たるたびに鳴らすと雑音になる。0.2秒に1回だと耳には「カン！カン！カン！」と
// 3〜4連に聞こえる。光の方は間引かない（弾は出続けているので毎発光ってよい）
export const RICOCHET_SOUND_INTERVAL_MS = 200;
// 通常のスパークは3〜5個。倍以上にしないと「走った」感じが出なかった。
// 14 でもまだ「地味すぎて見えない」と実機で指摘されたので 28 へ倍増し、
// 速度と寿命も上げた（散る範囲が広がるぶん、1粒あたりの見つけやすさが上がる）
export const BEAM_SPARK_COUNT = 28;
export const BEAM_SPARK_SPEED_MIN = 2.0;   // 通常1.5。勢いよく弾けさせる
export const BEAM_SPARK_SPEED_MAX = 6.5;   // 通常4.0。5.0 から更に上げた
export const BEAM_SPARK_LIFETIME = 22;     // 通常10〜19。18 から更に伸ばして尾を長く見せる

// 被弾点の閃光。粒を増やすだけでは「一瞬の出来事」が視界の端で拾えないので、
// 既存の ImpactFlash（命中の合図に使う小さく硬い光）を紫で1つ出す。
// 爆発(playBlast)ではないので音は付いてこない ＝ 効果音は別に選べる。
// 半径はミサイル着弾(IMPACT_FLASH_RADIUS=18)より小さく、マシンガン(6)より
// 大きい 14。自機を覆い隠さず、それでいて必ず目に入る大きさ
export const BEAM_SPARK_FLASH_RADIUS = 14;
// リングは砲台のランプの明るい紫。被弾の光と、撃ってきた砲台とが同じ色域で
// 結びつく。芯は当初ビーム本体と同じ #F2E6FF にしていたが、「もっと明るく」
// という指摘を受けて純白へ。加算合成(lighter)で描くので芯は白がいちばん強い
export const COLOR_BEAM_HIT_FLASH_CORE = '#FFFFFF';
export const COLOR_BEAM_HIT_FLASH_RING = '#C77DFF';

// タレットの半分を差し替える反射ビームキャノン本体（EnemyTurret の beam 型）
export const REFLECT_BEAM_CANNON_HP = 40;        // タレット30より硬い（自機ミサイル3発）
export const REFLECT_BEAM_CANNON_SCORE = 350;    // タレット200より高い

// 冷却時間は廃止した。ユーザーから「冷却時間は不要で、充填で連続して打ってくる
// ような感じにしてほしい」と指示され、`cooldown` 状態そのものを通らなくした
// （EnemyTurret.js の beam 型は撃ち終わったら 'idle' に戻り、cooldownTimer を
// 「次弾までの充填」として使い回す）。パイロットランプで進み具合を見せることで
// 「そろそろ撃つ」が読めるようにし、待ち時間そのものに意味を持たせる方針にした。
//
// 固定の周期だとリズムを読み切られるため、1発ごとにこの範囲から選び直す
// （Math.random() を使う。game.rng を使うと週次の決定性が壊れるため厳禁）。
// 中央値は旧・冷却時間だった180に合わせ、そこから REFLECT_BEAM_CHARGE_MIN/MAX の
// 幅を持たせた
export const REFLECT_BEAM_CHARGE_MIN = 180;  // 3.0秒
export const REFLECT_BEAM_CHARGE_MAX = 240;  // 4.0秒

// 2連弾の2発目だけに足す、小さな角度のずれ。自機が止まっていると
// _updateAiming() の「狙い直し」が効かず、2発とも同じ線に乗ってしまう
// （実機で「2連射目は少しずらした方がいい」と指摘された）。以前の同時2本の
// 扇型は±15度だったが、こちらは狙い直しと重なるぶん小さくてよい
export const REFLECT_BEAM_SECOND_SHOT_OFFSET = 8 * Math.PI / 180;  // 8度

// 2発目には小さなブレを足す。左右交互のずれ(REFLECT_BEAM_SECOND_SHOT_OFFSET)だけだと
// 反射の経路が2通りに固定されてしまい、跳ね返り先が読めてしまうため（実機で
// 「2発目のブレを微妙に加えた方が反射角度が変わっていい」と指摘された）。既存の
// タレットの弾が持つ不正確さ((Math.random() - 0.5) * 0.1)と同じ大きさに揃えてある
export const REFLECT_BEAM_SECOND_SHOT_JITTER = 0.05;  // ±0.05rad ≒ ±2.9度

// 既存のタレット（#555555 / #888888 / #667788）より明るい灰色。並んだときに
// 新型だと分かるようにする
export const COLOR_BEAM_CANNON_BASE = '#AAB2BA';
export const COLOR_BEAM_CANNON_BARREL = '#D8DEE4';
// ピボット（回転軸の円）と砲口のエミッタが引く色。
// #C0C8D0 → #DDE4EB → #F2F6FA → #C8D0D8 と動かした。ほぼ白まで上げたのは
// 「もっと白く」という指摘に沿ったものだが、実機で見ると円だけが浮いて
// 砲台が「白い円に部品が生えたもの」に見えた（「白さを落として他のパーツと
// 同程度に」）。base(#AAB2BA) と barrel(#D8DEE4) の中間に置き直し、3つの
// パーツが同じ金属の別の面に見えるようにした。
// なお、白くした際にあらわになった「暗い座がピボットを塗り潰す」問題は
// BEAM_LAMP_BACK_RADIUS の側で直してある（白さを戻しても再発しない）
export const COLOR_BEAM_CANNON_PIVOT = '#C8D0D8';

// パイロットランプ（充填の進み具合を示す）。撃った直後は暗紫、充填が高まるほど
// 明るい紫に輝く。暗紫は COLOR_REFLECT_BEAM_EDGE（ビームの外周）と同じ値にして、
// 「撃ち終わった直後の砲台＝ビームの外周色」で統一感を持たせた。
// **色は必ず hex 形式で書くこと**（lerpColor() が parseInt するため。rgba() を
// 入れると '#NaNNaNNaN' になり実 canvas では無言で劣化する）
export const COLOR_BEAM_CANNON_LAMP_DIM = '#3B0F6B';
// 一度「機体の明るい灰色に埋もれるので彩度を上げる」として #B026FF（青紫寄り）に
// 変えたが、実機で「以前の白っぽい色の方が良い」と指摘され #C77DFF（白っぽい紫）
// へ戻した。埋もれる問題は COLOR_BEAM_CANNON_LAMP_BACK（暗い座）を敷くことで
// 別途解決済みなので、色そのものの彩度を上げる必要は無かった
export const COLOR_BEAM_CANNON_LAMP_BRIGHT = '#C77DFF';
// ランプ本体・輪を描く前に敷く暗い座。COLOR_BEAM_CANNON_BASE/_PIVOT が明るい灰色
// なので、紫を直接その上に乗せてもコントラストが出ない（実機フィードバック）。
// ほぼ黒に近い紫を先に塗って、その上へランプの色を重ねることでインパクトを出す
export const COLOR_BEAM_CANNON_LAMP_BACK = '#1A0A2E';

// 充填リングの軌道。ランプの中（半径6px）では動く距離が短すぎて「波が中心へ
// 寄る」と読めず、ただの明滅に見えた（実機で指摘された）。砲台の外側から
// 胴体の縁まで収束させることで、距離を稼いで動きを読めるようにする
// 22→16→13 と詰めてきた。22 は機体(24x24)より外まで輪が広がるため、砲台より
// 大きな光の輪が地形の上に重なり、「砲台の形がヘン」に見える一因になっていた
// （実機フィードバック）。
// 13 にしたのは3回目のフィードバック「リングが大きすぎて形が見えにくい」への
// 対応。ただし**主因は大きさではなく描画順**だったので、輪を砲台の実体より先に
// 描くように変えてある（EnemyTurret._drawChargeRings()）。輪は機体に隠れ、
// 機体の半径12のすぐ外へはみ出した弧だけが見える。13 はその「はみ出し」を
// 1px の細い弧に留める値で、これ以上大きいと隠れる意味が薄れる。
// 6 はランプの座(半径7)の内側で、輪が最後にランプへ吸い込まれて見える終点
export const BEAM_LAMP_RING_OUTER = 13;
export const BEAM_LAMP_RING_INNER = 6;
// 砲身より一段暗くして、線として見えるようにする。冷却フィン（ラジエーター）で
// 輪郭に凹凸を出し、既存のタレットと形でも見分けられるようにするためのもの
export const COLOR_BEAM_CANNON_FIN = '#8A939C';

// --- 開始地点のまわりの安全圏 ---
// 開始地点（母艦に乗った自機の中心）からこの半径の内側には敵を置かない（地雷は別）。2026-11-23 ユーザー指定。
// 地図の生成の除外（左上 20×16 タイルの矩形）だけでは、20シード×7面で 9体が 200px の内側にいた（最も近くて 96px）。
// 開始地点は地図を作った後に決まるので、SpawnManager.spawnEnemies が置いた後に、内側の敵を外の「その敵が置ける一番近い場所」へ
// 移す（systems/startSafeZone.js。乱数を使わず地図だけで決める＝game.rng を引く回数は変えない）。初めは外していたが、
// 週によって敵の数が減る（20シード×7面で 140 面中 8 面、1〜2体）ので「移すほうがいい」（同日ユーザー）
export const START_SAFE_RADIUS = 200;

// --- 敵の被弾ノックバック（反動） ---
// 敵AIは毎tick自分で vx/vy を代入し直す型が多い（EnemyTank の巡回など）。
// 速度を書き換えるだけでは次のフレームで消えるので、この時間だけ敵側の
// 移動制御を止めて反動を成立させる。射撃は止めない（自機の着地スタンと同じ考え方）。
export const ENEMY_RECOIL_FRAMES = 18;
// 自機の被弾ノックバック（反動）。2026-11-23 ユーザー指定「敵のアタッカーと同じように自機も被弾したときにノックバック」。
// 速度は前から applyKnockback で書き換えていたが、次のフレームで左右の入力（±MAX の代入）と地面の摩擦に消されて
// ほとんど飛ばなかった。アタッカーと同じ長さだけ、左右の入力と摩擦を止める（ホバーは止めない＝穴・水の上で立て直せる）
export const PLAYER_RECOIL_FRAMES = ENEMY_RECOIL_FRAMES;

// 機体ごとの吹き飛び方。重い機体ほど動かない。破片の weight と同じ考え方。
export const ENEMY_RECOIL_PROFILES = {
    drone: { vx: 3.0, vy: -2.5 },      // 軽い。よく飛ぶ
    rival: { vx: 2.6, vy: -2.4 },
    standard: { vx: 2.0, vy: -2.0 },
    artillery: { vx: 1.6, vy: -1.6 },
    tank: { vx: 1.0, vy: -1.0 },       // 重い
    heavy: { vx: 0.8, vy: -0.8 },      // 最も重い
};

export const MISSILE_HIT_KNOCKBACK_VY = -2;
export const MISSILE_HIT_KNOCKBACK_VX = 1.5;

// --- 命中時のダメージ ---
// CollisionManager が当たり判定と一緒に private な定数として抱えていたもの。
// 弾の速さや射程は上のほうに、威力だけが別ファイルにある状態だったので、
// 火力を触るのに2箇所を見る必要があった。実際に効いている値をそのまま移す。
// 名前は「何の・ダメージ・誰へ」の順（PLAYER_MG_DAMAGE / ENEMY_DRONE_KAMIKAZE_DAMAGE_PLAYER と同じ）。
// 以前は DAMAGE_ が頭に付いていて、ここの5つだけ並びが違った（2026-11-04 に揃えた）
export const CRUISE_MISSILE_DAMAGE = 40;          // 巡航ミサイルの直撃
export const ENEMY_HOMING_MISSILE_DAMAGE = 20;    // 誘導ミサイルの直撃
export const PLAYER_MISSILE_DAMAGE = 15;          // 自機ミサイル → 敵
export const ENEMY_MISSILE_DAMAGE_PLAYER = 15;    // 敵ミサイル → 自機（rival は2倍）
export const ENEMY_MISSILE_DAMAGE_CARRIER = 10;   // 敵ミサイル → 母艦（同上）

// --- 飛来するミサイルの迎撃 ---
// 自機の弾で撃ち落とせる距離と、成功したときの得点。
// 距離は二乗で持つ（毎フレーム全弾ぶん比較するので平方根を取らない）。
export const HOMING_INTERCEPT_RADIUS_SQ = 144;   // 12px
export const CRUISE_INTERCEPT_RADIUS_SQ = 400;   // 20px。巡航ミサイルは大きいので広め
export const HOMING_INTERCEPT_SCORE = 20;        // 誘導ミサイルは1発で消える
// 巡航ミサイルの得点は CRUISE_MISSILE_SCORE（巡航ミサイルの節）
