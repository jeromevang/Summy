export interface Metric {
  timestamp: number;
  value: number;
  label?: string;
}

export interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
}

export interface HealthStatus {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message: string;
  responseTime: number;
}

export interface PerformanceMetrics {
  avgResponseTime: number;
  requestCount: number;
  errorRate: number;
  throughput: number;
}
