import { Project } from 'ts-morph';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

async function run() {
  console.log(chalk.bold.white('\n🔍 VALIDATING CODEBASE STRUCTURE'));
  console.log(chalk.white('----------------------------------'));

  const project = new Project({
    compilerOptions: {
        allowJs: true,
        jsx: 1
    },
    skipAddingFilesFromTsConfig: true,
  });

  // Load key files (server + client src)
  const files = glob.sync('**/*.{ts,tsx}', {
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/test-project/**'],
    absolute: true
  });
  
  console.log(chalk.gray(`Found ${files.length} total files.`));
  if (files.length > 0) console.log(chalk.gray(`Sample: ${files[0]}`));
  
  // Filter for src/ directories (handle both slash types)
  const srcFiles = files.filter(f => f.replace(/\\/g, '/').includes('/src/'));
  
  console.log(chalk.gray(`Analyzing ${srcFiles.length} source files...`));

  // Build dependency graph
  const graph = new Map<string, string[]>();
  
  for (const file of srcFiles) {
    // Only add files we care about to project
    const sourceFile = project.addSourceFileAtPath(file);
    const imports = sourceFile.getImportDeclarations();
    
    const deps: string[] = [];
    for (const imp of imports) {
      const moduleSpecifier = imp.getModuleSpecifierValue();
      if (moduleSpecifier.startsWith('.')) {
        // Resolve relative import
        const impSourceFile = imp.getModuleSpecifierSourceFile();
        if (impSourceFile) {
            deps.push(impSourceFile.getFilePath());
        }
      }
    }
    graph.set(sourceFile.getFilePath(), deps);
  }

  // Detect Cycles (DFS)
  console.log(chalk.cyan('Checking for circular dependencies...'));
  
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  let cyclesFound = 0;

  function detectCycle(currentFile: string, pathStack: string[]) {
    visited.add(currentFile);
    recursionStack.add(currentFile);
    pathStack.push(currentFile);

    const deps = graph.get(currentFile) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        detectCycle(dep, pathStack);
      } else if (recursionStack.has(dep)) {
        // Cycle detected!
        console.log(chalk.red(`\n⭕ Circular Dependency Found:`));
        const cyclePath = pathStack.slice(pathStack.indexOf(dep));
        cyclePath.push(dep);
        
        cyclePath.forEach((p, i) => {
            const rel = path.relative(path.join(rootDir, '../'), p);
            const indent = '  '.repeat(i);
            console.log(chalk.yellow(`${indent} -> ${rel}`));
        });
        cyclesFound++;
      }
    }

    recursionStack.delete(currentFile);
    pathStack.pop();
  }

  for (const file of graph.keys()) {
    if (!visited.has(file)) {
      detectCycle(file, []);
    }
  }

  if (cyclesFound === 0) {
    console.log(chalk.green('\n✅ No circular dependencies found.'));
  } else {
    console.log(chalk.red(`\n❌ Found ${cyclesFound} circular dependencies.`));
    process.exit(1);
  }
}

run().catch(err => console.error(err));
