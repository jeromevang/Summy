import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import { fileURLToPath } from 'url';

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The database file is in the root data directory
// Relative to this file: ../../../data/summy.db
// However, using process.cwd() is safer if we run from the database package root
const dbPath = path.resolve(process.cwd(), '../data/summy.db');

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

export type DbClient = typeof db;