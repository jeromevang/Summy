import { useState, useEffect } from 'react';
import axios from 'axios';

export interface WorkspaceInfo {
  current: string;
  recent: string[];
}

export const useWorkspace = () => {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspace = async () => {
    try {
      const res = await axios.get('/api/workspace');
      setWorkspace(res.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch workspace info');
    } finally {
      setLoading(false);
    }
  };

  const switchWorkspace = async (path: string) => {
    setSwitching(true);
    try {
      const res = await axios.post('/api/workspace/switch', { path });
      if (res.data.success) {
        // Refresh info
        await fetchWorkspace();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSwitching(false);
    }
  };

  useEffect(() => {
    fetchWorkspace();
  }, []);

  return {
    workspace,
    loading,
    switching,
    error,
    switchWorkspace,
    refresh: fetchWorkspace
  };
};
