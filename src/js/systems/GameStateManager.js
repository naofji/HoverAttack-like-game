// ============================================
// Game State Manager - State transitions, restart, respawn
// ============================================

import { Map } from '../world/Map.js';
import { Player } from '../entities/Player.js';
import { Carrier } from '../entities/Carrier.js';
import { HUD } from '../ui/HUD.js';

export class GameStateManager {
    constructor(game) {
        this.game = game;
    }

    /**
     * Reset the level. Used by both restart and nextMission.
     * @param {boolean} resetScore - If true, reset score and missionsCompleted (full restart)
     */
    resetLevel(resetScore = false) {
        const game = this.game;

        if (resetScore) {
            game.score = 0;
            game.missionsCompleted = 0;
        }

        game.projectiles = [];
        game.particles = [];
        game.landmines = [];
        game.enemies = [];
        game.enemyBullets = [];
        game.base = null;
        game.flag = null;
        game.gameState = 'playing';

        // Regenerate map
        game.map = new Map(game, game.missionsCompleted);
        game.hud = new HUD(game);

        const spawnPos = game.spawnManager.findSpawnPosition(5, 5, 12, 10);
        game.carrier = new Carrier(game, spawnPos.x, spawnPos.y);
        game.player = new Player(
            game,
            game.carrier.x + game.carrier.width / 2 - 10,
            game.carrier.y - 24
        );
        game.player.docked = true;
        game.camera.follow(game.player);
        game.camera.snapToTarget();

        // Recreate landmines and enemies
        game.spawnManager.spawnLandmines();
        game.spawnManager.spawnEnemies();
    }

    /** Full restart (from game over) */
    restart() {
        this.resetLevel(true);
    }

    /** Continue to next mission (score preserved) */
    nextMission() {
        this.resetLevel(false);
    }

    /** Respawn the player on carrier */
    respawnPlayer() {
        const game = this.game;
        if (game.carrier && game.carrier.alive) {
            game.player.respawn(
                game.carrier.x + game.carrier.width / 2 - game.player.width / 2,
                game.carrier.y - game.player.height
            );
            game.player.docked = true;
        }
    }

    /** Respawn the carrier at its original position */
    respawnCarrier() {
        const game = this.game;
        if (game.carrier) {
            game.carrier.respawn();
            game.camera.follow(game.carrier);
            game.camera.snapToTarget();
        }
    }
}
