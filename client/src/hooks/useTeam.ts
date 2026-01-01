import { useState, useEffect } from 'react';
import axios from 'axios';

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  model: string;
}

export interface TeamConfig {
  mainModelId: string;
  executorEnabled: boolean;
  executorModelId: string;
  agents: AgentConfig[];
  updatedAt?: string;
}

export const useTeam = () => {
  const [team, setTeam] = useState<TeamConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTeam = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/team');
      if (res.data.team) {
        setTeam(res.data.team);
      }
      setError(null);
    } catch (err: any) {
      console.error('Failed to fetch team:', err);
      // Don't set error on 404/null, just means no team yet
    } finally {
      setLoading(false);
    }
  };

  const saveTeam = async (config: TeamConfig) => {
    setSaving(true);
    try {
      const res = await axios.post('/api/team', config);
      setTeam(res.data.team);
      setError(null);
      return true;
    } catch (err: any) {
      setError(err.response?.data?.error || err.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  return {
    team,
    loading,
    saving,
    error,
    saveTeam,
    refresh: fetchTeam
  };
};
