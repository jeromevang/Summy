import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '@/pages/ContextEditor/hooks/useSession';
import { useCompression } from '@/pages/ContextEditor/hooks/useCompression';
import { useKeywords } from '@/pages/ContextEditor/hooks/useKeywords'; // Import useKeywords
import { ContextSession } from '@/pages/ContextEditor/types';
import { CompressionVersions } from '@summy/shared'; // Correct import path
import { getAllMessages, getEffectiveTurnIndex } from '@/pages/ContextEditor/utils';


export interface PrismState {
  // Data
  session: ContextSession | null;
  loading: boolean;
  
  // Selection
  selectedTurnIdx: number;
  setSelectedTurnIdx: (idx: number) => void;
  maxTurns: number;
  
  // Compression / Surgical View
  compressionMode: number;
  setCompressionMode: (mode: number) => void;
  keepRecent: number;
  setKeepRecent: (count: number) => void;
  surgicalMessages: any[]; // The messages sent to LLM
  
  // Keywords
  keywords: string[];
  keywordMap: Map<string, string>;

  // Window Stats (for Prism Visualizer)
  windowStats: {
    system: number;
    rag: number;
    memory: number;
    history: number;
    total: number;
    limit: number;
  };
  
  // Interaction
  recompress: (systemPrompt: string) => void;
  isRecompressing: boolean;
  saveCompressionSettings: (mode: number, recent: number) => void; // Expose save function
}

export const useContextPrism = (sessionId: string | undefined): PrismState => {
  const navigate = useNavigate();
  
  // 1. Core Session Data
  const {
    session,
    loading,
    lmstudioConnected // lmstudioConnected is used by useCompression
  } = useSession(sessionId, navigate);

  // 2. Compression / Surgical Logic
  const {
    compressionMode,
    handleCompressionModeChange,
    keepRecent,
    setKeepRecent,
    compressionVersions,
    recompressing,
    handleRecompress,
    saveCompressionSettings
  } = useCompression(sessionId, session);

  // 3. Keyword Extraction
  const { keywords, keywordMap } = useKeywords(session);

  // 4. Selection State
  const [selectedTurn, setSelectedTurn] = useState<number>(0);

  // 5. Derived Data
  const maxTurns = session?.conversations.length || 0;
  
  // Ensure selected turn is valid
  const effectiveTurnIdx = useMemo(() => {
    if (!session) return 0;
    return getEffectiveTurnIndex(session, selectedTurn);
  }, [selectedTurn, session]);

  // Get surgical messages for the current mode
  const surgicalMessages = useMemo(() => {
    if (!compressionVersions) return [];
    const modeKeys = ['none', 'light', 'medium', 'aggressive'];
    const currentModeKey = modeKeys[compressionMode] as keyof CompressionVersions;
    // @ts-ignore
    return compressionVersions[currentModeKey]?.messages || [];
  }, [compressionVersions, compressionMode]);

  // Calculate Window Stats (Mock logic for now - real logic requires token counting)
  const windowStats = useMemo(() => {
    // TODO: Implement actual token counting from messages
    // For now, estimate based on message count/length
    const allSessionMessages = getAllMessages(session);
    const totalCharsRaw = allSessionMessages.reduce((acc: number, m: any) => acc + (m.content?.length || 0), 0);
    const estimatedTokensRaw = Math.ceil(totalCharsRaw / 4);

    const totalCharsSurgical = surgicalMessages.reduce((acc: number, m: any) => acc + (m.content?.length || 0), 0);
    const estimatedTokensSurgical = Math.ceil(totalCharsSurgical / 4);
    
    // Using surgical messages for history, others are placeholders for now
    return {
      system: 1500, // Fixed system prompt budget
      rag: 2000,    // RAG chunks (placeholder)
      memory: 500,  // Long-term memory (placeholder)
      history: estimatedTokensSurgical,
      total: 1500 + 2000 + 500 + estimatedTokensSurgical,
      limit: 128000 // GPT-4-turbo limit example
    };
  }, [surgicalMessages, session]);

  return {
    session,
    loading,
    selectedTurnIdx: effectiveTurnIdx,
    setSelectedTurnIdx: setSelectedTurn,
    maxTurns,
    compressionMode,
    setCompressionMode: handleCompressionModeChange,
    keepRecent,
    setKeepRecent,
    surgicalMessages,
    keywords,
    keywordMap,
    windowStats,
    recompress: (systemPrompt: string) => handleRecompress(systemPrompt), // Pass systemPrompt
    isRecompressing: recompressing,
    saveCompressionSettings
  };
};
