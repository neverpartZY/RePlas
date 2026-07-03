const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/stats — dashboard statistics
router.get('/', (req, res) => {
  try {
    const totalSupplies = db.prepare(
      "SELECT COUNT(*) AS cnt FROM listings WHERE type = 'supply' AND status != 'closed'"
    ).get().cnt;

    const totalDemands = db.prepare(
      "SELECT COUNT(*) AS cnt FROM listings WHERE type = 'demand' AND status != 'closed'"
    ).get().cnt;

    const totalMatches = db.prepare(
      'SELECT COUNT(*) AS cnt FROM matches'
    ).get().cnt;

    const activeUsers = db.prepare(
      'SELECT COUNT(*) AS cnt FROM users'
    ).get().cnt;

    // Additional stats
    const pendingMatches = db.prepare(
      "SELECT COUNT(*) AS cnt FROM matches WHERE status = 'pending'"
    ).get().cnt;

    const dealMatches = db.prepare(
      "SELECT COUNT(*) AS cnt FROM matches WHERE status = 'deal'"
    ).get().cnt;

    res.json({
      success: true,
      stats: {
        totalSupplies,
        totalDemands,
        totalMatches,
        activeUsers,
        pendingMatches,
        dealMatches,
      },
    });
  } catch (err) {
    console.error('[stats] error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
