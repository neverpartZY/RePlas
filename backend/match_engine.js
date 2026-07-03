/**
 * 6-dimension match engine for 再塑通 platform.
 *
 * Scoring dimensions (total 100 points):
 *  1. Category match    – 40 pts (exact match required)
 *  2. Form compatibility  – 12 pts
 *  3. Location proximity   – 12 pts
 *  4. Price compatibility  –  8 pts
 *  5. Quantity compatibility –  8 pts
 *  6. Quality match      – 20 pts (color/purity/melt_index/certifications/grade)
 */

// ---- Helpers ----------------------------------------------------------------

const FORM_COMPAT_MAP = {
  // waste form -> compatible recycled forms
  '瓶砖':     ['瓶片', '碎片', '颗粒'],
  '瓶片':     ['瓶片', '碎片', '颗粒'],
  '破碎料':   ['破碎料', '颗粒'],
  '粉碎料':   ['粉碎料', '颗粒'],
  '碎片':     ['碎片', '颗粒'],
  '颗粒':     ['颗粒'],
  '膜':       ['膜颗粒', '颗粒'],
  '块料':     ['破碎料', '颗粒'],
  '扎装':     ['瓶砖', '瓶片', '颗粒'],
  '吨包':     ['颗粒', '破碎料'],
  '毛料':     ['破碎料', '颗粒'],
  '废丝':     ['颗粒'],
  '板材':     ['破碎料', '颗粒'],
  '管材':     ['破碎料', '颗粒'],
  '破碎':     ['破碎料', '颗粒'],
  '车灯破碎': ['破碎料', '颗粒'],
};

// Adjacent province map (simplified)
const ADJACENT_MAP = {
  '河北': ['北京','天津','山西','河南','山东','辽宁','内蒙古'],
  '北京': ['河北','天津'],
  '天津': ['北京','河北'],
  '山西': ['河北','河南','陕西','内蒙古'],
  '河南': ['河北','山西','山东','安徽','湖北','陕西'],
  '山东': ['河北','河南','江苏','安徽'],
  '江苏': ['山东','安徽','浙江','上海'],
  '浙江': ['江苏','上海','安徽','江西','福建'],
  '上海': ['江苏','浙江'],
  '安徽': ['河南','山东','江苏','浙江','江西','湖北'],
  '湖北': ['河南','安徽','江西','湖南','重庆','陕西'],
  '广东': ['福建','江西','湖南','广西','海南'],
  '福建': ['浙江','江西','广东'],
  '江西': ['浙江','安徽','湖北','湖南','广东','福建'],
  '湖南': ['湖北','江西','广东','广西','贵州','重庆'],
  '辽宁': ['河北','吉林','内蒙古'],
  '四川': ['重庆','贵州','云南','西藏','陕西','甘肃','青海'],
  '重庆': ['四川','贵州','湖南','湖北','陕西'],
  '陕西': ['山西','河南','湖北','四川','甘肃','宁夏','内蒙古','重庆'],
  '内蒙古': ['河北','山西','辽宁','吉林','黑龙江','陕西','甘肃','宁夏'],
};

// Canonical category names
function normalizeCategory(raw) {
  if (!raw) return '';
  const c = raw.toUpperCase().trim();
  if (c.includes('PET')) return 'PET';
  if (c.includes('PP') && !c.includes('ABS')) return 'PP';
  if (c.includes('HDPE') || c.includes('HD PE')) return 'HDPE';
  if (c.includes('LDPE') || c.includes('LD PE')) return 'LDPE';
  if (c.includes('ABS')) return 'ABS';
  if (c.includes('PC')) return 'PC';
  if (c.includes('PVC')) return 'PVC';
  if (c.includes('PE') && !c.includes('PET') && !c.includes('HDPE') && !c.includes('LDPE')) return 'PE';
  if (c.includes('PS')) return 'PS';
  return c;
}

// ---- Dimension scorers ------------------------------------------------------

function scoreCategory(supply, demand) {
  const sCat = normalizeCategory(supply.material);
  const dCat = normalizeCategory(demand.material);
  return sCat === dCat && sCat !== '' ? 40 : 0;
}

