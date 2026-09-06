import { EventBus } from './core/EventBus.js';
import { GameEngine } from './core/GameEngine.js';
import { StorageService } from './core/StorageService.js';
import { SceneRenderer } from './scene/SceneRenderer.js';
import { AudioEngine } from './systems/AudioEngine.js';
import { InputManager } from './systems/InputManager.js';
import { UIController } from './ui/UIController.js';

/**
 * Application bootstrap and composition root.
 */
function bootstrap() {
  const canvas = document.getElementById('game-canvas');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing #game-canvas element');
  }

  const eventBus = new EventBus();
  const storage = new StorageService();
  const engine = new GameEngine({ eventBus, storage });
  const renderer = new SceneRenderer({
    canvas,
    eventBus,
    initialWorld: engine.worldId,
    initialTargetType: engine.target.type,
  });
  const audio = new AudioEngine(eventBus, storage);
  const input = new InputManager({ canvas, engine, audio });

  // UIController binds HUD, reticle, wind compass, popups, and modal overlays
  new UIController({ eventBus, engine, audio, storage, renderer });

  const handleResize = () => {
    renderer.resize(window.innerWidth, window.innerHeight);
  };

  handleResize();
  window.addEventListener('resize', handleResize);
  input.attach();
  engine.startLoop((state, dt) => renderer.render(state, dt));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
