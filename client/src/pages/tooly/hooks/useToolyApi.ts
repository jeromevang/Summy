import { useConfigOps, useModelOps, useTestOps, useSandboxOps } from './api';

export function useToolyApi(params: any): any {
  const config = useConfigOps(params, params);
  const model = useModelOps(params, params);
  const test = useTestOps(params, params);
  const sandbox = useSandboxOps(params);

  return {
    ...config,
    ...model,
    ...test,
    ...sandbox,
    fetchMcpStatus: async () => {},
    toggleMcpConnection: async () => {},
    updateContextLength: async () => {},
    removeContextLength: async () => {},
    fetchCustomTests: async () => {},
    fetchLogs: async () => {},
    fetchModelProfile: async () => {},
    runProbeTests: async () => {},
    saveProxyMode: async () => {},
    handleRollback: async () => {},
    handleDeleteTest: async () => {},
    handleTryTest: async () => {},
    getMainModels: () => params.models.filter((m: any) => m.role === 'main' || m.role === 'both'),
    getExecutorModels: () => params.models.filter((m: any) => m.role === 'executor' || m.role === 'both'),
    indexSandbox: async () => {}
  };
}