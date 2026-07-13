/**
 * SQLite → MySQL 数据迁移脚本
 *
 * 用法:
 *   1. 确保 SQLite 数据库存在: backend/data/zaisutong.db
 *   2. 配置目标 MySQL: 设置环境变量 MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
 *   3. 运行: node scripts/migrate-to-mysql.js
 *
 * 可加参数:
 *   --schema-only    只创建表结构，不迁移数据
 *   --data-only      只迁移数据（表结构已存在）
 *   --table=users    只迁移指定表
 */

const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');

// ---- 配置 ----------------------------------------------------------------
const SQLITE_PATH = path.join(__dirname, '..', 'data', 'zaisutong.db');
const MYSQL_CONFIG = {
  host:     process.env.MYSQL_HOST     || '127.0.0.1',
  port:     process.env.MYSQL_PORT     || 3306,
  user:     process.env.MYSQL_USER     || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'zaisutong',
  charset:  'utf8mb4',
  multipleStatements: true,
};

const SCHEMA_ONLY = process.argv.includes('--schema-only');
const DATA_ONLY   = process.argv.includes('--data-only');
const TABLE_ONLY  = (() => {
  const arg = process.argv.find(a => a.startsWith('--table='));
  return arg ? arg.split('=')[1] : null;
})();

// ---- SQLite → MySQL 类型映射 ----------------------------------------------
function sqliteToMySQLType(sqliteType) {
  const t = sqliteType.toUpperCase();
  if (t.includes('INTEGER') || t === 'INT') return 'INT';
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUBLE')) return 'DOUBLE';
  if (t.includes('TEXT') || t.includes('CHAR') || t.includes('CLOB')) return 'TEXT';
  if (t.includes('BLOB')) return 'LONGBLOB';
  return 'TEXT'; // fallback
}

// ---- 获取 SQLite 表信息 ---------------------------------------------------
function getSQLiteTables(sqliteDb) {
  const tables = sqliteDb.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();
  return tables.map(t => t.name).filter(name => !TABLE_ONLY || name === TABLE_ONLY);
}

function getTableColumns(sqliteDb, tableName) {
  return sqliteDb.prepare(`PRAGMA table_info("${tableName}")`).all();
}

function getTableIndexes(sqliteDb, tableName) {
  return sqliteDb.prepare(
    `SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`
  ).all(tableName);
}

