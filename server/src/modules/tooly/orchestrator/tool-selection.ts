/**
 * Tool Selection Logic
 * Encapsulates logic for selecting tools based on ModelProfile.
 */

import type { ModelProfile } from '../types.js';
import { ESSENTIAL_TOOLS, STANDARD_TOOLS, FULL_TOOLS } from '../orchestrator/mcp-orchestrator.js'; // Assuming these constants are exported from mcp-orchestrator

/**
 * Determines the set of enabled and disabled tools based on ModelProfile data.
 * Considers overall readiness, specific failure modes, calibration, precedence, and blocked capabilities.
 */
export function selectToolsForModel(profile: ModelProfile): { enabledTools: string[], disabledTools: string[] } {
    const {
      agenticReadiness,
      failureProfile,
      precedenceMatrix,
      calibration,
      blockedCapabilities
    } = profile;

    let enabledTools: string[];
    let disabledTools: string[] = [];

    // Initial tier based on overall score
    if (agenticReadiness?.overallScore && agenticReadiness.overallScore >= 80) {
      enabledTools = [...FULL_TOOLS];
    } else if (agenticReadiness?.overallScore && agenticReadiness.overallScore >= 50) {
      enabledTools = [...STANDARD_TOOLS];
    } else {
      enabledTools = [...ESSENTIAL_TOOLS];
    }

    // Refine tool set based on specific failure modes, calibration, and precedence
    // 1. Hallucination/Tool Failure
    if (failureProfile?.hallucinationType === 'tool' || failureProfile?.failureType === 'silent' || failureProfile?.failureType === 'partial') {
        // If model frequently hallucinates or fails tools silently/partially, restrict to safer/essential tools
        if (enabledTools.length > ESSENTIAL_TOOLS.length) {
            enabledTools = [...ESSENTIAL_TOOLS]; // Fallback to essential tools
            disabledTools.push(...STANDARD_TOOLS.filter(t => !ESSENTIAL_TOOLS.includes(t)));
            disabledTools.push(...FULL_TOOLS.filter(t => !STANDARD_TOOLS.includes(t) && !ESSENTIAL_TOOLS.includes(t)));
        }
    }
    // 2. Overconfidence/High Error Rate
    if (calibration?.overconfidenceRatio && calibration.overconfidenceRatio > 0.6) {
        // If overconfident and wrong, use a stricter/safer tool set
        if (enabledTools.length > STANDARD_TOOLS.length) { // If currently FULL_TOOLS
            enabledTools = [...STANDARD_TOOLS];
            disabledTools.push(...FULL_TOOLS.filter(t => !STANDARD_TOOLS.includes(t)));
        }
    }
    // 3. Hidden Errors
    if (failureProfile?.detectability === 'hidden') {
        // If errors are hidden, be extremely cautious and prune more aggressively
        if (enabledTools.length > ESSENTIAL_TOOLS.length) {
            enabledTools = [...ESSENTIAL_TOOLS];
            disabledTools.push(...STANDARD_TOOLS.filter(t => !ESSENTIAL_TOOLS.includes(t)));
            disabledTools.push(...FULL_TOOLS.filter(t => !STANDARD_TOOLS.includes(t) && !ESSENTIAL_TOOLS.includes(t)));
        }
    }
    // 4. Precedence Matrix (Safety)
    if (precedenceMatrix?.safetyVsExecution === 'execution') {
        // If safety is often sacrificed for execution, explicitly disable risky tools.
        // This requires a mapping of risky tools, which is not yet available.
        // For now, we add a general system prompt warning.
    }
    // 5. Blocked Capabilities
    if (profile.blockedCapabilities && profile.blockedCapabilities.length > 0) {
        enabledTools = enabledTools.filter(tool => !profile.blockedCapabilities!.includes(tool));
        disabledTools.push(...profile.blockedCapabilities.filter(t => !disabledTools.includes(t)));
    }
    // Ensure no duplicates and clean up disabledTools list
    enabledTools = [...new Set(enabledTools)];
    disabledTools = [...new Set(disabledTools)];

    return { enabledTools, disabledTools };
  }
