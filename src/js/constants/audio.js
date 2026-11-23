// 音作り（ホバー音・母艦のエンジン音・敵の移動音・ステレオパン・効果音と BGM の音量）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
import { CANVAS_WIDTH } from './core.js';

// --- 母艦のエンジン音（ドッキング中だけ鳴るループ）---
// 停止時が下限、全速で下限＋幅ぶんまで上がる。
// gain は 2026-08-12 に 2段階で下げた。0.060/0.050 → -4dB → さらに -4dB で
// 合計 -8dB（停止時 0.060→0.024、全速 0.110→0.044）。ドッキング中ずっと
// 鳴っていて、この音だけで他の効果音が埋もれるという実機の判断。
// 停止時と全速の比は変えていないので、動かしたときの上がり方は元のまま。
// 回復ハム(240〜460Hz)と帯域が重ならないよう、こちらは低いまま保つこと。
export const CARRIER_ENGINE_FREQ_BASE = 46;      // 停止時の基音
export const CARRIER_ENGINE_FREQ_RANGE = 14;     // 全速で足す量
export const CARRIER_ENGINE_SUB_BASE = 23;       // 1オクターブ下の副音
export const CARRIER_ENGINE_SUB_RANGE = 7;
export const CARRIER_ENGINE_FILTER_BASE = 150;   // ローパス。開くほど荒くなる
export const CARRIER_ENGINE_FILTER_RANGE = 120;
export const CARRIER_ENGINE_GAIN_BASE = 0.024;   // 停止時＝エンジンの唸り
export const CARRIER_ENGINE_GAIN_RANGE = 0.020;  // 全速で足す量＝移動時の上乗せ

export const REPAIR_HUM_FREQ_FROM = 240;    // HP 空
export const REPAIR_HUM_FREQ_TO = 460;      // 満タン直前
export const REPAIR_HUM_GAIN = 0.05;        // 鳴り続けるので単発の効果音より控えめ
export const REPAIR_HUM_WOBBLE_HZ = 7;      // 装置が働いている感じを出す揺れ
export const REPAIR_HUM_WOBBLE_DEPTH = 0.012; // REPAIR_HUM_GAIN 未満を保つこと。上回ると揺れが実効ゲインを負に振り切り位相反転する

// --- Enemy missile hit knockback (smaller than a grenade) ---
// --- ホバー音の音作り ---
// 自機・敵とも「共鳴させたノイズ」が主体。回転翼の風切り音に近い。
// 自機は RPM に追従して最大 PLAYER_HOVER_MAX_FREQ*2 = 1200Hz まで上がる。
export const PLAYER_HOVER_MAX_FREQ = 600;

// 敵は同じ音作りだが、自機と混ざっても区別できるよう性格を変えてある。
// (1) 中心を 600Hz に下げる（自機の 1200Hz のちょうど半分。耳では別物）
// (2) Q を緩めて痩せさせる（自機は 5。細く鋭いほど「自分の機体」らしい）
// (3) 中心周波数をゆっくり揺らす。自機の音は揺れないため、この「ふらつき」
//     だけで鳴っているのが敵だと分かる。ただし目立たせすぎない。
//     速さも幅も控えめにして、音色の癖として感じる程度に留める。
export const ENEMY_HOVER_NOISE_FREQ = 600;
export const ENEMY_HOVER_NOISE_Q = 3.5;
export const ENEMY_HOVER_WOBBLE_HZ = 4.5;   // 揺れの速さ
export const ENEMY_HOVER_WOBBLE_DEPTH = 70; // 揺れの幅（Hz）。中心の約12%
// 高域だけだと軽いので、低い唸りを薄く足して機体の重さを出す
export const ENEMY_HOVER_BODY_FREQ = 200;
export const ENEMY_HOVER_BODY_GAIN = 0.35;
// 主体をノコギリ波からバンドパスノイズに変えた時点で、聞こえる大きさが
// 8.9dB(A) 落ちて事実上無音になった。狭い帯域を通すと白色ノイズの
// エネルギーの大半が捨てられるため。その補正。
// 倍率は A特性の実測から決めている。中心を 760Hz から 600Hz へ下げた際に
// 聴感が 1.9dB 落ちたぶんも、ここで戻してある（2.8 → 3.5）。
// tests/hover-timbre.test.js が自機のホバー音との差を監視している。
export const ENEMY_HOVER_MAKEUP = 3.5;

