// 水（水中の動き・地底湖・水の流れと水圧・滝・泡・波紋・しぶき）の定数。
//
// 入口は utils/Constants.js。使う側はこのファイルではなく Constants.js から import する
// （分ける前の import を1行も変えずに済ませるため。置き場が1つという約束も入口で保つ）。
// 値の根拠と経緯は各定数のコメントにある。分割は 2026-11-24、値・順序とも分割前と同じ。
import { TILE_SIZE } from './core.js';

// 水中の動き。speed は位置更新と推力に掛ける倍率、gravity は重力の倍率。
// 浮力は持たない（重力が弱いだけで、沈めば底を歩く）。実機で詰める前の初期値。
export const WATER_SPEED_SCALE = 0.5;
export const WATER_GRAVITY_SCALE = 0.3;
// 水中での最大落下速度の倍率（空気中 MAX_FALLING_SPEED に対する係数）。
// 0.42 を掛けることで、実移動量は空気中の約 0.21倍（現行の半分以下）に抑えられ、
// 自機(実速度 約1.47)・グレネード(実速度 約1.26)ともに心地よい浮力と沈降感になる。
export const WATER_FALL_SPEED_SCALE = 0.42;
// マシンガン弾（Bullet.js、自機・敵共通）が水中で受ける抗力。1フレームごとに
// vx/vy へ掛けて速度そのものを弱める（motion.speed のような「その場だけ遅くなる」
// 倍率ではない）。水中に入ったら減速し続け、水中→空中へ出た瞬間は減速済みの速度の
// まま飛び続ける（実機の指摘: 出た瞬間に元の速さへ戻るのは不自然）。
// 0.85 は減速が急すぎた（実機の指摘）ので 0.96 に緩和。初速4px/frameが
// BULLET_WATER_MIN_SPEED を下回るまで約51フレーム(0.85秒)かかる
export const BULLET_WATER_DRAG = 0.96;
// これを下回ったら「止まって漂う」のではなく自然消滅させる（実機の指摘:
// 寿命が尽きるまで水中に静止したままなのは不自然）。0.5 だと消えるまで
// 約51フレームかかり長すぎた（実機の指摘）ので 1.0 に引き上げ、約34フレーム(0.57秒)で消える
export const BULLET_WATER_MIN_SPEED = 1.0;
// 水中を進む弾の白い尾。Missile の TrailParticle と同じ仕組みに乗る（実機の指摘）
export const BULLET_WATER_TRAIL_INTERVAL = 2; // フレームおきに1個

