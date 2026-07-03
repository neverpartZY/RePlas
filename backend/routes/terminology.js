/**
 * 行业术语标准化映射 (Terminology Normalization)
 *
 * GET  /api/terminology/normalize?q=大蓝桶      — 标准化输入术语
 * POST /api/terminology/normalize                — 批量标准化
 * GET  /api/terminology/map                      — 查看完整映射表
 */

const express = require('express');
const router = express.Router();

// ---- 塑料行业常用俗称 → 标准品类映射表 ------------------------------------
const TERM_MAP = {
  // PET 聚酯类
  '三色瓶砖': 'PET三色瓶砖',
  '蓝白瓶砖': 'PET蓝白瓶砖',
  '纯白瓶砖': 'PET纯白瓶砖',
  '绿瓶砖': 'PET绿瓶砖',
  '瓶砖': 'PET三色瓶砖',
  '瓶片': 'PET瓶片',
  '热水片': 'PET热水蓝白片',
  '冷水片': 'PET冷水蓝白片',
  '绿片': 'PET绿片',
  '3A片': 'PET3A纯白片',
  '长丝': 'PET长丝',
  '短纤': 'PET短纤',
  '泡泡料': 'PET泡泡料',
  '吸塑片': 'PET吸塑片',
  '废瓶': 'PET废瓶',

  // HDPE
  '大蓝桶': 'HDPE大蓝桶破碎',
  '大蓝桶破碎': 'HDPE大蓝桶破碎',
  '蓝桶': 'HDPE大蓝桶破碎',
  '大桶': 'HDPE大桶',
  '小中空': 'HDPE小中空破碎',
  '中空料': 'HDPE中空破碎',
  '管道料': 'HDPE管道级颗粒',
  '波纹管': 'HDPE波纹管破碎',
  '桶料': 'HDPE桶料破碎',
  '牛奶瓶': 'HDPE牛奶瓶',
  '洗发水瓶': 'HDPE日化瓶',
  '日化瓶': 'HDPE日化瓶',

  // PP
  '白色粉碎料': 'PP白色粉碎料',
  '白粉碎': 'PP白色粉碎料',
  '杂色粉碎': 'PP杂色粉碎料',
  'PP粉碎': 'PP白色粉碎料',
  '注塑级': 'PP注塑级再生颗粒',
  '拉丝级': 'PP拉丝级再生颗粒',
  '吨袋': 'PP吨袋',
  '编织袋': 'PP编织袋',
  '保险杠': 'PP汽车保险杠破碎',
  '汽车料': 'PP汽车保险杠破碎',
  '洗衣机料': 'PP家电破碎',
  '家电料': 'PP家电破碎',

  // LDPE
  '大棚膜': 'LDPE大棚膜颗粒',
  '地膜': 'LDPE地膜',
  '工业膜': 'LDPE工业膜',
  '缠绕膜': 'LDPE缠绕膜',
  '高压颗粒': 'LDPE高压再生颗粒',
  '花料': 'LDPE花料',

  // ABS
  '灰白破碎': 'ABS灰白破碎料',
  'ABS破碎': 'ABS灰白破碎料',
  '电瓶壳': 'ABS电瓶壳破碎',
  '电视机壳': 'ABS电视机壳破碎',
  'ABS颗粒': 'ABS再生颗粒',

  // PC
  '车灯': 'PC车灯破碎',
  '水桶': 'PC水桶破碎',
  '光盘': 'PC光盘破碎',
  'PC颗粒': 'PC再生颗粒',

  // PVC
  '管材破碎': 'PVC管材破碎',
  '型材破碎': 'PVC型材破碎',
  '电线皮': 'PVC电线皮',

  // PS
  '泡沫': 'PS泡沫',
  '冰箱料': 'PS冰箱内胆破碎',
  'PS颗粒': 'PS再生颗粒',

  // PA
  '尼龙': 'PA尼龙破碎',
  '丝': 'PA丝料',
  'PA颗粒': 'PA再生颗粒',

  // EVA
  'EVA发泡': 'EVA发泡料',
  '鞋底料': 'EVA鞋底料',
};

