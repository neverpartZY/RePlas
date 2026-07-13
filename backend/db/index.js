/**
 * 数据库工厂 — 根据 DB_TYPE 环境变量自动选择 SQLite 或 MySQL
 *
 * 本地开发:  DB_TYPE=sqlite (默认，使用 better-sqlite3)
 * 云托管:    DB_TYPE=mysql (使用 TDSQL-C MySQL)
 *
 * 两种模式导出相同的 API 接口：
 *   db.prepare(sql).get/run/all(params)  +  db.transaction(fn)
 *
 * 注意：MySQL 模式下所有调用返回 Promise，需要在调用处加 await
 */

const DB_TYPE = (process.env.DB_TYPE || 'sqlite').toLowerCase();

let db;

if (DB_TYPE === 'mysql') {
  console.log('[DB] Using MySQL (TDSQL-C) adapter — all calls are async (use await)');
  db = require('./mysql');
} else {
  console.log('[DB] Using SQLite (better-sqlite3) adapter');
  // 注意：必须用 ../db.js 而非 ../db，否则会解析为 db/index.js 导致循环引用
  db = require('../db.js');
}

module.exports = db;
module.exports.DB_TYPE = DB_TYPE;
