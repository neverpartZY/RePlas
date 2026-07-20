/**
 * 爬虫CSV → price_history 导入脚本
 * 
 * 处理三个兼容性缺口：
 * 1. category自动提取，PE按子类拆 HDPE/LDPE
 * 2. region归一化（文安/东北/华北/京津冀等边缘case）
 * 3. source 设为 "external"
 * 
 * 用法: node scripts/import-price-csv.js data/price_import_20260720.csv
 */

const fs = require('fs');
const path = require('path');
const db = require('better-sqlite3')(path.join(__dirname, '..', 'data', 'zaisutong.db'));

// ============ 区域归一化（与 routes/pricing.js 完全一致 + 边缘case补充） ============
function normalizeRegion(location) {
  if (!location || location.trim() === '') return '全国';
  const loc = location.trim();

  // --- 边缘case补充（先于省级匹配） ---
  if (loc === '文安') return '华北';           // 河北廊坊下辖县
  if (loc === '东北') return '东北';           // 大区名
  if (loc === '华北') return '华北';           // 大区名
  if (loc === '华东') return '华东';
  if (loc === '华南') return '华南';
  if (loc === '华中') return '华中';
  if (loc === '西南') return '西南';
  if (loc === '西北') return '西北';
  if (loc === '全国') return '全国';
  if (loc === '京津冀') return '华北';          // 已含"河北"，但显式补充

  // --- 省级匹配（与 pricing.js 一致） ---
  if (loc.includes('北京') || loc.includes('天津') || loc.includes('河北') || loc.includes('山西') || loc.includes('内蒙古')) return '华北';
  if (loc.includes('上海') || loc.includes('江苏') || loc.includes('浙江') || loc.includes('山东') || loc.includes('安徽')) return '华东';
  if (loc.includes('广东') || loc.includes('福建') || loc.includes('广西') || loc.includes('海南')) return '华南';
  if (loc.includes('河南') || loc.includes('湖北') || loc.includes('湖南') || loc.includes('江西')) return '华中';
  if (loc.includes('四川') || loc.includes('重庆') || loc.includes('贵州') || loc.includes('云南') || loc.includes('西藏')) return '西南';
  if (loc.includes('辽宁') || loc.includes('吉林') || loc.includes('黑龙江')) return '东北';
  if (loc.includes('陕西') || loc.includes('甘肃') || loc.includes('宁夏') || loc.includes('青海') || loc.includes('新疆')) return '西北';

  return '全国';
}

// ============ 品类提取 + PE→HDPE/LDPE拆分 ============
function extractCategory(material) {
  if (!material) return null;
  const upper = material.toUpperCase();

  // 精准匹配：检查 material 的前缀部分
  const prefix = material.split('-')[0].toUpperCase();

  // PE 需拆分为 HDPE / LDPE / EVA
  if (prefix === 'PE') {
    // EVA 共聚物 → 独立品类
    if (material.includes('EVA')) return 'EVA';

    // 膜袋类 → LDPE (薄膜/袋子类再生PE以LDPE为主)
    if (material.includes('膜袋')) return 'LDPE';

    // 瓶壶类 → HDPE (中空吹塑以HDPE为主)
    if (material.includes('瓶壶')) return 'HDPE';

    // 管道类 → HDPE (管材以HDPE为主)
    if (material.includes('管道')) return 'HDPE';

    // 框桶类 → HDPE (注塑容器以HDPE为主)
    if (material.includes('框桶')) return 'HDPE';

    // 无明确子类 → 保留 PE（通用再生PE颗粒/破碎料）
    return 'PE';
  }

  // 标准品类映射（与 pricing.js normalizeCategory 一致）
  const map = {
    'PP': 'PP', 'PET': 'PET', 'ABS': 'ABS', 'PC': 'PC',
    'PS': 'PS', 'PA': 'PA', 'PA6': 'PA', 'PA66': 'PA',
    'PVC': 'PVC', 'EPS': 'EPS', 'EVA': 'EVA',
    'HDPE': 'HDPE', 'LDPE': 'LDPE', 'LLDPE': 'PE',
  };

  for (const [k, v] of Object.entries(map)) {
    if (upper.includes(k)) return v;
  }

  return null;
}

