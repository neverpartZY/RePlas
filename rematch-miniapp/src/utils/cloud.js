/**
 * 云函数调用封装
 * 开发模式下回退到 localStorage，生产模式下调用 wx.cloud.callFunction
 */

const isProduction = typeof wx !== 'undefined' && wx.cloud && true;

/**
 * 初始化云开发环境
 */
function initCloud() {
  if (typeof wx !== 'undefined' && wx.cloud) {
    try {
      wx.cloud.init({
        env: 'rematch-prod',
        traceUser: true
      });
    } catch (e) {
      console.warn('云开发初始化失败，使用本地存储模式:', e);
    }
  }
}

/**
 * 调用云函数（带本地回退）
 */
async function callFunction(name, data = {}) {
  if (isProduction && wx.cloud) {
    try {
      const result = await wx.cloud.callFunction({
        name: name,
        data: data
      });
      return result.result;
    } catch (error) {
      console.error(`云函数 ${name} 调用失败:`, error);
      throw error;
    }
  } else {
    // 开发模式：使用本地存储模拟
    return mockCallFunction(name, data);
  }
}

/**
 * 本地模拟云函数调用
 */
function mockCallFunction(name, data) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const result = getMockResult(name, data);
      resolve(result);
    }, 300);
  });
}

/**
 * 获取模拟数据
 */
function getMockResult(name, data) {
  switch (name) {
    case 'login':
      return {
        success: true,
        message: '登录成功（本地模式）',
        data: {
          user: getOrCreateLocalUser(),
          hasProfile: true
        }
      };

    case 'publishSupply':
      return publishSupplyLocal(data);

    case 'publishDemand':
      return publishDemandLocal(data);

    case 'getMatches':
      return getMatchesLocal(data);

    case 'getPrices':
      return getPricesLocal(data);

    default:
      return {
        success: false,
        message: `未知云函数: ${name}`
      };
  }
}

/**
 * 获取或创建本地用户
 */
function getOrCreateLocalUser() {
  try {
    const user = uni.getStorageSync('rematch_user');
    if (user) return JSON.parse(user);
  } catch (e) { /* ignore */ }

  const newUser = {
    _id: 'local_' + Date.now(),
    openid: 'local_user',
    nickname: '测试用户',
    avatarUrl: '',
    role: '回收商',
    company: '测试回收企业',
    location: '广东省深圳市',
    phone: '138****0000',
    stats: { published: 0, matched: 0, deals: 0 },
    createdAt: new Date().toISOString()
  };
  uni.setStorageSync('rematch_user', JSON.stringify(newUser));
  return newUser;
}

/**
 * 本地发布供应
 */
