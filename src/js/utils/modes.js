// Game modes: NORMAL adds a 0.8x wait (easier to dodge), NEWTYPE runs at full
// speed. Timers advance in real time regardless, so NEWTYPE earns time bonus
// more easily; NORMAL uses a gentler decay to compensate.
// color / desc drive the title-screen selector: the picked mode is drawn in its
// own colour (green reads as the gentler option, red as the demanding one) with
// desc spelling out what the choice actually changes.
export const MODES = {
    normal: {
        gameSpeed: 0.8, timeBonusDecay: 40, label: 'NORMAL',
        color: '#00FF88',
        desc: 'GAME SPEED 0.8x / EASIER TO DODGE',
    },
    newtype: {
        gameSpeed: 1.0, timeBonusDecay: 50, label: 'NEWTYPE',
        color: '#FF4477',
        desc: 'GAME SPEED 1.0x / HIGHER TIME BONUS',
    },
};

export const MODE_ORDER = ['normal', 'newtype'];

/** Return the neighbouring mode key. dir is +1 / -1, wrapping at both ends. */
export function cycleMode(current, dir) {
    const i = MODE_ORDER.indexOf(current);
    const n = MODE_ORDER.length;
    const next = ((i + dir) % n + n) % n;
    return MODE_ORDER[next];
}