// ホバー音の立ち上がりと減衰（秒）。左右非対称にしてある。
//
// 敵の hovering フラグは推進を噴いた瞬間だけ立ち、実測では滞空中の
// 12〜39% の時間、7〜45フレームの細切れでしか true にならない。左右対称の
// 0.08 秒だと噴射の切れ目ごとに音がしぼみ、平均音量が満音量の 6〜29% まで
// 落ちて「鳴っていない」ように聞こえる。
// 立ち上がりを速く、減衰を遅くすると 40〜49% まで上がる（+4〜16dB）。
export const ENEMY_HOVER_ATTACK = 0.03;
export const ENEMY_HOVER_RELEASE = 0.35;

// --- 敵アタッカーのジャンプ・着地音 ---
// 自機と同じ作り（ジャンプは掃引するノイズ、着地はノイズ＋低い一撃）だが、
// ホバー音と同じ理由で一段低くしてある。自機の音と混ざっても区別できるように。
// 自機: ジャンプ 1000→3000Hz / 着地の一撃 110〜150Hz
export const ENEMY_BURST_FREQ_FROM = 700;
export const ENEMY_BURST_FREQ_TO = 1800;
export const ENEMY_BURST_GAIN = 0.1;
// 着地音は一撃だけでなくノイズの帯域も下げる。一撃だけ下げても、上に載る
// ノイズが自機と同じままだと「低くなった」と感じにくい。
// 自機: ノイズ 700/1100Hz、一撃 110/150Hz
export const ENEMY_LANDING_NOISE_HARD = 500;
export const ENEMY_LANDING_NOISE_SOFT = 800;
export const ENEMY_LANDING_THUMP_HARD = 70;
export const ENEMY_LANDING_THUMP_SOFT = 95;

// --- ドローンの移動音 ---
// 停止・ホバリング中は無音で、突進を始めた瞬間だけ「プーーン」と鳴る。
// 高い方から低い方へ滑り落ちる下降のうなりで、AKIRA のフライング
// プラットフォームの登場音が下敷き。
//
// 音の作り: 少しずつ音程をずらした3本のノコギリ波を同時に鳴らし
// （うねりと厚みが出る＝あの独特の「ホロウ」な質感）、共鳴の強い
// ローパスを音程より一段速く下降させる。
//
// 母音は「ポ」。フィルタを常に基音の 1.8倍に置くことで第2倍音が生き残り、
// 開いた「オ」になる。基音より下まで閉じると倍音が消えて籠もった「ウ」に
// なってしまう。共鳴を Q=6.5 に留めているのも同じ理由で、Q が高いほど
// 細く詰まった音に寄る。
//
// フィルタは音程と同じ比率で下がるので、音色は最初から最後まで変わらない。
// 「ポーーン」の印象は音程が 2オクターブ落ちること自体から出ている。
// 候補を書き出して聴き比べたうえで選んだ設定（tools/render-drone-sound.mjs）。
export const DRONE_MOVE_FREQ_FROM = 620;    // 開始の音程
export const DRONE_MOVE_FREQ_TO = 160;      // 終わりの音程
export const DRONE_MOVE_DURATION = 0.9;     // 秒
export const DRONE_MOVE_FILTER_Q = 6.5;     // 共鳴の強さ。うなりの芯を作る
export const DRONE_MOVE_FILTER_MULT = 1.8;  // フィルタは音程の何倍の高さから始めるか
export const DRONE_MOVE_FILTER_END_MULT = 1.8;  // 終端。1を超えると「オ」寄りになる
export const DRONE_MOVE_DETUNE = [-11, 0, 13];  // セント。3本のずれ
// 音程を下げたぶんの聴感差を戻した値
export const DRONE_MOVE_GAIN = 0.098;
export const DRONE_MOVE_SUB_GAIN = 0.8;     // 1オクターブ下のサイン波（丸みと重さ）
// 連続で突進したときに音が重ならないよう、1体あたりの最短間隔を設ける
export const DRONE_MOVE_COOLDOWN = 40;      // フレーム
// 大きく動くときだけ鳴らす。少し動いただけで鳴ると耳につく。
// 突進距離の実測は中央値 117px（8〜243px）で、150px なら長い突進の
// 3割ほどに絞られる。
export const DRONE_MOVE_MIN_DISTANCE = 150; // px

// --- 左右の振り分け（ステレオパン） ---
// 画面端の音源がほぼ振り切るよう、可聴範囲は画面の半分に合わせる。
// ただし振り切りすぎない。等パワー則で pan=0.85 だと片側の成分が 0.118 まで
// 落ち、モノラル環境では -2.1dB 目減りして「遠くなった」と感じる。
// 0.6 なら目減りは -1.0dB で、左右差は依然 10dB あって方向は分かる。
export const AUDIO_PAN_RANGE = CANVAS_WIDTH / 2;
export const AUDIO_PAN_MAX = 0.6;

