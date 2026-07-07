/**
 * P0-2: 全网多平台匹配 — 采集管理器
 *
 * 统一管理所有外部站点采集器，提供：
 * - 定时采集调度（默认每30分钟）
 * - 手动触发采集
 * - 外部数据入库（external_listings 表）
 * - 同步到主匹配池
 * - 采集状态与统计查询
 */

const db = require('../db');
const path = require('path');
const fs = require('fs');

// ---- 导入各站点采集器 --------------------------------------------------------
const scrapers = [];
const scraperDir = __dirname;

// 自动发现并加载所有采集器
function loadScrapers() {
  const files = fs.readdirSync(scraperDir).filter(f =>
    f.endsWith('.js') && f !== 'base.js' && f !== 'manager.js' && f !== 'index.js'
  );

  for (const file of files) {
    try {
      const ScraperClass = require(path.join(scraperDir, file));
      const instance = new ScraperClass();
      scrapers.push(instance);
      console.log(`[ScraperManager] Loaded: ${instance.name}`);
    } catch (e) {
      console.error(`[ScraperManager] Failed to load ${file}:`, e.message);
    }
  }

  console.log(`[ScraperManager] ${scrapers.length} scrapers loaded`);
}

// ---- 外部供需数据表 ----------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS external_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    source_url TEXT DEFAULT '',
    external_id TEXT DEFAULT '',
    type TEXT NOT NULL,
    material TEXT NOT NULL,
    form TEXT DEFAULT '',
    quantity REAL DEFAULT 0,
    price REAL DEFAULT 0,
    location TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    published_at TEXT DEFAULT '',
    contact_info TEXT DEFAULT '',
    extra TEXT DEFAULT '{}',
    is_active INTEGER DEFAULT 1,
    first_seen TEXT DEFAULT (datetime('now')),
    last_seen TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    UNIQUE(source, external_id)
  );

  CREATE INDEX IF NOT EXISTS idx_ext_listings_source ON external_listings(source);
  CREATE INDEX IF NOT EXISTS idx_ext_listings_type ON external_listings(type);
  CREATE INDEX IF NOT EXISTS idx_ext_listings_material ON external_listings(material);
  CREATE INDEX IF NOT EXISTS idx_ext_listings_active ON external_listings(is_active);
`);

// ---- 采集调度 ----------------------------------------------------------------

let scrapeInterval = null;
let isScraping = false;

// 采集统计
const stats = {
  lastRun: null,
  totalItems: 0,
  newItems: 0,
  errors: [],
  duration: 0,
};

/**
 * 执行一次全量采集
 */
async function runAllScrapers() {
  if (isScraping) {
    console.log('[ScraperManager] Already scraping, skipping');
    return stats;
  }

  isScraping = true;
  const startTime = Date.now();
  stats.errors = [];
  stats.newItems = 0;
  stats.totalItems = 0;

  console.log(`[ScraperManager] Starting full scrape at ${new Date().toISOString()}`);

  // 使用事务批量插入
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO external_listings
    (source, source_url, external_id, type, material, form, quantity, price, location,
     notes, published_at, contact_info, extra, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);

  const updateStmt = db.prepare(`
    UPDATE external_listings SET last_seen = datetime('now'), is_active = 1
    WHERE source = ? AND external_id = ?
  `);

  for (const scraper of scrapers) {
    try {
      const items = await scraper.scrape();
      stats.totalItems += items.length;

      // 批量入库
      const insertBatch = db.transaction((batch) => {
        let count = 0;
        for (const item of batch) {
          const externalId = item.externalId || `${item.material}-${item.location}-${item.price}-${item.type}`;
          const result = insertStmt.run(
            item.source, item.sourceUrl || '', externalId,
            item.type, item.material, item.form || '',
            item.quantity || 0, item.price || 0, item.location || '',
            item.notes || '', item.publishedAt || '',
            item.contactInfo || '', JSON.stringify(item.extra || {}),
          );
          if (result.changes > 0) count++;
          else updateStmt.run(item.source, externalId);
        }
        return count;
      });

      const newCount = insertBatch(items);
      stats.newItems += newCount;

      console.log(`[ScraperManager] ${scraper.name}: ${items.length} items (${newCount} new)`);
    } catch (err) {
      console.error(`[ScraperManager] ${scraper.name} failed:`, err.message);
      stats.errors.push({ scraper: scraper.name, error: err.message });
    }
  }

  // 清理30天前的过期数据
  try {
    const cleaned = db.prepare(
      "UPDATE external_listings SET is_active = 0 WHERE last_seen < datetime('now', '-30 days')"
    ).run();
    if (cleaned.changes > 0) {
      console.log(`[ScraperManager] Cleaned ${cleaned.changes} expired listings`);
    }
  } catch (e) { console.error('[ScraperManager] Cleanup error:', e.message); }

  stats.lastRun = new Date().toISOString();
  stats.duration = Date.now() - startTime;
  isScraping = false;

  console.log(`[ScraperManager] Scrape complete: ${stats.totalItems} items, ${stats.newItems} new, ${Math.round(stats.duration / 1000)}s`);
  return stats;
}

/**
 * 启动定时采集
 * @param {number} intervalMinutes - 采集间隔（分钟），默认30
 */
function startScheduler(intervalMinutes = 30) {
  if (scrapeInterval) {
    clearInterval(scrapeInterval);
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[ScraperManager] Scheduler started: every ${intervalMinutes} minutes`);

  // 首次立即执行
  runAllScrapers();

  scrapeInterval = setInterval(() => {
    runAllScrapers();
  }, intervalMs);
}

/**
 * 停止定时采集
 */
function stopScheduler() {
  if (scrapeInterval) {
    clearInterval(scrapeInterval);
    scrapeInterval = null;
    console.log('[ScraperManager] Scheduler stopped');
  }
}

/**
 * 获取采集状态
 */
function getStatus() {
  return {
    ...stats,
    isScraping,
    scraperCount: scrapers.length,
    scraperNames: scrapers.map(s => ({ name: s.name, enabled: s.enabled })),
  };
}

/**
 * 查询外部供需列表
 */
function getExternalListings(filters = {}) {
  const { type, material, source, page = 1, limit = 50 } = filters;
  const offset = (page - 1) * limit;

  let where = 'WHERE is_active = 1';
  const params = [];

  if (type)    { where += ' AND type = ?'; params.push(type); }
  if (material) { where += ' AND material LIKE ?'; params.push(`%${material}%`); }
  if (source)  { where += ' AND source = ?'; params.push(source); }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM external_listings ${where}`).get(...params);
  const items = db.prepare(
    `SELECT * FROM external_listings ${where} ORDER BY published_at DESC, first_seen DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset);

  return {
    items: items.map(i => ({ ...i, extra: safeJSON(i.extra) })),
    total: total.cnt,
    page, limit,
  };
}

function safeJSON(str) {
  try { return JSON.parse(str); } catch (e) { return str; }
}

// ---- 初始化 ------------------------------------------------------------------
loadScrapers();

module.exports = {
  runAllScrapers,
  startScheduler,
  stopScheduler,
  getStatus,
  getExternalListings,
  get stats() { return stats; },
  get scrapers() { return scrapers; },
};
