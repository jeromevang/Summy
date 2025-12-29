/**
 * Database Index Optimization Script
 * Adds performance indexes to improve query performance
 */

import sqlite3 from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file location
const DB_PATH = path.join(__dirname, '../data/summy.db');

console.log('🔧 Database Index Optimization Script');
console.log('=====================================');

try {
  // Connect to database
  const db = sqlite3(DB_PATH);
  
  console.log('✅ Connected to database:', DB_PATH);
  
  // List of indexes to create
  const indexes = [
    // Combo Test Results
    'CREATE INDEX IF NOT EXISTS idx_combo_results_main_executor_score ON combo_test_results(main_model_id, executor_model_id, overall_score DESC);',
    'CREATE INDEX IF NOT EXISTS idx_combo_results_qualifying ON combo_test_results(qualifying_gate_passed, overall_score DESC);',
    'CREATE INDEX IF NOT EXISTS idx_combo_results_excluded ON combo_test_results(main_excluded, overall_score DESC);',
    'CREATE INDEX IF NOT EXISTS idx_combo_results_tested_at ON combo_test_results(tested_at DESC);',
    
    // Test History
    'CREATE INDEX IF NOT EXISTS idx_test_history_model_id ON test_history(model_id);',
    'CREATE INDEX IF NOT EXISTS idx_test_history_model_timestamp ON test_history(model_id, timestamp DESC);',
    'CREATE INDEX IF NOT EXISTS idx_test_history_mode ON test_history(test_mode);',
    'CREATE INDEX IF NOT EXISTS idx_test_history_timestamp ON test_history(timestamp DESC);',
    
    // Execution Logs
    'CREATE INDEX IF NOT EXISTS idx_logs_session_timestamp ON execution_logs(session_id, timestamp DESC);',
    'CREATE INDEX IF NOT EXISTS idx_logs_model_tool ON execution_logs(model, tool);',
    'CREATE INDEX IF NOT EXISTS idx_logs_session_tool ON execution_logs(session_id, tool);',
    'CREATE INDEX IF NOT EXISTS idx_logs_status_duration ON execution_logs(status, duration_ms);',
    
    // Sessions
    'CREATE INDEX IF NOT EXISTS idx_sessions_model ON sessions(model);',
    'CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider);',
    'CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);',
    'CREATE INDEX IF NOT EXISTS idx_sessions_model_created ON sessions(model, created_at DESC);',
    
    // Analytics
    'CREATE INDEX IF NOT EXISTS idx_analytics_model_timestamp ON analytics(model, timestamp DESC);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_type_success ON analytics(type, success);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_provider_timestamp ON analytics(provider, timestamp DESC);',
    'CREATE INDEX IF NOT EXISTS idx_analytics_success_timestamp ON analytics(success, timestamp DESC);'
  ];
  
  console.log(`\n📊 Creating ${indexes.length} performance indexes...`);
  
  let createdCount = 0;
  let skippedCount = 0;
  
  for (const indexSql of indexes) {
    try {
      db.exec(indexSql);
      createdCount++;
      console.log(`  ✅ Created: ${indexSql.match(/CREATE INDEX IF NOT EXISTS (\w+)/)?.[1] || 'Unknown'}`);
    } catch (error) {
      if (error.message.includes('already exists')) {
        skippedCount++;
        console.log(`  ⏭️  Skipped (already exists): ${indexSql.match(/CREATE INDEX IF NOT EXISTS (\w+)/)?.[1] || 'Unknown'}`);
      } else {
        console.log(`  ❌ Error: ${error.message}`);
      }
    }
  }
  
  // Analyze table statistics
  console.log('\n📈 Database Statistics:');
  console.log('======================');
  
  const tables = ['sessions', 'analytics', 'execution_logs', 'combo_test_results', 'test_history'];
  
  for (const table of tables) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      console.log(`  ${table}: ${count.count.toLocaleString()} rows`);
    } catch (error) {
      console.log(`  ${table}: Error counting rows`);
    }
  }
  
  // Show index information
  console.log('\n📋 Index Information:');
  console.log('====================');
  
  const indexInfo = db.prepare(`
    SELECT name, tbl_name, sql 
    FROM sqlite_master 
    WHERE type='index' AND tbl_name IN ('sessions', 'analytics', 'execution_logs', 'combo_test_results', 'test_history')
    ORDER BY tbl_name, name
  `).all();
  
  let currentTable = '';
  for (const index of indexInfo) {
    if (index.tbl_name !== currentTable) {
      currentTable = index.tbl_name;
      console.log(`\n  📁 ${currentTable}:`);
    }
    console.log(`    • ${index.name}`);
  }
  
  console.log('\n✅ Database optimization completed!');
  console.log(`   Created: ${createdCount} indexes`);
  console.log(`   Skipped: ${skippedCount} indexes (already exist)`);
  
  db.close();
  
} catch (error) {
  console.error('❌ Database optimization failed:', error.message);
  process.exit(1);
}