// ---- 生成 MySQL CREATE TABLE ----------------------------------------------
function generateMySQLCreateTable(tableName, columns, indexes) {
  const lines = [];
  lines.push(`CREATE TABLE IF NOT EXISTS \`${tableName}\` (`);

  const colDefs = [];
  for (const col of columns) {
    const mysqlType = sqliteToMySQLType(col.type);
    let def = `  \`${col.name}\` ${mysqlType}`;

    // 自增主键
    if (col.pk && col.name === 'id') {
      def += ' AUTO_INCREMENT';
    }

    // 非空
    if (col.notnull) {
      // MySQL TEXT 列不能有 DEFAULT（除非指定长度），跳过
      if (mysqlType !== 'TEXT' && mysqlType !== 'LONGBLOB') {
        if (col.dflt_value !== null) {
          let dflt = col.dflt_value;
          // SQLite datetime('now') → MySQL CURRENT_TIMESTAMP
          if (dflt === "datetime('now')" || dflt === "(datetime('now'))") {
            dflt = 'CURRENT_TIMESTAMP';
          }
          // 去掉 SQLite 的引号转义
          dflt = dflt.replace(/^'|'$/g, '');
          def += ` DEFAULT '${dflt}'`;
        }
      }
      def += ' NOT NULL';
    } else if (col.dflt_value !== null && mysqlType !== 'TEXT') {
      let dflt = col.dflt_value;
      if (dflt === "datetime('now')" || dflt === "(datetime('now'))") {
        dflt = 'CURRENT_TIMESTAMP';
      }
      dflt = dflt.replace(/^'|'$/g, '');
      def += ` DEFAULT '${dflt}'`;
    }

    // 主键标识
    if (col.pk) {
      def += ' PRIMARY KEY';
    }

    colDefs.push(def);
  }

  // 如果 id 列没有 AUTO_INCREMENT，补充修改
  for (let i = 0; i < colDefs.length; i++) {
    if (colDefs[i].includes('`id`') && !colDefs[i].includes('AUTO_INCREMENT')) {
      colDefs[i] = colDefs[i].replace('PRIMARY KEY', 'AUTO_INCREMENT PRIMARY KEY');
    }
  }

  lines.push(colDefs.join(',\n'));

  // 外键 — 从原始 SQLite CREATE TABLE SQL 中提取
  // 简化处理：外键通过索引注释记录，手动添加

  lines.push(`) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
  return lines.join('\n');
}

// ---- 主流程 ----------------------------------------------------------------
async function main() {
  console.log('========================================');
  console.log(' 再塑通 SQLite → MySQL 数据迁移');
  console.log('========================================\n');

  // 1. 连接 SQLite
  console.log(`[1/5] 连接 SQLite: ${SQLITE_PATH}`);
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`❌ SQLite 数据库不存在: ${SQLITE_PATH}`);
    process.exit(1);
  }
  const sqliteDb = new Database(SQLITE_PATH, { readonly: true });

  // 2. 连接 MySQL
  console.log(`[2/5] 连接 MySQL: ${MYSQL_CONFIG.user}@${MYSQL_CONFIG.host}:${MYSQL_CONFIG.port}/${MYSQL_CONFIG.database}`);
  const mysqlConn = await mysql.createConnection(MYSQL_CONFIG);

  // 确保数据库存在
  await mysqlConn.execute(
    `CREATE DATABASE IF NOT EXISTS \`${MYSQL_CONFIG.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await mysqlConn.execute(`USE \`${MYSQL_CONFIG.database}\``);

  // 3. 创建表结构
  if (!DATA_ONLY) {
    console.log('[3/5] 创建 MySQL 表结构...');
    const tables = getSQLiteTables(sqliteDb);
    console.log(`  找到 ${tables.length} 张表: ${tables.join(', ')}`);

    // 先禁用外键检查
    await mysqlConn.execute('SET FOREIGN_KEY_CHECKS = 0');

    for (const tableName of tables) {
      const columns = getTableColumns(sqliteDb, tableName);
      const indexes = getTableIndexes(sqliteDb, tableName);

      const createSQL = generateMySQLCreateTable(tableName, columns, indexes);
      try {
        await mysqlConn.execute(`DROP TABLE IF EXISTS \`${tableName}\``);
        await mysqlConn.execute(createSQL);
        console.log(`  ✓ ${tableName} (${columns.length} 列)`);
      } catch (err) {
        console.error(`  ✗ ${tableName}: ${err.message}`);
      }
    }

    await mysqlConn.execute('SET FOREIGN_KEY_CHECKS = 1');
  }

  // 4. 迁移数据
  if (!SCHEMA_ONLY) {
    console.log('[4/5] 迁移数据...');
    const tables = getSQLiteTables(sqliteDb);

    // 按依赖顺序排列（users 先于其他表）
    const orderedTables = [
      'users', 'listings', 'matches', 'messages', 'notifications',
      'prices', 'price_history', 'deal_intents', 'enterprise_samples',
      'evaluations', 'reports', 'audit_logs', 'upload_images',
      'vision_records', 'sms_codes', 'refresh_tokens', 'login_attempts',
    ];

    const tablesToMigrate = orderedTables.filter(t => tables.includes(t));

    await mysqlConn.execute('SET FOREIGN_KEY_CHECKS = 0');

    let totalRows = 0;
    for (const tableName of tablesToMigrate) {
      const rows = sqliteDb.prepare(`SELECT * FROM "${tableName}"`).all();
      if (rows.length === 0) {
        console.log(`  - ${tableName}: 0 行（跳过）`);
        continue;
      }

      const columns = getTableColumns(sqliteDb, tableName).map(c => c.name);
      const placeholders = columns.map(() => '?').join(', ');
      const insertSQL = `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${placeholders})`;

      // 分批插入（每批 500 行）
      const batchSize = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        for (const row of batch) {
          try {
            const values = columns.map(col => {
              let val = row[col];
              // SQLite 的 datetime 格式兼容
              if (val === null || val === undefined) return null;
              if (typeof val === 'string') {
                // 移除 SQLite 特有的引号转义
                val = val.replace(/''/g, "'");
              }
              return val;
            });
            await mysqlConn.execute(insertSQL, values);
            inserted++;
          } catch (err) {
            console.error(`  ✗ ${tableName} 行 ${i}: ${err.message}`);
          }
        }
      }

      totalRows += inserted;
      console.log(`  ✓ ${tableName}: ${inserted} 行`);
    }

    await mysqlConn.execute('SET FOREIGN_KEY_CHECKS = 1');
    console.log(`\n  总计迁移: ${totalRows} 行`);
  }

  // 5. 创建索引
  if (!DATA_ONLY) {
    console.log('[5/5] 创建索引...');
    const tables = getSQLiteTables(sqliteDb);
    const tableSet = new Set(tables);

    // 常用索引
    const indexMap = {
      'listings': [
        'listings_type_status', 'listings_material', 'listings_user',
        'listings_review', 'listings_created', 'listings_status',
        'listings_pole', 'listings_transaction',
      ],
      'matches': ['matches_supply', 'matches_demand', 'matches_score'],
      'messages': [
        'messages_conv', 'messages_sender', 'messages_receiver',
        'messages_conversation',
      ],
      'notifications': ['notifications_user'],
      'prices': [],
      'price_history': [
        'price_hist_category', 'price_hist_material', 'price_hist_region',
        'price_hist_date',
      ],
      'deal_intents': [
        'intents_initiator', 'intents_counterparty', 'intents_match',
        'intents_status',
      ],
      'enterprise_samples': ['samples_user', 'samples_category'],
      'evaluations': ['evals_target', 'evals_reviewer'],
      'reports': ['reports_status', 'reports_target'],
      'audit_logs': ['audit_logs_admin', 'audit_logs_action', 'audit_logs_created'],
      'users': ['users_status', 'users_phone', 'users_dual_roles'],
      'sms_codes': ['sms_phone', 'sms_expires'],
      'refresh_tokens': ['refresh_user', 'refresh_token', 'refresh_family', 'refresh_expires'],
      'login_attempts': ['attempts_id_type'],
      'upload_images': ['images_ref'],
      'messages': ['messages_unread'],
      'deal_intents_status': ['deal_intents_status'],
      'deal_intents_initiator': ['deal_intents_initiator'],
    };

    // 定义各索引的列
    const indexColumns = {
      'listings_type_status':    '(`type`, `status`)',
      'listings_material':       '(`material`)',
      'listings_user':           '(`user_id`)',
      'listings_review':         '(`review_status`)',
      'listings_created':        '(`created_at`)',
      'listings_status':         '(`status`)',
      'listings_pole':           '(`pole`)',
      'listings_transaction':    '(`transaction_status`)',
      'matches_supply':          '(`supply_id`)',
      'matches_demand':          '(`demand_id`)',
      'matches_score':           '(`score`)',
      'messages_conv':           '(`conversation_id`)',
      'messages_sender':         '(`sender_id`)',
      'messages_receiver':       '(`receiver_id`)',
      'messages_conversation':   '(`conversation_id`)',
      'messages_unread':         '(`receiver_id`, `is_read`)',
      'notifications_user':      '(`user_id`, `is_read`)',
      'price_hist_category':     '(`category`, `recorded_date`)',
      'price_hist_material':     '(`material`, `recorded_date`)',
      'price_hist_region':       '(`region`, `recorded_date`)',
      'price_hist_date':         '(`recorded_date`)',
      'intents_initiator':       '(`initiator_id`)',
      'intents_counterparty':    '(`counterparty_id`)',
      'intents_match':           '(`match_id`)',
      'intents_status':          '(`status`)',
      'samples_user':            '(`user_id`)',
      'samples_category':        '(`category`)',
      'evals_target':            '(`target_user_id`)',
      'evals_reviewer':          '(`reviewer_id`)',
      'reports_status':          '(`status`)',
      'reports_target':          '(`target_type`, `target_id`)',
      'audit_logs_admin':        '(`admin_id`)',
      'audit_logs_action':       '(`action`)',
      'audit_logs_created':      '(`created_at`)',
      'users_status':            '(`status`)',
      'users_phone':             '(`phone`)',
      'users_dual_roles':        '(`dual_roles`(255))',
      'sms_phone':               '(`phone`, `purpose`, `used`)',
      'sms_expires':             '(`expires_at`)',
      'refresh_user':            '(`user_id`, `revoked`)',
      'refresh_token':           '(`token`)',
      'refresh_family':          '(`family`)',
      'refresh_expires':         '(`expires_at`)',
      'attempts_id_type':        '(`identifier`, `attempt_type`, `created_at`)',
      'images_ref':              '(`reference_type`, `reference_id`)',
      'deal_intents_status':     '(`status`)',
      'deal_intents_initiator':  '(`initiator_id`)',
      'deal_intents_counterparty': '(`counterparty_id`)',
    };

    let idxCount = 0;
    for (const [tableName, idxList] of Object.entries(indexMap)) {
      if (!tableSet.has(tableName)) continue;
      for (const idxName of idxList) {
        const cols = indexColumns[idxName];
        if (!cols) continue;
        const sql = `CREATE INDEX IF NOT EXISTS idx_${idxName} ON \`${tableName}\` ${cols}`;
        try {
          await mysqlConn.execute(sql);
          idxCount++;
        } catch (err) {
          console.error(`  ✗ 索引 idx_${idxName}: ${err.message}`);
        }
      }
    }
    console.log(`  ✓ 创建 ${idxCount} 个索引`);
  }

  // 6. 重置自增计数器（确保后续 INSERT 不冲突）
  if (!DATA_ONLY) {
    const tables = getSQLiteTables(sqliteDb);
    for (const tableName of tables) {
      try {
        const maxId = sqliteDb.prepare(`SELECT MAX(id) as max_id FROM "${tableName}"`).get();
        if (maxId && maxId.max_id) {
          await mysqlConn.execute(`ALTER TABLE \`${tableName}\` AUTO_INCREMENT = ${maxId.max_id + 1}`);
        }
      } catch (e) { /* 忽略 */ }
    }
  }

  // 完成
  await mysqlConn.end();
  sqliteDb.close();

  console.log('\n========================================');
  console.log(' ✅ 迁移完成！');
  console.log('========================================');
  console.log('\n下一步:');
  console.log('  1. 设置 DB_TYPE=mysql 环境变量');
  console.log('  2. 在服务端设置 MYSQL_HOST/PORT/USER/PASSWORD/DATABASE');
  console.log('  3. 运行 awaitify-routes.js 给路由文件批量加 async/await');
  console.log('  4. 重启服务: node server.js');
}

main().catch(err => {
  console.error('\n❌ 迁移失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
