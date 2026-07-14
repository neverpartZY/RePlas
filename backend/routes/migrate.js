/**
 * 数据迁移 API（SQLite & MySQL 双模式兼容）
 * 用于 ECS → 云托管 数据同步
 * 使用 MIGRATION_TOKEN 鉴权（不依赖 JWT）
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const isMySQL = (process.env.DB_TYPE || 'sqlite').toLowerCase() === 'mysql';

// 迁移密钥
const MIGRATION_TOKEN = process.env.MIGRATION_TOKEN || '';

// ---- 鉴权中间件 ----
function requireMigrationToken(req, res, next) {
  if (!MIGRATION_TOKEN) {
    return res.status(403).json({ success: false, error: '迁移功能未启用' });
  }
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (token !== MIGRATION_TOKEN) {
    return res.status(401).json({ success: false, error: '无效的迁移令牌' });
  }
  next();
}

router.use(requireMigrationToken);

// ---- 获取表列表（兼容 SQLite & MySQL） ----
async function getTableList() {
  if (isMySQL) {
    const rows = await db.prepare(
      "SELECT TABLE_NAME as name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
    ).all();
    return rows.map(r => r.name);
  } else {
    const rows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();
    return rows.map(r => r.name);
  }
}

// ---- 获取表列名（兼容 SQLite & MySQL） ----
async function getColumnNames(tableName) {
  if (isMySQL) {
    const rows = await db.prepare(`SHOW COLUMNS FROM \`${tableName}\``).all();
    return rows.map(r => r.Field);
  } else {
    const rows = db.prepare(`PRAGMA table_info("${tableName}")`).all();
    return rows.map(r => r.name);
  }
}

// ---- 检查表是否存在 ----
async function tableExists(tableName) {
  if (isMySQL) {
    const row = await db.prepare(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?"
    ).get(tableName);
    return !!row;
  } else {
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(tableName);
    return !!row;
  }
}

// ---- 导出全部数据（JSON） ----
router.get('/export', async (req, res) => {
  try {
    const tables = await getTableList();
    const data = {};
    for (const name of tables) {
      try {
        if (isMySQL) {
          data[name] = await db.prepare(`SELECT * FROM \`${name}\``).all();
        } else {
          data[name] = db.prepare(`SELECT * FROM "${name}"`).all();
        }
      } catch (e) {
        data[name] = { _error: e.message };
      }
    }
    res.json({ success: true, tables, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 导入数据（JSON） ----
router.post('/import', async (req, res) => {
  const { tables: tableList, data, clearFirst } = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ success: false, error: '缺少 data 字段' });
  }

  const results = {};
  const errors = [];

  // 依赖顺序
  const orderedTables = ['users', 'external_listings', 'price_history', 'prices',
    'reports', 'refresh_tokens', 'sms_codes', 'login_attempts',
    'deal_intents', 'evaluations', 'upload_images', 'vision_records',
    'listings', 'matches', 'messages', 'notifications', 'audit_logs',
    'enterprise_samples'];

  const allTableNames = tableList || Object.keys(data);
  for (const t of allTableNames) {
    if (!orderedTables.includes(t)) orderedTables.push(t);
  }

  // 按顺序处理每个表
  for (const tableName of orderedTables) {
    const rows = data[tableName];
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      results[tableName] = { rows: 0, skipped: true };
      continue;
    }

    // 检查表是否存在
    const exists = await tableExists(tableName);
    if (!exists) {
      results[tableName] = { rows: 0, skipped: 'table not found' };
      continue;
    }

    // 获取列名
    let colNames;
    try {
      colNames = await getColumnNames(tableName);
    } catch (e) {
      errors.push(`${tableName}: ${e.message}`);
      results[tableName] = { rows: 0, error: e.message };
      continue;
    }

    try {
      // 可选：清空旧数据
      if (clearFirst) {
        if (isMySQL) {
          // MySQL 外键约束：临时禁用检查，清空后重新启用
          await db.prepare('SET FOREIGN_KEY_CHECKS = 0').run();
          await db.prepare(`DELETE FROM \`${tableName}\``).run();
          await db.prepare('SET FOREIGN_KEY_CHECKS = 1').run();
        } else {
          db.prepare(`DELETE FROM "${tableName}"`).run();
        }
      }

      let inserted = 0;
      const quotedCols = isMySQL
        ? colNames.map(c => `\`${c}\``).join(',')
        : colNames.map(c => `"${c}"`).join(',');

      const placeholders = colNames.map(() => '?').join(',');

      // MySQL 用 REPLACE INTO，SQLite 用 INSERT OR REPLACE
      const insertSQL = isMySQL
        ? `REPLACE INTO \`${tableName}\` (${quotedCols}) VALUES (${placeholders})`
        : `INSERT OR REPLACE INTO "${tableName}" (${quotedCols}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = colNames.map(col => {
          const val = row[col];
          if (val === undefined) return null;
          if (val !== null && typeof val === 'object') {
            return JSON.stringify(val);
          }
          return val;
        });

        if (isMySQL) {
          await db.prepare(insertSQL).run(...values);
        } else {
          db.prepare(insertSQL).run(...values);
        }
        inserted++;
      }

      results[tableName] = { rows: inserted };
    } catch (e) {
      errors.push(`${tableName}: ${e.message}`);
      results[tableName] = { rows: 0, error: e.message };
    }
  }

  res.json({
    success: errors.length === 0,
    results,
    errors: errors.length > 0 ? errors : undefined,
    summary: `Imported ${Object.values(results).reduce((sum, r) => sum + (r.rows || 0), 0)} rows across ${Object.keys(results).length} tables`,
  });
});

// ---- 获取迁移状态 ----
router.get('/status', async (req, res) => {
  try {
    const tables = await getTableList();
    const counts = {};

    for (const name of tables) {
      try {
        if (isMySQL) {
          const row = await db.prepare(`SELECT COUNT(*) as c FROM \`${name}\``).get();
          counts[name] = row.c;
        } else {
          counts[name] = db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get().c;
        }
      } catch (e) {
        counts[name] = -1;
      }
    }

    res.json({
      success: true,
      counts,
      totalRows: Object.values(counts).reduce((a, b) => a + (b > 0 ? b : 0), 0),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
