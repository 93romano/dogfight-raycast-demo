// server/game/CombatSystem.js
import GameEventService from '../services/GameEventService.js';

export class CombatSystem {
  constructor(gameState, webSocketManager, matchManager) {
    this.gameState = gameState;
    this.webSocketManager = webSocketManager;
    this.matchManager = matchManager;
  }

  async handlePlayerHit(attackerId, victimId, damage, position, distance) {
    const matchId = this.gameState.getCurrentMatch();
    console.log('matchId', matchId);
    if (!matchId) return;

    try {
      const attacker = this.gameState.getPlayer(attackerId);
      const victim = this.gameState.getPlayer(victimId);

      if (!attacker || !victim) {
        console.log(`⚠️ Player not found: attacker=${attackerId}, victim=${victimId}`);
        return;
      }

      // 탄약 체크
      if (attacker.ammo <= 0) {
        console.log(`🚫 Shot rejected: Player ${attackerId} has no ammo`);
        return;
      }

      // 재장전 중 체크
      if (attacker.isReloading) {
        console.log(`🚫 Shot rejected: Player ${attackerId} is reloading`);
        return;
      }

      // 연사 제한 검증
      const now = Date.now();
      if (now - attacker.lastShotTime < attacker.shotCooldown) {
        console.log(`🚫 Shot rejected: Player ${attackerId} shooting too fast`);
        return;
      }

      attacker.lastShotTime = now;
      attacker.ammo--; // 탄약 소모
      
      // 피해자 체력 감소
      victim.health = Math.max(0, victim.health - damage);
      
      console.log(`🎯 Player ${attackerId} hit Player ${victimId} for ${damage} damage! Victim health: ${victim.health}/${victim.maxHealth}`);
      
      // 모든 클라이언트에게 피격 이벤트 브로드캐스트
      const hitMessage = JSON.stringify({
        type: 'player-hit',
        attackerId: attackerId,
        victimId: victimId,
        damage: damage,
        victimHealth: victim.health,
        position: position,
        distance: distance,
        timestamp: now
      });
      
      this.webSocketManager.broadcast(hitMessage);
      
      // 사망 처리
      if (victim.health <= 0) {
        await this.handlePlayerDeath(attackerId, victimId);
      }
    } catch (error) {
      console.error('Error handling player hit:', error);
    }
  }

  async handlePlayerDeath(attackerId, victimId) {
    console.log(`💀 Player ${victimId} was killed by Player ${attackerId}`);
    
    // 킬/데스 이벤트를 Redis에 저장
    const attackerUserId = this.gameState.getUserForPlayer(attackerId);
    const victimUserId = this.gameState.getUserForPlayer(victimId);
    
    if (attackerUserId && victimUserId) {
      await GameEventService.handlePlayerKill(
        this.gameState.getCurrentMatch(),
        attackerUserId,
        victimUserId,
        100 // 죽을 때의 데미지
      );
    }
    
    // 플레이어 리스폰
    const victim = this.gameState.getPlayer(victimId);
    victim.health = victim.maxHealth;
    victim.position = [0, 10, 0]; // 리스폰 위치
    victim.rotation = [0, 0, 0, 1];
    
    // 사망/리스폰 이벤트 브로드캐스트
    const deathMessage = JSON.stringify({
      type: 'player-death',
      victimId: victimId,
      attackerId: attackerId,
      respawnPosition: victim.position,
      timestamp: Date.now()
    });
    
    this.webSocketManager.broadcast(deathMessage);
  }

  handlePlayerReload(playerId) {
    const player = this.gameState.getPlayer(playerId);
    if (!player) {
      console.log(`⚠️ Player not found: ${playerId}`);
      return false;
    }

    // 이미 재장전 중이면 거부
    if (player.isReloading) {
      console.log(`🚫 Reload rejected: Player ${playerId} already reloading`);
      return false;
    }

    // 탄약이 가득 차면 거부
    if (player.ammo >= player.maxAmmo) {
      console.log(`🚫 Reload rejected: Player ${playerId} ammo is full`);
      return false;
    }

    // 재장전 시작
    player.isReloading = true;
    player.reloadStartTime = Date.now();

    console.log(`🔄 Player ${playerId} started reloading`);

    // 재장전 완료 타이머 설정
    setTimeout(() => {
      if (player.isReloading) {
        player.ammo = player.maxAmmo;
        player.isReloading = false;
        console.log(`✅ Player ${playerId} reload complete! Ammo: ${player.ammo}/${player.maxAmmo}`);

        // 재장전 완료 이벤트 브로드캐스트
        const reloadCompleteMessage = JSON.stringify({
          type: 'player-reload-complete',
          playerId: playerId,
          ammo: player.ammo,
          maxAmmo: player.maxAmmo,
          timestamp: Date.now()
        });

        this.webSocketManager.broadcast(reloadCompleteMessage);
      }
    }, player.reloadDuration);

    // 재장전 시작 이벤트 브로드캐스트
    const reloadMessage = JSON.stringify({
      type: 'player-reload',
      playerId: playerId,
      reloadDuration: player.reloadDuration,
      timestamp: Date.now()
    });

    this.webSocketManager.broadcast(reloadMessage);
    return true;
  }

  updateReloadStatus(playerId) {
    const player = this.gameState.getPlayer(playerId);
    if (!player || !player.isReloading) return null;

    const now = Date.now();
    const elapsed = now - player.reloadStartTime;
    const remaining = Math.max(0, player.reloadDuration - elapsed);

    if (remaining === 0 && player.isReloading) {
      // 재장전 완료
      player.ammo = player.maxAmmo;
      player.isReloading = false;
      console.log(`✅ Player ${playerId} reload complete (update)! Ammo: ${player.ammo}/${player.maxAmmo}`);
    }

    return {
      isReloading: player.isReloading,
      reloadTimeRemaining: remaining,
      ammo: player.ammo,
      maxAmmo: player.maxAmmo
    };
  }
}

export default CombatSystem; 