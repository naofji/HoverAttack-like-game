// ============================================
// 全画面トグル
// ============================================

/**
 * Fullscreen API を入る／出るで切り替える。
 *
 * 対象を documentElement にしているのは、CSS が 100vw / 100vh を基準に
 * canvas を拡大しているため。#game-container を全画面にすると vh の
 * 基準が変わって拡大の計算が素直に効かない。
 *
 * doc を引数で受けているのは node --test に document が無いから。
 * 呼び出し側は省略していい。
 *
 * @param {Element} [element] 全画面にする要素
 * @param {Document} [doc] fullscreenElement / exitFullscreen を持つオブジェクト
 */
export function toggleFullscreen(element, doc) {
    const d = doc ?? (typeof document !== 'undefined' ? document : null);
    if (!d) return;

    const el = element ?? d.documentElement;

    // Promise の reject を飲む。ユーザー操作を伴わない呼び出しはブラウザに
    // 拒否されるが、そのたびにコンソールへ未処理エラーを出す必要はない。
    if (d.fullscreenElement) {
        if (typeof d.exitFullscreen === 'function') {
            Promise.resolve(d.exitFullscreen()).catch(() => { });
        }
        return;
    }

    if (el && typeof el.requestFullscreen === 'function') {
        Promise.resolve(el.requestFullscreen()).catch(() => { });
    }
}
