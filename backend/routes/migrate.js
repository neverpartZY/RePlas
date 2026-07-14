/**
 * 数据迁移 API
 * 用于 ECS → 云托管 数据同步
 * 使用 MIGRATION_TOKEN 鉴权（不依赖 JWT）
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

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

// ---- 导出全部数据（JSON） ----
router.get('/export', (req, res) => {
  try {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();

    const data = {};
    for (const { name } of tables) {
      try {
        data[name] = db.prepare(`SELECT * FROM "${name}"`).all();
      } catch (e) {
        data[name] = { _error: e.message };
      }
    }

    res.json({ success: true, tables: Object.keys(data), data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 导入数据（JSON） ----
router.post('/import', (req, res) => {
  const { tables: tableList, data, clearFirst } = req.body;
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ success: false, error: '缺少 data 字段' });
  }

  const results = {};
  const errors = [];

  // 依赖顺序：先 users，再其他
  const orderedTables = ['users', 'listings', 'external_listings', 'prices',
    'price_history', 'matches', 'notifications', 'messages', 'reports',
    'refresh_tokens', 'sms_codes', 'login_attempts', 'audit_logs',
    'enterprise_samples', 'upload_images', 'vision_records',
    'deal_intents', 'evaluations'];

  // 把没在 orderedTables 中的表也加上
  const allTableNames = tableList || Object.keys(data);
  for (const t of allTableNames) {
    if (!orderedTables.includes(t)) orderedTables.push(t);
  }

  const importAll = db.transaction(() => {
    for (const tableName of orderedTables) {
      const rows = data[tableName];
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        results[tableName] = { rows: 0, skipped: true };
        continue;
      }

      // 检查表是否存在
      const tableExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(tableName);

      if (!tableExists) {
        results[tableName] = { rows: 0, skipped: 'table not found' };
        continue;
      }

      // 获取列名
      const cols = db.prepare(`PRAGMA table_info("${tableName}")`).all();
      const colNames = cols.map(c => c.name);

      try {
        // 可选：清空旧数据
        if (clearFirst) {
          // 跳过 sqlite_sequence（自动管理）
          if (tableName !== 'sqlite_sequence') {
            db.prepare(`DELETE FROM "${tableName}"`).run();
          }
        }

        let inserted = 0;
        const placeholders = colNames.map(() => '?').join(',');

        // 使用 INSERT OR REPLACE（对于有唯一约束的表正确处理）
        const insertStmt = db.prepare(`
          INSERT OR REPLACE INTO "${tableName}" (${colNames.map(c => `"${c}"`).join(',')})
          VALUES (${placeholders})
        `);

        for (const row of rows) {
          const values = colNames.map(col => {
            const val = row[col];
            // 处理 JSON 对象/数组 — 转为字符串
            if (val !== null && val !== undefined && typeof val === 'object') {
              return JSON.stringify(val);
            }
            return val !== undefined ? val : null;
          });
          insertStmt.run(...values);
          inserted++;
        }

        results[tableName] = { rows: inserted };
      } catch (e) {
        errors.push(`${tableName}: ${e.message}`);
        results[tableName] = { rows: 0, error: e.message };
      }
    }
  });

  // 在事务外执行
  try {
    importAll();
  } catch (err) {
    errors.push(`transaction: ${err.message}`);
  }

  res.json({
    success: errors.length === 0,
    results,
    errors: errors.length > 0 ? errors : undefined,
    summary: `Imported ${Object.values(results).reduce((sum, r) => sum + (r.rows || 0), 0)} rows across ${Object.keys(results).length} tables`,
  });
});

// ---- 获取迁移状态 ----
router.get('/status', (req, res) => {
  try {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all();

    const counts = {};
    for (const { name } of tables) {
      try {
        counts[name] = db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get().c;
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
