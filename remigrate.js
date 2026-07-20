/**
 * 从 ECS SQLite 重新迁移数据到云托管
 * 运行: node remigrate.js
 */
const Database = require('better-sqlite3');
const http = require('http');

const CLOUD_HOST = 'replas1-280446-9-1452497195.sh.run.tcloudbase.com';
const CLOUD_PORT = 443; // 云托管走 HTTPS，但用 http 模块发也行（需要 nginx 支持 HTTP）
const MIGRATION_TOKEN = 'replas_migrate_2026_5a7b9c';
const DB_PATH = '/opt/replas-match/backend/data/zaisutong.db';

// 尝试多种路径
let db;
const paths = [DB_PATH, '/root/rematch-miniapp/backend/data/zaisutong.db'];
for (const p of paths) {
  try {
    db = new Database(p, { readonly: true });
    console.log('✓ 已连接数据库:', p);
    break;
  } catch (e) {}
}

if (!db) {
  console.error('✗ 找不到数据库文件！');
  process.exit(1);
}

// 获取所有表
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
const tableNames = tables.map(t => t.name);
console.log(`发现 ${tableNames.length} 个表: ${tableNames.join(', ')}`);

// 读取所有数据
const data = {};
for (const name of tableNames) {
  try {
    const rows = db.prepare(`SELECT * FROM "${name}"`).all();
    data[name] = rows;
    console.log(`  ${name}: ${rows.length} 行`);
  } catch (e) {
    console.error(`  ${name}: 错误 - ${e.message}`);
  }
}

db.close();

// 发送到云托管
const payload = JSON.stringify({ data, clearFirst: true });
console.log(`\n发送数据到云托管 (${Buffer.byteLength(payload)} bytes)...`);

const https = require('https');
const options = {
  hostname: CLOUD_HOST,
  port: 443,
  path: '/api/migrate/import',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${MIGRATION_TOKEN}`,
    'Content-Length': Buffer.byteLength(payload)
  },
  timeout: 120000,
  rejectUnauthorized: false
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log(`状态: ${res.statusCode}`);
    try {
      const result = JSON.parse(body);
      if (result.success) {
        console.log('✓ 迁移成功！');
        if (result.results) {
          for (const [t, r] of Object.entries(result.results)) {
            console.log(`  ${t}: 导入 ${r.rows || r.imported || 0} 行`);
          }
        }
      } else {
        console.log('✗ 迁移失败:', result.error);
      }
    } catch (e) {
      console.log('原始响应:', body.substring(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.error('✗ 请求错误:', e.message);
});

req.write(payload);
req.end();
