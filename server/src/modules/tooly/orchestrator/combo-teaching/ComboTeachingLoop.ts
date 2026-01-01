import { ComboTester, ComboScore } from '../../testing/combo-tester.js';
import { BroadcastService, ComboTeachingResult } from './types.js';
import { prostheticStore, buildProstheticPrompt } from '../../learning/prosthetic-store.js';
import { failureLog } from '../../../../services/failure-log.js';

export class ComboTeachingLoop {
  constructor(private tester: ComboTester, private broadcast?: any) {}

  async runTeachingCycle(mainModelId: string, executorModelId: string, options: any = {}): Promise<ComboTeachingResult> {
    const log: string[] = [];
    const logMsg = (msg: string) => {
      console.log(`[ComboTeaching] ${msg}`);
      log.push(msg);
      if (this.broadcast && this.broadcast.broadcastComboTeachingProgress) {
         this.broadcast.broadcastComboTeachingProgress({
             comboId: `${mainModelId}-${executorModelId}`,
             message: msg,
             step: 'teaching'
         });
      }
    };

    logMsg(`Started teaching cycle for ${mainModelId} + ${executorModelId}`);
    
    // 1. Initial Assessment
    logMsg('Running initial assessment...');
    const initialScore = await this.tester.testCombo(mainModelId, executorModelId);
    logMsg(`Initial Score: ${initialScore.overallScore}`);

    if (initialScore.overallScore >= 90) {
       logMsg('Score >= 90, no teaching needed.');
       return this.buildResult(mainModelId, executorModelId, initialScore, initialScore, false, log);
    }

    // 2. Analyze Failures
    const failedTests = initialScore.testResults.filter(r => !r.passed);
    const failureDetails = failedTests.map(t => ({
        id: t.testId,
        category: t.category || 'combo_pairing',
        details: t.error || 'Unknown error'
    }));

    if (failureDetails.length === 0) {
        logMsg('No specific test failures found, but score is low (latency/flakiness?).');
        return this.buildResult(mainModelId, executorModelId, initialScore, initialScore, false, log);
    }

    // 3. Generate Prosthetic
    const currentProsthetic = prostheticStore.getForCombo(mainModelId, executorModelId);
    let newLevel = (currentProsthetic?.level || 0) + 1;
    
    if (newLevel > 4) {
        logMsg('Max prosthetic level (4) reached. Cannot escalate further.');
        return this.buildResult(mainModelId, executorModelId, initialScore, initialScore, false, log, 4);
    }
    
    // Force level 1 at minimum if none exists
    if (newLevel < 1) newLevel = 1;

    logMsg(`Generating Level ${newLevel} prosthetic...`);
    // Cast level to 1|2|3|4
    const levelCast = (newLevel >= 1 && newLevel <= 4 ? newLevel : 1) as 1|2|3|4;
    const prompt = buildProstheticPrompt(failureDetails, levelCast);

    // 4. Apply Prosthetic
    prostheticStore.saveComboPrompt({
        mainModelId,
        executorModelId,
        prompt,
        level: levelCast,
        probesFixed: failedTests.map(t => t.testId),
        categoryImprovements: { combo_pairing: 0 } // placeholder
    });
    logMsg('Prosthetic applied. Re-configuring router/models...');

    // 5. Re-test
    logMsg('Re-testing with prosthetic...');
    const finalScore = await this.tester.testCombo(mainModelId, executorModelId);
    logMsg(`Final Score: ${finalScore.overallScore}`);

    const improved = finalScore.overallScore > initialScore.overallScore;
    if (improved) {
        const improvement = finalScore.overallScore - initialScore.overallScore;
        prostheticStore.updatePrompt(`${mainModelId}-${executorModelId}`, {
            comboScoreBefore: initialScore.overallScore,
            comboScoreAfter: finalScore.overallScore,
            successfulRuns: 1,
            verified: true // provisional verification
        });
        logMsg(`Improvement verified (+${improvement} points).`);
    } else {
        logMsg('No improvement detected.');
        // Optional: delete or revert if strictly worse? 
        // For now, keep it as "attempted".
    }

    return this.buildResult(mainModelId, executorModelId, initialScore, finalScore, improved, log, levelCast);
  }

  private buildResult(main: string, exec: string, initial: ComboScore, final: ComboScore, improved: boolean, log: string[], level: number = 1): ComboTeachingResult {
      const initialFailed = initial.testResults.filter(r => !r.passed).map(r => r.testId);
      const finalFailed = final.testResults.filter(r => !r.passed).map(r => r.testId);
      const testsImproved = initialFailed.filter(id => !finalFailed.includes(id));
      
      return {
          success: improved,
          attempts: 1,
          startingScore: initial.overallScore,
          finalScore: final.overallScore,
          finalLevel: level as 1|2|3|4,
          prostheticApplied: true,
          mainModelId: main,
          executorModelId: exec,
          comboId: `${main}:${exec}`,
          comboScoreBefore: initial.overallScore,
          comboScoreAfter: final.overallScore,
          testsImproved,
          testsRemaining: finalFailed,
          failedTestsByLevel: [],
          improvements: { overall: final.overallScore - initial.overallScore, mainCorrect: 0, executorSuccess: 0 },
          certified: final.overallScore >= 90,
          log
      };
  }
}