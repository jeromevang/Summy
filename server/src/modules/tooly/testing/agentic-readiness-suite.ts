/**
 * Agentic Readiness Test Suite Module
 */

export * from './agentic-readiness/index.js';
import { ReadinessSuite } from './agentic-readiness/ReadinessSuite.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUITE_CONFIG_PATH = path.join(__dirname, '../../../../data/agentic-readiness-suite.json');

const suiteInstance = new ReadinessSuite(SUITE_CONFIG_PATH);
export const loadTestSuite = () => ({ suite: suiteInstance.getTests(), config: suiteInstance.getConfig() });

export default { loadTestSuite };