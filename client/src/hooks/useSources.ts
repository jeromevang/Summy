import { useState, useEffect } from 'react';
import axios from 'axios';
import { ServerSettings } from '../pages/Settings/types';

export const useSources = () => {
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/settings');
      setSettings(res.data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const saveSources = async (newSettings: Partial<ServerSettings>) => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = { ...settings, ...newSettings };
      await axios.post('/api/settings', updated);
      setSettings(updated);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchSources();
  }, []);

  return {
    settings,
    loading,
    saving,
    error,
    saveSources,
    refresh: fetchSources
  };
};
