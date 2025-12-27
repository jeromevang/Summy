/**
 * Failure Observer Service
 * Monitors failures in real-time and broadcasts alerts via WebSocket.
 * 
 * Responsibilities:
 * - Group failures by pattern
 * - Detect threshold breaches (5+ similar failures)
 * - Broadcast notifications to connected clients
 * - Trigger controller analysis suggestions
 */

import { wsBroadcast } from './ws-broadcast.js';
import { failureLog, type FailureCategory, type FailureEntry, type FailurePattern } from './failure-log.js';

// ============================================================
// TYPES
// ============================================================

export interface FailureAlert {
  id: string;
  type: 'threshold_breach' | 'critical_pattern' | 'new_pattern' | 'recurring_failure';
  severity: 'info' | 'warning' | 'error' | 'critical';
  pattern: string;
  patternName: string;
  count: number;
  modelId?: string;
  message: string;
  timestamp: string;
  actionRequired: boolean;
  suggestedAction?: string;
}

export interface ObserverConfig {
  thresholdCount: number;       // Alert after N failures of same pattern
  criticalThreshold: number;    // Alert for critical patterns after N failures
  checkIntervalMs: number;      // How often to check for patterns
  enabled: boolean;
}

// ============================================================
// FAILURE OBSERVER CLASS
// ============================================================

class FailureObserver {
  private config: ObserverConfig;
  private alertHistory: FailureAlert[] = [];
  private lastCheckTime: string = new Date().toISOString();
  private checkInterval: NodeJS.Timeout | null = null;
  private seenPatterns: Set<string> = new Set();

  constructor(config?: Partial<ObserverConfig>) {
    this.config = {
      thresholdCount: 5,
      criticalThreshold: 3,
      checkIntervalMs: 30000, // 30 seconds
      enabled: true,
      ...config
    };
  }

  /**
   * Start monitoring
   */
  start(): void {
    if (this.checkInterval) {
      this.stop();
    }

    if (!this.config.enabled) {
      console.log('[FailureObserver] Observer is disabled');
      return;
    }

    console.log(`[FailureObserver] Starting observer (interval: ${this.config.checkIntervalMs}ms)`);
    
    // Initial check
    this.checkForAlerts();

    // Periodic checks
    this.checkInterval = setInterval(() => {
      this.checkForAlerts();
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[FailureObserver] Observer stopped');
    }
  }

  /**
   * Update configuration
   */
  configure(config: Partial<ObserverConfig>): void {
    this.config = { ...this.config, ...config };
    
    if (config.enabled !== undefined || config.checkIntervalMs !== undefined) {
      this.stop();
      if (this.config.enabled) {
        this.start();
      }
    }
  }

  /**
   * Manually trigger a check (called when failure is logged)
   */
  onFailureLogged(entry: FailureEntry): void {
    // Immediate check for critical failures
    if (entry.pattern) {
      const pattern = failureLog.getPattern(entry.pattern);
      if (pattern && pattern.severity === 'critical' && pattern.count >= this.config.criticalThreshold) {
        this.emitAlert({
          type: 'critical_pattern',
          severity: 'critical',
          pattern: pattern.id,
          patternName: pattern.name,
          count: pattern.count,
          modelId: entry.modelId,
          message: `Critical failure pattern detected: ${pattern.name}`,
          actionRequired: true,
          suggestedAction: 'Run controller analysis immediately'
        });
      }
    }
  }

  /**
   * Check for new alerts
   */
  private checkForAlerts(): void {
    const patterns = failureLog.getPatternsAboveThreshold(1); // Get all patterns
    const now = new Date().toISOString();

    for (const pattern of patterns) {
      // Check for threshold breaches
      if (pattern.count >= this.config.thresholdCount) {
        const alertId = `threshold_${pattern.id}`;
        
        if (!this.hasRecentAlert(alertId)) {
          this.emitAlert({
            type: 'threshold_breach',
            severity: pattern.severity === 'critical' ? 'critical' : 'warning',
            pattern: pattern.id,
            patternName: pattern.name,
            count: pattern.count,
            message: `${pattern.count} failures match pattern: ${pattern.name}`,
            actionRequired: pattern.count >= this.config.thresholdCount * 2,
            suggestedAction: pattern.count >= this.config.thresholdCount * 2 
              ? 'Consider running controller analysis'
              : undefined
          });
        }
      }

      // Check for new patterns
      if (!this.seenPatterns.has(pattern.id) && pattern.count >= 2) {
        this.seenPatterns.add(pattern.id);
        
        this.emitAlert({
          type: 'new_pattern',
          severity: 'info',
          pattern: pattern.id,
          patternName: pattern.name,
          count: pattern.count,
          message: `New failure pattern identified: ${pattern.name}`,
          actionRequired: false
        });
      }
    }

    // Check for recurring failures on same model
    const stats = failureLog.getStats();
    for (const [modelId, count] of Object.entries(stats.failuresByModel)) {
      if (count >= 10 && !this.hasRecentAlert(`recurring_${modelId}`)) {
        this.emitAlert({
          type: 'recurring_failure',
          severity: 'warning',
          pattern: 'MODEL_FAILURES',
          patternName: 'Recurring Model Failures',
          count,
          modelId,
          message: `Model ${modelId} has ${count} failures`,
          actionRequired: true,
          suggestedAction: 'Consider running smoke test or applying prosthetic'
        });
      }
    }

    this.lastCheckTime = now;
  }

  /**
   * Emit an alert via WebSocket
   */
  private emitAlert(params: Omit<FailureAlert, 'id' | 'timestamp'>): void {
    const alert: FailureAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      timestamp: new Date().toISOString(),
      ...params
    };

    this.alertHistory.push(alert);

    // Keep only last 100 alerts
    if (this.alertHistory.length > 100) {
      this.alertHistory = this.alertHistory.slice(-100);
    }

    // Broadcast via WebSocket
    wsBroadcast.broadcast('failure_alert', alert);

    console.log(`[FailureObserver] Alert: ${alert.message} (${alert.severity})`);
  }

