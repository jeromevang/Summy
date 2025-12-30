import { apiClient } from './api-client';
import type { DiscoveredModel, ModelProfile, ProxyMode } from '../pages/tooly/types';
import type { CustomTest } from '../components/TestEditor';

export const ToolyService = {
  // Settings
  getSettings: async () => {
    const { data } = await apiClient.get('/settings');
    return data;
  },

  updateSettings: async (settings: any) => {
    const { data } = await apiClient.post('/settings', settings);
    return data;
  },

  updateProxyMode: async (proxyMode: ProxyMode) => {
    const { data } = await apiClient.put('/settings', { proxyMode });
    return data;
  },

  // Models
  getModels: async (providerFilter: string) => {
    const { data } = await apiClient.get(`/tooly/models?provider=${providerFilter}`);
    return data;
  },

  getModelProfile: async (modelId: string) => {
    const { data } = await apiClient.get(`/tooly/models/${encodeURIComponent(modelId)}/detail`);
    return data;
  },

  saveSystemPrompt: async (modelId: string, systemPrompt: string) => {
    const { data } = await apiClient.put(`/tooly/models/${encodeURIComponent(modelId)}/prompt`, { systemPrompt });
    return data;
  },

  updateContextLength: async (modelId: string, contextLength: number) => {
    const { data } = await apiClient.put(`/tooly/models/${encodeURIComponent(modelId)}/context-length`, { contextLength });
    return data;
  },

  removeContextLength: async (modelId: string) => {
    await apiClient.delete(`/tooly/models/${encodeURIComponent(modelId)}/context-length`);
  },

  // Tests & Execution
  runModelTests: async (modelId: string, provider: string, testMode: string) => {
    const { data } = await apiClient.post(`/tooly/models/${encodeURIComponent(modelId)}/test`, {
      provider,
      testMode
    });
    return data;
  },

  runProbeTests: async (modelId: string, provider: string, runLatencyProfile: boolean) => {
    const { data } = await apiClient.post(`/tooly/models/${encodeURIComponent(modelId)}/probe`, {
      provider,
      runLatencyProfile
    });
    return data;
  },

  getTests: async () => {
    const { data } = await apiClient.get('/tooly/tests');
    return data;
  },

  getCustomTests: async () => {
    const { data } = await apiClient.get('/tooly/custom-tests');
    return data;
  },

  saveCustomTest: async (test: CustomTest) => {
    if (test.id) {
      const { data } = await apiClient.put(`/tooly/custom-tests/${encodeURIComponent(test.id)}`, test);
      return data;
    } else {
      const { data } = await apiClient.post('/tooly/custom-tests', test);
      return data;
    }
  },

  deleteCustomTest: async (testId: string) => {
    await apiClient.delete(`/tooly/custom-tests/${encodeURIComponent(testId)}`);
  },

  tryCustomTest: async (testId: string, modelId: string) => {
    const { data } = await apiClient.post(`/tooly/custom-tests/${encodeURIComponent(testId)}/try`, { modelId });
    return data;
  },

  getLogs: async () => {
    const { data } = await apiClient.get('/tooly/logs');
    return data;
  },

  // MCP
  getMcpStatus: async () => {
    const { data } = await apiClient.get('/tooly/mcp/status');
    return data;
  },

  getMcpTools: async () => {
    const { data } = await apiClient.get('/tooly/mcp/tools');
    return data;
  },

  toggleMcpConnection: async (connected: boolean) => {
    const endpoint = connected ? '/tooly/mcp/disconnect' : '/tooly/mcp/connect';
    const { data } = await apiClient.post(endpoint);
    return data;
  },

  // Sandbox
  enterSandbox: async () => {
    const { data } = await apiClient.post('/tooly/sandbox/enter');
    return data;
  },

  exitSandbox: async () => {
    const { data } = await apiClient.post('/tooly/sandbox/exit');
    return data;
  },

  getSandboxStatus: async () => {
    const { data } = await apiClient.get('/tooly/sandbox/status');
    return data;
  },

  indexSandbox: async () => {
    const { data } = await apiClient.post('/tooly/sandbox/index');
    return data;
  },

  // Backups
  restoreBackup: async (backupId: string) => {
    await apiClient.post(`/tooly/backups/${backupId}/restore`);
  }
};
