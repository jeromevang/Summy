/**
 * Performance Monitoring Hook
 * Tracks render performance and provides optimization insights
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface PerformanceMetrics {
  renderCount: number;
  averageRenderTime: number;
  lastRenderTime: number;
  slowRenders: number;
  memoryUsage?: number;
}

interface UsePerformanceOptions {
  threshold?: number; // ms threshold for slow renders
  trackMemory?: boolean;
  componentName?: string;
}

export const usePerformance = (options: UsePerformanceOptions = {}): PerformanceMetrics => {
  const {
    threshold = 16, // 60fps threshold
    trackMemory = true,
    componentName = 'Component'
  } = options;

  const renderCount = useRef(0);
  const renderTimes = useRef<number[]>([]);
  const startTime = useRef<number>(0);
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderCount: 0,
    averageRenderTime: 0,
    lastRenderTime: 0,
    slowRenders: 0
  });

  // Start timing on render
  startTime.current = performance.now();

  useEffect(() => {
    const endTime = performance.now();
    const renderTime = endTime - startTime.current;
    
    renderCount.current += 1;
    renderTimes.current.push(renderTime);

    // Keep only last 100 renders
    if (renderTimes.current.length > 100) {
      renderTimes.current.shift();
    }

    const slowRenders = renderTimes.current.filter(time => time > threshold).length;
    const averageRenderTime = renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length;

    setMetrics({
      renderCount: renderCount.current,
      averageRenderTime,
      lastRenderTime: renderTime,
      slowRenders,
      memoryUsage: trackMemory ? (performance as any).memory?.usedJSHeapSize : undefined
    });

    // Log performance warnings in development
    if (process.env.NODE_ENV === 'development') {
      if (renderTime > threshold) {
        console.warn(`${componentName} slow render: ${renderTime.toFixed(2)}ms`);
      }
      
      if (renderTime > threshold * 2) {
        console.error(`${componentName} very slow render: ${renderTime.toFixed(2)}ms`);
      }
    }
  });

  return metrics;
};

/**
 * Debounced callback hook for performance optimization
 */
export const useDebouncedCallback = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args: any[]) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
};

/**
 * Memoized expensive calculations
 */
export const useExpensiveCalculation = <T>(
  dependencies: any[],
  calculation: () => T,
  threshold = 16
): T => {
  const startTime = useRef(performance.now());
  const result = useMemo(() => {
    const result = calculation();
    const duration = performance.now() - startTime.current;
    
    if (duration > threshold && process.env.NODE_ENV === 'development') {
      console.warn(`Expensive calculation took ${duration.toFixed(2)}ms`);
    }
    
    return result;
  }, dependencies);

  return result;
};

/**
 * Virtualization helper for long lists
 */
export const useVirtualization = <T>(
  items: T[],
  itemHeight: number,
  containerHeight: number
) => {
  const [scrollTop, setScrollTop] = useState(0);
  
  const visibleRange = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + 1,
      items.length - 1
    );
    
    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, items.length]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [items, visibleRange]);

  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.startIndex * itemHeight;

  return {
    visibleItems,
    totalHeight,
    offsetY,
    setScrollTop
  };
};

/**
 * Image loading optimization hook
 */
export const useImagePreload = (src: string) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setIsLoaded(true);
    img.onerror = (e) => setError(new Error(`Failed to load image: ${src}`));
    img.src = src;
  }, [src]);

  return { isLoaded, error };
};

/**
 * Intersection Observer hook for lazy loading
 */
export const useIntersectionObserver = (
  options: IntersectionObserverInit = {}
) => {
  const [isIntersecting, setIsIntersecting] = useState(false);
  const elementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [options]);

  return { elementRef, isIntersecting };
};

/**
 * Performance monitoring component wrapper
 */
interface PerformanceWrapperProps {
  children: React.ReactNode;
  name: string;
  threshold?: number;
}

export const PerformanceWrapper: React.FC<PerformanceWrapperProps> = ({
  children,
  name,
  threshold = 16
}) => {
  const metrics = usePerformance({ threshold, componentName: name });

  return (
    <div>
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-500 mb-2">
          {name} - Renders: {metrics.renderCount}, Avg: {metrics.averageRenderTime.toFixed(2)}ms, 
          Slow: {metrics.slowRenders}
        </div>
      )}
      {children}
    </div>
  );
};
