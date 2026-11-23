// ============================================
// Game Constants（入口）
// ============================================
//
// ゲームバランスと演出の数値の唯一の置き場。中身は系統ごとに constants/ の
// ファイルへ分けてあり、ここはそれを全部まとめて再 export するだけ。
// 使う側は今までどおり Constants.js から import する。
//
// 分けた理由（2026-11-24）: 1ファイル 3000行・定数 1095個になり、1つ足すにも
// 全体を読む必要があった。系統の境目はもとのファイルの見出し（// --- ... ---）。
// 定数を足すときは系統が合うファイルへ。新しい系統のファイルを作ったら下に1行足す
// （tests/constants-entry.test.js が「constants/ の全 export がここから見える」ことを縛る）。
// 同じ名前を2つのファイルで export すると、export * の仕様でその名前は曖昧になり、
// import した側が読み込みの時点でエラーになる（黙って片方が勝つことはない）。
export * from '../constants/core.js';
export * from '../constants/player.js';
export * from '../constants/attackers.js';
export * from '../constants/audio.js';
export * from '../constants/ui.js';
export * from '../constants/effects.js';
export * from '../constants/enemies.js';
export * from '../constants/stages.js';
export * from '../constants/base.js';
export * from '../constants/fortress.js';
export * from '../constants/water.js';
export * from '../constants/environment.js';
export * from '../constants/town.js';
export * from '../constants/stageProps.js';
