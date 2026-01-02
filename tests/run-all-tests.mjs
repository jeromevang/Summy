#!/usr/bin/env node
/**
 * Comprehensive Test Runner
 * Runs all functional tests in sequence with proper setup/teardown
 */

import { spawn } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';

const tests = [
  {
    name: 'RAG Server',
    file: './functional/rag-server.test.mjs',
    description: 'Indexing, file watching, semantic search',
    timeout: 120000
  },
  {
    name: 'MCP Server',
    file: './functional/mcp-server.test.mjs',
    description: 'Tool execution across all categories',
    timeout: 180000
  },
  {
    name: 'Workspace Management',
    file: './functional/workspace-management.test.mjs',
    description: 'Project switching, git integration',
    timeout: 120000
  },
  {
    name: 'Team Builder',
    file: './functional/team-builder.test.mjs',
    description: 'Squad creation and persistence',
    timeout: 60000
  },
  {
    name: 'Health & Error Handling',
    file: './functional/health-and-errors.test.mjs',
    description: 'Health checks, request tracking, error responses',
    timeout: 60000
  },
  {
    name: 'Learning System',
    file: './functional/learning-system.test.mjs',
    description: 'Combo teaching, prosthetics, failures',
    timeout: 240000
  },
  {
    name: 'WebSocket',
    file: './functional/websocket.test.mjs',
    description: 'Real-time updates and broadcasting',
    timeout: 60000
  }
];

const results = {
  passed: [],
  failed: [],
  skipped: []
};

console.log(chalk.cyan.bold('\n🚀 Summy Comprehensive Test Suite\n'));
console.log(chalk.gray('Testing all subsystems...\n'));

async function runTest(test) {
  const spinner = ora({
    text: `Running ${test.name} tests...`,
    color: 'cyan'
  }).start();

  return new Promise((resolve) => {
    const proc = spawn('npx', ['vitest', 'run', test.file, '--config', './vitest.config.mjs'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      spinner.fail(chalk.red(`${test.name} - TIMEOUT`));
      results.failed.push({ ...test, reason: 'timeout' });
      resolve(false);
    }, test.timeout);

    proc.on('close', (code) => {
      clearTimeout(timeout);

      if (code === 0) {
        spinner.succeed(chalk.green(`${test.name} - PASSED`));
        console.log(chalk.gray(`  ${test.description}`));
        results.passed.push(test);
        resolve(true);
      } else {
        spinner.fail(chalk.red(`${test.name} - FAILED`));
        console.log(chalk.gray(`  ${test.description}`));
        console.log(chalk.red(`  Exit code: ${code}`));

        if (errorOutput) {
          const errorLines = errorOutput.split('\n').slice(0, 5);
          errorLines.forEach(line => {
            console.log(chalk.dim(`  ${line}`));
          });
        }

        results.failed.push({ ...test, code, output: errorOutput });
        resolve(false);
      }
    });
  });
}

async function checkPrerequisites() {
  const spinner = ora('Checking prerequisites...').start();

  // Check if servers are running
  const checks = [
    { name: 'Main Server', port: 3001 },
    { name: 'RAG Server', port: 3002 }
  ];

  for (const check of checks) {
    try {
      const response = await fetch(`http://localhost:${check.port}/health`).catch(() => null);
      if (!response || !response.ok) {
        throw new Error(`${check.name} not running on port ${check.port}`);
      }
    } catch (e) {
      spinner.fail(chalk.red(`${check.name} is not running on port ${check.port}`));
      console.log(chalk.yellow(`\nPlease start all services first:`));
      console.log(chalk.gray(`  npm run dev\n`));
      process.exit(1);
    }
  }

  spinner.succeed(chalk.green('All services are running'));
}

async function runAllTests() {
  try {
    await checkPrerequisites();

    console.log(chalk.cyan(`\nRunning ${tests.length} test suites...\n`));

    for (const test of tests) {
      await runTest(test);
      console.log(); // Blank line between tests
    }

    // Summary
    console.log(chalk.cyan.bold('\n📊 Test Results Summary\n'));
    console.log(chalk.green(`✅ Passed: ${results.passed.length}`));
    console.log(chalk.red(`❌ Failed: ${results.failed.length}`));
    console.log(chalk.yellow(`⊘  Skipped: ${results.skipped.length}`));

    const total = results.passed.length + results.failed.length + results.skipped.length;
    const passRate = total > 0 ? ((results.passed.length / total) * 100).toFixed(1) : 0;
    console.log(chalk.cyan(`\n🎯 Pass Rate: ${passRate}%\n`));

    if (results.failed.length > 0) {
      console.log(chalk.red.bold('Failed Tests:'));
      results.failed.forEach(test => {
        console.log(chalk.red(`  • ${test.name}`));
        if (test.reason === 'timeout') {
          console.log(chalk.dim(`    Timeout after ${test.timeout}ms`));
        }
      });
      console.log();
    }

    // Exit with appropriate code
    process.exit(results.failed.length === 0 ? 0 : 1);

  } catch (error) {
    console.error(chalk.red('\n💥 Test runner failed:'), error.message);
    process.exit(1);
  }
}

runAllTests();
