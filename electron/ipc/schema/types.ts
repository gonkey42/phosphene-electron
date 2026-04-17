import type Database from "better-sqlite3";

export type SchemaInitializer = (database: Database.Database) => void;
