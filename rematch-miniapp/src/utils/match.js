/**
 * 废塑料供需匹配算法
 * 与云函数版本逻辑完全一致
 */

/**
 * 计算供应与需求的匹配分数
 * @param {Object} supply - 供应数据
 * @param {Object} demand - 需求数据
 * @returns {number} 匹配分数 (0-100)
 */
export function computeMatchScore(supply, demand) {
  let score = 0;

  // 1. 品类匹配 (50分) - 必须匹配，否则直接返回0
  if (supply.category !== demand.category) {
    return 0;
  }
  score += 50;

  // 2. 形态兼容性 (15分)
  const formCompat = {
    '瓶片': ['瓶片', '颗粒', '破碎料'],
    '颗粒': ['颗粒', '瓶片', '破碎料'],
    '破碎料': ['破碎料', '瓶片', '颗粒'],
    '废塑料': ['废塑料', '瓶片', '颗粒', '破碎料'],
    '膜': ['膜', '废塑料'],
    '注塑料': ['注塑料', '颗粒'],
    '工程塑料': ['工程塑料', '颗粒', '破碎料']
  };
  const supplyForms = formCompat[supply.form] || [supply.form];
  const demandForm = demand.form || demand.techSpecsForm || '';
  if (supplyForms.includes(demandForm) || demandForm === '' || supply.form === demandForm) {
    score += 15;
  } else {
    score += 5; // 形态不同但有品类匹配，给基础分
  }

  // 3. 地理位置匹配 (15分)
  if (supply.location && demand.location) {
    const supplyProv = extractProvince(supply.location);
    const demandProv = extractProvince(demand.location);
    if (supply.location === demand.location) {
      score += 15; // 同城
    } else if (supplyProv === demandProv) {
      score += 10; // 同省
    } else {
      score += 5;  // 跨省
    }
  } else {
    score += 5; // 缺少位置信息
  }

  // 4. 价格兼容性 (10分)
  if (supply.price && demand.budget) {
    const ratio = Math.max(supply.price, demand.budget) / Math.min(supply.price, demand.budget);
    if (ratio <= 1.05) {
      score += 10; // 价格非常接近
    } else if (ratio <= 1.15) {
      score += 7;  // 价格偏差较小
    } else if (ratio <= 1.3) {
      score += 4;  // 价格有一定偏差
    } else {
      score += 1;  // 价格差异较大
    }
  } else {
    score += 5; // 缺少价格信息
  }

  // 5. 数量兼容性 (10分)
  if (supply.quantity && demand.monthlyVolume) {
    const ratio = Math.max(supply.quantity, demand.monthlyVolume) / Math.min(supply.quantity, demand.monthlyVolume);
    if (ratio <= 1.2) {
      score += 10; // 供需数量匹配度高
    } else if (ratio <= 2) {
      score += 7;  // 数量偏差可接受
    } else if (ratio <= 5) {
      score += 4;  // 数量有较大偏差
    } else {
      score += 1;  // 数量差异很大
    }
  } else {
    score += 5; // 缺少数量信息
  }

  return Math.min(score, 100);
}

/**
 * 从地址中提取省份
 */
export function extractProvince(location) {
  if (!location) return '';
  // 匹配 "XX省" 或 "XX市" 模式
  const provMatch = location.match(/^(.+?)[省市]/);
  if (provMatch) return provMatch[1];
  // 直辖市
  if (location.includes('北京') || location.includes('上海') || 
      location.includes('天津') || location.includes('重庆')) {
    return location.substring(0, 2);
  }
  return location.substring(0, 2);
}

/**
 * 获取匹配等级
 */
export function getMatchLevel(score) {
  if (score >= 85) return { level: 'strong', label: '强烈推荐', color: '#07C160' };
  if (score >= 70) return { level: 'recommend', label: '推荐', color: '#1677FF' };
  if (score >= 50) return { level: 'consider', label: '可考虑', color: '#FF9500' };
  return { level: 'low', label: '待观察', color: '#CCCCCC' };
}

/**
 * 五维度打分明细
 */
export function getScoreBreakdown(supply, demand) {
  const breakdown = [
    {
      name: '品类匹配',
      score: supply.category === demand.category ? 50 : 0,
      max: 50,
      icon: '📦'
    },
    {
      name: '形态兼容',
      score: 0,
      max: 15,
      icon: '🔧'
    },
    {
      name: '地理位置',
      score: 0,
      max: 15,
      icon: '📍'
    },
    {
      name: '价格兼容',
      score: 0,
      max: 10,
      icon: '💰'
    },
    {
      name: '数量匹配',
      score: 0,
      max: 10,
      icon: '📊'
    }
  ];

  if (supply.category !== demand.category) return breakdown;

  // 形态
  const formCompat = {
    '瓶片': ['瓶片', '颗粒', '破碎料'],
    '颗粒': ['颗粒', '瓶片', '破碎料'],
    '破碎料': ['破碎料', '瓶片', '颗粒'],
    '废塑料': ['废塑料', '瓶片', '颗粒', '破碎料'],
    '膜': ['膜', '废塑料'],
    '注塑料': ['注塑料', '颗粒'],
    '工程塑料': ['工程塑料', '颗粒', '破碎料']
  };
  const demandForm = demand.form || demand.techSpecsForm || '';
  const supplyForms = formCompat[supply.form] || [supply.form];
  breakdown[1].score = supplyForms.includes(demandForm) || demandForm === '' || supply.form === demandForm ? 15 : 5;

  // 地理位置
  if (supply.location && demand.location) {
    const supplyProv = extractProvince(supply.location);
    const demandProv = extractProvince(demand.location);
    if (supply.location === demand.location) breakdown[2].score = 15;
    else if (supplyProv === demandProv) breakdown[2].score = 10;
    else breakdown[2].score = 5;
  } else {
    breakdown[2].score = 5;
  }

  // 价格
  if (supply.price && demand.budget) {
    const ratio = Math.max(supply.price, demand.budget) / Math.min(supply.price, demand.budget);
    if (ratio <= 1.05) breakdown[3].score = 10;
    else if (ratio <= 1.15) breakdown[3].score = 7;
    else if (ratio <= 1.3) breakdown[3].score = 4;
    else breakdown[3].score = 1;
  } else {
    breakdown[3].score = 5;
  }

  // 数量
  if (supply.quantity && demand.monthlyVolume) {
    const ratio = Math.max(supply.quantity, demand.monthlyVolume) / Math.min(supply.quantity, demand.monthlyVolume);
    if (ratio <= 1.2) breakdown[4].score = 10;
    else if (ratio <= 2) breakdown[4].score = 7;
    else if (ratio <= 5) breakdown[4].score = 4;
    else breakdown[4].score = 1;
  } else {
    breakdown[4].score = 5;
  }

  return breakdown;
}

export default {
  computeMatchScore,
  extractProvince,
  getMatchLevel,
  getScoreBreakdown
};