  /**
   * Check if we've recently sent an alert for this pattern
   */
  private hasRecentAlert(patternKey: string): boolean {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    return this.alertHistory.some(alert => 
      alert.pattern === patternKey && alert.timestamp > oneHourAgo
    );
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit: number = 20): FailureAlert[] {
    return this.alertHistory.slice(-limit).reverse();
  }

  /**
   * Get current observer status
   */
  getStatus(): {
    enabled: boolean;
    running: boolean;
    lastCheck: string;
    alertCount: number;
    patternsTracked: number;
    config: ObserverConfig;
  } {
    return {
      enabled: this.config.enabled,
      running: this.checkInterval !== null,
      lastCheck: this.lastCheckTime,
      alertCount: this.alertHistory.length,
      patternsTracked: this.seenPatterns.size,
      config: this.config
    };
  }

  /**
   * Get summary for dashboard
   */
  getDashboardSummary(): {
    unresolvedFailures: number;
    criticalPatterns: number;
    modelsAffected: number;
    recentAlerts: FailureAlert[];
    needsAttention: boolean;
  } {
    const stats = failureLog.getStats();
    const patterns = failureLog.getPatterns();
    const criticalPatterns = patterns.filter(p => 
      p.severity === 'critical' && p.count >= this.config.criticalThreshold
    ).length;

    return {
      unresolvedFailures: stats.unresolvedCount,
      criticalPatterns,
      modelsAffected: Object.keys(stats.failuresByModel).length,
      recentAlerts: this.alertHistory.slice(-5).reverse(),
      needsAttention: criticalPatterns > 0 || stats.unresolvedCount >= 20
    };
  }

  /**
   * Clear alert history
   */
  clearAlerts(): void {
    this.alertHistory = [];
    console.log('[FailureObserver] Alert history cleared');
  }

  /**
   * Reset observer state
   */
  reset(): void {
    this.alertHistory = [];
    this.seenPatterns.clear();
    this.lastCheckTime = new Date().toISOString();
    console.log('[FailureObserver] Observer state reset');
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

export const failureObserver = new FailureObserver();

// Auto-start observer when module loads (in production)
// failureObserver.start();

export default failureObserver;

