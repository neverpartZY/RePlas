/**
 * P0-2: 外部供需数据 API 路由
 *
 * GET  /api/external/listings    — 查询外部采集的供需列表（来源筛选、分页）
 * POST /api/external/scrape      — 手动触发全网采集
 * GET  /api/external/status      — 采集器状态与统计
 * GET  /api/external/sources     — 可用数据源列表
 * GET  /api/external/stats       — 按来源/品类统计
 */

const express = require('express');
const router = express.Router();
const scraperManager = require('../scrapers/manager');
const db = require('../db');

// ---- GET /api/external/listings ---------------------------------------------

router.get('/listings', (req, res) => {
  try {
    const { type, material, source, page, limit } = req.query;
    const result = scraperManager.getExternalListings({
      type, material, source,
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 50, 200),
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[External] Listings error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- POST /api/external/scrape ----------------------------------------------

router.post('/scrape', async (req, res) => {
  try {
    res.json({
      success: true,
      message: '采集任务已启动',
      data: { status: 'running' },
    });

    // 异步执行采集
    scraperManager.runAllScrapers().catch(err => {
      console.error('[External] Scrape async error:', err.message);
    });
  } catch (err) {
    console.error('[External] Scrape error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- GET /api/external/status -----------------------------------------------

router.get('/status', (req, res) => {
  try {
    res.json({
      success: true,
      data: scraperManager.getStatus(),
    });
  } catch (err) {
    console.error('[External] Status error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- GET /api/external/sources ----------------------------------------------

router.get('/sources', (req, res) => {
  try {
    // 从数据库获取所有来源
    const sources = db.prepare(`
      SELECT source, COUNT(*) as count,
             SUM(CASE WHEN type='supply' THEN 1 ELSE 0 END) as supply_count,
             SUM(CASE WHEN type='demand' THEN 1 ELSE 0 END) as demand_count,
             MAX(last_seen) as last_update
      FROM external_listings
      WHERE is_active = 1
      GROUP BY source
      ORDER BY count DESC
    `).all();

    res.json({
      success: true,
      data: {
        sources,
        scrapers: scraperManager.getStatus().scraperNames,
      },
    });
  } catch (err) {
    console.error('[External] Sources error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- GET /api/external/stats ------------------------------------------------

router.get('/stats', (req, res) => {
  try {
    // 按品类统计
    const byCategory = db.prepare(`
      SELECT material, COUNT(*) as count,
             ROUND(AVG(price), 0) as avg_price,
             MIN(price) as min_price, MAX(price) as max_price
      FROM external_listings
      WHERE is_active = 1 AND price > 0
      GROUP BY material
      ORDER BY count DESC
      LIMIT 30
    `).all();

    // 总览
    const overview = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN type='supply' THEN 1 ELSE 0 END) as supply,
        SUM(CASE WHEN type='demand' THEN 1 ELSE 0 END) as demand,
        COUNT(DISTINCT source) as sources
      FROM external_listings WHERE is_active = 1
    `).get();

    res.json({
      success: true,
      data: { overview, byCategory },
    });
  } catch (err) {
    console.error('[External] Stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- GET /api/external/match/:listingId -------------------------------------
// 对指定本地 listing 进行全网匹配

router.get('/match/:listingId', (req, res) => {
  try {
    const listingId = parseInt(req.params.listingId, 10);
    const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
    if (!listing) {
      return res.status(404).json({ success: false, error: '供需不存在' });
    }

    // 查询与本地 listing 品类匹配的外部数据
    const materialPattern = listing.material
      ? listing.material.replace(/再生/g, '').replace(/级/g, '').trim()
      : '';

    let externalMatches = [];
    if (materialPattern) {
      const oppositeType = listing.type === 'supply' ? 'demand' : 'supply';
      // 品类名提取关键词匹配
      const keywords = materialPattern.split(/[^\u4e00-\u9fa5A-Za-z]/)
        .filter(k => k.length >= 2);

      if (keywords.length > 0) {
        let where = `WHERE is_active = 1 AND type = ? AND (`;
        const params = [oppositeType];
        const conditions = keywords.map(k => `material LIKE ?`);
        where += conditions.join(' OR ') + ')';
        params.push(...keywords.map(k => `%${k}%`));

        externalMatches = db.prepare(
          `SELECT * FROM external_listings ${where} ORDER BY published_at DESC LIMIT 20`
        ).all(...params);
      }
    }

    // 简单评分
    const scored = externalMatches.map(ext => {
      let score = 30; // base score for external matches
      const listingCat = (listing.material || '').toUpperCase();
      const extCat = (ext.material || '').toUpperCase();

      // 品类加分
      const catList = ['PET', 'PP', 'PE', 'HDPE', 'LDPE', 'ABS', 'PC', 'PS', 'PA', 'PVC'];
      for (const cat of catList) {
        if (listingCat.includes(cat) && extCat.includes(cat)) { score += 35; break; }
      }

      // 地点加分
      if (listing.location && ext.location && listing.location.substring(0, 2) === ext.location.substring(0, 2)) {
        score += 10;
      }

      // 价格加分
      if (listing.price > 0 && ext.price > 0) {
        const ratio = Math.min(listing.price, ext.price) / Math.max(listing.price, ext.price);
        if (ratio >= 0.85) score += 10;
        else if (ratio >= 0.7) score += 5;
      }

      return {
        ...ext,
        matchScore: score,
        source: ext.source,
        sourceUrl: ext.source_url,
      };
    });

    scored.sort((a, b) => b.matchScore - a.matchScore);

    res.json({
      success: true,
      data: {
        listing: { id: listing.id, material: listing.material, type: listing.type, location: listing.location },
        matches: scored.slice(0, 15),
        total: externalMatches.length,
        source: 'external',
      },
    });
  } catch (err) {
    console.error('[External] Match error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
