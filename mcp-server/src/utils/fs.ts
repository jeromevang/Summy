import fs from "fs";
import path from "path";
import ignore, { Ignore } from "ignore";

const projectRoot = process.cwd();
const gitignoreCache: Map<string, Ignore> = new Map();

export function loadGitignore(dirPath: string): Ignore {
  const cached = gitignoreCache.get(dirPath);
  if (cached) return cached;

  const ig = ignore();
  ig.add([
    '.git',
    'node_modules',
    '.DS_Store',
    'Thumbs.db',
    '*.pyc',
    '__pycache__',
    '.env.local',
    '.env.*.local'
  ]);

  let currentDir = dirPath;
  const gitignoreFiles: string[] = [];

  while (currentDir.startsWith(projectRoot) || currentDir === projectRoot) {
    const gitignorePath = path.join(currentDir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      gitignoreFiles.unshift(gitignorePath);
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  for (const gitignorePath of gitignoreFiles) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      ig.add(content);
    } catch (err) {}
  }

  gitignoreCache.set(dirPath, ig);
  return ig;
}

export function isIgnored(basePath: string, relativePath: string): boolean {
  const ig = loadGitignore(basePath);
  return ig.ignores(relativePath);
}

export function isPathInProject(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(projectRoot);
}

export function resolvePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}
