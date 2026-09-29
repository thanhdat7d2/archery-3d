import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StorageService } from '../src/core/StorageService.js';

describe('StorageService', () => {
  it('saves and retrieves high scores only when beaten', () => {
    const storage = new StorageService();
    assert.equal(storage.getHighScore('championship'), 0);

    assert.equal(storage.saveHighScore('championship', 45), true);
    assert.equal(storage.getHighScore('championship'), 45);

    assert.equal(storage.saveHighScore('championship', 30), false);
    assert.equal(storage.getHighScore('championship'), 45);

    assert.equal(storage.saveHighScore('championship', 80), true);
    assert.deepEqual(storage.getAllHighScores(), { championship: 80 });
  });

  it('caches parsed values instead of re-reading storage on every getHighScore call', () => {
    let reads = 0;
    const store = new Map();
    const mockStorage = {
      getItem(key) {
        reads += 1;
        return store.get(key) ?? null;
      },
      setItem(key, val) {
        store.set(key, val);
      },
    };

    const storage = new StorageService(mockStorage);
    storage.saveHighScore('windMaster', 120);
    const readsAfterSave = reads;

    for (let i = 0; i < 50; i++) {
      assert.equal(storage.getHighScore('windMaster'), 120);
    }
    assert.equal(reads, readsAfterSave);
  });

  it('persists partial settings patches and falls back gracefully on storage errors', () => {
    const throwingStorage = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
    };

    const storage = new StorageService(throwingStorage);
    const initial = storage.getSettings();
    assert.equal(initial.selectedMode, 'championship');

    storage.saveSettings({ muted: true, selectedWorld: 'lava' });
    const updated = storage.getSettings();
    assert.equal(updated.muted, true);
    assert.equal(updated.selectedWorld, 'lava');
    assert.equal(updated.selectedMode, 'championship');
  });
});
