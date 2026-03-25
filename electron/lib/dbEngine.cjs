const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { existsSync, mkdirSync } = require('node:fs');
const { app } = require('electron');
const { getBaseSchemaSql } = require('./db/schema.cjs');
const { runMigrations } = require('./db/migrations.cjs');

let db = null;

/**
 * 데이터베이스 초기화 및 테이블 생성
 */
function ensureDatabase() {
  if (db) return db;

  const dbDir = path.join(app.getPath('userData'), 'data');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  db = new DatabaseSync(path.join(dbDir, 'edufixer.sqlite'));
  db.exec(getBaseSchemaSql());
  runMigrations(db);

  return db;
}

/**
 * DB 인스턴스 반환
 */
function getDb() {
  return db || ensureDatabase();
}

module.exports = {
  ensureDatabase,
  getDb,
};
