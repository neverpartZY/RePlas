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

// ---- 获取表列信息（兼容 SQLite & MySQL） ----
// 返回 { name, nullable, type } 数组
async function getColumnInfo(tableName) {
  if (isMySQL) {
    const rows = await db.prepare(`SHOW COLUMNS FROM \`${tableName}\``).all();
    return rows.map(r => ({
      name: r.Field,
      nullable: r.Null === 'YES',
      type: (r.Type || '').toLowerCase()
    }));
  } else {
    const rows = db.prepare(`PRAGMA table_info("${tableName}")`).all();
    return rows.map(r => ({
      name: r.name,
      nullable: !r.notnull || r.notnull === 0,
      type: (r.type || '').toLowerCase()
    }));
  }
}

// ---- 获取表列名（兼容 SQLite & MySQL） ----
async function getColumnNames(tableName) {
  const info = await getColumnInfo(tableName);
  return info.map(c => c.name);
}

// NOT NULL 列缺失时的默认值
function defaultForType(type) {
  if (!type) return '';
  if (type.includes('int')) return 0;
  if (type.includes('real') || type.includes('float') || type.includes('double') || type.includes('decimal')) return 0;
  if (type.includes('datetime') || type.includes('timestamp')) {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }
  return '';
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

// ---- 清空指定表 ----
async function clearTable(tableName) {
  if (isMySQL) {
    await db.prepare(`DELETE FROM \`${tableName}\``).run();
  } else {
    db.prepare(`DELETE FROM "${tableName}"`).run();
  }
}

// ---- 导入数据（JSON） ----
router.post('/import', async (req, res) => {
  const { tables: tableList, data, clearFirst } = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ success: false, error: '缺少 data 字段' });
  }

  const results = {};
  const errors = [];

  // 依赖顺序（从表优先清空，主表优先导入）
  const clearOrder = ['enterprise_samples', 'audit_logs', 'notifications', 'messages',
    'matches', 'deal_intents', 'evaluations', 'upload_images', 'vision_records',
    'listings', 'price_history', 'prices', 'reports',
    'external_listings', 'login_attempts', 'refresh_tokens', 'sms_codes', 'users'];

  const importOrder = ['users', 'external_listings', 'price_history', 'prices',
    'reports', 'refresh_tokens', 'sms_codes', 'login_attempts',
    'deal_intents', 'evaluations', 'upload_images', 'vision_records',
    'listings', 'matches', 'messages', 'notifications', 'audit_logs',
    'enterprise_samples'];

  const allTableNames = tableList || Object.keys(data);

  // 禁用 MySQL 外键和检查约束
  if (isMySQL && clearFirst) {
    await db.prepare('SET FOREIGN_KEY_CHECKS = 0').run();
    // 对于有 CHECK 约束的表，尝试禁用（MySQL 8.0.16+）
    try { await db.prepare('SET SESSION check_constraint_checks = 0').run(); } catch (e) {}
  }

  // Step A: 如果需要清空，先清空所有指定表（按依赖倒序：从表先清）
  if (clearFirst) {
    for (const tableName of clearOrder) {
      if (!allTableNames.includes(tableName)) continue;
      // 只清空存在的表
      const exists = await tableExists(tableName);
      if (!exists) continue;
      try {
        await clearTable(tableName);
      } catch (e) {
        errors.push(`${tableName} clear: ${e.message}`);
      }
    }
  }

  // Step B: 按顺序导入数据
  for (const tableName of importOrder) {
    if (!allTableNames.includes(tableName)) continue;
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

    // 获取目标表列信息（含 NULL 约束）
    let columnInfo;
    try {
      columnInfo = await getColumnInfo(tableName);
    } catch (e) {
      errors.push(`${tableName}: ${e.message}`);
      results[tableName] = { rows: 0, error: e.message };
      continue;
    }

    try {
      let inserted = 0;
      // 取第一行数据来确定哪些列有值
      const firstRow = rows[0];
      const rowKeys = Object.keys(firstRow);

      // 只取交集：MySQL 列 ∩ 数据列。对于 NOT NULL 但数据中不存在的列，填入默认值
      const matchedCols = [];
      const defaultValues = [];
      for (const ci of columnInfo) {
        if (rowKeys.includes(ci.name)) {
          matchedCols.push(ci.name);
          defaultValues.push(null); // 占位，实际值从数据取
        } else if (!ci.nullable) {
          // NOT NULL 列在数据中不存在 → 填默认值
          matchedCols.push(ci.name);
          defaultValues.push(defaultForType(ci.type));
        }
        // nullable 且在数据中不存在的列 → 跳过（MySQL 会用 DEFAULT 或 NULL）
      }

      if (matchedCols.length === 0) {
        results[tableName] = { rows: 0, error: 'no matching columns' };
        continue;
      }

      const quotedCols = isMySQL
        ? matchedCols.map(c => `\`${c}\``).join(',')
        : matchedCols.map(c => `"${c}"`).join(',');

      const placeholders = matchedCols.map(() => '?').join(',');

      // MySQL 用 REPLACE INTO，SQLite 用 INSERT OR REPLACE
      const insertSQL = isMySQL
        ? `REPLACE INTO \`${tableName}\` (${quotedCols}) VALUES (${placeholders})`
        : `INSERT OR REPLACE INTO "${tableName}" (${quotedCols}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = matchedCols.map((colName, idx) => {
          // 如果这个列有默认值（即数据中不存在），使用默认值
          if (defaultValues[idx] !== null) return defaultValues[idx];
          
          const val = row[colName];
          if (val === undefined || val === null) return null;
          if (typeof val === 'object') {
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

  // 恢复 MySQL 约束检查
  if (isMySQL && clearFirst) {
    await db.prepare('SET FOREIGN_KEY_CHECKS = 1').run();
    try { await db.prepare('SET SESSION check_constraint_checks = 1').run(); } catch (e) {}
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
