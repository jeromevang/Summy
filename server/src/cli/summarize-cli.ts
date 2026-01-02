#!/usr/bin/env tsx
/**
 * CLI Summarization Tool
 * Standalone CLI wrapper for Summy's intelligent Summarizer
 *
 * Usage:
 *   echo "text..." | npx tsx server/src/cli/summarize-cli.ts --content
 *   Get-Content transcript.jsonl | npx tsx server/src/cli/summarize-cli.ts --conversation --skip-last 5
 */

import { Summarizer } from '../modules/tooly/context/summarizer.js';
import * as readline from 'readline';

// ============================================================
// CLI ARGUMENT PARSING
// ============================================================

interface CliArgs {
  mode: 'content' | 'conversation';
  skipLast?: number;  // Number of messages to skip from end
  targetTokens?: number;
  json?: boolean;     // Output JSON format
  help?: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    mode: 'content',
    json: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--conversation':
        parsed.mode = 'conversation';
        break;
      case '--content':
        parsed.mode = 'content';
        break;
      case '--skip-last':
        parsed.skipLast = parseInt(args[++i], 10);
        break;
      case '--target-tokens':
        parsed.targetTokens = parseInt(args[++i], 10);
        break;
      case '--json':
        parsed.json = true;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
    }
  }

  return parsed;
}

function printHelp(): void {
  console.log(`
Summy CLI Summarization Tool

Usage:
  echo "text..." | npx tsx server/src/cli/summarize-cli.ts [options]
  Get-Content transcript.jsonl | npx tsx server/src/cli/summarize-cli.ts [options]

Options:
  --content              Summarize plain text content (default)
  --conversation         Summarize conversation transcript (JSONL format)
  --skip-last <N>        Skip last N messages from summarization (default: 5)
  --target-tokens <N>    Target token count for summary (default: 500)
  --json                 Output JSON format
  --help, -h             Show this help message

Examples:
  # Summarize plain text
  echo "Long text..." | npx tsx server/src/cli/summarize-cli.ts --content

  # Summarize conversation, skip last 5 messages
  Get-Content transcript.jsonl | npx tsx server/src/cli/summarize-cli.ts --conversation --skip-last 5

  # Get JSON output
  echo "text..." | npx tsx server/src/cli/summarize-cli.ts --content --json
`);
}

// ============================================================
// STDIN READING
// ============================================================

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', (line) => {
      data += line + '\n';
    });

    rl.on('close', () => {
      resolve(data.trim());
    });
  });
}

// ============================================================
// CONVERSATION PARSING
// ============================================================

function parseConversation(jsonlData: string): Array<{ role: string; content: string }> {
  const lines = jsonlData.split('\n').filter(line => line.trim());
  const messages: Array<{ role: string; content: string }> = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.role && parsed.content) {
        messages.push({
          role: parsed.role,
          content: parsed.content
        });
      }
    } catch (error) {
      console.error(`[CLI] Failed to parse line: ${line.substring(0, 50)}...`, error);
    }
  }

  return messages;
}

// ============================================================
// MAIN EXECUTION
// ============================================================

async function main() {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Read input from stdin
  const input = await readStdin();

  if (!input) {
    console.error('[CLI] Error: No input received from stdin');
    process.exit(1);
  }

  // Initialize summarizer
  const summarizer = new Summarizer();

  try {
    if (args.mode === 'conversation') {
      // Parse JSONL conversation
      const messages = parseConversation(input);

      if (messages.length === 0) {
        console.error('[CLI] Error: No valid messages found in input');
        process.exit(1);
      }

      // Skip last N messages if specified
      const skipLast = args.skipLast !== undefined ? args.skipLast : 5;
      const messagesToSummarize = skipLast > 0
        ? messages.slice(0, -skipLast)
        : messages;

      if (messagesToSummarize.length === 0) {
        if (args.json) {
          console.log(JSON.stringify({
            summary: 'No messages to summarize (all skipped)',
            turns: 0,
            keyTopics: [],
            pendingItems: [],
            importantFacts: [],
            skippedLast: skipLast
          }));
        } else {
          console.log('No messages to summarize (all skipped)');
        }
        process.exit(0);
      }

      // Summarize conversation
      const targetTokens = args.targetTokens || 500;
      const result = await summarizer.summarizeConversation(messagesToSummarize, targetTokens);

      // Output result
      if (args.json) {
        console.log(JSON.stringify({
          ...result,
          skippedLast: skipLast,
          totalMessages: messages.length,
          summarizedMessages: messagesToSummarize.length
        }, null, 2));
      } else {
        console.log(`Summary (${messagesToSummarize.length}/${messages.length} messages):\n`);
        console.log(result.summary);

        if (result.keyTopics.length > 0) {
          console.log(`\nKey Topics: ${result.keyTopics.join(', ')}`);
        }

        if (result.pendingItems.length > 0) {
          console.log(`\nPending Items:\n${result.pendingItems.map(item => `- ${item}`).join('\n')}`);
        }

        console.log(`\n(Last ${skipLast} messages preserved with full detail)`);
      }

    } else {
      // Summarize plain content
      const targetTokens = args.targetTokens || 200;
      const result = await summarizer.summarizeContent(input, targetTokens);

      // Output result
      if (args.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(result.summary);

        if (result.keyPoints.length > 0) {
          console.log(`\nKey Points:\n${result.keyPoints.map(p => `- ${p}`).join('\n')}`);
        }

        if (result.aiGenerated) {
          console.log(`\n(AI-generated, ${Math.round(result.compressionRatio * 100)}% compression)`);
        } else {
          console.log('\n(Extractive summary - LM Studio unavailable)');
        }
      }
    }

    process.exit(0);

  } catch (error) {
    console.error('[CLI] Summarization failed:', error);
    process.exit(1);
  }
}

// Run main function
main().catch((error) => {
  console.error('[CLI] Fatal error:', error);
  process.exit(1);
});
