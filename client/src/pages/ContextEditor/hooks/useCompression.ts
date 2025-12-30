import { useState, useEffect } from 'react';
import axios from 'axios';
import { CompressionVersions, ContextSession } from '../types';

export const useCompression = (sessionId: string | undefined, session: ContextSession | null) => {
  const [compressionMode, setCompressionMode] = useState<0 | 1 | 2 | 3>(0);
  const [keepRecent, setKeepRecent] = useState(5);
  const [compressionVersions, setCompressionVersions] = useState<CompressionVersions | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [recompressing, setRecompressing] = useState(false);

  const loadCompressionVersions = async () => {
    if (!sessionId) return;
    setLoadingVersions(true);
    try {
      const response = await axios.get(`http://localhost:3001/api/sessions/${sessionId}/compressions`);
      setCompressionVersions(response.data);
    } catch (error) {
      console.error('Failed to load compression versions:', error);
    } finally {
      setLoadingVersions(false);
    }
  };

  const saveCompressionSettings = async (mode: 0 | 1 | 2 | 3, keepRecentValue: number) => {
    if (!sessionId) return;
    try {
      await axios.post(`http://localhost:3001/api/sessions/${sessionId}/compression`, {
        mode,
        keepRecent: keepRecentValue,
        enabled: true
      });
    } catch (error) {
      console.error('Failed to save compression settings:', error);
    }
  };

  const handleCompressionModeChange = (newMode: 0 | 1 | 2 | 3) => {
    setCompressionMode(newMode);
    saveCompressionSettings(newMode, keepRecent);
  };

  const handleRecompress = async (systemPrompt: string) => {
    if (!sessionId) return;
    setRecompressing(true);
    try {
      const response = await axios.post(`http://localhost:3001/api/sessions/${sessionId}/recompress`, {
        keepRecent,
        systemPrompt
      });
      if (response.data) {
        setCompressionVersions(response.data);
        return true;
      }
    } catch (error: any) {
      console.error('Recompression failed:', error);
      alert(`Recompression failed: ${error.response?.data?.message || error.message}`);
    } finally {
      setRecompressing(false);
    }
    return false;
  };

  useEffect(() => {
    if (sessionId) {
      loadCompressionVersions();
    }
  }, [sessionId, session?.conversations.length]); // Reload when turn count changes

  useEffect(() => {
    if (session?.compression) {
      if (session.compression.mode !== undefined) {
        setCompressionMode(session.compression.mode);
      }
      if (session.compression.keepRecent !== undefined) {
        setKeepRecent(session.compression.keepRecent);
      }
    }
  }, [session]);

  return {
    compressionMode,
    setCompressionMode,
    keepRecent,
    setKeepRecent,
    compressionVersions,
    setCompressionVersions,
    loadingVersions,
    recompressing,
    handleCompressionModeChange,
    handleRecompress,
    saveCompressionSettings,
    loadCompressionVersions
  };
};
