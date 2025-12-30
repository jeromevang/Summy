import fs from 'fs-extra';
import { AgenticReadinessTest, TestSuiteConfig } from './types.js';
import * as evaluators from './evaluators.js';

export class ReadinessSuite {
  private suite: AgenticReadinessTest[] = [];
  private config!: TestSuiteConfig;

  constructor(configPath: string) {
    this.load(configPath);
  }

  private load(path: string) {
    const data = fs.readJsonSync(path);
    this.config = data;
    this.suite = data.tests.map((t: any) => ({ ...t, evaluate: (evaluators as any)[t.evaluationLogic.match(/return\s+(\w+)/)?.[1] || ''] }));
  }

  getTests() { return this.suite; }
  getConfig() { return this.config; }
}
