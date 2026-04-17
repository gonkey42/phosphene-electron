import type Database from "better-sqlite3";

export type SchemaInitializer = (database: Database.Database) => void;

export type Migration = {
  version: number;
  description: string;
  up: (db: Database.Database) => void;
};