// 地底湖の生成。低い位置のチャンバーを選び、部屋の底から数段を水にする。
export const WATER_POOL_COUNT = 3;
export const WATER_POOL_DEPTH_MIN = 3;      // 段（タイル）
export const WATER_POOL_DEPTH_RANGE = 2;    // 3〜5段（depthMin + floor(rng*(range+1)) なので range=2）
export const WATER_POOL_MAX_TILES = 600;    // これを超える塗り広がりは「部屋に閉じていない」とみなして捨てる
// 水流セル・オートマトン。1タイルを 8 段階の水量（mass）で管理する。
export const MAX_WATER_MASS = 8;
export const MIN_WATER_MASS = 1;
// 落下。以前は 4フレームに1回・最大2 で、横の流れ（毎フレーム最大4）の 1/8 しかなく、水の塊が
// 落ちきる前に横へ広がって宙に浮いた四角になり、階段や棚に居座った（2026-10-10 実機の指摘）。
// 4面・6シード×2400フレームの実測で、浮いた満水の四角は 4f/2: 682、毎フレーム/2: 206、
// 毎フレーム/4: 208、毎フレーム/8: 171。効くのは間隔で量ではないので、量は 2 のまま
export const WATER_MAX_FALL_FLOW = 2;   // 1回の落下で下のセルへ移せる最大量
export const WATER_FALL_INTERVAL = 1;   // 落下の間隔（フレーム）
export const WATER_MAX_SPREAD_FLOW = 4; // 1ステップあたりの最大水平流出量（初期のスムーズな流出速度）
// 細い流れの記録（world/waterStream.js）。落下が毎フレームだと、湧き水の粒（4フレームおきに水量1）は
// 1マス/フレームで落ち、粒と粒のあいだが3マス空く。セルの中身だけで滝を判定すると点線になって
// 点滅した（4面・6シード×2400フレームで、滝⇄滝以外の入れ替わり 43,995 → 820,474）。
// 量1で落ちたセルに記録を残し、そのあいだは空でも滝とみなす（試作で 2,770 まで減った）。
// 保持 4・5・6 で点滅は 2,774・2,778・2,780 と差が無い。記録が長いほど流れが止んだ後も滝が
// 残るので、最短の 4。湧き水の周期（WATER_SPRING_INTERVAL）より短くしてはいけない: 水源の口の
// マスは「ここから落ちた」の記録しか付かず（落ちて来る粒が無い）、それも湧き水の周期に1回だけ。
// 保持 3 だと口のマスが点滅し、点滅は 2,966→17,420、描いた帯の点滅は 4,162→18,745 に戻った
export const WATER_STREAM_HOLD_FRAMES = 4;
// 記録するのは1回に落ちた量がこれ以下のときだけ。塊は2ずつ落ちるので、絞らないと塊の通り道に
// 滝の尾が残った（幅3の縦穴を落ちる塊の上に、延べ195セル×フレーム）。絞っても細い流れの点滅は
// 2,774 → 2,770 で変わらない（細い流れはどれも量1で落ちる）
export const WATER_STREAM_MAX_FLOW = 1;
// 水圧（連通管、world/waterPressure.js）。水面より下でつながった池どうしで、高い方から低い方へ
// 1ステップ（WATER_PRESSURE_INTERVAL に1回）あたり「接続部の太さ（セル数）× round(GAIN × √水位差)」を運ぶ。
// 水位差は 1/8タイル単位。GAIN の初期値は、水位差4タイル（√32 ≈ 5.7）で 1経路あたり 2単位/4フレーム
// ＝ 0.5単位/フレームになるように選んだ。水面より上の穴1段から滝で流れ落ちる速さ（実測 0.52単位/
// フレーム、2026-10-10）とほぼ同じで、水面の上の穴と下の穴とで流れる速さの感覚が揃う。実機未確認
export const WATER_PRESSURE_GAIN = 0.35;
// これ未満の水位差では運ばない。1単位運ぶと差は2縮むので、2未満で運ぶと逆転して行き来する
export const WATER_PRESSURE_MIN_DIFF = 2;
// 1経路・1ステップあたりの上限（WATER_MAX_SPREAD_FLOW と同じ）。太い穴を開けた直後の勢いの頭打ち
export const WATER_PRESSURE_MAX_FLOW = 4;
// 水圧で運ぶ間隔（フレーム）。以前は落下と同じフレーム（WATER_FALL_INTERVAL = 4 に1回）に運んでいて、
// GAIN などはその速さで実機確認した（「いい感じ」）。落下を毎フレームにしたとき水圧まで4倍速く
// ならないよう、間隔を切り離して 4 のまま保つ
export const WATER_PRESSURE_INTERVAL = 4;
// 水源（湧水）と滝の仕様
// 湧き出る周期と量。湖の満ちる速さ（面のバランス）を決めるので、落下を毎フレームにしたときも
// 変えていない（ユーザー判断 2026-10-10）。粒は4フレームおきに出て1マス/フレームで落ちるので
// 中身だけ見ると3マスおきの点線になるが、滝としては流れの記録（waterStream.js）でつながる。
// （以前は落下も4フレームに1回で、周期を落下の間隔と揃えて中身だけで隙間なく連ねていた。
// 実機で「FallingWater が途切れ途切れ」と指摘されたのは周期15のとき）
export const WATER_SPRING_INTERVAL = 4;        // 湧き出る周期（フレーム）
// 水量は 1。周期を 15→4 に縮めたぶん、1回あたりを 2→1 に減らして流入量の
// 増加を 1.9 倍に抑える（2 のままだと 3.8 倍で水没がかなり速くなる）
export const WATER_SPRING_MASS = 1;            // 1回あたりの湧出水量
export const WATER_SPRING_COUNT = 2;           // 水源の数
export const WATER_SPRING_MAX_ROW_RATIO = 0.5; // マップ上半分から水源を選ぶ
// 滝（落下水流）の中の物理
// 滝・床を流れる水の見た目（environment/waterfallRuns.js）。どれも見た目だけの値で、
// 当たり判定（isWaterfallAtPixel）はタイル単位のまま。
//
// 以前は「滝の描き始めを一番上の落下セルの上辺から WATERFALL_HEAD_DROP(16px) 下げる」で
// 岩の縁から滑り落ちる感じを出していたが、水源の口の下が1タイル空いて点々だけに見えた
// （実機の指摘）。今は滝を1本の区間として扱い、どこから出たかで描き始めを決める:
// 岩の口からなら岩の下面から細く、床の縁からなら床を流れる水の上面から。
export const WATERFALL_BAND_WIDTH = 8;         // px。滝の帯の幅
// 岩の口から出る滝が、この高さ(px)をかけて WATERFALL_MOUTH_WIDTH から帯の幅まで広がる
export const WATERFALL_MOUTH_TAPER = 8;
export const WATERFALL_MOUTH_WIDTH = 2;        // px。口の真下での幅
// 床を流れる水（着水点から次の落ち際まで）の厚み。シミュレーションでは床の上の水は
// 同じフレームのうちに落ち口まで運ばれてしまい、セルとしてはほとんど見えないので、
// 着水点と落ち口の位置から描く
export const RUNNING_WATER_THICKNESS = 3;      // px
// 床の縁から落ちる滝（spill）の上端で、水の進む側の角を丸める四分円の半径。
// 床の水（厚み3px）と帯（幅8px）が直角の L 字でつながるだけだと、水が縁を回り込む感じが
// 出なかった。帯の幅と同じ 8px なら円弧は床の水の上面から帯の外縁まで届いて、
// ちょうど角が丸まる（帯の幅を超えても広がらないよう spillArcRows 側で切る）。
// 実機で見て大きすぎ／小さすぎならここだけ動かす
export const WATERFALL_SPILL_ARC_RADIUS = 8;   // px

