import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema.js';
import path from 'path';

// The database file is in the root data directory
// Using process.cwd() to resolve from project root
const dbPath = path.resolve(process.cwd(), '../data/summy.db');

const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

export type DbClient = typeof db;