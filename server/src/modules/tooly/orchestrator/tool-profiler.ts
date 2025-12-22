/**
 * Tool Profiler
 * Analyzes tool performance per model and generates optimal tool configurations
 */

import { TestResult, TestRunResult } from '../testing/test-definitions.js';
import { ESSENTIAL_TOOLS, STANDARD_TOOLS, FULL_TOOLS } from './mcp-orchestrator.js';

// ============================================================
// TYPES
// ============================================================

export type ToolTier = 'essential' | 'standard' | 'full';

export interface ToolPerformance {
  toolName: string;
  successRate: number;
  avgLatency: number;
  testCount: number;
  lastTested: string;
  tier: ToolTier;
  issues: ToolIssue[];
}

export interface ToolIssue {
  type: 'wrong_params' | 'wrong_tool' | 'timeout' | 'error' | 'hallucination';
  description: string;
  frequency: number;
}

export interface ToolProfile {
  modelId: string;
  testedAt: string;
  overallScore: number;
  toolPerformances: Record<string, ToolPerformance>;
  recommendations: ToolRecommendation[];
  suggestedTier: ToolTier;
}

export interface ToolRecommendation {
  type: 'enable' | 'disable' | 'priority' | 'description';
  tool: string;
  reason: string;
  confidence: number;
}

// ============================================================
// TOOL PROFILER CLASS
// ============================================================

export class ToolProfiler {
  private profiles: Map<string, ToolProfile> = new Map();
  
  /**
   * Get tool tier for a tool name
   */
  getToolTier(toolName: string): ToolTier {
    if (ESSENTIAL_TOOLS.includes(toolName)) return 'essential';
    if (STANDARD_TOOLS.includes(toolName)) return 'standard';
    if (FULL_TOOLS.includes(toolName)) return 'full';
    return 'full'; // Default unknown tools to full
  }
  
  /**
   * Analyze test results to build a tool profile
   */
  analyzeTestResults(modelId: string, testResults: TestRunResult): ToolProfile {
    const toolPerformances: Record<string, ToolPerformance> = {};
    const issues: Map<string, ToolIssue[]> = new Map();
    
    // Group results by tool
    const resultsByTool = new Map<string, TestResult[]>();
    for (const result of testResults.results) {
      const existing = resultsByTool.get(result.tool) || [];
      existing.push(result);
      resultsByTool.set(result.tool, existing);
    }
    
    // Calculate performance for each tool
    for (const [toolName, results] of resultsByTool) {
      const successCount = results.filter(r => r.passed).length;
      const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;
      
      // Analyze issues
      const toolIssues: ToolIssue[] = [];
      
      // Wrong params
      const wrongParams = results.filter(r => 
        !r.passed && r.calledTool === r.tool && r.checks.some(c => !c.passed && c.name.startsWith('Param:'))
      );
      if (wrongParams.length > 0) {
        toolIssues.push({
          type: 'wrong_params',
          description: `Incorrect parameters in ${wrongParams.length} tests`,
          frequency: wrongParams.length / results.length
        });
      }
      
      // Wrong tool called
      const wrongTool = results.filter(r => 
        !r.passed && r.calledTool && r.calledTool !== r.tool
      );
      if (wrongTool.length > 0) {
        toolIssues.push({
          type: 'wrong_tool',
          description: `Called wrong tool in ${wrongTool.length} tests`,
          frequency: wrongTool.length / results.length
        });
      }
      
      // Errors
      const errors = results.filter(r => r.error);
      if (errors.length > 0) {
        toolIssues.push({
          type: 'error',
          description: `Errors in ${errors.length} tests`,
          frequency: errors.length / results.length
        });
      }
      
      toolPerformances[toolName] = {
        toolName,
        successRate: results.length > 0 ? successCount / results.length : 0,
        avgLatency,
        testCount: results.length,
        lastTested: testResults.completedAt,
        tier: this.getToolTier(toolName),
        issues: toolIssues
      };
    }
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(toolPerformances);
    
    // Suggest tier based on performance
    const suggestedTier = this.suggestTier(toolPerformances);
    
    const profile: ToolProfile = {
      modelId,
      testedAt: testResults.completedAt,
      overallScore: testResults.overallScore,
      toolPerformances,
      recommendations,
      suggestedTier
    };
    
    this.profiles.set(modelId, profile);
    return profile;
  }
  
