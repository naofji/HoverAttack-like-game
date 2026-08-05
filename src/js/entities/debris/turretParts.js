// EnemyTurret の破片パーツ定義。
// 描画は機体中心を原点にしているので、ここでは +12/+12 して
// バウンディングボックス左上原点（24x24）へ揃えてある。
// 基部は地形に据え付けられているため weight を大きくし、ほとんど飛ばさない。

const CX = 12;
const CY = 12;

/** 設置向き（床置き / 天井吊り）に応じた基部とアーム。 */
export function turretBaseParts(turret) {
    if (turret.isCeilingMounted) {
        return [
            { x: CX, y: CY - 8, w: 20, h: 8, color: '#555555', weight: 8 },
            { x: CX, y: CY - 2, w: 8, h: 4, color: '#555555', weight: 6 },
        ];
    }
    return [
        { x: CX, y: CY + 8, w: 20, h: 8, color: '#555555', weight: 8 },
        { x: CX, y: CY + 2, w: 8, h: 4, color: '#555555', weight: 6 },
    ];
}

/** 死亡時の砲塔角度を焼き込んだ旋回体。 */
export function turretHeadParts(turret) {
    const angle = turret.currentAngle || 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const barrelLength = 14 - (turret.recoil || 0);

    // 砲身は回転中心から前方へ伸びるので、中心を回して置き直す
    const barrelCx = 4 + barrelLength / 2;
    return [
        {
            x: CX + barrelCx * cos,
            y: CY + barrelCx * sin,
            w: barrelLength, h: 4, color: '#888888', weight: 0.7, angle,
        },
        { x: CX, y: CY, w: 16, h: 16, color: '#667788', weight: 1.6 },
        { x: CX, y: CY, w: 6, h: 6, color: '#FFCC00', weight: 0.4 },
    ];
}

export const turretDebris = {
    holdFrames: 2,
    burst: 1.8,
    mirrored: () => false,   // 砲台は左右反転しない
    // 実際のパーツは EnemyTurret.getDebrisParts() が設置向き・砲塔角度を
    // 焼き込んで供給する（buildDebris は entity.getDebrisParts を優先する）。
};
