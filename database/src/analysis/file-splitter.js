import fs from 'fs-extra';
import path from 'path';
import { ASTParser } from './ast-parser.js';
import { db } from '../services/database.js';
import chalk from 'chalk';
export class FileSplitter {
    parser;
    constructor() {
        this.parser = new ASTParser();
    }
    async splitFile(filePath, outputDir, options = {}) {
        const { minLines = 100, createBarrel = true, dryRun = false } = options;
        console.log(chalk.blue(`[Splitter] Processing ${filePath}...`));
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        if (lines.length < minLines && !options.groupByType) {
            console.log(chalk.yellow(`[Splitter] File too small (${lines.length} lines), skipping split.`));
            return;
        }
        const units = this.parser.parseFile(filePath, content);
        console.log(chalk.green(`[Splitter] Identified ${units.length} semantic units.`));
        if (dryRun) {
            console.log(chalk.gray(`[Splitter] Dry run: Would split into ${units.length} files in ${outputDir}`));
            return;
        }
        await fs.ensureDir(outputDir);
        const exports = [];
        // 1. Group units (simple: one file per unit for now, or group by type)
        for (const unit of units) {
            const fileName = `${unit.name}.${path.extname(filePath).slice(1)}`;
            const targetPath = path.join(outputDir, fileName);
            // Basic implementation: prepend necessary imports (this is the hard part of auto-splitting)
            // For now, we'll just write the unit content
            // In a real implementation, we would use AST to extract exactly the imports needed
            const fileContent = this.generateFileContent(unit, content);
            await fs.writeFile(targetPath, fileContent);
            console.log(chalk.cyan(`[Splitter] Created ${targetPath}`));
            if (unit.isExported) {
                exports.push(unit.name);
            }
            // Update database
            this.updateIndex(filePath, unit, targetPath);
        }
        // 2. Create barrel export
        if (createBarrel) {
            const barrelPath = path.join(outputDir, 'index.ts');
            const barrelContent = units
                .filter(u => u.isExported)
                .map(u => `export { ${u.name} } from './${u.name}';`)
                .join('\n');
            await fs.writeFile(barrelPath, barrelContent);
            console.log(chalk.magenta(`[Splitter] Created barrel export: ${barrelPath}`));
        }
    }
    generateFileContent(unit, originalContent) {
        // This is a naive implementation. 
        // A robust one would analyze imports needed for this unit.
        // For now, we'll just return the unit content.
        return `// Split from original file\n\n${unit.content}`;
    }
    updateIndex(originalPath, unit, newPath) {
        const connection = db.getConnection();
        // Insert/Update code_index for the new file
        connection.prepare(`
      INSERT INTO code_index (file_path, category, lines_count)
      VALUES (?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET
        category = excluded.category,
        lines_count = excluded.lines_count,
        updated_at = CURRENT_TIMESTAMP
    `).run(newPath, unit.type, unit.endLine - unit.startLine);
        // Insert chunk metadata
        connection.prepare(`
      INSERT INTO code_chunks (id, file_path, symbol_name, symbol_type, content, start_line, end_line)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        updated_at = CURRENT_TIMESTAMP
    `).run(`${unit.name}_${Date.now()}`, newPath, unit.name, unit.type, unit.content, 1, unit.endLine - unit.startLine + 1);
    }
}
//# sourceMappingURL=file-splitter.js.map