// ============ 主导入逻辑 ============
function importCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    console.error('CSV 文件为空或只有标题行');
    process.exit(1);
  }

  // 解析标题行
  const headers = lines[0].replace(/^\uFEFF/, '').split(',');  // 去掉BOM
  console.log('CSV headers:', headers.join(', '));

  // 逐字段索引
  const idx = {};
  headers.forEach((h, i) => { idx[h.trim()] = i; });

  // 统计
  let totalRows = 0;
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  const categoryStats = {};

  // 准备 INSERT 语句
  const checkDup = db.prepare(
    'SELECT id FROM price_history WHERE material = ? AND region = ? AND recorded_date = ? LIMIT 1'
  );
  const insertStmt = db.prepare(
    `INSERT INTO price_history (category, material, form, price_avg, price_low, price_high, region, source, recorded_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // 在事务中批量插入
  const doImport = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      totalRows++;
      const cols = parseCSVLine(lines[i]);
      if (cols.length < headers.length) {
        console.warn(`⚠ 第${i+1}行字段不足，跳过`);
        errors++;
        continue;
      }

      const material = (cols[idx.material] || '').trim();
      const form = (cols[idx.form] || '').trim();
      const priceAvg = parseFloat(cols[idx.price_avg]);
      const priceLow = parseFloat(cols[idx.price_low]);
      const priceHigh = parseFloat(cols[idx.price_high]);
      const rawRegion = (cols[idx.region] || '').trim();
      const source = 'external';  // 爬虫数据统一标记
      const recordedDate = (cols[idx.recorded_date] || '').trim();

      // --- 数据校验 ---
      if (!material || isNaN(priceAvg)) {
        console.warn(`⚠ 第${i+1}行关键字段缺失: material="${material}" price_avg="${cols[idx.price_avg]}"`);
        errors++;
        continue;
      }

      // --- 品类提取 ---
      const category = extractCategory(material);
      if (!category) {
        console.warn(`⚠ 第${i+1}行无法识别品类: "${material}"`);
        errors++;
        continue;
      }

      // --- 区域归一化 ---
      const region = normalizeRegion(rawRegion);

      // --- 去重（同物料+区域+日期） ---
      const existing = checkDup.get(material, region, recordedDate);
      if (existing) {
        skipped++;
        continue;
      }

      // --- 插入 ---
      insertStmt.run(category, material, form, priceAvg, priceLow, priceHigh, region, source, recordedDate);
      inserted++;

      // 统计
      categoryStats[category] = (categoryStats[category] || 0) + 1;
    }
  });

  try {
    doImport();
  } catch (e) {
    console.error('导入事务失败:', e.message);
    process.exit(1);
  }

  // ============ 输出报告 ============
  console.log('\n========================================');
  console.log('  导入完成');
  console.log('========================================');
  console.log(`  总行数:  ${totalRows}`);
  console.log(`  已插入:  ${inserted} ✅`);
  console.log(`  已跳过(重复): ${skipped}`);
  console.log(`  错误:    ${errors}`);
  console.log(`  当前表总行数: ${db.prepare('SELECT COUNT(*) as n FROM price_history').get().n}`);
  console.log('----------------------------------------');
  console.log('  品类分布:');
  Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).forEach(([cat, cnt]) => {
    console.log(`    ${cat.padEnd(6)} ${String(cnt).padStart(3)} 条`);
  });

  // PE 拆分验证
  console.log('----------------------------------------');
  console.log('  PE拆分详情:');
  ['PE', 'HDPE', 'LDPE', 'EVA'].forEach(cat => {
    const cnt = db.prepare(
      "SELECT COUNT(*) as n FROM price_history WHERE category = ? AND recorded_date = ?"
    ).get(cat, '2026-07-20');
    if (cnt) console.log(`    ${cat.padEnd(6)} ${String(cnt.n).padStart(3)} 条 (2026-07-20)`);
  });
  console.log('========================================');
}

// CSV 行解析（处理含逗号的字段，本数据简单无引号嵌套）
function parseCSVLine(line) {
  return line.split(',');
}

// 入口
const csvPath = process.argv[2];
if (!csvPath) {
  console.error('用法: node scripts/import-price-csv.js <csv文件路径>');
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error('文件不存在:', csvPath);
  process.exit(1);
}

console.log(`导入文件: ${csvPath}`);
console.log(`目标库:   data/zaisutong.db\n`);
importCSV(csvPath);
db.close();
