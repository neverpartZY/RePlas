const db = require('better-sqlite3')(require('path').join(__dirname, '..', 'data', 'zaisutong.db'));

console.log('=== PE拆分样本 ===');
const peSamples = db.prepare(
  'SELECT material, category, region FROM price_history WHERE recorded_date=? AND category IN (?,?,?,?) ORDER BY category, material'
).all('2026-07-20', 'HDPE', 'LDPE', 'PE', 'EVA');
peSamples.forEach(r => console.log(`  [${r.category.padEnd(5)}] [${r.region.padEnd(4)}] ${r.material}`));

console.log('\n=== 区域分布 (今日) ===');
const regions = db.prepare(
  "SELECT region, COUNT(*) as cnt FROM price_history WHERE recorded_date='2026-07-20' GROUP BY region ORDER BY cnt DESC"
).all();
regions.forEach(r => console.log(`  ${r.region.padEnd(4)} ${r.cnt} 条`));

console.log('\n=== 文安数据 (应归入华北) ===');
const wenan = db.prepare(
  "SELECT material, region FROM price_history WHERE material LIKE '%文安%'"
).all();
wenan.forEach(r => console.log(`  [${r.region}] ${r.material}`));

console.log('\n=== 今日品类汇总 ===');
const cats = db.prepare(
  "SELECT category, COUNT(*) as cnt FROM price_history WHERE recorded_date='2026-07-20' GROUP BY category ORDER BY cnt DESC"
).all();
cats.forEach(r => console.log(`  ${r.category.padEnd(6)} ${r.cnt} 条`));

// 文安验证
console.log('\n=== 文安数据验证 (应归入华北) ===');
const wenanCheck = db.prepare(
  "SELECT material, region FROM price_history WHERE material=? AND recorded_date=?"
).get('ABS-日用品类-米黄-再生颗粒', '2026-07-20');
if (wenanCheck) {
  console.log(`  ABS-日用品类-米黄-再生颗粒 → region: ${wenanCheck.region} ${wenanCheck.region === '华北' ? '✅' : '❌'}`)
} else {
  console.log('  NOT FOUND — 可能被去重跳过');
}

// 东北验证
console.log('\n=== 东北数据验证 ===');
const ne = db.prepare(
  "SELECT material, region FROM price_history WHERE region=? AND recorded_date=?"
).all('东北', '2026-07-20');
ne.forEach(r => console.log(`  [${r.region}] ${r.material}`));

console.log('\n总行数:', db.prepare('SELECT COUNT(*) as n FROM price_history').get().n);
db.close();
