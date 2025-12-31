import { ASTParser, SemanticUnit } from '../src/analysis/ast-parser.js';
import { db } from '../src/services/database.js';
import { glob } from 'glob';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SymbolMapEntry {
  id: string;
  filePath: string;
  type: string;
}

// In-memory map for dependency resolution: SymbolName -> [Entries]
// A symbol name might appear in multiple files, so we store a list.
const symbolMap = new Map<string, SymbolMapEntry[]>();

async function run() {
  const parser = new ASTParser();
  const rootDir = path.resolve(__dirname, '../../');
  
  console.log(chalk.bold.white('\n🔍 ANALYZING CODEBASE FOR INDEXING (Phase 4: Enhanced Metadata)'));
  console.log(chalk.white('------------------------------------------------------------'));

  // 1. Find Files
  const files = await glob('**/*.{ts,tsx,js,jsx}', { // focused on JS/TS for now
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.*/**', '**/test-project/**'],
    absolute: true
  });

  console.log(chalk.gray(`Found ${files.length} source files to index.\n`));

  const connection = db.getConnection();

  // 2. Clear Old Data
  console.log(chalk.yellow('Clearing old index...'));
  connection.exec('DELETE FROM code_dependencies');
  connection.exec('DELETE FROM code_chunks');
  connection.exec('DELETE FROM code_index');

  // Prepare Statements
  const insertFileStmt = connection.prepare(`
    INSERT INTO code_index (
      file_path, scope, category, lines_count, updated_at
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);

  const insertChunkStmt = connection.prepare(`
    INSERT INTO code_chunks (
      id, file_path, symbol_name, symbol_type, content, 
      start_line, end_line, is_exported, signature, doc_comment
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDepStmt = connection.prepare(`
    INSERT INTO code_dependencies (
      source_chunk_id, target_chunk_id, dependency_type
    ) VALUES (?, ?, ?)
  `);

  let indexedCount = 0;
  const allUnits: { unit: SemanticUnit; relPath: string; chunkId: string }[] = [];

  console.log(chalk.cyan('Phase 1: Parsing and Chunking...'));

  // Transaction for Phase 1
  const phase1Tx = connection.transaction(() => {
    for (const file of files) {
      const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const linesCount = content.split('\n').length;
        
        // Categorize file
        let category = 'other';
        if (relPath.includes('/components/')) category = 'component';
        else if (relPath.includes('/hooks/')) category = 'hook';
        else if (relPath.includes('/services/')) category = 'service';
        else if (relPath.includes('/utils/')) category = 'utility';
        else if (relPath.includes('/pages/')) category = 'page';
        else if (relPath.includes('/routes/')) category = 'route';

        // Insert File Record
        insertFileStmt.run(relPath, 'project', category, linesCount);

        // Parse Units
        const units = parser.parseFile(file, content);

        for (const unit of units) {
          // Generate a stable ID: symbol_filepath_line
          // Sanitize path for ID
          const cleanPath = relPath.replace(/[^a-zA-Z0-9]/g, '_');
          const chunkId = `${unit.name}_${cleanPath}_${unit.startLine}`;

          // Insert Chunk Record
          // We need to alter table if columns missing, but for now assuming schema matches standard
          // Note: The schema.ts had columns: inputs, outputs. We'll map signature -> inputs/outputs roughly or skip
          insertChunkStmt.run(
            chunkId,
            relPath,
            unit.name,
            unit.type,
            unit.content,
            unit.startLine,
            unit.endLine,
            unit.isExported ? 1 : 0,
            unit.signature || null,
            unit.docComment || null
          );

          // Store for Phase 2
          allUnits.push({ unit, relPath, chunkId });

          // Add to symbol map for resolution
          if (!symbolMap.has(unit.name)) {
            symbolMap.set(unit.name, []);
          }
          symbolMap.get(unit.name)!.push({ id: chunkId, filePath: relPath, type: unit.type });
        }

        indexedCount++;
        if (indexedCount % 50 === 0) process.stdout.write(chalk.green('.'));

      } catch (err: any) {
        // console.log(chalk.red(`\nSkipping ${relPath}: ${err.message}`));
      }
    }
  });

  phase1Tx();
  console.log(chalk.green(`\nParsed ${allUnits.length} chunks from ${indexedCount} files.`));

  // Phase 2: Dependency Resolution
  console.log(chalk.cyan('\nPhase 2: Linking Dependencies...'));
  
  let depCount = 0;
  const phase2Tx = connection.transaction(() => {
    for (const { unit, chunkId, relPath } of allUnits) {
      // Simple Heuristic: Look for symbol names in the content body
      // In a real system, we'd use the AST's `references` or `calls` 
      // but ts-morph's full findReferences is slow for a whole project in this loop.
      // We will do a regex scan of the content for known symbols.
      
      // Optimization: Only look for symbols that actually exist in our map
      // This is O(N * M) where N=chunks, M=symbols. Can be slow.
      // Better: Tokenize content words and check if they exist in symbolMap.

      const tokens = new Set(unit.content.match(/\b[a-zA-Z_]\w+\b/g) || []);
      
      for (const token of tokens) {
        if (token === unit.name) continue; // Skip self-reference (recursion handled separately?)

        const targets = symbolMap.get(token);
        if (targets) {
          for (const target of targets) {
            // Avoid linking to self (if multiple definitions exist)
            if (target.id === chunkId) continue;

            // Heuristic: Prefer imports from same directory or explicit imports
            // For now, we link ALL matches. This creates a "potential dependency" graph.
            // Precision can be improved by parsing imports.
            
            insertDepStmt.run(chunkId, target.id, 'calls'); // Generic 'calls' or 'references'
            depCount++;
          }
        }
      }
    }
  });

  phase2Tx();
  console.log(chalk.green(`\nCreated ${depCount} dependency links.`));

  console.log(chalk.bold.green(`\n✅ INDEXING COMPLETE`));
}

// Add columns if they don't exist (Migration-lite)
function ensureSchema() {
    const connection = db.getConnection();
    try {
        connection.exec('ALTER TABLE code_chunks ADD COLUMN is_exported INTEGER DEFAULT 0');
    } catch (e) {}
    try {
        connection.exec('ALTER TABLE code_chunks ADD COLUMN signature TEXT');
    } catch (e) {}
    try {
        connection.exec('ALTER TABLE code_chunks ADD COLUMN doc_comment TEXT');
    } catch (e) {}
}

ensureSchema();
run().catch(err => {
  console.error(chalk.red(err.message));
  // console.error(err.stack);
  process.exit(1);
});