// 下方向への押し下げ加速度。GRAVITY(0.30) に**足す**。滝が水中と同じ弱い重力
// (0.09) だった頃の 0.18 は、空気と同じ重力(0.30)に直すと合計 0.48 になり、
// ホバーの推力 0.50 とほぼ釣り合って滝が登れない壁になる。合計 0.36（空気の1.2倍）
// にして、「重いが登れる」ようにした。上昇の実効加速度は空気中 -0.20 に対し -0.14。
// 滝の押しをもっと強くしたいならここだけ上げる（0.20 でホバーがほぼ釣り合う）
export const WATERFALL_DOWNFORCE = 0.06;
// 滝の中での落下速度上限スケール。1.0 ＝ 空気中と同じ（滝に浮力は無い）
export const WATERFALL_FALL_SPEED_SCALE = 1.0;
// 地底湖の描画。塗りは半透明（水セルは前景1枚、境界ブロックの面取り隙間は下層水で完全に同色同濃度）。
export const WATER_FILL = 'rgba(40, 120, 200, 0.45)';
export const WATER_BEHIND_FILL = WATER_FILL; // 境界ブロックの隙間埋め用（前景水と同一濃度）
// 泡の粒。泡のマス（棚から棚へ流れ落ちる満水のセルの真下の隙間）から生まれ、水の中を昇って水の外で消える。
// 泡のマスは1か所に3フレームも続かない（落下の4フレーム周期で出たり消えたりする）ので、マスに粒を描くと
// 点滅するだけだった。粒はマスが消えても寿命まで昇り続ける（2026-10-10 ユーザー要望「白い泡が上に上がる」）
export const WATER_BUBBLE_COLOR = 'rgba(240, 250, 255, 0.85)';
export const WATER_BUBBLE_RISE_MIN = 0.4;      // px/フレーム。1タイル（16px）を 20〜40 フレームで昇る
export const WATER_BUBBLE_RISE_MAX = 0.8;
export const WATER_BUBBLE_EMIT_CHANCE = 0.35;  // 泡のマス1つが1フレームに粒を生む確率
export const WATER_BUBBLE_LIFETIME = 40;       // フレーム。最後の8フレームで薄れる
export const WATER_BUBBLE_MAX = 150;           // 粒の数の上限（実マップの泡のマスは同時に多くて7つ）
// ジェットの噴射と水中の爆発が撒く泡の粒（2026-10-11 ユーザー要望「水中でジェット噴射したら水泡が舞う」
// 「水中でグレネードが爆発したら水泡が舞い上がっていく」）。見た目は上の泡の粒そのもの（同じ色・同じ描き方で、
// 水の描画の bubbles に相乗りする。粒子(particles)にすると水の塗りの下に描かれて泡だけ色がくすむ）。
// 泡のマスの粒との違いは、初めに勢い（噴流に押される・爆発で飛び散る）を持ち、浮力で昇る速さへ
// 寄っていくことと、水面まで昇り切れるよう速く長生きなこと（泡のマスの粒は 40 フレームで 16〜32px しか昇らない）。
//   count         1回に撒く数（blast だけは爆発の大きさから BLAST_BUBBLES_* で決める）
//   speedMin/Max  初速 px/フレーム。angle の向きを中心に spread の扇
//   angle         初速の向き（ラジアン、画面座標。π/2 が真下）
//   jitter        出る位置の散らばり px（中心から ±jitter/2）
//   riseMin/Max   浮力で落ち着く昇る速さ px/フレーム
//   sizes         粒の大きさ px。ここから一様に選ぶ（1 を重ねると小さい粒が多くなる）
//   life          寿命フレーム。ほとんどはその前に水面へ出て消える
export const BUBBLE_BURSTS = {
    // ホバーの噴射。HOVER_JET_BUBBLE_INTERVAL おきに、炎の先あたりから噴流に押されて下へ。
    // 初速 -2 前後・浮力 0.08 だと 10px ほど下がってから昇りに転じる（噴流が水を押す感じ）
    jet:   { count: 2, speedMin: 1.0, speedMax: 2.5, angle: Math.PI / 2, spread: 0.9, jitter: 4,
             riseMin: 0.8, riseMax: 1.6, sizes: [1, 1, 2], life: 120 },
    // バーストジャンプ（敵はジャンプ）の一吹き。噴射と同じ向きで、多く・強く・横にも広く
    burst: { count: 10, speedMin: 1.5, speedMax: 3.5, angle: Math.PI / 2, spread: 1.6, jitter: 8,
             riseMin: 0.8, riseMax: 1.6, sizes: [1, 2, 2], life: 120 },
    // 水中の爆発。全方向へ飛び散り、大きい粒ほど目立つよう 3px も混ぜる
    blast: { count: 0, speedMin: 1.5, speedMax: 4.0, angle: 0, spread: Math.PI * 2, jitter: 10,
             riseMin: 1.0, riseMax: 2.2, sizes: [1, 2, 2, 3], life: 150 },
};
export const WATER_BUBBLE_DRAG = 0.9;          // 横の初速が毎フレーム残る割合（水の抵抗）
export const WATER_BUBBLE_BUOYANCY = 0.08;     // 昇る速さが毎フレーム rise へ寄る割合
export const WATER_BUBBLE_SPAWNED_MAX = 300;   // 撒いた泡の数の上限（泡のマスの粒とは別に数える。噴射が泡のマスの粒を締め出さない）
export const HOVER_JET_BUBBLE_INTERVAL = 3;    // フレーム。噴射の泡を撒く間隔（BUBBLE_BURSTS.jet.count 粒ずつ）
// 水中の爆発の泡の数 = 爆発の粒の数 × PER（上限 MAX）。グレネード(150粒)で 38、敵機の破壊(20〜36粒)で 5〜9、
// マシンガンの着弾(4粒)で 1。爆発の大きさが泡の量でも分かるように比例させる
export const BLAST_BUBBLES_PER_PARTICLE = 0.25;
export const BLAST_BUBBLES_MAX = 40;
export const WATER_SURFACE_COLOR = 'rgba(180, 220, 255, 0.45)'; // 実機: もっと淡く（0.9 → 0.45）
export const WATER_SURFACE_LINE_WIDTH = 1;  // 実機: 細い線（2 → 1）
export const WATER_WAVE_AMPLITUDE = 1.5;    // 実機: 波を細かく（2.5 → 1.5）。px。当たり判定は波打たない
export const WATER_WAVE_LENGTH = 24;        // 実機: 波を細かく（48 → 24。1.5 タイル）
export const WATER_WAVE_SPEED = 0.05;       // rad/frame
export const WATER_RIPPLE_DECAY = 0.94;     // しぶきが落ちた場所の波の減衰（毎フレーム）
export const WATER_RIPPLE_MAX = 2.5;        // しぶきの波紋の強さの上限（実機: 爆発の波動は穏やかに。6 → 2.5）
export const WATER_RIPPLE_MIN = 0.2;        // これ未満になった波紋は捨てる
// 水中での爆発（グレネード・ミサイル・敵機の破壊。すべて spawnExplosion() に相乗り）の波紋。
// しぶき(spawnSplash)の最大と同じ強さにしてある。爆発はしぶきよりずっと激しい現象だが、
// 波紋の見た目自体の上限が WATER_RIPPLE_MAX なので、それ以上強くしても変わらない（実機の指摘）
export const EXPLOSION_RIPPLE_STRENGTH = WATER_RIPPLE_MAX;
// 水中爆発の水柱。SplashParticle をそのまま流用し、しぶき(SPLASH_*)よりずっと
// 勢いよく・まっすぐ上向きに多く打ち上げて「水柱が上がった」印象にする（実機の指摘:
// グレネードが敵機の爆発より地味に見える）
export const WATER_COLUMN_PARTICLE_COUNT = 40;
export const WATER_COLUMN_SPEED_MIN = 4;
export const WATER_COLUMN_SPEED_MAX = 9;
export const WATER_COLUMN_SPREAD = 0.5; // rad。SPLASH(1.2)よりだいぶ狭く、まっすぐ上に近い
// しぶき。粒の数は |vy| に比例（速く落ちるほど盛大）。
export const SPLASH_PARTICLES_PER_VY = 3;
export const SPLASH_MAX_PARTICLES = 24;
export const SPLASH_LIFETIME = 28;
// 滝の着水点のしぶき（SplashParticle）と水煙（WaterMistParticle）。以前は帯より少し広い泡の線と
// 3px しか跳ねない点3つだけで地味だった（2026-10-11 実機の指摘「もっと派手に」）。水面に落ち込む滝も
// 床に落ちる滝も同じ。強さ（0〜1）は落差に比例し、WATERFALL_SPLASH_FULL_DROP で頭打ち。
// 出すのは描画が組み立てた画面内の滝だけ（画面外で particles を食い潰さない）。数は実機で見て調整する
export const WATERFALL_SPLASH_INTERVAL = 3;              // フレーム。この間隔で1回ぶん出す
export const WATERFALL_SPLASH_FULL_DROP = TILE_SIZE * 6; // px。この落差で強さ1
export const WATERFALL_SPLASH_SPRAY_MIN = 1;             // しぶきの粒（1回あたり、強さ0のとき）
export const WATERFALL_SPLASH_SPRAY_MAX = 5;             //                 （強さ1のとき）
export const WATERFALL_SPLASH_SPRAY_SPEED_MIN = 1.5;     // 強さ0のときの最大初速
// 散らばる範囲は「派手すぎ。狭く」（2026-10-11 実機の指摘）で絞った。落差最大で95%の粒が届く範囲:
//   調整前 SPEED_MAX 4.5・SPREAD 1.4・水煙の倍率1 → しぶき横±64px・高さ45px、水煙は床の上で横±102px
//   調整後 → tests/waterfall-splash.test.js が しぶき横±32・高さ32、水煙横±40 以内を縛る
export const WATERFALL_SPLASH_SPRAY_SPEED_MAX = 3.2;     // 強さ1のときの最大初速（高さ v²/(2×0.18) ≈ 28px）
export const WATERFALL_SPLASH_SPRAY_SPREAD = 0.7;        // rad。真上を中心にした扇の広さ
export const WATERFALL_SPLASH_MIST_MIN = 1;              // 水煙の粒（1回あたり、強さ0のとき）
export const WATERFALL_SPLASH_MIST_MAX = 4;              //               （強さ1のとき）
export const WATERFALL_SPLASH_MIST_SPREAD = 0.3;         // 水煙の散らばりの倍率（ホバーの水滴を1として）
// 水面に落ち込む滝の着水点の波紋（12フレームおき）。以前は 0.4 で、しぶきを派手にしても
// 水面がほとんど揺れなかった。上限は WATER_RIPPLE_MAX
export const WATERFALL_SPLASH_RIPPLE = 0.9;
