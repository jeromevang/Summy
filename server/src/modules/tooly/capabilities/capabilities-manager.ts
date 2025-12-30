import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { ModelProfile, ToolCapability, ProbeResults, ContextLatencyData, AgenticReadinessStatus } from './types.js';
import { ALL_TOOLS, REMOVED_TOOLS, TOOL_CATEGORIES, TOOL_RISK_LEVELS } from './tool-metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODEL_PROFILES_DIR = path.join(__dirname, '../../../../data/model-profiles');

export class CapabilitiesService {
  private cache: Map<string, ModelProfile> = new Map();

  constructor() {
    fs.ensureDirSync(MODEL_PROFILES_DIR);
  }

  async getAllProfiles(): Promise<ModelProfile[]> {
    const files = await fs.readdir(MODEL_PROFILES_DIR);
    const profiles: ModelProfile[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const profile = await fs.readJson(path.join(MODEL_PROFILES_DIR, file));
          profiles.push(profile);
          this.cache.set(profile.modelId, profile);
        } catch (e) {
          console.error(`[Capabilities] Failed to load profile ${file}:`, e);
        }
      }
    }
    return profiles;
  }

  async getProfile(modelId: string): Promise<ModelProfile | null> {
    if (this.cache.has(modelId)) return this.cache.get(modelId)!;
    const safeName = this.sanitizeFileName(modelId);
    const profilePath = path.join(MODEL_PROFILES_DIR, `${safeName}.json`);
    try {
      if (await fs.pathExists(profilePath)) {
        const profile = await fs.readJson(profilePath);
        if (profile.enabledTools) profile.enabledTools = profile.enabledTools.filter((t: string) => !REMOVED_TOOLS.includes(t));
        if (profile.capabilities) for (const tool of REMOVED_TOOLS) delete profile.capabilities[tool];
        this.cache.set(modelId, profile);
        return profile;
      }
    } catch (e) { console.error(`[Capabilities] Failed to load profile for ${modelId}:`, e); }
    return null;
  }

  async saveProfile(profile: ModelProfile): Promise<void> {
    const safeName = this.sanitizeFileName(profile.modelId);
    const profilePath = path.join(MODEL_PROFILES_DIR, `${safeName}.json`);
    await fs.writeJson(profilePath, profile, { spaces: 2 });
    this.cache.set(profile.modelId, profile);
    console.log(`[Capabilities] Saved profile for ${profile.modelId}`);
  }

  async deleteProfile(modelId: string): Promise<boolean> {
    const safeName = this.sanitizeFileName(modelId);
    const profilePath = path.join(MODEL_PROFILES_DIR, `${safeName}.json`);
    try {
      if (await fs.pathExists(profilePath)) {
        await fs.remove(profilePath);
        this.cache.delete(modelId);
        return true;
      }
    } catch (e) { console.error(`[Capabilities] Failed to delete profile:`, e); }
    return false;
  }

  detectProviderFromModelId(modelId: string): 'lmstudio' | 'openai' | 'azure' | 'openrouter' {
    if (modelId.includes('/') && (modelId.startsWith('openai/') || modelId.startsWith('anthropic/') || modelId.startsWith('nvidia/') || modelId.startsWith('mistralai/'))) return 'openrouter';
    if (modelId.includes('-') && !modelId.includes('/')) return 'azure';
    return 'lmstudio';
  }

  createEmptyProfile(modelId: string, displayName: string, provider: 'lmstudio' | 'openai' | 'azure' | 'openrouter'): ModelProfile {
    const capabilities: Record<string, ToolCapability> = {};
    for (const tool of ALL_TOOLS) capabilities[tool] = { supported: false, score: 0, testsPassed: 0, testsFailed: 0 };
    return { modelId, displayName, provider, testedAt: new Date().toISOString(), testVersion: 1, score: 0, toolFormat: 'openai_tools', capabilities, enabledTools: [], testResults: [] };
  }

  async updateProbeResults(modelId: string, probeResults: ProbeResults, role: 'main' | 'executor' | 'both' | 'none', contextLatency?: ContextLatencyData, scoreBreakdown?: any): Promise<void> {
    let profile = await this.getProfile(modelId) || this.createEmptyProfile(modelId, modelId, 'lmstudio');
    profile.probeResults = probeResults;
    profile.role = role;
    if (probeResults.overallScore) profile.score = probeResults.overallScore;
    if (contextLatency) {
      profile.contextLatency = contextLatency;
      if (!profile.contextLength) profile.contextLength = contextLatency.recommendedContext;
    }
    if (scoreBreakdown) {
      (profile as any).scoreBreakdown = scoreBreakdown;
      if (scoreBreakdown.isBaseline !== undefined) profile.isBaseline = scoreBreakdown.isBaseline;
    }
    await this.saveProfile(profile);
  }

  async isCapabilityBlocked(modelId: string, capability: string): Promise<boolean> {
    const profile = await this.getProfile(modelId);
    if (!profile) return false;
    return !!profile.blockedCapabilities?.includes(capability) || !!profile.capabilityMap?.[capability]?.blocked;
  }

  async getFallbackModel(modelId: string, capability: string): Promise<string | null> {
    const profile = await this.getProfile(modelId);
    if (!profile) return null;
    if (profile.fallbackModelId) return profile.fallbackModelId;
    const all = await this.getAllProfiles();
    for (const p of all) if (p.modelId !== modelId && p.nativeStrengths?.includes(capability)) return p.modelId;
    return null;
  }

  async setFallbackModel(modelId: string, fallbackModelId: string): Promise<void> {
    const profile = await this.getProfile(modelId);
    if (profile) { profile.fallbackModelId = fallbackModelId; await this.saveProfile(profile); }
  }

  async updateAgenticReadiness(modelId: string, readiness: AgenticReadinessStatus, trainabilityScores?: any): Promise<void> {
    let profile = await this.getProfile(modelId) || this.createEmptyProfile(modelId, modelId, this.detectProviderFromModelId(modelId));
    profile.agenticReadiness = readiness;
    profile.score = readiness.score;
    if (trainabilityScores) profile.trainabilityScores = trainabilityScores;
    await this.saveProfile(profile);
  }

  async getModelsWithNativeCapability(capability: string): Promise<ModelProfile[]> {
    const all = await this.getAllProfiles();
    return all.filter(p => p.nativeStrengths?.includes(capability));
  }

  async getCapabilitySummary(modelId: string): Promise<any> {
    const profile = await this.getProfile(modelId);
    if (!profile) return { native: [], learned: [], blocked: [], untested: [], fallbackModel: null };
    const all = ['rag_query', 'read_file', 'write_file', 'search_files', 'shell_exec', 'web_search', 'browser_navigate', 'multi_step'];
    const tested = new Set([...(profile.nativeStrengths || []), ...(profile.learnedCapabilities || []), ...(profile.blockedCapabilities || [])]);
    return { native: profile.nativeStrengths || [], learned: profile.learnedCapabilities || [], blocked: profile.blockedCapabilities || [], untested: all.filter(c => !tested.has(c)), fallbackModel: profile.fallbackModelId || null };
  }

  private sanitizeFileName(id: string): string {
    return id.toLowerCase().replace(/[^a-z0-9-_.]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
}

export const capabilities = new CapabilitiesService();
