// game.pickups（落ちているアイテムの1本の配列）から種類で取り出す。
// 種類ごとの配列（repairKits / missileKits / autoAimUnits / lifeKits）だった頃のテストの見方を
// そのまま保つための手助け。instanceof で絞るので、MissileKit で取るとオーバードライブキット
// （MissileKit の子）も入る＝以前の missileKits 配列と同じ中身になる。
export function pickupsOf(game, Cls) {
  return game.pickups.filter((item) => item instanceof Cls);
}
