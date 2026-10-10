// ============================================
// waterStream - 細い流れの記録（純関数）
// ============================================
//
// 落下が毎フレームだと、湧き水の粒（4フレームおきに水量1）は1マス/フレームで落ち、
// 粒と粒のあいだが3マス空く。セルの中身だけで滝を判定すると、細い滝が点線になって点滅した。
// 「細い流れがついさっきここを落ちた」をセルごとに残りフレーム数で持ち、そのあいだは
// 空のセルでも滝とみなす（waterQuery.js の isFallingCell）。
//
// 書くのはシミュレーションの落下（waterSimulation.js のフェーズ1）だけ。減らすのは Map.update で、
// 切れたセルは onWaterChanged で種別キャッシュに知らせる（水量が変わらなくても種別が変わるので）。
// 乱数は使わない（週次の決定性）。

import { WATER_STREAM_HOLD_FRAMES, WATER_STREAM_MAX_FLOW } from '../utils/Constants.js';

/**
 * from から to へ flow だけ落ちたことを記録する。量が WATER_STREAM_MAX_FLOW を超える落下（塊）は
 * 記録しない — 塊の通り道に滝の尾が残るため（Constants.js の WATER_STREAM_MAX_FLOW）。
 * @param {Uint8Array} hold セルごとの残りフレーム数
 * @param {Set<number>} live hold が 0 でないセル (r * cols + c)
 */
export function recordFall(hold, live, from, to, flow) {
    if (flow > WATER_STREAM_MAX_FLOW) return;
    hold[from] = WATER_STREAM_HOLD_FRAMES;
    live.add(from);
    hold[to] = WATER_STREAM_HOLD_FRAMES;
    live.add(to);
}

/**
 * 記録を1フレーム進める。0 になったセルを live から外して返す（呼び手が種別キャッシュに知らせる）。
 * @returns {number[]} 記録が切れたセル (r * cols + c)
 */
export function decayStream(hold, live) {
    const expired = [];
    for (const k of live) {
        hold[k]--;
        if (hold[k] === 0) {
            live.delete(k);
            expired.push(k);
        }
    }
    return expired;
}
