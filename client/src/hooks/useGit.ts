import { useState, useEffect } from 'react';
import axios from 'axios';

export interface GitStatus {
  isRepo: boolean;
  isClean: boolean;
  branch: string;
  modifiedFiles: string[];
  conflicts: boolean;
}

export const useGit = () => {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [safeMode, setSafeMode] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/api/git/status');
      setStatus(res.data);
      
      // Also sync safe mode from workspace
      const wsRes = await axios.get('/api/workspace');
      setSafeMode(wsRes.data.safeMode);
    } catch (e) {
      console.error('Failed to fetch git status:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleSafeMode = async () => {
    const newVal = !safeMode;
    try {
      await axios.post('/api/workspace/safe-mode', { enabled: newVal });
      setSafeMode(newVal);
    } catch (e) {
      console.error('Failed to toggle safe mode:', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  return {
    status,
    loading,
    safeMode,
    toggleSafeMode,
    refresh: fetchStatus
  };
};