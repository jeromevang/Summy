import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import Sources from '../src/pages/Sources';
import { BrowserRouter } from 'react-router-dom';
import * as useSourcesHook from '../src/hooks/useSources';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock useSources
const mockSaveSources = vi.fn();
const mockSettings = {
  openaiApiKey: 'sk-test',
  openrouterApiKey: '',
  lmstudioUrl: 'http://localhost:1234',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3', // Included in settings
  azureResourceName: '',
  azureApiKey: ''
};

vi.mock('../src/hooks/useSources', () => ({
  useSources: vi.fn()
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(
    <BrowserRouter>
      {component}
    </BrowserRouter>
  );
};

describe('Verification: Sources Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useSourcesHook.useSources as any).mockReturnValue({
      settings: mockSettings,
      loading: false,
      saving: false,
      saveSources: mockSaveSources
    });
    mockedAxios.get.mockResolvedValue({ data: { endpoints: { rag: 'http://locahost:3002' }, systemPromptSnippet: 'Use RAG...' } });
  });

  it('renders the title correctly', () => {
    renderWithRouter(<Sources />);
    expect(screen.getByText(/Sources & Providers/i)).toBeInTheDocument();
  });

  it('renders input fields', () => {
    renderWithRouter(<Sources />);
    expect(screen.getByPlaceholderText(/sk-\.\.\./i)).toBeInTheDocument(); // OpenAI
    expect(screen.getByPlaceholderText(/http:\/\/localhost:11434/i)).toBeInTheDocument(); // Ollama
  });

  it('correctly initializes form state including ollamaModel', async () => {
    renderWithRouter(<Sources />);
    
    // This expects the input with value 'llama3' (from mockSettings)
    // If the bug exists (ollamaModel missing in state init), this might fail or show empty
    const ollamaModelInput = screen.getByDisplayValue('llama3');
    expect(ollamaModelInput).toBeInTheDocument();
  });

  it('updates input fields', () => {
    renderWithRouter(<Sources />);
    const input = screen.getByPlaceholderText(/sk-\.\.\./i);
    fireEvent.change(input, { target: { value: 'sk-new-key' } });
    expect((input as HTMLInputElement).value).toBe('sk-new-key');
  });

  it('calls saveSources on save button click', () => {
    renderWithRouter(<Sources />);
    fireEvent.click(screen.getByText('Save Changes'));
    expect(mockSaveSources).toHaveBeenCalled();
  });
});
