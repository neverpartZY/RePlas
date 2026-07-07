const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// The workspace uses a FUSE filesystem (virtiofs) which does not support
// SQLite file locking. Store the database on the local overlayfs instead.
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'zaisutong.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    location TEXT DEFAULT '',
    password_hash TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    company TEXT DEFAULT '',
    avatar_url TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_type TEXT DEFAULT 'text',
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (sender_id) REFERENCES users(id),
    FOREIGN KEY (receiver_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    link_type TEXT DEFAULT '',
    link_id INTEGER,
    is_read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    waste_or_recycled TEXT NOT NULL,
    material TEXT NOT NULL,
    form TEXT DEFAULT '',
    quantity REAL DEFAULT 0,
    price REAL DEFAULT 0,
    location TEXT DEFAULT '',
    specs TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supply_id INTEGER NOT NULL,
    demand_id INTEGER NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    dimension_scores TEXT DEFAULT '{}',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (supply_id) REFERENCES listings(id),
    FOREIGN KEY (demand_id) REFERENCES listings(id)
  );

  CREATE TABLE IF NOT EXISTS prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    material TEXT NOT NULL,
    price_avg REAL NOT NULL,
    price_low REAL,
    price_high REAL,
    trend TEXT DEFAULT 'flat',
    change_pct REAL DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
  );
`);

// Fix 13: add indexes for common query paths
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_listings_type_status ON listings(type, status);
  CREATE INDEX IF NOT EXISTS idx_listings_material ON listings(material);
  CREATE INDEX IF NOT EXISTS idx_listings_user ON listings(user_id);
  CREATE INDEX IF NOT EXISTS idx_matches_supply ON matches(supply_id);
  CREATE INDEX IF NOT EXISTS idx_matches_demand ON matches(demand_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
  CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
`);

// Migration: add price_negotiable column if it doesn't exist
try {
  db.exec('ALTER TABLE listings ADD COLUMN price_negotiable INTEGER DEFAULT 0');
  console.log('[DB] Added price_negotiable column');
} catch (e) { /* column already exists */ }

// Migration: add password_hash, phone, company, avatar_url to users
const userCols = ['password_hash', 'phone', 'company', 'avatar_url'];
for (const col of userCols) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT DEFAULT ''`);
    console.log(`[DB] Added users.${col} column`);
  } catch (e) { /* column already exists */ }
}

// Migration: add openid, unionid to users (WeChat miniapp login)
const wxCols = ['openid', 'unionid'];
for (const col of wxCols) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT DEFAULT ''`);
    console.log(`[DB] Added users.${col} column`);
  } catch (e) { /* column already exists */ }
}

// Migration: add email to users
try {
  db.exec("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''");
  console.log('[DB] Added users.email column');
} catch (e) { /* column already exists */ }

