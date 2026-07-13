/**
 * MySQL 数据库适配层
 * 提供与 better-sqlite3 兼容的 API，用于微信云托管 TDSQL-C MySQL
 *
 * API: db.prepare(sql).get/run/all(params) + db.transaction(fn)
 * 与 SQLite 版的区别：所有操作返回 Promise，调用方需要 await
 *
 * 环境变量：
 *   MYSQL_HOST     — 数据库主机（云托管自动注入）
 *   MYSQL_PORT     — 端口（默认 3306）
 *   MYSQL_USER     — 用户名
 *   MYSQL_PASSWORD — 密码
 *   MYSQL_DATABASE — 数据库名
 */

const mysql = require('mysql2/promise');

// ---- 连接池 ----------------------------------------------------------------
let pool = null;

function getPool() {
  if (!pool) {
    const config = {
      host:     process.env.MYSQL_HOST     || '127.0.0.1',
      port:     process.env.MYSQL_PORT     || 3306,
      user:     process.env.MYSQL_USER     || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'zaisutong',
      charset:  'utf8mb4',
      // 云托管环境下连接池配置
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    };
    pool = mysql.createPool(config);
  }
  return pool;
}

// ---- PreparedStatement 包装类 ------------------------------------------------

class PreparedStatement {
  constructor(sql) {
    this.sql = sql;
  }

  /**
   * 获取单行 — 等同于 better-sqlite3 的 .get()
   * @returns {Promise<Object|undefined>}
   */
  async get(...params) {
    const [rows] = await getPool().execute(this.sql, params);
    return rows[0];
  }

  /**
   * 获取所有行 — 等同于 better-sqlite3 的 .all()
   * @returns {Promise<Array<Object>>}
   */
  async all(...params) {
    const [rows] = await getPool().execute(this.sql, params);
    return rows;
  }

  /**
   * 执行写操作 — 等同于 better-sqlite3 的 .run()
   * @returns {Promise<{changes: number, lastInsertRowid: number}>}
   */
  async run(...params) {
    const [result] = await getPool().execute(this.sql, params);
    return {
      changes: result.affectedRows,
      lastInsertRowid: result.insertId,
    };
  }
}

// ---- db 对象（模拟 better-sqlite3 接口）--------------------------------------

const db = {
  /**
   * 创建预编译语句
   */
  prepare(sql) {
    return new PreparedStatement(sql);
  },

  /**
   * 执行原始 SQL（DDL 等不需要参数化的情况）
   */
  async exec(sql) {
    const pool = getPool();
    // 拆分多条 SQL 语句分别执行
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      await pool.execute(stmt);
    }
  },

  /**
   * 事务包装器
   * 用法: await db.transaction(async (trx) => { ... })
   * trx 拥有与 db 相同的 prepare() 方法
   */
  async transaction(fn) {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      // 创建事务作用域内的 prepare 方法
      const trx = {
        prepare(sql) {
          const stmt = new PreparedStatement(sql);
          // 用事务连接覆盖 getPool 行为
          const origPool = pool;
          pool = { execute: (...args) => conn.execute(...args) };
          const result = stmt;
          // 包装以在调用后恢复 pool
          const _get = stmt.get.bind(stmt);
          const _all = stmt.all.bind(stmt);
          const _run = stmt.run.bind(stmt);
          stmt.get = async function(...params) {
            const [rows] = await conn.execute(sql, params);
            return rows[0];
          };
          stmt.all = async function(...params) {
            const [rows] = await conn.execute(sql, params);
            return rows;
          };
          stmt.run = async function(...params) {
            const [result] = await conn.execute(sql, params);
            return { changes: result.affectedRows, lastInsertRowid: result.insertId };
          };
          return stmt;
        },
      };

      const result = await fn(trx);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /**
   * 关闭连接池
   */
  async close() {
    if (pool) {
      await pool.end();
      pool = null;
    }
  },

  /**
   * MySQL 不需要 pragma，保留空方法兼容
   */
  pragma() {
    // no-op in MySQL
  },
};

module.exports = db;