function publishSupplyLocal(data) {
  const supplies = getLocalList('supplies');
  const supply = {
    _id: 'sup_' + Date.now(),
    userId: 'local_user',
    category: data.category,
    form: data.form,
    quantity: parseFloat(data.quantity),
    price: parseFloat(data.price),
    location: data.location,
    specs: data.specs || '',
    notes: data.notes || '',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  supplies.push(supply);
  saveLocalList('supplies', supplies);

  // 自动匹配
  const demands = getLocalList('demands');
  const matches = [];
  for (const demand of demands) {
    const score = computeMatchScore(supply, demand);
    if (score > 0) {
      const match = {
        _id: 'mat_' + Date.now() + '_' + matches.length,
        supplyId: supply._id,
        demandId: demand._id,
        score: score,
        level: score >= 85 ? 'strong' : (score >= 70 ? 'recommend' : 'consider'),
        supply: { category: supply.category, form: supply.form, quantity: supply.quantity, price: supply.price, location: supply.location, specs: supply.specs, notes: supply.notes },
        demand: { category: demand.category, role: demand.role, company: demand.company, monthlyVolume: demand.monthlyVolume, budget: demand.budget, location: demand.location, application: demand.application, techSpecs: demand.techSpecs },
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      matches.push(match);
    }
  }
  const allMatches = getLocalList('matches');
  saveLocalList('matches', allMatches.concat(matches));

  updateLocalUserStats();

  return {
    success: true,
    message: '供应信息发布成功（本地模式）',
    data: { supply, matches, matchCount: matches.length }
  };
}

/**
 * 本地发布需求
 */
function publishDemandLocal(data) {
  const demands = getLocalList('demands');
  const demand = {
    _id: 'dem_' + Date.now(),
    userId: 'local_user',
    category: data.category,
    role: data.role,
    company: data.company,
    techSpecs: data.techSpecs || '',
    form: data.techSpecsForm || '',
    monthlyVolume: parseFloat(data.monthlyVolume),
    budget: parseFloat(data.budget),
    application: data.application || '',
    location: data.location,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  demands.push(demand);
  saveLocalList('demands', demands);

  const supplies = getLocalList('supplies');
  const matches = [];
  for (const supply of supplies) {
    const score = computeMatchScore(supply, demand);
    if (score > 0) {
      const match = {
        _id: 'mat_' + Date.now() + '_' + matches.length,
        supplyId: supply._id,
        demandId: demand._id,
        score: score,
        level: score >= 85 ? 'strong' : (score >= 70 ? 'recommend' : 'consider'),
        supply: { category: supply.category, form: supply.form, quantity: supply.quantity, price: supply.price, location: supply.location, specs: supply.specs, notes: supply.notes },
        demand: { category: demand.category, role: demand.role, company: demand.company, monthlyVolume: demand.monthlyVolume, budget: demand.budget, location: demand.location, application: demand.application, techSpecs: demand.techSpecs },
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      matches.push(match);
    }
  }
  const allMatches = getLocalList('matches');
  saveLocalList('matches', allMatches.concat(matches));

  updateLocalUserStats();

  return {
    success: true,
    message: '需求信息发布成功（本地模式）',
    data: { demand, matches, matchCount: matches.length }
  };
}

/**
 * 本地获取匹配
 */
function getMatchesLocal(data) {
  let matches = getLocalList('matches');
  if (data.scoreMin !== undefined) {
    matches = matches.filter(m => m.score >= data.scoreMin);
  }
  if (data.scoreMax !== undefined) {
    matches = matches.filter(m => m.score <= data.scoreMax);
  }
  matches.sort((a, b) => b.score - a.score);
  const start = ((data.page || 1) - 1) * (data.pageSize || 20);
  const pageData = matches.slice(start, start + (data.pageSize || 20));

  return {
    success: true,
    data: {
      matches: pageData,
      total: matches.length,
      page: data.page || 1,
      pageSize: data.pageSize || 20,
      hasMore: start + (data.pageSize || 20) < matches.length
    }
  };
}

/**
 * 本地获取价格
 */
function getPricesLocal(data) {
  const allPrices = [
    { category: 'PET瓶片', name: 'PET瓶片（蓝白）', currentPrice: 5800, previousPrice: 5700, unit: '元/吨', change: 100, changePercent: 1.75 },
    { category: 'PET瓶片', name: 'PET瓶片（绿色）', currentPrice: 4800, previousPrice: 4850, unit: '元/吨', change: -50, changePercent: -1.03 },
    { category: 'HDPE', name: 'HDPE破碎料', currentPrice: 6200, previousPrice: 6100, unit: '元/吨', change: 100, changePercent: 1.64 },
    { category: 'HDPE', name: 'HDPE颗粒（一级）', currentPrice: 8500, previousPrice: 8400, unit: '元/吨', change: 100, changePercent: 1.19 },
    { category: 'PP', name: 'PP编织袋颗粒', currentPrice: 4500, previousPrice: 4550, unit: '元/吨', change: -50, changePercent: -1.10 },
    { category: 'PP', name: 'PP注塑颗粒', currentPrice: 7200, previousPrice: 7200, unit: '元/吨', change: 0, changePercent: 0 },
    { category: 'LDPE', name: 'LDPE膜料', currentPrice: 5300, previousPrice: 5200, unit: '元/吨', change: 100, changePercent: 1.92 },
    { category: 'ABS', name: 'ABS破碎料', currentPrice: 9800, previousPrice: 10000, unit: '元/吨', change: -200, changePercent: -2.00 },
    { category: 'PS', name: 'PS颗粒', currentPrice: 6800, previousPrice: 6700, unit: '元/吨', change: 100, changePercent: 1.49 },
    { category: 'PC', name: 'PC透明料', currentPrice: 13500, previousPrice: 13200, unit: '元/吨', change: 300, changePercent: 2.27 },
    { category: 'PA', name: 'PA6颗粒', currentPrice: 14500, previousPrice: 14300, unit: '元/吨', change: 200, changePercent: 1.40 },
    { category: 'PVC', name: 'PVC废料', currentPrice: 3200, previousPrice: 3250, unit: '元/吨', change: -50, changePercent: -1.54 }
  ];
  let result = allPrices;
  if (data.category) {
    result = allPrices.filter(p => p.category === data.category);
  }
  return {
    success: true,
    data: { prices: result, total: result.length, isDefault: true }
  };
}

/**
 * 匹配算法（本地版，与云函数逻辑一致）
 */
function computeMatchScore(supply, demand) {
  let score = 0;
  if (supply.category !== demand.category) return 0;
  score += 50;

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
  if (supplyForms.includes(demandForm) || demandForm === '' || supply.form === demandForm) {
    score += 15;
  } else {
    score += 5;
  }

  if (supply.location && demand.location) {
    const supplyProv = supply.location.replace(/省.*/, '').replace(/市.*/, '');
    const demandProv = demand.location.replace(/省.*/, '').replace(/市.*/, '');
    if (supply.location === demand.location) score += 15;
    else if (supplyProv === demandProv) score += 10;
    else score += 5;
  } else {
    score += 5;
  }

  if (supply.price && demand.budget) {
    const ratio = Math.max(supply.price, demand.budget) / Math.min(supply.price, demand.budget);
    if (ratio <= 1.05) score += 10;
    else if (ratio <= 1.15) score += 7;
    else if (ratio <= 1.3) score += 4;
    else score += 1;
  } else {
    score += 5;
  }

  if (supply.quantity && demand.monthlyVolume) {
    const ratio = Math.max(supply.quantity, demand.monthlyVolume) / Math.min(supply.quantity, demand.monthlyVolume);
    if (ratio <= 1.2) score += 10;
    else if (ratio <= 2) score += 7;
    else if (ratio <= 5) score += 4;
    else score += 1;
  } else {
    score += 5;
  }

  return Math.min(score, 100);
}

/**
 * 本地列表操作辅助
 */
function getLocalList(key) {
  try {
    const data = uni.getStorageSync('rematch_' + key);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalList(key, list) {
  uni.setStorageSync('rematch_' + key, JSON.stringify(list));
}

function updateLocalUserStats() {
  try {
    const user = JSON.parse(uni.getStorageSync('rematch_user'));
    const supplies = getLocalList('supplies');
    const matches = getLocalList('matches');
    user.stats = {
      published: supplies.length,
      matched: matches.length,
      deals: matches.filter(m => m.status === 'accepted').length
    };
    uni.setStorageSync('rematch_user', JSON.stringify(user));
  } catch (e) { /* ignore */ }
}

export {
  initCloud,
  callFunction,
  computeMatchScore
};
