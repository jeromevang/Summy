import { useState, useEffect } from 'react';
import axios from 'axios';
import { ServerSettings } from '../types';

export const useSettings = () => {
  const [settings, setSettings] = useState<ServerSettings>({ provider: 'openai', openaiModel: 'gpt-4o-mini', azureResourceName: '', azureDeploymentName: '', azureApiKey: '', azureApiVersion: '2024-02-01', lmstudioUrl: 'http://localhost:1234', lmstudioModel: '', openrouterApiKey: '', openrouterModel: '', defaultCompressionMode: 1, defaultKeepRecent: 5 });
  const [openaiKey, setOpenaiKey] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [summyEnabled, setSummyEnabled] = useState(true);
  const [toolyEnabled, setToolyEnabled] = useState(true);

  const loadSettings = async () => {
    try {
      const res = await axios.get('http://localhost:3001/api/settings');
      setSettings(res.data);
      setSummyEnabled(res.data.modules?.summy?.enabled ?? true);
      setToolyEnabled(res.data.modules?.tooly?.enabled ?? true);
      const key = localStorage.getItem('summy-openai-key');
      if (key) setOpenaiKey(key);
      setIsLoaded(true);
    } catch { setIsLoaded(true); }
  };

  useEffect(() => { loadSettings(); }, []);

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const data = { ...settings, modules: { summy: { enabled: summyEnabled }, tooly: { enabled: toolyEnabled } } };
      await axios.post('http://localhost:3001/api/settings', data);
      localStorage.setItem('summy-openai-key', openaiKey);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch { setSaveStatus('error'); }
  };

  return { settings, setSettings, openaiKey, setOpenaiKey, isLoaded, saveStatus, summyEnabled, setSummyEnabled, toolyEnabled, setToolyEnabled, handleSave };
};