  /**
   * Generate recommendations based on performance
   */
  private generateRecommendations(performances: Record<string, ToolPerformance>): ToolRecommendation[] {
    const recommendations: ToolRecommendation[] = [];
    
    for (const [toolName, perf] of Object.entries(performances)) {
      // Disable poorly performing tools
      if (perf.successRate < 0.3 && perf.testCount >= 3) {
        recommendations.push({
          type: 'disable',
          tool: toolName,
          reason: `Low success rate (${Math.round(perf.successRate * 100)}%)`,
          confidence: 0.8
        });
      }
      
      // Add priority to well-performing tools
      if (perf.successRate >= 0.9 && perf.testCount >= 2) {
        recommendations.push({
          type: 'priority',
          tool: toolName,
          reason: `High success rate (${Math.round(perf.successRate * 100)}%)`,
          confidence: 0.7
        });
      }
      
      // Suggest description changes for tools with param issues
      const paramIssue = perf.issues.find(i => i.type === 'wrong_params');
      if (paramIssue && paramIssue.frequency > 0.3) {
        recommendations.push({
          type: 'description',
          tool: toolName,
          reason: 'Model struggles with parameters - add clearer description',
          confidence: 0.6
        });
      }
    }
    
    return recommendations;
  }
  
  /**
   * Suggest appropriate tool tier based on performance
   */
  private suggestTier(performances: Record<string, ToolPerformance>): ToolTier {
    const essentialPerf = Object.values(performances)
      .filter(p => p.tier === 'essential');
    const standardPerf = Object.values(performances)
      .filter(p => p.tier === 'standard');
    const fullPerf = Object.values(performances)
      .filter(p => p.tier === 'full');
    
    // Calculate average success rates per tier
    const essentialAvg = this.averageSuccessRate(essentialPerf);
    const standardAvg = this.averageSuccessRate(standardPerf);
    const fullAvg = this.averageSuccessRate(fullPerf);
    
    // If essential tools score poorly, stick with essential
    if (essentialAvg < 0.6) {
      return 'essential';
    }
    
    // If standard tools score well, consider full
    if (standardAvg >= 0.7 && fullPerf.length > 0 && fullAvg >= 0.5) {
      return 'full';
    }
    
    // If standard tools score reasonably, use standard
    if (standardPerf.length > 0 && standardAvg >= 0.5) {
      return 'standard';
    }
    
    return 'essential';
  }
  
  /**
   * Calculate average success rate
   */
  private averageSuccessRate(performances: ToolPerformance[]): number {
    if (performances.length === 0) return 0;
    return performances.reduce((sum, p) => sum + p.successRate, 0) / performances.length;
  }
  
  /**
   * Get profile for a model
   */
  getProfile(modelId: string): ToolProfile | undefined {
    return this.profiles.get(modelId);
  }
  
  /**
   * Get enabled tools for a model based on profile
   */
  getEnabledTools(modelId: string): string[] {
    const profile = this.profiles.get(modelId);
    if (!profile) {
      return ESSENTIAL_TOOLS;
    }
    
    // Start with tier-appropriate tools
    let tools: string[];
    switch (profile.suggestedTier) {
      case 'essential':
        tools = [...ESSENTIAL_TOOLS];
        break;
      case 'standard':
        tools = [...ESSENTIAL_TOOLS, ...STANDARD_TOOLS];
        break;
      case 'full':
        tools = [...ESSENTIAL_TOOLS, ...STANDARD_TOOLS, ...FULL_TOOLS];
        break;
    }
    
    // Apply recommendations
    for (const rec of profile.recommendations) {
      if (rec.type === 'disable' && rec.confidence >= 0.7) {
        tools = tools.filter(t => t !== rec.tool);
      }
    }
    
    return tools;
  }
  
  /**
   * Get disabled tools for a model based on profile
   */
  getDisabledTools(modelId: string): string[] {
    const profile = this.profiles.get(modelId);
    if (!profile) return [];
    
    return profile.recommendations
      .filter(r => r.type === 'disable' && r.confidence >= 0.7)
      .map(r => r.tool);
  }
}

export const toolProfiler = new ToolProfiler();
export default toolProfiler;