// Migration: add admin & moderation columns to users
const adminUserCols = [
  { name: 'is_admin', def: 'INTEGER DEFAULT 0' },
  { name: 'status', def: "TEXT DEFAULT 'active'" },   // active | suspended
];
for (const col of adminUserCols) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.def}`);
    console.log(`[DB] Added users.${col.name} column`);
  } catch (e) { /* column already exists */ }
}

// Migration: add review columns to listings
const reviewCols = [
  { name: 'review_status', def: "TEXT DEFAULT 'auto'" },  // auto | pending | approved | rejected
  { name: 'reviewed_by', def: 'INTEGER' },
  { name: 'reviewed_at', def: 'TEXT' },
  { name: 'review_note', def: "TEXT DEFAULT ''" },
];
for (const col of reviewCols) {
  try {
    db.exec(`ALTER TABLE listings ADD COLUMN ${col.name} ${col.def}`);
    console.log(`[DB] Added listings.${col.name} column`);
  } catch (e) { /* column already exists */ }
}

// ======================== v6.0 两极框架 + 品质规格 迁移 ========================

// listings: 两极分类 (first_pole / second_pole / cross_pole)
const poleCols = [
  { name: 'pole',           def: "TEXT DEFAULT ''" },       // first_pole | second_pole | cross_pole
  { name: 'grade',          def: "TEXT DEFAULT ''" },       // 食品级 | 工业级 | 普通级
  { name: 'quality_specs',  def: "TEXT DEFAULT '{}'" },     // JSON: {color, melt_index, purity, impurity_limit, certifications, application}
  { name: 'images',         def: "TEXT DEFAULT '[]'" },     // JSON: ["url1","url2"]
  { name: 'monthly_available', def: 'REAL DEFAULT 0' },    // 月供应量/月需求量（吨）
  { name: 'delivery',       def: "TEXT DEFAULT ''" },       // 自提 | 送货 | 均可
  { name: 'purpose',        def: "TEXT DEFAULT ''" },       // 用途：注塑/吹塑/挤出/拉丝/改性/化纤/清洗造粒
  { name: 'source_region',  def: "TEXT DEFAULT ''" },       // 货源/需求区域偏好
  { name: 'price_range_min', def: 'REAL DEFAULT 0' },      // 价格区间最低
  { name: 'price_range_max', def: 'REAL DEFAULT 0' },      // 价格区间最高
  { name: 'transaction_status', def: "TEXT DEFAULT 'active'" }, // active→contacted→dealing→completed→closed
];
for (const col of poleCols) {
  try {
    db.exec(`ALTER TABLE listings ADD COLUMN ${col.name} ${col.def}`);
    console.log(`[DB] Added listings.${col.name} column`);
  } catch (e) { /* column already exists */ }
}

// users: 双身份 + 企业名片字段
const enterpriseUserCols = [
  { name: 'dual_roles',       def: "TEXT DEFAULT '[]'" },   // JSON: ["打包站","再生工厂"]
  { name: 'capacity',         def: "TEXT DEFAULT ''" },     // 产能描述 e.g. "月产100吨"
  { name: 'process_type',     def: "TEXT DEFAULT ''" },     // 工艺：清洗/造粒/改性/破碎
  { name: 'certifications',   def: "TEXT DEFAULT '[]'" },   // JSON: ["FDA","EFSA","GRS","ISO9001"]
  { name: 'business_scope',   def: "TEXT DEFAULT ''" },     // 主营品类
  { name: 'established_year', def: 'INTEGER DEFAULT 0' },   // 成立年份
  { name: 'employee_count',   def: 'INTEGER DEFAULT 0' },   // 员工数
  { name: 'wechat_id',        def: "TEXT DEFAULT ''" },     // 微信号
  { name: 'longitude',        def: 'REAL DEFAULT 0' },      // 经度（用于距离计算）
  { name: 'latitude',         def: 'REAL DEFAULT 0' },      // 纬度
];
for (const col of enterpriseUserCols) {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${col.name} ${col.def}`);
    console.log(`[DB] Added users.${col.name} column`);
  } catch (e) { /* column already exists */ }
}

// 企业名片：产品样本墙
db.exec(`
  CREATE TABLE IF NOT EXISTS enterprise_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,                  -- 产品名称
    category TEXT NOT NULL,               -- 品类: PET/PP/PE...
    form TEXT DEFAULT '',                 -- 形态: 瓶砖/颗粒/破碎料
    spec_image_urls TEXT DEFAULT '[]',    -- JSON: 产品图片URLs
    spec_card TEXT DEFAULT '{}',          -- JSON: 指标卡 {color,melt_index,purity,...}
    price REAL DEFAULT 0,                 -- 参考价格
    description TEXT DEFAULT '',          -- 产品描述
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_samples_user ON enterprise_samples(user_id);
  CREATE INDEX IF NOT EXISTS idx_samples_category ON enterprise_samples(category);
`);

// 交易评价
db.exec(`
  CREATE TABLE IF NOT EXISTS evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reviewer_id INTEGER NOT NULL,         -- 评价人
    target_user_id INTEGER NOT NULL,      -- 被评价人
    listing_id INTEGER,                   -- 关联供需
    match_id INTEGER,                     -- 关联匹配
    rating_quality INTEGER DEFAULT 5,     -- 品质评价 (1-5)
    rating_integrity INTEGER DEFAULT 5,   -- 诚信评价 (1-5)
    rating_speed INTEGER DEFAULT 5,       -- 响应速度 (1-5)
    comment TEXT DEFAULT '',              -- 评价内容
    tags TEXT DEFAULT '[]',               -- JSON: ["品质稳定","发货快","服务好"]
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (reviewer_id) REFERENCES users(id),
    FOREIGN KEY (target_user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_evals_target ON evaluations(target_user_id);
  CREATE INDEX IF NOT EXISTS idx_evals_reviewer ON evaluations(reviewer_id);
`);

// 价格历史（时序数据）
db.exec(`
  CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,               -- 品类: PET/PP/PE...
    material TEXT NOT NULL,               -- 具体品类
    form TEXT DEFAULT '',                 -- 形态
    price_avg REAL NOT NULL,
    price_low REAL,
    price_high REAL,
    region TEXT DEFAULT '',               -- 区域
    source TEXT DEFAULT 'manual',         -- manual | platform | external
    recorded_date TEXT NOT NULL,          -- 记录日期 YYYY-MM-DD
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_price_hist_category ON price_history(category, recorded_date);
  CREATE INDEX IF NOT EXISTS idx_price_hist_material ON price_history(material, recorded_date);
  CREATE INDEX IF NOT EXISTS idx_price_hist_region ON price_history(region, recorded_date);
`);

