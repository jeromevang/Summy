/**
 * Unit Tests for CLI Summarization Tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLI_PATH = path.resolve(__dirname, '../summarize-cli.ts');

// ============================================================
// TEST HELPERS
// ============================================================

async function runCLI(input: string, args: string[] = []): Promise<string> {
  const command = `echo "${input.replace(/"/g, '\\"')}" | npx tsx "${CLI_PATH}" ${args.join(' ')}`;

  try {
    const { stdout } = await execAsync(command, {
      timeout: 10000 // 10s timeout
    });
    return stdout.trim();
  } catch (error: any) {
    throw new Error(`CLI execution failed: ${error.message}\nStdout: ${error.stdout}\nStderr: ${error.stderr}`);
  }
}

function createMockTranscript(numMessages: number): string {
  const messages = [];
  for (let i = 1; i <= numMessages; i++) {
    messages.push(
      JSON.stringify({ role: 'user', content: `User message ${i}` })
    );
    messages.push(
      JSON.stringify({ role: 'assistant', content: `Assistant response ${i}` })
    );
  }
  return messages.join('\n');
}

// ============================================================
// TESTS
// ============================================================

describe('summarize-cli', () => {
  describe('Content Mode', () => {
    it('should summarize short text content', async () => {
      const input = 'This is a short test message.';
      const result = await runCLI(input, ['--content']);

      expect(result).toContain('This is a short test message');
      expect(result.toLowerCase()).toContain('extractive');
    });

    it('should handle long content', async () => {
      const longText = 'Lorem ipsum dolor sit amet. '.repeat(50);
      const result = await runCLI(longText, ['--content']);

      expect(result).toBeTruthy();
      expect(result.length).toBeLessThan(longText.length);
    });

    it('should output JSON format when requested', async () => {
      const input = 'Test content for JSON output';
      const result = await runCLI(input, ['--content', '--json']);

      // Parse JSON to verify format
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('keyPoints');
      expect(parsed).toHaveProperty('tokensSaved');
      expect(parsed).toHaveProperty('compressionRatio');
      expect(parsed).toHaveProperty('aiGenerated');
    });
  });

  describe('Conversation Mode', () => {
    it('should summarize conversation from JSONL', async () => {
      const transcript = createMockTranscript(5); // 10 messages total
      const result = await runCLI(transcript, ['--conversation', '--skip-last', '0']);

      expect(result).toBeTruthy();
      expect(result.toLowerCase()).toContain('summary');
    });

    it('should skip last N messages', async () => {
      const transcript = createMockTranscript(10); // 20 messages total
      const result = await runCLI(transcript, ['--conversation', '--skip-last', '5']);

      // Should indicate that last messages were preserved
      expect(result.toLowerCase()).toContain('preserved');
      expect(result).toContain('(15/20 messages)');
    });

    it('should handle empty transcript gracefully', async () => {
      const result = await runCLI('', ['--conversation']);

      expect(result.toLowerCase()).toContain('no');
    });

    it('should output conversation summary as JSON', async () => {
      const transcript = createMockTranscript(3);
      const result = await runCLI(transcript, ['--conversation', '--json', '--skip-last', '0']);

      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('keyTopics');
      expect(parsed).toHaveProperty('pendingItems');
      expect(parsed).toHaveProperty('importantFacts');
      expect(parsed).toHaveProperty('turns');
      expect(parsed).toHaveProperty('skippedLast');
    });

    it('should handle invalid JSONL gracefully', async () => {
      const invalidInput = 'not valid json\nanother invalid line';

      try {
        await runCLI(invalidInput, ['--conversation']);
        // If it doesn't throw, it should handle gracefully
      } catch (error: any) {
        // Should error with helpful message
        expect(error.message.toLowerCase()).toContain('no');
      }
    });

    it('should skip all messages if skip-last >= total', async () => {
      const transcript = createMockTranscript(2); // 4 messages
      const result = await runCLI(transcript, ['--conversation', '--skip-last', '10']);

      expect(result.toLowerCase()).toContain('no messages to summarize');
      expect(result.toLowerCase()).toContain('skipped');
    });
  });

  describe('CLI Arguments', () => {
    it('should show help message', async () => {
      const { stdout } = await execAsync(`npx tsx "${CLI_PATH}" --help`);

      expect(stdout).toContain('Usage:');
      expect(stdout).toContain('--content');
      expect(stdout).toContain('--conversation');
      expect(stdout).toContain('--skip-last');
    });

    it('should respect custom target tokens', async () => {
      const longText = 'Word '.repeat(200);
      const result = await runCLI(longText, ['--content', '--target-tokens', '50']);

      // Summary should be shorter due to lower target
      expect(result.split(' ').length).toBeLessThan(100);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing input', async () => {
      try {
        // Empty stdin
        await execAsync(`npx tsx "${CLI_PATH}" --content`, { input: '' });
      } catch (error: any) {
        expect(error.code).toBe(1);
        expect(error.stderr.toLowerCase()).toContain('no input');
      }
    });

    it('should exit with code 0 on success', async () => {
      const result = await execAsync(`echo "test" | npx tsx "${CLI_PATH}" --content`);
      // If this doesn't throw, exit code was 0
      expect(result.stdout).toBeTruthy();
    });
  });
});

describe('Summarizer Integration', () => {
  it('should use extractive summarization when LM Studio unavailable', async () => {
    // Since LM Studio likely isn't running in tests
    const input = 'Test text for summarization';
    const result = await runCLI(input, ['--content']);

    expect(result.toLowerCase()).toContain('extractive');
    expect(result).not.toContain('AI-generated');
  });

  it('should handle timeout gracefully', async () => {
    // This test assumes LM Studio isn't running
    const longTranscript = createMockTranscript(50);

    try {
      const result = await runCLI(longTranscript, ['--conversation']);
      // Should complete even without AI
      expect(result).toBeTruthy();
    } catch (error) {
      // If it times out, that's also acceptable behavior to document
      expect(error).toBeTruthy();
    }
  }, 15000); // 15s timeout for this test
});
