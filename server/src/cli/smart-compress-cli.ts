#!/usr/bin/env tsx
/**
 * Smart Compression CLI Tool
 * Standalone CLI for intelligent context compression using LLM-powered analysis
 *
 * Usage:
 *   Get-Content transcript.jsonl | npx tsx server/src/cli/smart-compress-cli.ts --smart --mode conservative
 *   Get-Content transcript.jsonl | npx tsx server/src/cli/smart-compress-cli.ts --provider lmstudio --skip-last 5
 */

import * as readline from 'readline';
import { MessageAnalyzer, SmartCompressor, RAGCompressor } from '../modules/tooly/context/index.js';
import type { Turn, CompressionMode } from '../modules/tooly/context/index.js';

// ============================================================
// CLI ARGUMENT PARSING
// ============================================================

interface CliArgs {
  smart: boolean;           // Use smart compression (vs simple mode)
  mode: CompressionMode;    // Compression mode
  provider: 'lmstudio' | 'claude';  // Analysis provider
  skipLast: number;         // Messages to skip from end
  useRAG: boolean;          // Enable RAG semantic analysis
  json: boolean;            // Output JSON format
  verbose: boolean;         // Verbose output
  outputCompressed: boolean; // Output compressed transcript
  outputDecisions: boolean;  // Output compression decisions
  help: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    smart: false,
    mode: 'conservative',
    provider: 'lmstudio',
    skipLast: 5,
    useRAG: false,
    json: false,
    verbose: false,
    outputCompressed: true,
    outputDecisions: false,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--smart':
        parsed.smart = true;
        break;
      case '--mode':
        i++;
        {
          const value = args[i] as CompressionMode;
          if (['conservative', 'aggressive', 'context-aware'].includes(value)) {
            parsed.mode = value;
          }
        }
        break;
      case '--provider':
        i++;
        {
          const value = args[i] as 'lmstudio' | 'claude';
          if (['lmstudio', 'claude'].includes(value)) {
            parsed.provider = value;
          }
        }
        break;
      case '--skip-last':
        i++;
        {
          const value = args[i];
          if (value) {
            parsed.skipLast = parseInt(value, 10);
          }
        }
        break;
      case '--use-rag':
        parsed.useRAG = true;
        break;
      case '--json':
        parsed.json = true;
        break;
      case '--verbose':
      case '-v':
        parsed.verbose = true;
        break;
      case '--output-compressed':
        parsed.outputCompressed = true;
        break;
      case '--output-decisions':
        parsed.outputDecisions = true;
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
Summy Smart Compression CLI Tool

Intelligently compresses conversation transcripts using LLM-powered analysis.
Analyzes each message's importance and makes smart decisions: preserve, compress, or drop.

Usage:
  Get-Content transcript.jsonl | npx tsx server/src/cli/smart-compress-cli.ts [options]

Options:
  --smart                   Enable smart LLM-powered compression (default: false)
  --mode <mode>             Compression mode: conservative, aggressive, context-aware (default: conservative)
  --provider <provider>     Analysis provider: lmstudio, claude (default: lmstudio)
  --skip-last <N>           Always preserve last N messages (default: 5)
  --use-rag                 Enable RAG semantic analysis for better deduplication (default: false)
  --json                    Output JSON format with full metadata (default: false)
  --verbose, -v             Verbose output with compression details
  --output-compressed       Output compressed transcript (default: true)
  --output-decisions        Output compression decisions for each message
  --help, -h                Show this help message

Compression Modes:
  conservative              Preserve more messages (score >= 7, drop <= 3)
  aggressive                Compress more aggressively (score >= 8, drop <= 4)
  context-aware             Dynamic thresholds based on conversation characteristics

Providers:
  lmstudio                  Local LMStudio (free, private) - http://localhost:1234
  claude                    Claude API (smarter, ~$0.005 per compression)

Examples:
  # Basic smart compression with LMStudio (default)
  Get-Content transcript.jsonl | npx tsx server/src/cli/smart-compress-cli.ts --smart

  # Aggressive compression with Claude API
  Get-Content transcript.jsonl | npx tsx server/src/cli/smart-compress-cli.ts --smart --mode aggressive --provider claude

  # With RAG semantic analysis
  Get-Content transcript.jsonl | npx tsx server/src/cli/smart-compress-cli.ts --smart --use-rag

  # JSON output with decisions
  Get-Content transcript.jsonl | npx tsx server/src/cli/smart-compress-cli.ts --smart --json --output-decisions