// 撮合意向追踪
db.exec(`
  CREATE TABLE IF NOT EXISTS deal_intents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER,                     -- 关联匹配
    listing_id INTEGER NOT NULL,          -- 关联供需
    user_id INTEGER NOT NULL,             -- 操作人
    intent_type TEXT NOT NULL,            -- interested | negotiating | deal | completed | cancelled
    note TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (listing_id) REFERENCES listings(id)
  );

  CREATE INDEX IF NOT EXISTS idx_intents_user ON deal_intents(user_id);
  CREATE INDEX IF NOT EXISTS idx_intents_match ON deal_intents(match_id);
`);

// 迁移 deal_intents: intent_type → status (向前兼容旧 schema)
const dealCols = db.prepare("PRAGMA table_info(deal_intents)").all().map(c => c.name);
if (!dealCols.includes('status')) {
  db.exec("ALTER TABLE deal_intents ADD COLUMN status TEXT DEFAULT 'intent' CHECK(status IN ('intent','negotiating','deal','completed','cancelled'))");
  // 从 intent_type 迁移已有数据
  if (dealCols.includes('intent_type')) {
    db.exec("UPDATE deal_intents SET status = intent_type WHERE status = 'intent' AND intent_type IS NOT NULL AND intent_type != 'intent'");
  }
  console.log('[DB] Migrated deal_intents: added status column');
}

// images 独立表（便于审核和CDN管理）
db.exec(`
  CREATE TABLE IF NOT EXISTS upload_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    original_name TEXT DEFAULT '',
    mime_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    reference_type TEXT DEFAULT '',       -- listing | sample | avatar
    reference_id INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',         -- active | deleted
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_images_ref ON upload_images(reference_type, reference_id);
`);

// New tables: reports, audit_logs
db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_id INTEGER NOT NULL,
    target_type TEXT NOT NULL,         -- 'listing' | 'user' | 'message'
    target_id INTEGER NOT NULL,
    reason TEXT NOT NULL,              -- 举报原因分类
    detail TEXT DEFAULT '',            -- 详细描述
    status TEXT DEFAULT 'pending',     -- pending | resolved | dismissed
    handled_by INTEGER,
    handle_note TEXT DEFAULT '',
    handled_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (reporter_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    action TEXT NOT NULL,              -- 'review_listing' | 'ban_user' | 'unban_user' | 'set_admin' | 'handle_report' | 'delete_listing' | 'export_data'
    target_type TEXT DEFAULT '',       -- 'listing' | 'user' | 'report'
    target_id INTEGER,
    detail TEXT DEFAULT '',            -- JSON string with action details
    ip TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (admin_id) REFERENCES users(id)
  );
`);

// Indexes for new tables
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_admin ON audit_logs(admin_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
  CREATE INDEX IF NOT EXISTS idx_listings_review ON listings(review_status);
  CREATE INDEX IF NOT EXISTS idx_listings_created ON listings(created_at);
  CREATE INDEX IF NOT EXISTS idx_listings_user ON listings(user_id);
  CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
  CREATE INDEX IF NOT EXISTS idx_deal_intents_status ON deal_intents(status);
  CREATE INDEX IF NOT EXISTS idx_deal_intents_initiator ON deal_intents(initiator_id);
  CREATE INDEX IF NOT EXISTS idx_deal_intents_counterparty ON deal_intents(counterparty_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(recorded_date);
`);

