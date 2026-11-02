import {
  ENVIRONMENTS,
  EVENTS,
  GAME_MODES,
  GAME_STATES,
  TARGET_TYPES,
} from '../config/constants.js';

const RETICLE_CIRCUMFERENCE = 2 * Math.PI * 26;

/**
 * Light-theme DOM HUD, interactive aiming reticle, wind compass,
 * world-projected score popups, and modal overlay controller.
 */
export class UIController {
  /**
   * @param {object} deps
   * @param {import('../core/EventBus.js').EventBus} deps.eventBus
   * @param {import('../core/GameEngine.js').GameEngine} deps.engine
   * @param {import('../systems/AudioEngine.js').AudioEngine} deps.audio
   * @param {import('../core/StorageService.js').StorageService} deps.storage
   * @param {import('../scene/SceneRenderer.js').SceneRenderer} deps.renderer
   */
  constructor({ eventBus, engine, audio, storage, renderer }) {
    this.eventBus = eventBus;
    this.engine = engine;
    this.audio = audio;
    this.storage = storage;
    this.renderer = renderer;

    this.els = {
      hud: document.getElementById('hud'),
      scoreValue: document.getElementById('hud-score'),
      bestValue: document.getElementById('hud-best'),
      arrowsValue: document.getElementById('hud-arrows'),
      distanceValue: document.getElementById('hud-distance'),
      timerChip: document.getElementById('hud-round-timer-chip'),
      roundTimerValue: document.getElementById('hud-round-timer'),
      streakBadge: document.getElementById('hud-streak'),

      windNeedle: document.getElementById('wind-needle'),
      windSpeed: document.getElementById('wind-speed'),
      windDirLabel: document.getElementById('wind-dir-label'),

      reticle: document.getElementById('reticle'),
      reticleProgress: document.getElementById('reticle-progress'),
      reticleHint: document.getElementById('reticle-hint'),
      targetScope: document.getElementById('target-scope'),
      scopeDistance: document.getElementById('scope-distance'),
      scopeLastHit: document.getElementById('scope-last-hit'),
      popupLayer: document.getElementById('popup-layer'),
      stageToast: document.getElementById('stage-toast'),

      pauseBtn: document.getElementById('btn-pause'),
      muteBtn: document.getElementById('btn-mute'),

      menuOverlay: document.getElementById('menu-overlay'),
      worldGrid: document.getElementById('world-grid'),
      targetGrid: document.getElementById('target-grid'),
      modeGrid: document.getElementById('mode-grid'),
      playBtn: document.getElementById('btn-play'),

      pauseOverlay: document.getElementById('pause-overlay'),
      resumeBtn: document.getElementById('btn-resume'),
      restartFromPauseBtn: document.getElementById('btn-restart-pause'),
      menuFromPauseBtn: document.getElementById('btn-menu-pause'),

      gameOverOverlay: document.getElementById('gameover-overlay'),
      newBestBadge: document.getElementById('gameover-new-best'),
      finalScore: document.getElementById('gameover-score'),
      finalBest: document.getElementById('gameover-best'),
      finalAccuracy: document.getElementById('gameover-accuracy'),
      finalAvgRing: document.getElementById('gameover-avgring'),
      finalBullseyes: document.getElementById('gameover-bullseyes'),
      finalStreak: document.getElementById('gameover-streak'),
      replayBtn: document.getElementById('btn-replay'),
      menuFromOverBtn: document.getElementById('btn-menu-over'),
    };

    this._toastTimer = null;
    this._lastHud = {};

    this._renderWorldPills();
    this._renderTargetPills();
    this._renderModeCards();
    this._bindDOM();
    this._bindEvents();
    this._updateMuteButton(this.audio.muted);
    this._syncOverlays(GAME_STATES.MENU);
  }

