import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadServerSettings } from '../settings-service.js';
import fs from 'fs-extra';

vi.mock('fs-extra');

describe('settings-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return default settings if file does not exist', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false as never);
    
    const settings = await loadServerSettings();
    
    expect(settings.provider).toBe('openai');
    expect(settings.openaiModel).toBe('gpt-4o-mini');
  });

  it('should load settings from file if it exists', async () => {
    const mockSettings = {
      provider: 'openrouter',
      openrouterModel: 'test-model'
    };
    
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue(mockSettings);
    
    const settings = await loadServerSettings();
    
    expect(settings.provider).toBe('openrouter');
    expect(settings.openrouterModel).toBe('test-model');
  });
});