// Seed admin user if not exists
const adminExists = db.prepare('SELECT id FROM users WHERE is_admin = 1').get();
if (!adminExists) {
  const bcrypt = require('bcryptjs');
  const { randomBytes } = require('crypto');
  const adminPassword = process.env.ADMIN_INIT_PASSWORD || randomBytes(12).toString('hex');
  const hash = bcrypt.hashSync(adminPassword, 10);
  db.prepare(`INSERT INTO users (name, role, location, password_hash, phone, company, is_admin, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    'admin', '管理员', '深圳', hash, '', '再塑通平台', 1, 'active'
  );
  console.log(`[DB] Seeded admin user. Password: ${adminPassword}`);
  console.log('[DB] ⚠️  请立即记录密码并设置 ADMIN_INIT_PASSWORD 环境变量');
}

// Seed prices if empty
const priceCount = db.prepare('SELECT COUNT(*) AS cnt FROM prices').get();
if (priceCount.cnt === 0) {
  const insertPrice = db.prepare(
    'INSERT INTO prices (category, material, price_avg, price_low, price_high, trend, change_pct) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const seedPrices = [
    // 第一极 - 破碎料/打包料
    ['PET',    'PET三色瓶砖',          5800,  5600,  6200,  'up',    2.7],
    ['PET',    'PET透明瓶片',          7200,  6800,  7600,  'up',    3.1],
    ['PET',    'PET蓝白瓶片',          6500,  6200,  6800,  'flat',  0.5],
    ['PP',     'PP白色粉碎料',         6200,  5800,  6500,  'down',  -1.2],
    ['PP',     'PP花色破碎料',         4800,  4500,  5500,  'flat',  0],
    ['HDPE',   'HDPE大蓝桶破碎',       7500,  7000,  8000,  'up',    0.8],
    ['HDPE',   'HDPE小中空破碎',       5600,  5300,  5800,  'flat',  0],
    ['ABS',    'ABS灰白破碎料',        8900,  8200,  9600,  'up',    3.1],
    ['PC',     'PC车灯破碎',           9200,  8500,  10000, 'flat',  0],
    ['PA',     'PA6扎带破碎',          8800,  8000,  9500,  'up',    2.0],
    ['LDPE',   'LDPE进口电缆皮',       7600,  7200,  8000,  'flat',  0],
    // 第二极 - 再生颗粒
    ['PP',     'PP注塑级再生颗粒',     6800,  6500,  7200,  'flat',  0],
    ['PP',     'PP高抗冲再生颗粒',     12000, 10000, 15000, 'up',    1.5],
    ['HDPE',   'HDPE管道级颗粒',       8200,  7800,  8600,  'up',    0.8],
    ['LDPE',   'LDPE大棚膜颗粒',       6300,  5800,  6800,  'down',  -2.1],
    ['LDPE',   'LDPE透明膜颗粒',       9100,  8500,  9600,  'flat',  0],
    ['ABS',    'ABS本色颗粒',          11000, 9500,  12500, 'up',    1.8],
    ['PC',     'PC高光中粘颗粒',       14500, 12500, 16500, 'up',    2.2],
    ['PA6',    'PA6增强颗粒',          10000, 8000,  12000, 'flat',  0],
    ['PA66',   'PA66高质颗粒',         12000, 10000, 14000, 'up',    1.0],
  ];

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertPrice.run(...item);
    }
  });

  insertMany(seedPrices);
  console.log(`[DB] Seeded ${seedPrices.length} price records`);
}

// Seed price_history if empty (for trend charts)
const priceHistoryCount = db.prepare('SELECT COUNT(*) AS cnt FROM price_history').get();
if (priceHistoryCount.cnt === 0) {
  const insertHistory = db.prepare(
    'INSERT INTO price_history (category, material, form, price_avg, price_low, price_high, region, source, recorded_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const seedHistory = [];
  const basePrices = { 'PET三色瓶砖': 5800, 'PP白色粉碎料': 6200, 'PP注塑级再生颗粒': 6800, 'HDPE小中空破碎': 5600, 'ABS灰白破碎料': 8900, 'PC车灯破碎': 9200 };
  const categories = { 'PET三色瓶砖': ['PET', '破碎料'], 'PP白色粉碎料': ['PP', '破碎料'], 'PP注塑级再生颗粒': ['PP', '颗粒'], 'HDPE小中空破碎': ['HDPE', '破碎料'], 'ABS灰白破碎料': ['ABS', '破碎料'], 'PC车灯破碎': ['PC', '破碎料'] };

  // Generate 90 days of history for each
  for (const [material, base] of Object.entries(basePrices)) {
    for (let day = 90; day >= 0; day--) {
      const date = new Date();
      date.setDate(date.getDate() - day);
      const ds = date.toISOString().slice(0, 10);
      const noise = (Math.random() - 0.45) * 0.08; // slight upward bias
      const avg = Math.round(base * (1 + noise));
      seedHistory.push([categories[material][0], material, categories[material][1], avg, avg - Math.round(avg * 0.05), avg + Math.round(avg * 0.05), '全国', 'manual', ds]);
    }
  }

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertHistory.run(...item);
    }
  });
  insertMany(seedHistory);
  console.log(`[DB] Seeded ${seedHistory.length} price history records (90 days x ${Object.keys(basePrices).length} materials)`);
}

// v6.0 新增索引（这些列通过 ALTER TABLE 迁移添加，索引必须在迁移之后创建）
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_listings_pole ON listings(pole);
  CREATE INDEX IF NOT EXISTS idx_listings_transaction ON listings(transaction_status);
  CREATE INDEX IF NOT EXISTS idx_matches_score ON matches(score);
  CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(receiver_id, is_read);
  CREATE INDEX IF NOT EXISTS idx_users_dual_roles ON users(dual_roles);
`);

module.exports = db;