function scoreForm(supply, demand) {
  // supply side is the waste/recycled form; demand side specifies desired form
  const sForm = (supply.form || '').trim();
  const dForm = (demand.form || '').trim();
  if (!sForm || !dForm) return 4; // unspecified → partial credit

  const compatible = FORM_COMPAT_MAP[sForm];
  if (!compatible) return 4;

  // Check if demand form is directly in the compatible list
  for (const c of compatible) {
    if (dForm.includes(c) || c.includes(dForm)) return 12;
  }
  return 4;
}

function scoreLocation(supply, demand) {
  const sLoc = (supply.location || '').trim();
  const dLoc = (demand.location || '').trim();
  if (!sLoc || !dLoc) return 4;

  // Extract province (first 2 characters usually)
  const extractProvince = (loc) => {
    for (const p of Object.keys(ADJACENT_MAP)) {
      if (loc.startsWith(p)) return p;
    }
    return loc.substring(0, 2);
  };

  const sProv = extractProvince(sLoc);
  const dProv = extractProvince(dLoc);

  if (sProv === dProv) return 12;
  if (ADJACENT_MAP[sProv] && ADJACENT_MAP[sProv].includes(dProv)) return 8;
  return 4;
}

function scorePrice(supply, demand) {
  const sPrice = supply.price || 0;
  const dPrice = demand.price || 0;
  if (sPrice <= 0 || dPrice <= 0) return 4; // price not set

  // Demand is buying: they have a budget. Supply is selling: they have an asking price.
  // Good match when supply price ≤ demand budget.
  if (sPrice <= dPrice) return 8;
  // Slightly over budget — partial
  const ratio = dPrice / sPrice;
  if (ratio >= 0.85) return 6;
  if (ratio >= 0.70) return 3;
  return 1;
}

function scoreQuantity(supply, demand) {
  const sQty = supply.quantity || 0;
  const dQty = demand.quantity || 0;
  if (sQty <= 0 || dQty <= 0) return 4;

  const ratio = Math.min(sQty, dQty) / Math.max(sQty, dQty);
  if (ratio >= 0.8) return 8;
  if (ratio >= 0.5) return 6;
  if (ratio >= 0.3) return 3;
  return 2;
}

// ---- Quality dimension (6th dimension - P0-3) -------------------------------

/**
 * Color compatibility matrix for recycled plastics.
 * Each entry maps a supply color to compatible demand colors.
 */
const COLOR_COMPAT = {
  '纯白':    ['纯白', '白色', '透明'],
  '白色':    ['纯白', '白色', '透明', '杂色'],
  '蓝白':    ['蓝白', '蓝色', '白色'],
  '透明':    ['透明', '纯白', '白色'],
  '绿色':    ['绿色'],
  '蓝色':    ['蓝色', '蓝白'],
  '黑色':    ['黑色', '杂色'],
  '灰色':    ['灰色', '灰白', '杂色'],
  '灰白':    ['灰白', '灰色', '杂色'],
  '花色':    ['花色', '杂色'],
  '杂色':    ['杂色', '花色', '黑色'],
  '乳白':    ['乳白', '白色'],
  '米黄':    ['米黄', '乳白'],
};

/**
 * Grade compatibility:
 * 食品级 supply → 食品级 demand only (strict)
 * 工业级 supply → 工业级 or 普通级
 * 普通级 supply → 普通级 only
 */
const GRADE_COMPAT = {
  '食品级': ['食品级'],
  '工业级': ['工业级', '普通级'],
  '普通级': ['普通级', '工业级'], // 普通级也可以满足不太挑剔的工业级需求
};

/**
 * Score quality match: 20 points total
 * - Color compatibility: 8 pts
 * - Grade compatibility: 5 pts
 * - Certification overlap: 4 pts
 * - Purity/impurity requirements: 3 pts
 */
