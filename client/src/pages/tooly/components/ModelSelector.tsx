import React from 'react';
import { ModelListPanel } from './ModelListPanel';
import type { 
  DiscoveredModel, 
  TestProgress, 
  TestAllProgress, 
  IntentProgress, 
  ProviderFilter, 
  TestMode, 
  AvailableProviders 
} from '../types';

interface ModelSelectorProps {
  models: DiscoveredModel[];
  selectedModelId: string | null;
  loading: boolean;
  testProgress: TestProgress;
  calculateETA: () => string | null;
  onSelectModel: (modelId: string) => void;
  providerFilter: ProviderFilter;
  setProviderFilter: (filter: ProviderFilter) => void;
  availableProviders: AvailableProviders;
  testMode: TestMode;
  setTestMode: (mode: TestMode) => void;
  testingAllModels: boolean;
  setTestingAllModels: (testing: boolean) => void;
  testAllProgress: TestAllProgress | null;
  setTestAllProgress: (progress: TestAllProgress | null) => void;
  cancelTestAllRef: React.MutableRefObject<boolean>;
  testingIntents: boolean;
  setTestingIntents: (testing: boolean) => void;
  intentProgress: IntentProgress | null;
  setIntentProgress: (progress: IntentProgress | null) => void;
  cancelIntentTestRef: React.MutableRefObject<boolean>;
  fetchModels: () => Promise<void>;
}

export const ModelSelector: React.FC<ModelSelectorProps> = (props) => {
  return (
    <div className="flex flex-col h-full">
      <ModelListPanel {...props} />
    </div>
  );
};