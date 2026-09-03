// ============================================
// 環境なしの描画。kind 'none' と、document が無い環境（node のテスト）の逃げ先。
// ============================================
//
// 霧・雪・水の描画はオフスクリーン canvas を作る。テストには document が無いので、
// 作れないときはこの「何もしない」実装に落とす。AudioManager が available で
// 黙るのと同じ作り。挙動（motionAt / sightScale）はこの分岐の影響を受けない。

export function createNoneRenderer() {
    return {
        update() {},
        drawOverWorld() {},
        drawOverlay() {},
    };
}

/** オフスクリーン canvas が作れる環境か。 */
export function canvasAvailable() {
    return typeof document !== 'undefined' && typeof document.createElement === 'function';
}
