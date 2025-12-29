/**
 * Frontend Testing Framework
 * React component tests, integration tests, and e2e tests
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import React from 'react';

// Test utilities
export const createMockComponent = (props: any = {}) => {
  return {
    render: (component: React.ReactElement) => {
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false }
        }
      });

      return render(
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            {component}
          </BrowserRouter>
        </QueryClientProvider>
      );
    }
  };
};

// Mock data generators
export const generateMockModel = (overrides: any = {}) => ({
  id: 'test-model-1',
  displayName: 'Test Model',
  provider: 'openai',
  status: 'tested',
  role: 'both',
  category: 'general',
  score: 85,
  toolScore: 90,
  reasoningScore: 80,
  avgLatency: 1000,
  testedAt: new Date().toISOString(),
  ...overrides
});

export const generateMockComboResult = (overrides: any = {}) => ({
  mainModelId: 'model-1',
  executorModelId: 'model-2',
  overallScore: 85,
  mainScore: 80,
  executorScore: 90,
  tierScores: [],
  categoryScores: [],
  testResults: [],
  avgLatencyMs: 1000,
  passedCount: 10,
  failedCount: 2,
  mainExcluded: false,
  testedAt: new Date().toISOString(),
  ...overrides
});

// ============================================================
// COMPONENT TESTS
// ============================================================

describe('Error Handling Components', () => {
  let mockUseError: any;

  beforeEach(() => {
    mockUseError = vi.fn();
    vi.mock('../hooks/useError.ts', () => ({
      useError: () => mockUseError()
    }));
  });

  it('should render error display component', () => {
    const mockError = generateMockError();
    mockUseError.mockReturnValue({
      errors: [mockError],
      dismissError: vi.fn(),
      retryError: vi.fn()
    });

    const { ErrorDisplay } = require('../components/ErrorDisplay.tsx');
    
    render(
      <ErrorDisplay 
        error={mockError} 
        onDismiss={() => {}} 
        onRetry={() => {}} 
      />
    );

    expect(screen.getByText(mockError.message)).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });
});

describe('Model Management Components', () => {
  it('should render model list', async () => {
    const mockModels = [
      generateMockModel({ displayName: 'Model 1' }),
      generateMockModel({ displayName: 'Model 2' })
    ];

    vi.mock('../services/model-manager.ts', () => ({
      modelManager: {
        getModels: vi.fn().mockResolvedValue(mockModels)
      }
    }));

    const { ModelList } = require('../components/ModelList.tsx');

    render(<ModelList />);

    await waitFor(() => {
      expect(screen.getByText('Model 1')).toBeInTheDocument();
      expect(screen.getByText('Model 2')).toBeInTheDocument();
    });
  });

  it('should handle model selection', () => {
    const mockOnSelect = vi.fn();
    const mockModel = generateMockModel();

    render(
      <ModelCard 
        model={mockModel}
        isSelected={false}
        onToggle={mockOnSelect}
        role="main"
      />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(mockOnSelect).toHaveBeenCalledWith(mockModel.id);
  });
});

describe('Combo Testing Components', () => {
  it('should render combo test results', async () => {
    const mockResults = [
      generateMockComboResult({ mainModelId: 'Model A', executorModelId: 'Model B' })
    ];

    vi.mock('../services/combo-tester.ts', () => ({
      getComboResults: vi.fn().mockResolvedValue(mockResults)
    }));

    render(<ComboTestResults results={mockResults} />);

    await waitFor(() => {
      expect(screen.getByText('Model A')).toBeInTheDocument();
      expect(screen.getByText('Model B')).toBeInTheDocument();
    });
  });
});

// ============================================================
// HOOK TESTS
// ============================================================

describe('useError Hook', () => {
  it('should handle API errors correctly', async () => {
    const { useErrorHandler } = require('../hooks/useError.ts');

    const mockAddError = vi.fn();
    const mockContext = {
      addError: mockAddError,
      dismissError: vi.fn()
    };

    // Mock the error context
    vi.mock('../context/ErrorContext.tsx', () => ({
      useError: () => mockContext
    }));

    const { handleApiError } = useErrorHandler();

    const mockError = {
      response: {
        status: 400,
        data: { message: 'Validation error' }
      }
    };

    handleApiError(mockError, { component: 'TestComponent', action: 'testAction' });

    expect(mockAddError).toHaveBeenCalledWith({
      type: 'VALIDATION_ERROR',
      message: 'Validation error',
      details: { message: 'Validation error' },
      component: 'TestComponent',
      action: 'testAction',
      retryable: false
    });
  });
});

describe('usePerformance Hook', () => {
  it('should track render performance', () => {
    const { usePerformance } = require('../hooks/usePerformance.ts');

    let renderCount = 0;
    const TestComponent = () => {
      usePerformance({ componentName: 'TestComponent' });
      renderCount++;
      return <div>Test</div>;
    };

    render(<TestComponent />);
    render(<TestComponent />);

    expect(renderCount).toBe(2);
  });
});

describe('useAsyncError Hook', () => {
  it('should handle async errors', async () => {
    const { useAsyncError } = require('../hooks/useError.ts');

    const mockHandleApiError = vi.fn();
    const mockContext = {
      handleApiError: mockHandleApiError
    };

    vi.mock('../hooks/useError.ts', () => ({
      useErrorHandler: () => mockContext
    }));

    const { executeAsync } = useAsyncError();

    const mockAsyncFn = vi.fn().mockRejectedValue(new Error('Test error'));

    const result = await executeAsync(mockAsyncFn, { component: 'TestComponent' });

    expect(result).toBeNull();
    expect(mockHandleApiError).toHaveBeenCalled();
  });
});

// ============================================================
// INTEGRATION TESTS
// ============================================================

describe('Model Management Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should complete full model discovery workflow', async () => {
    const mockModels = [generateMockModel()];
    
    vi.mock('../services/model-manager.ts', () => ({
      modelManager: {
        discoverModels: vi.fn().mockResolvedValue({
          models: mockModels,
          providers: { openai: true },
          totalModels: 1
        }),
        getModels: vi.fn().mockReturnValue(mockModels)
      }
    }));

    const { ModelDiscoveryPage } = require('../pages/ModelDiscovery.tsx');

    render(<ModelDiscoveryPage />);

    await waitFor(() => {
      expect(screen.getByText('Discover Models')).toBeInTheDocument();
    });

    const discoverButton = screen.getByText('Discover Models');
    fireEvent.click(discoverButton);

    await waitFor(() => {
      expect(screen.getByText(mockModels[0].displayName)).toBeInTheDocument();
    });
  });

  it('should handle model health checks', async () => {
    const mockHealthCheck = {
      modelId: 'test-model',
      status: 'healthy',
      responseTime: 100
    };

    vi.mock('../services/model-manager.ts', () => ({
      modelManager: {
        healthCheckModel: vi.fn().mockResolvedValue(mockHealthCheck)
      }
    }));

    const { HealthCheckPage } = require('../pages/HealthCheck.tsx');

    render(<HealthCheckPage />);

    await waitFor(() => {
      expect(screen.getByText('Health Check')).toBeInTheDocument();
    });

    const checkButton = screen.getByText('Check Health');
    fireEvent.click(checkButton);

    await waitFor(() => {
      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });
  });
});

describe('Combo Testing Integration', () => {
  it('should handle combo test workflow', async () => {
    const mockModels = [
      generateMockModel({ id: 'model1', role: 'main' }),
      generateMockModel({ id: 'model2', role: 'executor' })
    ];

    const mockResult = generateMockComboResult({
      mainModelId: 'model1',
      executorModelId: 'model2'
    });

    vi.mock('../services/model-manager.ts', () => ({
      modelManager: {
        getModels: vi.fn().mockReturnValue(mockModels)
      }
    }));

    vi.mock('../services/combo-tester.ts', () => ({
      runComboTest: vi.fn().mockResolvedValue(mockResult)
    }));

    const { ComboTestPage } = require('../pages/ComboTest.tsx');

    render(<ComboTestPage />);

    await waitFor(() => {
      expect(screen.getByText('Combo Testing')).toBeInTheDocument();
    });

    // Select models
    const model1Checkbox = screen.getByDisplayValue('model1');
    const model2Checkbox = screen.getByDisplayValue('model2');
    
    fireEvent.click(model1Checkbox);
    fireEvent.click(model2Checkbox);

    // Start test
    const startButton = screen.getByText('Start Combo Test');
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText('Test Results')).toBeInTheDocument();
    });
  });
});

// ============================================================
// E2E TESTS
// ============================================================

describe('End-to-End User Flows', () => {
  it('should complete full testing workflow', async () => {
    // Mock all necessary services
    const mockModels = [generateMockModel()];
    const mockRecommendations = [{
      model: mockModels[0],
      score: 90,
      reasons: ['Test reason'],
      confidence: 'high' as const
    }];

    vi.mock('../services/model-manager.ts', () => ({
      modelManager: {
        discoverModels: vi.fn().mockResolvedValue({ models: mockModels, totalModels: 1 }),
        getRecommendations: vi.fn().mockReturnValue(mockRecommendations),
        healthCheckModel: vi.fn().mockResolvedValue({ status: 'healthy' })
      }
    }));

    render(<App />); // Main app component

    // Navigate to model discovery
    await waitFor(() => {
      expect(screen.getByText('Summy')).toBeInTheDocument();
    });

    const discoverLink = screen.getByText('Model Discovery');
    fireEvent.click(discoverLink);

    await waitFor(() => {
      expect(screen.getByText('Discover Models')).toBeInTheDocument();
    });

    // Start discovery
    const discoverButton = screen.getByText('Discover Models');
    fireEvent.click(discoverButton);

    await waitFor(() => {
      expect(screen.getByText(mockModels[0].displayName)).toBeInTheDocument();
    });

    console.log('✅ Full workflow E2E test passed');
  });

  it('should handle error scenarios gracefully', async () => {
    vi.mock('../services/model-manager.ts', () => ({
      modelManager: {
        discoverModels: vi.fn().mockRejectedValue(new Error('Network error'))
      }
    }));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Summy')).toBeInTheDocument();
    });

    const discoverLink = screen.getByText('Model Discovery');
    fireEvent.click(discoverLink);

    await waitFor(() => {
      expect(screen.getByText('Discover Models')).toBeInTheDocument();
    });

    const discoverButton = screen.getByText('Discover Models');
    fireEvent.click(discoverButton);

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    console.log('✅ Error handling E2E test passed');
  });

  it('should handle performance monitoring', async () => {
    render(<PerformanceDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Performance Dashboard')).toBeInTheDocument();
    });

    const startButton = screen.getByText('Start Monitoring');
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(screen.getByText('Monitoring active')).toBeInTheDocument();
    });

    const clearButton = screen.getByText('Clear Metrics');
    fireEvent.click(clearButton);

    console.log('✅ Performance monitoring E2E test passed');
  });
});

// ============================================================
// PERFORMANCE TESTS
// ============================================================

describe('Component Performance', () => {
  it('should render large lists efficiently', async () => {
    const largeModelList = Array.from({ length: 1000 }, (_, i) => 
      generateMockModel({ id: `model-${i}`, displayName: `Model ${i}` })
    );

    const startTime = performance.now();
    
    render(<ModelList models={largeModelList} />);
    
    await waitFor(() => {
      expect(screen.getByText('Model 0')).toBeInTheDocument();
    });

    const endTime = performance.now();
    const renderTime = endTime - startTime;

    expect(renderTime).toBeLessThan(1000); // Should render in under 1 second
    console.log(`✅ Large list rendering test passed (${renderTime}ms)`);
  });

  it('should handle rapid state updates', async () => {
    const TestComponent = () => {
      const [count, setCount] = React.useState(0);
      const metrics = usePerformance({ componentName: 'RapidUpdateTest' });

      React.useEffect(() => {
        const interval = setInterval(() => {
          setCount(prev => prev + 1);
        }, 10);

        return () => clearInterval(interval);
      }, []);

      return <div>{count}</div>;
    };

    const startTime = performance.now();
    
    render(<TestComponent />);
    
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
    });

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    expect(totalTime).toBeLessThan(200); // Should update rapidly
    console.log(`✅ Rapid state updates test passed (${totalTime}ms)`);
  });
});

// ============================================================
// TEST CONFIGURATION
// ============================================================

export const setupFrontendTests = () => {
  // Setup test environment
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  console.log('🧪 Frontend test environment setup complete');
};

export const teardownFrontendTests = () => {
  vi.clearAllMocks();
  console.log('🧪 Frontend test environment teardown complete');
};

// Export test utilities
export default {
  createMockComponent,
  generateMockModel,
  generateMockComboResult,
  setupFrontendTests,
  teardownFrontendTests
};