  _renderWorldPills() {
    this.els.worldGrid.innerHTML = '';
    for (const world of Object.values(ENVIRONMENTS)) {
      const isSelected = world.id === this.engine.worldId;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `select-pill${isSelected ? ' is-selected' : ''}`;
      btn.dataset.worldId = world.id;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(isSelected));
      btn.innerHTML = `<span class="select-pill__dot" style="background:${world.accent}"></span>${world.label}`;
      btn.addEventListener('click', () => {
        this.engine.setWorld(world.id);
        this.els.worldGrid.querySelectorAll('.select-pill').forEach((el) => {
          const selected = el.dataset.worldId === world.id;
          el.classList.toggle('is-selected', selected);
          el.setAttribute('aria-checked', String(selected));
        });
      });
      this.els.worldGrid.appendChild(btn);
    }
  }

  _renderTargetPills() {
    this.els.targetGrid.innerHTML = '';
    for (const target of Object.values(TARGET_TYPES)) {
      const isSelected = target.id === this.engine.targetTypePreference;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `select-pill${isSelected ? ' is-selected' : ''}`;
      btn.dataset.targetId = target.id;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(isSelected));
      btn.textContent = target.label;
      btn.addEventListener('click', () => {
        this.engine.setTargetType(target.id);
        this.els.targetGrid.querySelectorAll('.select-pill').forEach((el) => {
          const selected = el.dataset.targetId === target.id;
          el.classList.toggle('is-selected', selected);
          el.setAttribute('aria-checked', String(selected));
        });
      });
      this.els.targetGrid.appendChild(btn);
    }
  }

  _renderModeCards() {
    const savedMode = this.storage.getSettings().selectedMode;
    const validMode = GAME_MODES[savedMode] ? savedMode : 'championship';
    this.engine.setMode(validMode);

    this.els.modeGrid.innerHTML = '';
    for (const mode of Object.values(GAME_MODES)) {
      const best = this.storage.getHighScore(mode.id);
      const isSelected = mode.id === this.engine.mode.id;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `mode-card${isSelected ? ' is-selected' : ''}`;
      card.dataset.modeId = mode.id;
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', String(isSelected));
      card.innerHTML = `
        <div class="mode-card__top">
          <span class="mode-card__tag">${mode.tagline}</span>
          <span class="mode-card__best">Best ${best}</span>
        </div>
        <div class="mode-card__title">${mode.label}</div>
        <p class="mode-card__desc">${mode.description}</p>
      `;

      card.addEventListener('click', () => {
        this.engine.setMode(mode.id);
        this._highlightSelectedMode(mode.id);
      });

      this.els.modeGrid.appendChild(card);
    }
  }

  _highlightSelectedMode(modeId) {
    this.els.modeGrid.querySelectorAll('.mode-card').forEach((card) => {
      const selected = card.dataset.modeId === modeId;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-checked', String(selected));
    });
  }

  _refreshModeHighScores() {
    this.els.modeGrid.querySelectorAll('.mode-card').forEach((card) => {
      const modeId = card.dataset.modeId;
      const bestEl = card.querySelector('.mode-card__best');
      if (bestEl && modeId) {
        bestEl.textContent = `Best ${this.storage.getHighScore(modeId)}`;
      }
    });
  }

  _bindDOM() {
    this.els.playBtn.addEventListener('click', () => {
      this.audio.unlock();
      this.engine.startGame(this.engine.mode.id);
    });

    this.els.pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.engine.togglePause();
    });

    this.els.muteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.toggleMute();
    });

    this.els.resumeBtn.addEventListener('click', () => {
      this.engine.togglePause();
    });

    this.els.restartFromPauseBtn.addEventListener('click', () => {
      this.audio.unlock();
      this.engine.startGame(this.engine.mode.id);
    });

    this.els.menuFromPauseBtn.addEventListener('click', () => {
      this._refreshModeHighScores();
      this.engine.returnToMenu();
    });

    this.els.replayBtn.addEventListener('click', () => {
      this.audio.unlock();
      this.engine.startGame(this.engine.mode.id);
    });

    this.els.menuFromOverBtn.addEventListener('click', () => {
      this._refreshModeHighScores();
      this.engine.returnToMenu();
    });
  }

  _bindEvents() {
    this.eventBus.on(EVENTS.STATE_CHANGED, ({ state }) => {
      this._syncOverlays(state);
    });

    this.eventBus.on(EVENTS.HUD_UPDATED, (hud) => {
      this._updateHud(hud);
    });

    this.eventBus.on(EVENTS.DRAW_UPDATED, ({ isDrawing, drawPower, fatigue }) => {
      this._updateReticle(isDrawing, drawPower, fatigue);
    });

    this.eventBus.on(EVENTS.TARGET_HIT, (payload) => {
      this._spawnWorldPopup(payload);
    });

    this.eventBus.on(EVENTS.TARGET_MISSED, () => {
      this._spawnCenterNotice('MISS', '', 'miss');
    });

    this.eventBus.on(EVENTS.STAGE_CHANGED, ({ stageIndex, distance, isMoving, targetType }) => {
      const targetName = (TARGET_TYPES[targetType]?.label ?? 'Target').toUpperCase();
      const tag = isMoving ? `${distance}m MOVING ${targetName}` : `${distance}m ${targetName}`;
      this._showStageToast(`STAGE ${stageIndex + 1} • ${tag}`);
    });

    this.eventBus.on(EVENTS.GAME_OVER, (summary) => {
      this._renderGameOver(summary);
    });

    this.eventBus.on(EVENTS.SOUND_TOGGLED, ({ muted }) => {
      this._updateMuteButton(muted);
    });
  }

  _syncOverlays(state) {
    this.els.menuOverlay.classList.toggle('is-hidden', state !== GAME_STATES.MENU);
    this.els.pauseOverlay.classList.toggle('is-hidden', state !== GAME_STATES.PAUSED);
    this.els.gameOverOverlay.classList.toggle('is-hidden', state !== GAME_STATES.GAME_OVER);
    this.els.hud.classList.toggle('is-hidden', state === GAME_STATES.MENU);
    this.els.reticle.classList.toggle('is-hidden', state !== GAME_STATES.PLAYING);
    this.els.reticleHint.classList.toggle('is-hidden', state !== GAME_STATES.PLAYING);
    this.els.targetScope.classList.toggle(
      'is-hidden',
      state !== GAME_STATES.PLAYING && state !== GAME_STATES.PAUSED
    );

    if (state === GAME_STATES.MENU) {
      this._refreshModeHighScores();
    }
    if (state !== GAME_STATES.PLAYING) {
      this._updateReticle(false, 0, 0);
    }
  }

  _setTextIfChanged(key, el, text) {
    if (this._lastHud[key] !== text) {
      this._lastHud[key] = text;
      el.textContent = text;
    }
  }

  _updateHud(hud) {
    this._setTextIfChanged('score', this.els.scoreValue, String(hud.score));
    this._setTextIfChanged('best', this.els.bestValue, String(Math.max(hud.score, hud.bestScore)));
    this._setTextIfChanged('distance', this.els.distanceValue, `${hud.distance}m`);
    this._setTextIfChanged('scopeDist', this.els.scopeDistance, `${hud.distance}m`);
    this._setTextIfChanged('lastHit', this.els.scopeLastHit, hud.lastHitLabel || 'READY');

    if (hud.infiniteArrows) {
      this._setTextIfChanged('arrows', this.els.arrowsValue, '∞');
      this.els.arrowsValue.classList.remove('is-low');
    } else {
      const arrowsText = String(Math.max(0, hud.arrowsLeft));
      this._setTextIfChanged('arrows', this.els.arrowsValue, arrowsText);
      this.els.arrowsValue.classList.toggle('is-low', hud.arrowsLeft <= 2);
    }

    // Time Attack timer
    if (hud.roundTimeRemaining !== null) {
      this.els.timerChip.classList.remove('is-hidden');
      this._setTextIfChanged(
        'timer',
        this.els.roundTimerValue,
        `${Math.ceil(hud.roundTimeRemaining)}s`
      );
      this.els.roundTimerValue.classList.toggle('is-low', hud.roundTimeRemaining <= 10);
    } else {
      this.els.timerChip.classList.add('is-hidden');
    }

    // Streak multiplier badge
    if (hud.streak >= 2) {
      this.els.streakBadge.classList.remove('is-hidden');
      const streakText =
        hud.comboMultiplier > 1
          ? `${hud.streak} STREAK • ${hud.comboMultiplier}x`
          : `${hud.streak} STREAK`;
      this._setTextIfChanged('streak', this.els.streakBadge, streakText);
    } else {
      this.els.streakBadge.classList.add('is-hidden');
    }

    // Wind compass readout
    const windSpeed = Math.hypot(hud.wind.x, hud.wind.y);
    this._setTextIfChanged('windSpeed', this.els.windSpeed, `${windSpeed.toFixed(1)} m/s`);
    if (windSpeed < 0.4) {
      this._setTextIfChanged('windDir', this.els.windDirLabel, 'CALM');
      if (this._lastHud.windRot !== 'rotate(0deg)') {
        this._lastHud.windRot = 'rotate(0deg)';
        this.els.windNeedle.style.transform = 'rotate(0deg)';
      }
    } else {
      const deg = (Math.atan2(-hud.wind.y, hud.wind.x) * 180) / Math.PI;
      const rot = `rotate(${deg}deg)`;
      if (this._lastHud.windRot !== rot) {
        this._lastHud.windRot = rot;
        this.els.windNeedle.style.transform = rot;
      }
      this._setTextIfChanged('windDir', this.els.windDirLabel, hud.wind.x >= 0 ? 'RIGHT' : 'LEFT');
    }
  }

  _updateReticle(isDrawing, drawPower, fatigue) {
    const offset = RETICLE_CIRCUMFERENCE * (1 - drawPower);
    this.els.reticleProgress.style.strokeDasharray = `${RETICLE_CIRCUMFERENCE}`;
    this.els.reticleProgress.style.strokeDashoffset = `${offset}`;

    let stateAttr = 'idle';
    if (isDrawing) {
      if (fatigue > 0.25) stateAttr = 'fatigue';
      else if (drawPower >= 0.85) stateAttr = 'full';
      else stateAttr = 'charging';
    }

    this.els.reticle.dataset.state = stateAttr;
    this.els.reticleHint.classList.toggle(
      'is-hidden',
      isDrawing || this.engine.state !== GAME_STATES.PLAYING
    );
  }

  _spawnWorldPopup({ worldPos, points, ring, label, isBullseye, bonusArrows, comboMultiplier }) {
    const projected = this.renderer.projectToScreen(worldPos);
    const x = projected.visible ? projected.x : window.innerWidth / 2;
    const y = projected.visible ? projected.y - 24 : window.innerHeight * 0.42;

    const details = [label || ring.name];
    if (comboMultiplier > 1) details.push(`${comboMultiplier}x COMBO`);
    if (bonusArrows > 0) details.push(`+${bonusArrows} ARROWS`);

    this._createPopupEl(x, y, `+${points}`, details.join(' • '), isBullseye ? 'bullseye' : 'hit');
  }

  _spawnCenterNotice(title, subtitle, variant) {
    this._createPopupEl(window.innerWidth / 2, window.innerHeight * 0.42, title, subtitle, variant);
  }

  _createPopupEl(x, y, title, subtitle, variant) {
    const el = document.createElement('div');
    el.className = `score-popup score-popup--${variant}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    const mainSpan = document.createElement('span');
    mainSpan.className = 'score-popup__main';
    mainSpan.textContent = title;
    el.appendChild(mainSpan);

    if (subtitle) {
      const subSpan = document.createElement('span');
      subSpan.className = 'score-popup__sub';
      subSpan.textContent = subtitle;
      el.appendChild(subSpan);
    }

    this.els.popupLayer.appendChild(el);
    window.setTimeout(() => el.remove(), 1150);
  }

  _showStageToast(text) {
    this.els.stageToast.textContent = text;
    this.els.stageToast.classList.remove('is-hidden');
    if (this._toastTimer) window.clearTimeout(this._toastTimer);
    this._toastTimer = window.setTimeout(() => {
      this.els.stageToast.classList.add('is-hidden');
    }, 2200);
  }

  _renderGameOver(summary) {
    this.els.finalScore.textContent = String(summary.score);
    this.els.finalBest.textContent = String(summary.bestScore);
    this.els.finalAccuracy.textContent = `${summary.accuracy}%`;
    this.els.finalAvgRing.textContent = String(summary.avgRing);
    this.els.finalBullseyes.textContent = String(summary.bullseyes);
    this.els.finalStreak.textContent = String(summary.maxStreak);
    this.els.newBestBadge.classList.toggle('is-hidden', !summary.isNewBest);
    this._refreshModeHighScores();
  }

  _updateMuteButton(muted) {
    this.els.muteBtn.textContent = muted ? '🔇' : '🔊';
    this.els.muteBtn.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
    this.els.muteBtn.title = muted ? 'Unmute (M)' : 'Mute (M)';
  }
}