function scoreQuality(supply, demand) {
  let score = 0;
  const breakdown = { color: 0, grade: 0, cert: 0, purity: 0 };

  // Parse quality_specs (handle both string and object)
  const sSpecs = parseSpecs(supply.quality_specs || supply.qualitySpecs);
  const dSpecs = parseSpecs(demand.quality_specs || demand.qualitySpecs);

  // If neither side has quality specs, give neutral partial score
  const sHasSpecs = Object.keys(sSpecs).length > 0;
  const dHasSpecs = Object.keys(dSpecs).length > 0;
  if (!sHasSpecs && !dHasSpecs) return { score: 10, breakdown: { color: 4, grade: 2, cert: 2, purity: 2 } };

  // ---- Color compatibility (8 pts) ----
  const sColor = sSpecs.color || supply.color || '';
  const dColor = dSpecs.color || demand.color || '';
  if (sColor && dColor) {
    const compat = COLOR_COMPAT[sColor];
    if (compat && compat.includes(dColor)) {
      breakdown.color = 8;
    } else if (compat && compat.some(c => dColor.includes(c))) {
      breakdown.color = 5;
    } else if (sColor === dColor) {
      breakdown.color = 8;
    } else {
      breakdown.color = 2; // colors differ but might still be usable
    }
  } else if (sColor || dColor) {
    breakdown.color = 4; // one side unspecified
  } else {
    breakdown.color = 4;
  }

  // ---- Grade compatibility (5 pts) ----
  const sGrade = supply.grade || '';
  const dGrade = demand.grade || '';
  if (sGrade && dGrade) {
    if (sGrade === dGrade) {
      breakdown.grade = 5;
    } else {
      const compat = GRADE_COMPAT[sGrade];
      if (compat && compat.includes(dGrade)) {
        breakdown.grade = 3;
      } else {
        breakdown.grade = 1; // grades incompatible
      }
    }
  } else if (sGrade || dGrade) {
    breakdown.grade = 3; // one side unspecified
  } else {
    breakdown.grade = 3;
  }

  // ---- Certification overlap (4 pts) ----
  const sCerts = (supply.certifications || []);
  const dCerts = (demand.certifications || []);
  const sCertList = Array.isArray(sCerts) ? sCerts : (typeof sCerts === 'string' ? safeJSON(sCerts) : []);
  const dCertList = Array.isArray(dCerts) ? dCerts : (typeof dCerts === 'string' ? safeJSON(dCerts) : []);

  if (sCertList.length > 0 && dCertList.length > 0) {
    const overlap = sCertList.filter(c => dCertList.includes(c));
    if (overlap.length >= 2) breakdown.cert = 4;
    else if (overlap.length === 1) breakdown.cert = 3;
    else breakdown.cert = 1;
  } else if (sCertList.length > 0 || dCertList.length > 0) {
    breakdown.cert = 2;
  } else {
    breakdown.cert = 2;
  }

  // ---- Purity / impurity requirements (3 pts) ----
  const sPurity = parseFloat(sSpecs.purity) || parseFloat(sSpecs.impurity) || 0;
  const dPurity = parseFloat(dSpecs.purity) || parseFloat(dSpecs.impurity) || 0;

  if (sPurity > 0 && dPurity > 0) {
    // For purity: higher is better. Supply purity >= demand requirement = good.
    // For impurity: lower is better. Supply impurity <= demand max = good.
    if (sSpecs.purity && dSpecs.purity) {
      // Purity matching: supply purity meets demand
      if (sPurity >= dPurity) breakdown.purity = 3;
      else if (sPurity >= dPurity * 0.9) breakdown.purity = 2;
      else breakdown.purity = 1;
    } else if (sSpecs.impurity && dSpecs.impurity) {
      // Impurity matching: supply impurity <= demand max
      if (sPurity <= dPurity) breakdown.purity = 3;
      else if (sPurity <= dPurity * 1.1) breakdown.purity = 2;
      else breakdown.purity = 1;
    } else {
      breakdown.purity = 1;
    }
  } else if (sPurity > 0 || dPurity > 0) {
    breakdown.purity = 2;
  } else {
    breakdown.purity = 2; // neutral
  }

  // ---- Melt index matching (bonus within purity) ----
  const sMI = parseFloat(sSpecs.melt_index) || parseFloat(sSpecs.mfi) || 0;
  const dMI = parseFloat(dSpecs.melt_index) || parseFloat(dSpecs.mfi) || 0;
  if (sMI > 0 && dMI > 0) {
    const miRatio = Math.min(sMI, dMI) / Math.max(sMI, dMI);
    if (miRatio >= 0.7) breakdown.purity = Math.min(3, breakdown.purity + 1);
  }

  score = breakdown.color + breakdown.grade + breakdown.cert + breakdown.purity;

  return { score, breakdown };
}

