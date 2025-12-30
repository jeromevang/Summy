import { ASTParser } from '../src/analysis/ast-parser.js';
import { db } from '../src/services/database.js';
import { glob } from 'glob';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const parser = new ASTParser();
  const rootDir = path.resolve(__dirname, '../../');
  
  console.log(chalk.bold.white('\n🔍 ANALYZING CODEBASE FOR INDEXING'));
  console.log(chalk.white('----------------------------------'));

  const files = await glob('**/*.{ts,tsx,js,jsx,py}', {
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.*/**'],
    absolute: true
  });

  console.log(chalk.gray(`Found ${files.length} files to index.\n`));

  const connection = db.getConnection();
  let indexedCount = 0;

  for (const file of files) {
    const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
    try {
      const content = await fs.readFile(file, 'utf-8');
      const units = parser.parseFile(file, content);

      // Record file in index
      connection.prepare(`
        INSERT INTO code_index (file_path, lines_count)
        VALUES (?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
          lines_count = excluded.lines_count,
          updated_at = CURRENT_TIMESTAMP
      `).run(relPath, content.split('\n').length);

      // Record units
      for (const unit of units) {
        connection.prepare(`
          INSERT INTO code_chunks (id, file_path, symbol_name, symbol_type, content, start_line, end_line)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            content = excluded.content,
            updated_at = CURRENT_TIMESTAMP
        `).run(
          `${unit.name}_${relPath}`,
          relPath,
          unit.name,
          unit.type,
          unit.content,
          unit.startLine,
          unit.endLine
        );
      }

      indexedCount++;
      if (indexedCount % 10 === 0) {
        process.stdout.write(chalk.green('.'));
      }
    } catch (err: any) {
      console.log(chalk.red(`\nError indexing ${relPath}: ${err.message}`));
    }
  }

  console.log(chalk.bold.green(`\n\n✅ INDEXING COMPLETE: ${indexedCount} files processed.`));
}

run().catch(err => {
  console.error(chalk.red(err.message));
  process.exit(1);
});