  # Context-aware mode, skip last 10 messages
  Get-Content transcript.jsonl | npx tsx server/src/cli/smart-compress-cli.ts --smart --mode context-aware --skip-last 10
`);
}

// ============================================================
// MAIN LOGIC
// ============================================================

async function main(): Promise<void> {
  const cliArgs = parseArgs();

  if (cliArgs.help) {
    printHelp();
    process.exit(0);
  }

  // Read input from stdin
  const input = await readStdin();

  if (!input || input.trim().length === 0) {
    console.error('Error: No input provided. Pipe a JSONL transcript to stdin.');
    process.exit(1);
  }

  try {
    // Parse JSONL transcript
    const messages = parseJSONL(input);

    if (messages.length === 0) {
      console.error('Error: No valid messages found in input');
      process.exit(1);
    }

    if (cliArgs.verbose) {
      console.error(`Loaded ${messages.length} messages from transcript`);
    }

    // Perform smart compression
    if (cliArgs.smart) {
      await performSmartCompression(messages, cliArgs);
    } else {
      console.error('Error: --smart flag required. This tool only supports smart compression.');
      console.error('Use --help for usage information.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error during compression:', error);
    process.exit(1);
  }
}

async function performSmartCompression(messages: Turn[], args: CliArgs): Promise<void> {
  const startTime = Date.now();

  try {
    // Step 1: Analyze messages
    if (args.verbose) {
      console.error(`\n[1/3] Analyzing messages with ${args.provider}...`);
    }

    const analyzer = new MessageAnalyzer({
      provider: args.provider,
      lmstudioUrl: process.env.LMSTUDIO_URL || 'http://localhost:1234',
      claudeApiKey: process.env.ANTHROPIC_API_KEY || ''
    });

    const scores = await analyzer.analyzeConversation(messages);

    if (args.verbose) {
      console.error(`Analyzed ${scores.length} messages`);
      console.error(`Average score: ${(scores.reduce((sum, s) => sum + s.score, 0) / scores.length).toFixed(2)}`);
    }

    // Step 2: RAG Enhancement (optional)
    let enhancedScores = scores;
    if (args.useRAG) {
      if (args.verbose) {
        console.error(`\n[2/3] Enhancing with RAG semantic analysis...`);
      }

      const ragCompressor = new RAGCompressor({
        enabled: true,
        ragServerUrl: process.env.RAG_SERVER_URL || 'http://localhost:3002'
      });

      // Check if RAG server is available
      const ragAvailable = await ragCompressor.checkAvailability();

      if (ragAvailable) {
        enhancedScores = await ragCompressor.enhanceScores(messages, scores);
        if (args.verbose) {
          console.error(`RAG enhancement complete`);
        }
      } else {
        if (args.verbose) {
          console.error(`Warning: RAG server unavailable, skipping semantic analysis`);
        }
      }
    } else {
      if (args.verbose) {
        console.error(`\n[2/3] Skipping RAG enhancement (use --use-rag to enable)`);
      }
    }

    // Step 3: Compress
    if (args.verbose) {
      console.error(`\n[3/3] Compressing with ${args.mode} mode...`);
    }

    const compressor = new SmartCompressor({
      mode: args.mode,
      skipLast: args.skipLast,
      preserveToolCalls: true
    });

    const result = await compressor.compress(messages, enhancedScores);

    const totalTime = Date.now() - startTime;

    // Output results
    if (args.json) {
      outputJSON(result, totalTime);
    } else {
      outputHuman(result, totalTime, args);
    }
  } catch (error) {
    console.error('Smart compression failed:', error);
    throw error;
  }
}

function outputJSON(result: any, totalTime: number): void {
  const output = {
    uncompressed: result.uncompressedTranscript.map((msg: Turn) => JSON.stringify(msg)).join('\n'),
    compressed: result.compressedTranscript.map((msg: any) => JSON.stringify(msg)).join('\n'),
    decisions: result.decisions,
    stats: {
      ...result.stats,
      totalDuration: totalTime
    }
  };

  console.log(JSON.stringify(output, null, 2));
}

function outputHuman(result: any, totalTime: number, args: CliArgs): void {
  if (args.verbose) {
    console.error(`\nCompression complete in ${totalTime}ms\n`);
    console.error('='.repeat(60));
    console.error('COMPRESSION STATISTICS');
    console.error('='.repeat(60));
    console.error(`Total messages:     ${result.stats.totalMessages}`);
    console.error(`Preserved:          ${result.stats.preservedCount} (${Math.round(result.stats.preservedCount / result.stats.totalMessages * 100)}%)`);
    console.error(`Compressed:         ${result.stats.compressedCount} (${Math.round(result.stats.compressedCount / result.stats.totalMessages * 100)}%)`);
    console.error(`Dropped:            ${result.stats.droppedCount} (${Math.round(result.stats.droppedCount / result.stats.totalMessages * 100)}%)`);
    console.error(`Original tokens:    ${result.stats.originalTokens.toLocaleString()}`);
    console.error(`Compressed tokens:  ${result.stats.compressedTokens.toLocaleString()}`);
    console.error(`Tokens saved:       ${result.stats.tokensSaved.toLocaleString()}`);
    console.error(`Compression ratio:  ${Math.round((1 - result.stats.compressionRatio) * 100)}% reduction`);
    console.error(`Duration:           ${result.stats.duration}ms`);
    console.error('='.repeat(60));
    console.error('');
  }

  // Output compressed transcript (JSONL)
  if (args.outputCompressed) {
    for (const msg of result.compressedTranscript) {
      console.log(JSON.stringify(msg));
    }
  }

  // Output decisions (if requested)
  if (args.outputDecisions) {
    if (args.verbose) {
      console.error('\nCOMPRESSION DECISIONS:');
      console.error('='.repeat(60));
    }

    for (const decision of result.decisions) {
      const actionColor = decision.action === 'preserve' ? '✓' : decision.action === 'compress' ? '↓' : '✗';
      console.error(
        `${actionColor} [${decision.messageId}] ${decision.action.toUpperCase()} ` +
        `(score: ${decision.score}) - ${decision.reason}`
      );
    }
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    let input = '';
    rl.on('line', (line) => {
      input += line + '\n';
    });

    rl.on('close', () => {
      resolve(input);
    });
  });
}

function parseJSONL(input: string): Turn[] {
  const lines = input.trim().split('\n');
  const messages: Turn[] = [];

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    try {
      const parsed = JSON.parse(line);

      // Support both Turn format and OpenAI message format
      if (parsed.role && parsed.content) {
        messages.push({
          role: parsed.role,
          content: parsed.content,
          toolCalls: parsed.tool_calls || parsed.toolCalls
        });
      }
    } catch (error) {
      console.error(`Warning: Failed to parse line: ${line.substring(0, 50)}...`);
    }
  }

  return messages;
}

// ============================================================
// ENTRY POINT
// ============================================================

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