// 形态映射
const FORM_MAP = {
  '破碎': '破碎料',
  '破碎料': '破碎料',
  '粉碎': '破碎料',
  '粉碎料': '破碎料',
  '颗粒': '颗粒',
  '颗粒料': '颗粒',
  '瓶砖': '瓶砖',
  '瓶片': '瓶片',
  '膜': '膜料',
  '膜料': '膜料',
  '丝': '丝料',
  '丝料': '丝料',
  '桶': '桶料',
  '桶料': '桶料',
  '块': '块料',
  '块料': '块料',
  '片': '片料',
  '片料': '片料',
  '卷': '卷料',
  '卷料': '卷料',
};

// 品类提取正则
const CATEGORY_PATTERNS = [
  { regex: /\b(PET|pet)\b/i, category: 'PET' },
  { regex: /\b(HDPE|hdpe|低压)\b/i, category: 'HDPE' },
  { regex: /\b(PP|pp|聚丙)\b/i, category: 'PP' },
  { regex: /\b(LDPE|ldpe|高压)\b/i, category: 'LDPE' },
  { regex: /\b(ABS|abs)\b/i, category: 'ABS' },
  { regex: /\b(PC|pc|聚碳)\b/i, category: 'PC' },
  { regex: /\b(PVC|pvc|聚氯)\b/i, category: 'PVC' },
  { regex: /\b(PS|ps|聚苯)\b/i, category: 'PS' },
  { regex: /\b(PA|pa|尼龙|锦纶)\b/i, category: 'PA' },
  { regex: /\bEVA|eva\b/i, category: 'EVA' },
  { regex: /三色|瓶砖|瓶片|长丝|短纤|吸塑|泡泡料|PET不|PET不/i, category: 'PET' },
  { regex: /蓝桶|大桶|小中空|管道|波纹管|日化瓶|牛奶瓶/i, category: 'HDPE' },
  { regex: /白粉碎|杂色粉碎|编织袋|吨袋|保险杠|洗衣机|注塑级|拉丝级/i, category: 'PP' },
  { regex: /大棚膜|地膜|工业膜|缠绕膜|花料/i, category: 'LDPE' },
  { regex: /电瓶壳|电视机壳|灰白破碎/i, category: 'ABS' },
  { regex: /车灯|水桶|光盘.*料/i, category: 'PC' },
];

function normalizeTerm(input) {
  if (!input || typeof input !== 'string') return { original: input || '', normalized: '', category: '', form: '' };

  const trimmed = input.trim();

  // 精确匹配映射表
  if (TERM_MAP[trimmed]) {
    const normalized = TERM_MAP[trimmed];
    const cat = CATEGORY_PATTERNS.find(p => p.regex.test(normalized));
    return { original: trimmed, normalized, category: cat ? cat.category : '', form: '', confidence: 0.95, source: 'map' };
  }

  // 模糊匹配
  for (const [key, value] of Object.entries(TERM_MAP)) {
    if (trimmed.includes(key) || key.includes(trimmed)) {
      const cat = CATEGORY_PATTERNS.find(p => p.regex.test(value));
      return { original: trimmed, normalized: value, category: cat ? cat.category : '', form: '', confidence: 0.7, source: 'fuzzy' };
    }
  }

  // 提取品类
  let category = '';
  for (const p of CATEGORY_PATTERNS) {
    if (p.regex.test(trimmed)) { category = p.category; break; }
  }

  // 提取形态
  let form = '';
  for (const [key, value] of Object.entries(FORM_MAP)) {
    if (trimmed.includes(key)) { form = value; break; }
  }

  return { original: trimmed, normalized: trimmed, category, form, confidence: category ? 0.5 : 0.0, source: 'auto' };
}

// GET /api/terminology/normalize?q=大蓝桶
router.get('/normalize', (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ success: false, error: 'q 参数必填' });
  const result = normalizeTerm(q);
  res.json({ success: true, ...result });
});

// POST /api/terminology/normalize — 批量标准化
router.post('/normalize', (req, res) => {
  const { terms } = req.body;
  if (!Array.isArray(terms) || terms.length === 0) {
    return res.status(400).json({ success: false, error: 'terms 必须是非空数组' });
  }

  const results = terms.map(t => normalizeTerm(typeof t === 'string' ? t : (t.text || t.name || '')));
  res.json({ success: true, results });
});

// GET /api/terminology/map — 完整映射表
router.get('/map', (req, res) => {
  const category = req.query.category || '';
  let map = Object.entries(TERM_MAP).map(([key, value]) => ({ term: key, normalized: value }));
  if (category) {
    map = map.filter(e => e.normalized.toUpperCase().startsWith(category.toUpperCase()));
  }
  res.json({ success: true, map, total: map.length });
});

module.exports = router;
