export enum HealthStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  UNHEALTHY = 'UNHEALTHY',
  UNKNOWN = 'UNKNOWN'
}

export interface HealthCheck {
  name: string;
  status: HealthStatus;
  message: string;
  responseTime: number;
  details?: any;
  timestamp: string;
}

export interface HealthSummary {
  overall: HealthStatus;
  checks: HealthCheck[];
  timestamp: string;
  uptime: number;
}