// --- 効果音のマスター ---
// 効果音は29箇所が個別に destination へ繋がっており、全体を上げる場所が
// 無かった。1本のバスに集約し、そこで持ち上げてからリミッタを通す。
// 素で 1.0 を超える音（ホバー音は 1.2）があるので、圧縮なしに上げると割れる。
export const SE_MASTER_GAIN = 1.8;
export const SE_COMP_THRESHOLD = -20;   // dB。ここから上を抑える
export const SE_COMP_KNEE = 15;
export const SE_COMP_RATIO = 4;
export const SE_COMP_ATTACK = 0.004;    // 秒。爆発の立ち上がりを潰さない速さ
export const SE_COMP_RELEASE = 0.18;
// ゲームオーバーで効果音を引くのにかける時間。ぶつ切りにすると事故に
// 聞こえるので、短く滑らかに落とす。
export const SE_FADE_OUT_SECONDS = 0.5;

// --- BGM の音量調節 ---
// 音量の刻み。役割で2段に分ける。
// 粗いほう（-/+ キー用）が 10% なのは、Input.isCharPressed() が押した瞬間しか拾わず
// 押しっぱなしで連射しないため。5% にすると最大から最小まで20回押すことになる。
// 細かいほう（設定画面用）は数字を見ながら合わせるので 5%。
export const VOLUME_STEP_COARSE = 0.1;
export const VOLUME_STEP_FINE = 0.05;
export const BGM_VOLUME_DEFAULT = 1.0;
export const BGM_VOLUME_STORAGE_KEY = 'hoverAttack.bgmVolume';
// 設定はまとめて1キーに入れる。項目を足すたびにキーが増えるのを避けるため。
export const SETTINGS_STORAGE_KEY = 'hoverattack.settings';
// 変更した瞬間だけ表示する。常時出しているとプレイの邪魔になる。
export const VOLUME_HUD_FRAMES = 120;      // 約2秒
export const VOLUME_HUD_FADE_FRAMES = 30;  // 最後の0.5秒で消える

// --- 敵のホバー音 ---
// 敵ごとにオシレーターを持つと数が増えるほど破綻するので、共有の1ループを
// **位置を持つ効果音すべてに効く**（敵ホバー音・ジャンプ音・着地音・武器の発射音）。
// 以前は ENEMY_HOVER_OFFSCREEN_* という名前だったが、敵ホバー音のために導入した
// あと共有されるようになり、名前が実態と食い違っていたので改名した。
//
// 「画面内なら満音量、画面外は縁でこの値」という割り切り。距離の2乗で減衰させて
// いたときは可聴範囲(480px)が画面の半分(512px)より狭く、画面に映っている敵が
// 既にほぼ無音だった（中心から256pxで22%）。見えている敵は聞こえるべき。
export const AUDIO_OFFSCREEN_GAIN = 0.4;
// 画面外に出てからこれだけ離れると聞こえなくなる。0 にしないと、マップの
// どこかに敵がいる限り低い唸りが鳴り続ける。
export const AUDIO_OFFSCREEN_FADE = 512;
// 画面外の減衰カーブの指数。1 = 従来の直線、2 = 下に凸（離れるほど急に落ちる）。
//
// 「画面外の音についてはもっと減衰してもいい」という実機フィードバックへの対応。
// 総攻撃モードで画面外の発砲が同時多発するようになり、1発あたりは控えめでも
// 重なると耳につくようになった。
// **縁の音量(AUDIO_OFFSCREEN_GAIN)を下げるだけにしなかったのは、画面の境界での
// 段差が広がって「画面に入った瞬間に急に鳴る」が目立つため。** 指数を上げれば
// 境界の段差はほぼそのままで、少し離れただけで大きく落ちる。
// 実測（画面の縁から外へ出た距離→dB。縁ちょうどはまだ「画面内」＝0dB で、
// 1px 外に出た時点でこの値になる）:
//   変更後 1px -8.0 / 100px -11.7 / 256px -20.0 / 384px -32.0
//   変更前 1px -6.0 / 100px -7.9  / 256px -12.0 / 384px -18.1
// **行き過ぎたと感じたら、まずここを 1 に戻せば従来の直線に戻る**（縁の音量は
// 0.4 のままなので、それでも変更前より一律 2dB 小さい）
export const AUDIO_OFFSCREEN_FALLOFF_EXP = 2;
export const ENEMY_HOVER_MAX_GAIN = 0.055;     // 最接近時の音量。自機のホバー音より控えめ
