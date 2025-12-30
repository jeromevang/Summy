import { FileSplitter } from '../src/analysis/file-splitter.js';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const splitter = new FileSplitter();
  
  const targetFile = path.resolve(__dirname, '../../client/src/pages/Tooly.tsx');
  const outputDir = path.resolve(__dirname, '../../client/src/pages/tooly_split');

  console.log(chalk.bold.white('\n🚀 STARTING FILE SPLIT TEST'));
  console.log(chalk.white('---------------------------'));
  console.log(chalk.gray(`Source: ${targetFile}`));
  console.log(chalk.gray(`Target: ${outputDir}\n`));

  try {
    await splitter.splitFile(targetFile, outputDir, {
      minLines: 100,
      createBarrel: true,
      dryRun: false // SET TO FALSE TO ACTUALLY CREATE FILES
    });

    console.log(chalk.bold.green('\n✅ SPLIT COMPLETED SUCCESSFULLY'));
    console.log(chalk.white('Check the output directory for the new focused modules.'));
  } catch (error: any) {
    console.error(chalk.bold.red('\n❌ SPLIT FAILED'));
    console.error(chalk.red(error.message));
  }
}

run();
