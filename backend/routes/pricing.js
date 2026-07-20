/**
 * P0-4: AI定价建议 & 合理性检测
 *
 * GET  /api/pricing/suggest   — 基于品类/形态/区域给出定价建议
 * POST /api/pricing/check     — 检测报价是否合理（偏离均价检测）
 * GET  /api/pricing/trends    — 品类价格趋势（7/14/30天）
 * GET  /api/pricing/comparison — 新料 vs 再生料价差
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

// ---- 品类-区域价格基准表（当 price_history 数据不足时的 fallback） -----------
const PRICE_BASELINES = {
  'PET': {
    wastePrices: { '华北': 5700, '华东': 5900, '华南': 6100, '华中': 5800, '西南': 5600, '全国': 5850 },
    recycledPrices: { '华北': 7200, '华东': 7500, '华南': 7700, '华中': 7300, '西南': 7100, '全国': 7400 },
    forms: { '瓶砖': 1.0, '瓶片': 1.15, '破碎料': 1.08, '颗粒': 1.30 },
    newMaterialPrice: 9200, // 新料 PET 参考价
  },
  'HDPE': {
    wastePrices: { '华北': 5500, '华东': 5800, '华南': 6000, '华中': 5600, '西南': 5400, '全国': 5700 },
    recycledPrices: { '华北': 7200, '华东': 7600, '华南': 8000, '华中': 7400, '西南': 7000, '全国': 7500 },
    forms: { '破碎料': 1.0, '桶料': 1.05, '颗粒': 1.25 },
    newMaterialPrice: 8800,
  },
  'PP': {
    wastePrices: { '华北': 4800, '华东': 5100, '华南': 5300, '华中': 4900, '西南': 4700, '全国': 5000 },
    recycledPrices: { '华北': 6200, '华东': 6600, '华南': 7000, '华中': 6400, '西南': 6000, '全国': 6500 },
    forms: { '破碎料': 1.0, '粉碎料': 1.05, '编织袋': 0.85, '颗粒': 1.20 },
    newMaterialPrice: 8200,
  },
  'LDPE': {
    wastePrices: { '华北': 5600, '华东': 6000, '华南': 6200, '华中': 5800, '西南': 5500, '全国': 5900 },
    recycledPrices: { '华北': 6500, '华东': 7000, '华南': 7500, '华中': 6800, '西南': 6300, '全国': 6900 },
    forms: { '膜': 1.0, '颗粒': 1.20 },
    newMaterialPrice: 9800,
  },
  'ABS': {
    wastePrices: { '华北': 7800, '华东': 8200, '华南': 8500, '华中': 8000, '西南': 7600, '全国': 8100 },
    recycledPrices: { '华北': 9500, '华东': 10200, '华南': 11000, '华中': 9800, '西南': 9200, '全国': 10000 },
    forms: { '破碎料': 1.0, '颗粒': 1.20 },
    newMaterialPrice: 14500,
  },
  'PC': {
    wastePrices: { '华北': 8500, '华东': 9000, '华南': 9500, '华中': 8800, '西南': 8300, '全国': 8900 },
    recycledPrices: { '华北': 11000, '华东': 12000, '华南': 13500, '华中': 11500, '西南': 10500, '全国': 11800 },
    forms: { '破碎料': 1.0, '桶料': 1.10, '颗粒': 1.25 },
    newMaterialPrice: 18000,
  },
  'PS': {
    wastePrices: { '华北': 4200, '华东': 4500, '华南': 4800, '华中': 4400, '西南': 4100, '全国': 4400 },
    recycledPrices: { '华北': 5500, '华东': 5800, '华南': 6200, '华中': 5600, '西南': 5300, '全国': 5700 },
    forms: { '破碎料': 1.0, '颗粒': 1.18 },
    newMaterialPrice: 9200,
  },
  'PA': {
    wastePrices: { '华北': 8000, '华东': 8500, '华南': 9000, '华中': 8200, '西南': 7800, '全国': 8400 },
    recycledPrices: { '华北': 9500, '华东': 10200, '华南': 11000, '华中': 9800, '西南': 9200, '全国': 10000 },
    forms: { '破碎料': 1.0, '颗粒': 1.25 },
    newMaterialPrice: 22000,
  },
  'PVC': {
    wastePrices: { '华北': 3200, '华东': 3500, '华南': 3800, '华中': 3400, '西南': 3100, '全国': 3400 },
    recycledPrices: { '华北': 4500, '华东': 4800, '华南': 5200, '华中': 4600, '西南': 4400, '全国': 4700 },
    forms: { '破碎料': 1.0, '管材料': 1.05, '颗粒': 1.18 },
    newMaterialPrice: 7200,
  },
};

// 区域映射
function normalizeRegion(location) {
  if (!location) return '全国';
  if (location.includes('北京') || location.includes('天津') || location.includes('河北') || location.includes('山西') || location.includes('内蒙古')) return '华北';
  if (location.includes('上海') || location.includes('江苏') || location.includes('浙江') || location.includes('山东') || location.includes('安徽')) return '华东';
  if (location.includes('广东') || location.includes('福建') || location.includes('广西') || location.includes('海南')) return '华南';
  if (location.includes('河南') || location.includes('湖北') || location.includes('湖南') || location.includes('江西')) return '华中';
  if (location.includes('四川') || location.includes('重庆') || location.includes('贵州') || location.includes('云南') || location.includes('西藏')) return '西南';
  if (location.includes('辽宁') || location.includes('吉林') || location.includes('黑龙江')) return '东北';
  if (location.includes('陕西') || location.includes('甘肃') || location.includes('宁夏') || location.includes('青海') || location.includes('新疆')) return '西北';
  return '全国';
}

function normalizeCategory(material) {
  if (!material) return null;
  const upper = material.toUpperCase();
  const map = { 'PET': 'PET', 'PP': 'PP', 'HDPE': 'HDPE', 'LDPE': 'LDPE', 'PE': 'LDPE',
    'ABS': 'ABS', 'PC': 'PC', 'PS': 'PS', 'PA': 'PA', 'PA6': 'PA', 'PA66': 'PA', 'PVC': 'PVC' };
  for (const [k, v] of Object.entries(map)) {
    if (upper.includes(k)) return v;
  }
  return null;
}

// ---- GET /api/pricing/suggest ----------------------------------------------

router.get('/suggest', (req, res) => {
  try {
    const { material, form, location, pole } = req.query;
    const category = normalizeCategory(material);
    if (!category) {
      return res.status(400).json({ success: false, error: '无法识别品类，请提供有效的 material 参数' });
    }

    const baseline = PRICE_BASELINES[category];
    if (!baseline) {
      return res.status(400).json({ success: false, error: `暂不支持品类: ${category}` });
    }

    const region = location ? normalizeRegion(location) : '全国';

    // 根据 pole 选择废料/再生料价格
    const isRecycled = pole === 'second_pole' ||
      (material && (material.includes('再生') || material.includes('颗粒')));
    const priceMap = isRecycled ? baseline.recycledPrices : baseline.wastePrices;
    const basePrice = priceMap[region] || priceMap['全国'];

    // 形态系数
    let formMultiplier = 1.0;
    if (form && baseline.forms) {
      for (const [f, mult] of Object.entries(baseline.forms)) {
        if (form.includes(f)) { formMultiplier = mult; break; }
      }
    }

    const suggestedPrice = Math.round(basePrice * formMultiplier);

    // 建议区间 (±10%)
    const priceLow = Math.round(suggestedPrice * 0.90);
    const priceHigh = Math.round(suggestedPrice * 1.10);

    // 品质等级调整
    const gradeAdjustments = {
      '食品级': { multiplier: 1.15, label: '食品级溢价 +15%' },
      '工业级': { multiplier: 1.0, label: '工业级基准价' },
      '普通级': { multiplier: 0.85, label: '普通级折价 -15%' },
    };

    // 获取价格趋势
    const trend = getPriceTrend(category, region);

    res.json({
      success: true,
      data: {
        category,
        region,
        materialType: isRecycled ? '再生料' : '废塑料',
        basePrice,
        formMultiplier,
        suggestedPrice,
        priceRange: { low: priceLow, high: priceHigh },
        gradeAdjustments,
        trend,
        newMaterialComparison: baseline.newMaterialPrice
          ? { newMaterialPrice: baseline.newMaterialPrice,
              spread: baseline.newMaterialPrice - suggestedPrice,
              spreadPct: Math.round((1 - suggestedPrice / baseline.newMaterialPrice) * 100),
              insight: getSpreadInsight(category, suggestedPrice, baseline.newMaterialPrice),
            }
          : null,
        pricingFormula: `${isRecycled ? '再生料' : '废塑料'}基准价 ${basePrice}元/吨 × 形态系数 ${formMultiplier} = ${suggestedPrice}元/吨`,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[Pricing] Suggest error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- POST /api/pricing/check -----------------------------------------------

router.post('/check', (req, res) => {
  try {
    const { material, price, form, location, quantity } = req.body;

    if (!material || price === undefined || price === null) {
      return res.status(400).json({ success: false, error: 'material 和 price 为必填参数' });
    }

    const category = normalizeCategory(material);
    if (!category) {
      return res.status(400).json({ success: false, error: '无法识别品类' });
    }

    const baseline = PRICE_BASELINES[category];
    const region = location ? normalizeRegion(location) : '全国';
    const priceMap = material.includes('再生') || material.includes('颗粒')
      ? baseline.recycledPrices : baseline.wastePrices;
    const marketAvg = priceMap[region] || priceMap['全国'];

    // 形态调整
    let formMult = 1.0;
    if (form && baseline.forms) {
      for (const [f, m] of Object.entries(baseline.forms)) {
        if (form.includes(f)) { formMult = m; break; }
      }
    }
    const adjustedAvg = marketAvg * formMult;

    const deviation = ((price - adjustedAvg) / adjustedAvg) * 100;
    const absDeviation = Math.abs(deviation);

    // 合理区间：±20%
    const isReasonable = absDeviation <= 20;
    let riskLevel, suggestion;

    if (absDeviation <= 5) {
      riskLevel = 'low';
      suggestion = '报价在市场均价范围内，合理';
    } else if (absDeviation <= 10) {
      riskLevel = 'low';
      suggestion = deviation > 0
        ? '报价略高于市场均价，建议关注买方反馈'
        : '报价略低于市场均价，可能有较好成交机会';
    } else if (absDeviation <= 20) {
      riskLevel = 'medium';
      suggestion = deviation > 0
        ? `报价偏离均价 +${Math.round(absDeviation)}%，偏高，可能影响成交速度`
        : `报价偏离均价 -${Math.round(absDeviation)}%，偏低，请确认品类和品质`;
    } else if (absDeviation <= 40) {
      riskLevel = 'high';
      suggestion = deviation > 0
        ? `⚠️ 报价严重偏高 (+${Math.round(absDeviation)}%)，建议核实市场行情`
        : `⚠️ 报价严重偏低 (-${Math.round(absDeviation)}%)，请确认是否为废料/库存/次品`;
    } else {
      riskLevel = 'critical';
      suggestion = deviation > 0
        ? `🚨 报价异常偏高 (+${Math.round(absDeviation)}%)，可能填写错误，请检查`
        : `🚨 报价异常偏低 (-${Math.round(absDeviation)}%)，可能为质劣品或填写错误`;
    }

    // 获取附近报价参照
    const nearbyListings = getNearbyPriceReferences(category, region, 5);

    res.json({
      success: true,
      data: {
        userPrice: price,
        marketAvg: Math.round(adjustedAvg),
        deviation: Math.round(deviation),
        absDeviation: Math.round(absDeviation),
        isReasonable,
        riskLevel,
        suggestion,
        breakdown: {
          category,
          region,
          basePrice: marketAvg,
          formMultiplier: formMult,
          adjustedAvg,
        },
        nearbyReferences: nearbyListings,
        action: isReasonable ? 'publish' : (riskLevel === 'high' || riskLevel === 'critical' ? 'review' : 'warn'),
      },
    });
  } catch (err) {
    console.error('[Pricing] Check error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- GET /api/pricing/trends -----------------------------------------------

router.get('/trends', (req, res) => {
  try {
    const { material, days = 30, region } = req.query;
    const category = normalizeCategory(material);
    const lookback = Math.min(90, Math.max(7, parseInt(days, 10) || 30));

    let where = 'WHERE 1=1';
    const params = [];

    if (category) {
      where += ' AND category = ?';
      params.push(category);
    }
    if (material) {
      where += ' AND material LIKE ?';
      params.push(`%${material}%`);
    }
    if (region) {
      where += ' AND (region = ? OR region = ?)';
      params.push(region, '全国');
    }

    const sql = `SELECT * FROM price_history ${where} ORDER BY recorded_date DESC LIMIT ?`;
    params.push(lookback);

    const rows = db.prepare(sql).all(...params);

    // 聚合按日期
    const dailyMap = {};
    for (const r of rows) {
      const d = r.recorded_date;
      if (!dailyMap[d]) dailyMap[d] = { sum: 0, count: 0, low: Infinity, high: -Infinity };
      dailyMap[d].sum += r.price_avg;
      dailyMap[d].count++;
      dailyMap[d].low = Math.min(dailyMap[d].low, r.price_low || r.price_avg);
      dailyMap[d].high = Math.max(dailyMap[d].high, r.price_high || r.price_avg);
    }

    const trend = Object.entries(dailyMap)
      .map(([date, data]) => ({
        date,
        avg: Math.round(data.sum / data.count),
        low: data.low === Infinity ? null : data.low,
        high: data.high === -Infinity ? null : data.high,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 计算趋势方向
    let direction = 'flat', changePct = 0;
    if (trend.length >= 2) {
      const first = trend[0].avg;
      const last = trend[trend.length - 1].avg;
      changePct = Math.round(((last - first) / first) * 100 * 10) / 10;
      direction = changePct > 1 ? 'up' : (changePct < -1 ? 'down' : 'flat');
    }

    res.json({
      success: true,
      data: {
        category: category || material,
        days: lookback,
        count: trend.length,
        direction,
        changePct,
        trend,
        lastUpdate: trend.length > 0 ? trend[trend.length - 1].date : null,
      },
    });
  } catch (err) {
    console.error('[Pricing] Trends error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- GET /api/pricing/comparison -------------------------------------------

router.get('/comparison', (req, res) => {
  try {
    const { material } = req.query;
    const category = normalizeCategory(material);
    const results = [];

    if (category) {
      const baseline = PRICE_BASELINES[category];
      if (baseline && baseline.newMaterialPrice) {
        const wastePrice = baseline.wastePrices['全国'];
        const recycledPrice = baseline.recycledPrices['全国'];
        results.push({
          category,
          wastePrice,
          recycledPrice,
          newMaterialPrice: baseline.newMaterialPrice,
          wasteSpreadPct: Math.round((1 - wastePrice / baseline.newMaterialPrice) * 100),
          recycledSpreadPct: Math.round((1 - recycledPrice / baseline.newMaterialPrice) * 100),
          insight: getSpreadInsight(category, recycledPrice, baseline.newMaterialPrice),
        });
      }
    } else {
      for (const [cat, baseline] of Object.entries(PRICE_BASELINES)) {
        if (!baseline.newMaterialPrice) continue;
        results.push({
          category: cat,
          wastePrice: baseline.wastePrices['全国'],
          recycledPrice: baseline.recycledPrices['全国'],
          newMaterialPrice: baseline.newMaterialPrice,
          wasteSpreadPct: Math.round((1 - baseline.wastePrices['全国'] / baseline.newMaterialPrice) * 100),
          recycledSpreadPct: Math.round((1 - baseline.recycledPrices['全国'] / baseline.newMaterialPrice) * 100),
        });
      }
    }

    res.json({
      success: true,
      data: results,
    });
  } catch (err) {
    console.error('[Pricing] Comparison error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 辅助函数 ----------------------------------------------------------------

function getPriceTrend(category, region) {
  try {
    // 查询最近14天的价格历史
    const rows = db.prepare(`
      SELECT * FROM price_history
      WHERE category = ? AND (region = ? OR region = '全国')
      ORDER BY recorded_date DESC
      LIMIT 14
    `).all(category, region);

    if (rows.length < 2) return { direction: 'flat', changePct: 0, days: 0 };

    const newest = rows[0].price_avg;
    const oldest = rows[rows.length - 1].price_avg;
    const change = Math.round(((newest - oldest) / oldest) * 100 * 10) / 10;
    return {
      direction: change > 1 ? 'up' : (change < -1 ? 'down' : 'flat'),
      changePct: change,
      days: rows.length,
      current: newest,
    };
  } catch (e) {
    return { direction: 'flat', changePct: 0, days: 0 };
  }
}

function getNearbyPriceReferences(category, region, limit) {
  try {
    const rows = db.prepare(`
      SELECT l.material, l.form, l.price, l.location, l.created_at,
             u.company, u.name
      FROM listings l JOIN users u ON l.user_id = u.id
      WHERE l.status = 'active'
        AND (l.material LIKE ? OR l.material LIKE ?)
        AND l.price > 0
      ORDER BY l.created_at DESC
      LIMIT ?
    `).all(`%${category}%`, `${category}%`, limit);

    return rows.map(r => ({
      material: r.material,
      form: r.form,
      price: r.price,
      location: r.location,
      company: r.company || r.name,
      date: r.created_at ? r.created_at.slice(0, 10) : '',
    }));
  } catch (e) {
    return [];
  }
}

function getSpreadInsight(category, recycledPrice, newMaterialPrice) {
  const spread = newMaterialPrice - recycledPrice;
  const pct = Math.round((spread / newMaterialPrice) * 100);

  if (pct >= 40) return `再生料比新料低 ${pct}%，替代空间巨大，制品工厂可关注成本节约机会`;
  if (pct >= 25) return `再生料比新料低 ${pct}%，具备良好的经济替代性`;
  if (pct >= 15) return `再生料比新料低 ${pct}%，有一定价格优势`;
  return `再生料比新料低 ${pct}%，价差较小，品质可能是更重要的决策因素`;
}

// ---- 品类匹配模式（heatmap 辅助） ----
const CATEGORY_PATTERNS = [
  { regex: /\b(PET|pet)\b/i, category: 'PET' },
  { regex: /\b(HDPE|hdpe|低压)\b/i, category: 'HDPE' },
  { regex: /\b(PP|pp|聚丙|ABS|abs)\b/i, category: 'PP' },
  { regex: /\b(LDPE|ldpe|高压)\b/i, category: 'LDPE' },
  { regex: /\bABS|abs\b/i, category: 'ABS' },
  { regex: /\bPC|pc|聚碳\b/i, category: 'PC' },
];

// ---- GET /api/pricing/heatmap — 区域热力图数据 ----
router.get('/heatmap', (req, res) => {
  try {
    const { category } = req.query;
    const regions = ['华北', '华东', '华南', '华中', '西南', '西北', '东北'];
    const categories = category ? [category.toUpperCase()] : Object.keys(PRICE_BASELINES);

    const data = [];
    for (const cat of categories) {
      const baseline = PRICE_BASELINES[cat];
      if (!baseline) continue;

      for (const region of regions) {
        const wastePrice = baseline.wastePrices[region];
        const recycledPrice = baseline.recycledPrices[region];
        if (!wastePrice && !recycledPrice) continue;

        data.push({
          category: cat,
          region,
          wastePrice: wastePrice || null,
          recycledPrice: recycledPrice || null,
          trend: baseline.trend || 'flat',
          newMaterialPrice: baseline.newMaterialPrice || null,
        });
      }
    }

    // 查询真实 listings 数据补充
    try {
      const listings = db.prepare(`
        SELECT l.material, l.location,
          AVG(CASE WHEN l.waste_or_recycled = '废塑料' THEN l.price END) as avg_waste,
          AVG(CASE WHEN l.waste_or_recycled = '再生料' THEN l.price END) as avg_recycled,
          COUNT(*) as cnt
        FROM listings l
        WHERE l.status = 'active' AND l.price > 0
        GROUP BY l.material, l.location
      `).all();

      for (const row of listings) {
        if (!row.material || !row.location) continue;
        const cat = CATEGORY_PATTERNS.find(p => p.regex.test(row.material));
        const catName = cat ? cat.category : '';
        const existing = data.find(d => d.category === catName && d.region.includes(row.location));
        if (existing && row.avg_recycled) existing.recycledPrice = Math.round(row.avg_recycled);
        if (existing && row.avg_waste) existing.wastePrice = Math.round(row.avg_waste);
      }
    } catch (e) { /* listing data optional */ }

    res.json({ success: true, data, regions });
  } catch (err) {
    console.error('[Pricing] Heatmap error:', err.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// ---- 趋势API扩展：支持 week/month/quarter 周期 ----
router.get('/trends-extended', (req, res) => {
  try {
    const period = req.query.period || 'month'; // week | month | quarter
    const category = req.query.category || '';

    // 周期配置（groupExpr 直接嵌入 SQL）
    const periodConfig = {
      week: { days: 7, label: '周', groupExpr: "strftime('%Y-W%W', recorded_date)" },
      month: { days: 30, label: '月', groupExpr: "strftime('%Y-%m', recorded_date)" },
      quarter: { days: 90, label: '季',
        groupExpr: "strftime('%Y', recorded_date) || '-Q' || ((CAST(strftime('%m', recorded_date) AS INTEGER) + 2) / 3)" },
    };

    const config = periodConfig[period] || periodConfig.month;

    let catFilter = '';
    const params = [config.days];
    if (category) {
      catFilter = 'AND category = ?';
      params.push(category.toUpperCase());
    }

    // 按周期聚合
    const rows = db.prepare(`
      SELECT
        ${config.groupExpr} as period_key,
        MIN(recorded_date) as period_start,
        ROUND(AVG(price_avg)) as avg_price,
        ROUND(MIN(price_low)) as min_price,
        ROUND(MAX(price_high)) as max_price,
        COUNT(*) as data_points
      FROM price_history
      WHERE recorded_date >= date('now', '-' || ? || ' days') ${catFilter}
      GROUP BY period_key
      ORDER BY period_start ASC
    `).all(...params);

    // 计算趋势方向
    let direction = 'flat';
    if (rows.length >= 2) {
      const first = rows[0].avg_price;
      const last = rows[rows.length - 1].avg_price;
      const change = ((last - first) / first) * 100;
      direction = change > 2 ? 'up' : change < -2 ? 'down' : 'flat';
    }

    res.json({
      success: true,
      period: config.label,
      category: category || '全部',
      direction,
      data: rows.map(r => ({
        key: r.period_key,
        start: r.period_start,
        avg: Math.round(r.avg_price),
        low: Math.round(r.min_price),
        high: Math.round(r.max_price),
        points: r.data_points,
      })),
    });
  } catch (err) {
    console.error('[Pricing] Trends-ext error:', err.message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

module.exports = router;
