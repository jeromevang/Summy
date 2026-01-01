import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../../services/database.js';
import { wsBroadcast } from '../../services/ws-broadcast.js';
import { ProbeDefinition } from './types.js';

export interface BaselineRunResult {
    testId: string;
    success: boolean;
    toolCalls: Array<{
        tool: string;
        args: any;
    }>;
    explanation?: string;
}

export class BaselineEngine {
    private genAI: GoogleGenerativeAI | null = null;

    constructor() {
        const apiKey = process.env['GEMINI_API_KEY'];
        if (apiKey) {
            this.genAI = new GoogleGenerativeAI(apiKey);
        }
    }

    /**
     * Run a test suite through the baseline model (Gemini)
     */
    async runBaselineSuite(testIds: string[]): Promise<BaselineRunResult[]> {
        if (!this.genAI) {
            throw new Error('GEMINI_API_KEY is not configured in .env');
        }

        const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
        const results: BaselineRunResult[] = [];

        for (const testId of testIds) {
            wsBroadcast.broadcast('baseline_progress', { testId, status: 'running' });

            try {
                // Fetch the test definition from DB or test-engine
                const test = db.getCustomTests().find((t: ProbeDefinition) => t.id === testId);
                if (!test) continue;

                const prompt = this.buildBaselinePrompt(test);
                const result = await model.generateContent(prompt);
                const response = result.response.text();

                const parsedResult = this.parseBaselineResponse(response, testId);
                results.push(parsedResult);

                // Store ground truth in DB for future comparisons
                db.saveGroundTruth(testId, parsedResult);

            } catch (error: any) {
                console.error(`[Baseline] Failed test ${testId}:`, error);
                results.push({ testId, success: false, toolCalls: [] });
            }
        }

        return results;
    }

    /**
     * Automatically generate baselines for all tests that lack ground truth
     */
    async autoGenerateBaselines(): Promise<BaselineRunResult[]> {
        if (!this.genAI) return [];

        try {
            const allTests = db.getCustomTests();
            const testsToBaseline: string[] = [];

            for (const test of allTests) {
                const existing = db.getGroundTruth(test.id);
                if (!existing || !existing.success) {
                    testsToBaseline.push(test.id);
                }
            }

            if (testsToBaseline.length === 0) {
                return [];
            }

            console.log(`[Baseline] Auto-generating ground truth for ${testsToBaseline.length} tests...`);
            return await this.runBaselineSuite(testsToBaseline);
        } catch (error) {
            console.error('[Baseline] Auto-generation sweep failed:', error);
            return [];
        }
    }

    private buildBaselinePrompt(test: any): string {
        return `You are a high-performance baseline model for a tool-use testing system.
Your goal is to provide the "Ground Truth" for the following task.
You must use the specified tools correctly with all necessary arguments.

Task: ${test.prompt}
Expected Tool: ${test.expectedTool || 'Decide the best tool if not specified'}
Expected Behavior: ${test.expectedBehavior || 'Provide the most accurate technical response'}

Output your response in the following JSON format:
{
  "toolCalls": [
    { "tool": "tool_name", "args": { "arg1": "value" } }
  ],
  "explanation": "Why these tool calls are the optimal solution."
}

Only output the JSON block.`;
    }

    private parseBaselineResponse(response: string, testId: string): BaselineRunResult {
        try {
            // Improved JSON extraction for markdown responses
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                // Try to see if the whole thing is JSON
                try {
                    const data = JSON.parse(response);
                    return {
                        testId,
                        success: true,
                        toolCalls: data.toolCalls || [],
                        explanation: data.explanation
                    };
                } catch (e) {
                    throw new Error('No JSON found in baseline response');
                }
            }

            const data = JSON.parse(jsonMatch[0]);
            return {
                testId,
                success: true,
                toolCalls: data.toolCalls || [],
                explanation: data.explanation
            };
        } catch (error) {
            console.warn(`[Baseline] Failed to parse response for ${testId}:`, response.substring(0, 100));
            return { testId, success: false, toolCalls: [] };
        }
    }
}

export const baselineEngine = new BaselineEngine();