function parseSpecs(specs) {
  if (!specs) return {};
  if (typeof specs === 'object' && !Array.isArray(specs)) return specs;
  if (typeof specs === 'string') {
    try { return JSON.parse(specs); } catch (e) { return {}; }
  }
  return {};
}

function safeJSON(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch (e) { return []; }
}

// ---- Main engine ------------------------------------------------------------

/**
 * Compute match scores between a given listing and a list of candidate listings.
 *
 * @param {Object} source   - The listing to match against (the one just created)
 * @param {Array}  candidates - Array of opposite-type listings
 * @param {number} limit    - Max matches to return
 * @returns {Array} sorted matches with score and dimension breakdown
 */
/**
 * Compute match score for a single supply-demand pair.
 * Returns { score, dimensions } or null when categories don't match.
 */
function computeMatchScore(supply, demand) {
  const dimCategory = scoreCategory(supply, demand);
  if (dimCategory === 0) return null; // category must match

  const dimForm = scoreForm(supply, demand);
  const dimLocation = scoreLocation(supply, demand);
  const dimPrice = scorePrice(supply, demand);
  const dimQuantity = scoreQuantity(supply, demand);
  const dimQuality = scoreQuality(supply, demand);

  const score = dimCategory + dimForm + dimLocation + dimPrice + dimQuantity + dimQuality.score;
  return {
    score,
    dimensions: {
      category: dimCategory,
      form: dimForm,
      location: dimLocation,
      price: dimPrice,
      quantity: dimQuantity,
      quality: dimQuality.score,
      qualityBreakdown: dimQuality.breakdown,
    },
  };
}

/**
 * Compute match scores between a given listing and a list of candidate listings.
 *
 * @param {Object} source   - The listing to match against (the one just created)
 * @param {Array}  candidates - Array of opposite-type listings
 * @param {number} limit    - Max matches to return
 * @returns {Array} sorted matches with score and dimension breakdown
 */
function computeMatches(source, candidates, limit = 10) {
  const results = [];

  for (const candidate of candidates) {
    const supply = source.type === 'supply' ? source : candidate;
    const demand = source.type === 'supply' ? candidate : source;

    const result = computeMatchScore(supply, demand);
    if (!result) continue; // must match category

    results.push({
      supplyId: supply.id,
      demandId: demand.id,
      score: result.score,
      dimensionScores: result.dimensions,
    });
  }

  // Sort by score descending, cap at limit
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Fix 15: Recompute all matches for a single listing after it has been updated.
 * The caller is expected to have already deleted stale matches involving this
 * listing. Re-evaluates the listing against every active opposite-type listing
 * and persists any match scoring >= 50 (i.e. category match achieved).
 */
function recomputeMatchesForListing(db, listingId) {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing || listing.status !== 'active') return;

  const oppositeType = listing.type === 'supply' ? 'demand' : 'supply';
  const candidates = db
    .prepare('SELECT * FROM listings WHERE type = ? AND status = ? AND id != ?')
    .all(oppositeType, 'active', listingId);

  const insertMatch = db.prepare(
    `INSERT INTO matches (supply_id, demand_id, score, dimension_scores, status) VALUES (?, ?, ?, ?, 'pending')`
  );
  const findExisting = db.prepare(
    'SELECT id FROM matches WHERE supply_id = ? AND demand_id = ?'
  );

  for (const candidate of candidates) {
    const supply = listing.type === 'supply' ? listing : candidate;
    const demand = listing.type === 'demand' ? listing : candidate;
    const result = computeMatchScore(supply, demand);
    if (result && result.score >= 50) {
      if (!findExisting.get(supply.id, demand.id)) {
        insertMatch.run(supply.id, demand.id, result.score, JSON.stringify(result.dimensions));
      }
    }
  }
}

module.exports = { computeMatches, computeMatchScore, recomputeMatchesForListing, normalizeCategory };
