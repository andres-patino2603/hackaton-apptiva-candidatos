import initSqlJs, { type SqlValue } from 'sql.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export async function openDb(path: string) {
  const SQL = await initSqlJs();
  const fresh = !existsSync(path);
  const raw = new SQL.Database(fresh ? undefined : readFileSync(path));
  raw.run('PRAGMA foreign_keys = ON');
  const all = <T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []): T[] => {
    const statement = raw.prepare(sql);
    try {
      statement.bind(params);
      const rows: T[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as T);
      return rows;
    } finally { statement.free(); }
  };
  const save = () => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path + '.tmp', raw.export());
    renameSync(path + '.tmp', path);
    raw.run('PRAGMA foreign_keys = ON');
  };
  const db = {
    all,
    get: <T = Record<string, SqlValue>>(sql: string, params: SqlValue[] = []) => all<T>(sql, params)[0],
    run: (sql: string, params: SqlValue[] = []) => { raw.run(sql, params); return raw.getRowsModified(); },
    transaction: <T>(operation: () => T): T => {
      raw.run('BEGIN IMMEDIATE');
      let result: T;
      try { result = operation(); raw.run('COMMIT'); }
      catch (error) { raw.run('ROLLBACK'); throw error; }
      save();
      return result;
    },
    close: () => raw.close(),
  };
  if (fresh) {
    raw.run(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
    raw.run(readFileSync(new URL('./seed.sql', import.meta.url), 'utf8'));
    save();
  }
  return db;
}
export type Db = Awaited<ReturnType<typeof openDb>>;
