// Render interpolation for the fixed-timestep loop.
//
// Physics advances in discrete SIM_STEP ticks, but frames are drawn more often
// than ticks occur: in NORMAL mode (gameSpeed 0.8) the accumulator gains
// 13.33ms per frame against a 16.67ms step, so one frame in every five runs no
// tick at all. Drawing entities at their raw tick positions makes them stutter
// against the smoothly interpolated camera. Drawing them lerped between the
// previous and current tick — the same way Camera already is — makes every
// frame advance a uniform 0.8 tick-widths instead of the 1,1,1,1,0 pattern.
//
// Usage: snapshotEntity on every entity at the top of a tick, interpolateEntity
// before drawing, restoreEntity after. Only x/y are touched, and they are always
// restored so game logic never observes an interpolated position.

import { lerp } from './timestep.js';

// Larger than any distance a single tick can cover, so respawns and other
// teleports are drawn at their destination rather than smearing across the map.
export const TELEPORT_THRESHOLD = 64;

/** Record an entity's pre-tick position so it can be interpolated from later. */
export function snapshotEntity(e) {
    if (!e) return;
    e._prevX = e.x;
    e._prevY = e.y;
}

/** Shift an entity to its interpolated draw position. Pair with restoreEntity. */
export function interpolateEntity(e, alpha) {
    if (!e) return;

    if (e._prevX === undefined) {
        // Spawned since the last tick — nothing to interpolate from.
        e._prevX = e.x;
        e._prevY = e.y;
    } else {
        const dx = e.x - e._prevX;
        const dy = e.y - e._prevY;
        if (dx * dx + dy * dy > TELEPORT_THRESHOLD * TELEPORT_THRESHOLD) {
            e._prevX = e.x;
            e._prevY = e.y;
        }
    }

    e._trueX = e.x;
    e._trueY = e.y;
    e.x = lerp(e._prevX, e.x, alpha);
    e.y = lerp(e._prevY, e.y, alpha);
}

/** Put an entity back on its true simulation position after drawing. */
export function restoreEntity(e) {
    if (!e || e._trueX === undefined) return;
    e.x = e._trueX;
    e.y = e._trueY;
}
