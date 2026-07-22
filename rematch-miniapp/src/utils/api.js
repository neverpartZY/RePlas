/**
 * 再塑通 小程序 HTTP API 封装 v6
 * 使用 wx.cloud.callContainer 走内网访问云托管
 *
 * 优势：
 *   - 无需配置服务器域名白名单
 *   - 走微信内网，不消耗公网流量
 *   - 天然免疫 DDoS
 *   - 可直接获取 openid 等用户信息
 *
 * 使用方式：
 *   import api from '@/utils/api.js';
 *   const result = await api.login();
 *   const matches = await api.getMatches({ page: 1 });
 */

// ================================================================
// 配置
// ================================================================
const CLOUD_ENV = 'prod-d1glhei0i1a9b8934';
const CLOUD_SERVICE = 'zaisutong';

const TOKEN_KEY = 'rematch_token';
const USER_KEY = 'rematch_user';

// ================================================================
// Token 管理
// ================================================================

function getToken() {
  try {
    return uni.getStorageSync(TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}

function setToken(token) {
  uni.setStorageSync(TOKEN_KEY, token);
}

function removeToken() {
  uni.removeStorageSync(TOKEN_KEY);
}

function hasToken() {
  return !!getToken();
}

// ================================================================
// 通用 HTTP 请求（wx.cloud.callContainer — 内网直连云托管）
// ================================================================

/**
 * 发起 API 请求
 * @param {string} method - GET | POST | PATCH | PUT | DELETE
 * @param {string} path   - API 路径，如 '/api/auth/me'
 * @param {Object} data   - 请求参数（GET 时作为 query，其他方法作为 JSON body）
 * @param {boolean} noAuth - 跳过 token 附加
 * @returns {Promise<Object>} { success, data, error }
 */
function request(method, path, data = {}, noAuth = false) {
  return _doRequest(method, path, data, noAuth, 0);
}

function _doRequest(method, path, data, noAuth, retryCount) {
  return new Promise((resolve) => {
    const header = {};

    if (!noAuth && hasToken()) {
      header['Authorization'] = 'Bearer ' + getToken();
    }

    // callContainer 必须的 header
    header['X-WX-SERVICE'] = CLOUD_SERVICE;

    // 清理 data 中的空值（undefined/null/空字符串）
    const cleanData = {};
    if (data && typeof data === 'object') {
      for (const key of Object.keys(data)) {
        if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
          cleanData[key] = data[key];
        }
      }
    }

    wx.cloud.callContainer({
      config: { env: CLOUD_ENV },
      path: path,
      method: method,
      header: header,
      data: Object.keys(cleanData).length > 0 ? cleanData : undefined,
      timeout: 15000, // callContainer 最大 15s
      success: (res) => {
        let body = res.data;
        if (typeof body === 'string') {
          try { body = JSON.parse(body); } catch (e) { body = {}; }
        }
        if (!body || typeof body !== 'object') body = {};

        const statusCode = res.statusCode || 200;
        console.log('[API]', method, path, '\u2192', statusCode, 'keys:', Object.keys(body).join(','));

        if (statusCode === 401) {
          removeToken();
          uni.removeStorageSync(USER_KEY);
          uni.$emit && uni.$emit('auth_expired');
          return resolve({ success: false, error: body.error || '登录已过期，请重新登录', _code: 401 });
        }

        if (statusCode >= 200 && statusCode < 300) {
          resolve(body);
        } else {
          resolve({ success: false, error: body.error || '请求失败 (' + statusCode + ')', _code: statusCode, _path: path });
        }
      },
      fail: (err) => {
        const errMsg = (err && err.errMsg) ? err.errMsg : JSON.stringify(err).substring(0, 100);
        console.error('[API] callContainer fail:', method, path, errMsg);

        // 自动重试一次（1.5s 后）
        if (retryCount < 1) {
          console.log('[API] 自动重试 (' + (retryCount + 1) + '/1)...');
          setTimeout(() => {
            _doRequest(method, path, data, noAuth, retryCount + 1)
              .then(resolve);
          }, 1500);
          return;
        }

        // 提供友好的错误信息，包含 errMsg 用于诊断
        resolve({ success: false, error: '网络异常: ' + errMsg, _code: -1, _path: path });
      },
    });
  });
}

// ================================================================
// 认证 API
// ================================================================

/**
 * 微信小程序登录
 * 调用 wx.login 获取 code，发送到后端换取 JWT
 * @param {Object} userInfo - 可选，{ nickname, avatarUrl }
 */
async function login(userInfo = {}) {
  return new Promise((resolve) => {
    wx.login({
      success: async (loginRes) => {
        if (!loginRes.code) {
          return resolve({ success: false, error: '获取微信登录凭证失败' });
        }

        try {
          const result = await request('POST', '/api/auth/wechat-login', {
            code: loginRes.code,
            nickname: userInfo.nickname || '',
            avatarUrl: userInfo.avatarUrl || '',
          }, true); // noAuth — 此时还没有 token

          if (result.success && result.token) {
            setToken(result.token);
            if (result.user) {
              saveLocalUser(result.user);
            }
          }
          resolve(result);
        } catch (err) {
          resolve({ success: false, error: err.error || '登录失败' });
        }
      },
      fail: (err) => {
        console.error('[API] wx.login 失败:', err);
        resolve({ success: false, error: '微信登录失败，请重试' });
      },
    });
  });
}

function saveLocalUser(user) {
  try {
    uni.setStorageSync(USER_KEY, JSON.stringify(user));
  } catch (e) { /* ignore */ }
}

function getLocalUser() {
  try {
    const data = uni.getStorageSync(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

/**
 * 获取当前用户信息（需已登录）
 */
async function getMe() {
  try {
    const result = await request('GET', '/api/auth/me');
    if (result.success && result.user) {
      saveLocalUser(result.user);
    }
    return result;
  } catch (e) {
    return { success: false, error: e.error };
  }
}

/**
 * 更新个人信息（手机号/邮箱/企业/地区）
 */
async function updateProfile(fields) {
  try {
    const result = await request('PATCH', '/api/auth/profile', fields);
    if (result.success && result.user) {
      saveLocalUser(result.user);
    }
    return result;
  } catch (e) {
    return { success: false, error: e.error };
  }
}

// ================================================================
// 匹配 API
// ================================================================

/**
 * 获取当前用户的匹配列表
 * 后端格式 → 小程序格式的转换
 */
async function getMatches(params = {}) {
  const { page = 1, pageSize = 50, scoreMin, scoreMax } = params;

  const localUser = getLocalUser();
  if (!localUser || !localUser.id) {
    return { success: false, data: { matches: [], total: 0, page: 1, pageSize: 50, hasMore: false } };
  }

  try {
    const result = await request('GET', `/api/matches/${localUser.id}`);
    if (!result.success) return result;

    // 转换为小程序格式
    let matches = (result.matches || []).map(transformMatch);

    // 客户端筛选
    if (scoreMin !== undefined) {
      matches = matches.filter(m => m.score >= scoreMin);
    }
    if (scoreMax !== undefined) {
      matches = matches.filter(m => m.score <= scoreMax);
    }

    matches.sort((a, b) => b.score - a.score);
    const start = (page - 1) * pageSize;
    const pageData = matches.slice(start, start + pageSize);

    return {
      success: true,
      data: {
        matches: pageData,
        total: matches.length,
        page,
        pageSize,
        hasMore: start + pageSize < matches.length,
      },
    };
  } catch (e) {
    console.error('[API] getMatches error:', e);
    return { success: false, data: { matches: [], total: 0 } };
  }
}

/** 后端匹配 → 小程序匹配格式 */
function transformMatch(m) {
  return {
    _id: 'mat_' + (m.id || Math.random()),
    supplyId: m.supply_id,
    demandId: m.demand_id,
    score: m.score || 0,
    level: m.score >= 85 ? 'strong' : (m.score >= 70 ? 'recommend' : 'consider'),
    supply: {
      _id: m.supply_id,
      category: m.supply_material || '',
      form: m.supply_form || '',
      quantity: m.supply_quantity || 0,
      price: m.supply_price || 0,
      location: m.supply_location || '',
    },
    demand: {
      _id: m.demand_id,
      category: m.demand_material || '',
      role: m.demand_user_role || '',
      company: m.demand_user_name || '',
      monthlyVolume: m.demand_quantity || 0,
      budget: m.demand_price || 0,
      location: m.demand_location || '',
    },
    status: m.status || 'pending',
    source: '本平台',
    createdAt: m.created_at || new Date().toISOString(),
  };
}

// ================================================================
// 价格 API
// ================================================================

/**
 * 获取行情价格
 * 后端格式 → 小程序格式的转换
 */
async function getPrices(params = {}) {
  const query = {};
  if (params.category) query.category = params.category;
  try {
    const result = await request('GET', '/api/prices', query);
    if (!result.success) return result;

    // 转换为小程序格式
    const prices = (result.prices || []).map(transformPrice);

    return {
      success: true,
      data: { prices, total: prices.length, isDefault: prices.length === 0 },
    };
  } catch (e) {
    console.error('[API] getPrices error:', e);
    // 回退：返回默认价格
    return getDefaultPrices(params.category);
  }
}

/** 后端价格 → 小程序价格格式 */
function transformPrice(p) {
  const changePct = p.change_pct || 0;
  const change = changePct > 0
    ? Math.round(p.price_avg * changePct / 100)
    : Math.round(p.price_avg * Math.abs(changePct) / 100) * (changePct < 0 ? -1 : 0);

  return {
    name: p.material || p.category,
    category: p.category,
    currentPrice: p.price_avg,
    previousPrice: p.price_avg - change,
    unit: '元/吨',
    change,
    changePercent: changePct,
  };
}

/** 默认价格（无后端数据时回退） */
function getDefaultPrices(category) {
  const allPrices = [
    { name: 'PET瓶片（蓝白）', category: 'PET', currentPrice: 5800, previousPrice: 5700, unit: '元/吨', change: 100, changePercent: 1.75 },
    { name: 'PET瓶片（绿色）', category: 'PET', currentPrice: 4800, previousPrice: 4850, unit: '元/吨', change: -50, changePercent: -1.03 },
    { name: 'HDPE破碎料', category: 'HDPE', currentPrice: 6200, previousPrice: 6100, unit: '元/吨', change: 100, changePercent: 1.64 },
    { name: 'HDPE颗粒（一级）', category: 'HDPE', currentPrice: 8500, previousPrice: 8400, unit: '元/吨', change: 100, changePercent: 1.19 },
    { name: 'PP编织袋颗粒', category: 'PP', currentPrice: 4500, previousPrice: 4550, unit: '元/吨', change: -50, changePercent: -1.10 },
    { name: 'PP注塑颗粒', category: 'PP', currentPrice: 7200, previousPrice: 7200, unit: '元/吨', change: 0, changePercent: 0 },
    { name: 'LDPE膜料', category: 'LDPE', currentPrice: 5300, previousPrice: 5200, unit: '元/吨', change: 100, changePercent: 1.92 },
    { name: 'ABS破碎料', category: 'ABS', currentPrice: 9800, previousPrice: 10000, unit: '元/吨', change: -200, changePercent: -2.00 },
    { name: 'PS颗粒', category: 'PS', currentPrice: 6800, previousPrice: 6700, unit: '元/吨', change: 100, changePercent: 1.49 },
    { name: 'PC透明料', category: 'PC', currentPrice: 13500, previousPrice: 13200, unit: '元/吨', change: 300, changePercent: 2.27 },
    { name: 'PA6颗粒', category: 'PA', currentPrice: 14500, previousPrice: 14300, unit: '元/吨', change: 200, changePercent: 1.40 },
    { name: 'PVC废料', category: 'PVC', currentPrice: 3200, previousPrice: 3250, unit: '元/吨', change: -50, changePercent: -1.54 },
  ];

  if (category) {
    const filtered = allPrices.filter(p => p.category === category);
    return { success: true, data: { prices: filtered, total: filtered.length, isDefault: true } };
  }
  return { success: true, data: { prices: allPrices, total: allPrices.length, isDefault: true } };
}

// ================================================================
// 发布 API
// ================================================================

/**
 * 发布供应信息到后端
 */
async function publishSupply(data) {
  const localUser = getLocalUser();
  if (!localUser || !localUser.id) {
    return { success: false, error: '请先登录' };
  }

  return request('POST', '/api/listings', {
    userId: localUser.id,
    type: 'supply',
    wasteOrRecycled: data.wasteOrRecycled || '废塑料',
    material: data.category,
    form: data.form || '',
    quantity: data.quantity || 0,
    price: data.price || 0,
    location: data.location || '',
    specs: data.specs || '',
    notes: data.notes || '',
  });
}

/**
 * 发布需求信息到后端
 */
async function publishDemand(data) {
  const localUser = getLocalUser();
  if (!localUser || !localUser.id) {
    return { success: false, error: '请先登录' };
  }

  return request('POST', '/api/listings', {
    userId: localUser.id,
    type: 'demand',
    wasteOrRecycled: data.wasteOrRecycled || '废塑料',
    material: data.category,
    form: data.form || '',
    quantity: data.monthlyVolume || 0,
    price: data.budget || 0,
    location: data.location || '',
    specs: data.techSpecs || '',
    notes: data.application || '',
  });
}

/**
 * 获取全网货源列表（从云托管后端）
 * 用于首页展示最新供求挂牌
 */
async function getListings(params = {}) {
  const { page = 1, limit = 20 } = params;
  return request('GET', '/api/listings', { page, limit }).catch(err => {
    console.error('[API] getListings 异常:', err);
    return { success: false, listings: [], error: err.error || '请求失败', _code: err.code || -99 };
  });
}

/**
 * 获取全网外部货源列表（ZZ91/变宝网等爬取数据）
 */
async function getExternalListings(params = {}) {
  const { page = 1, limit = 20 } = params;
  return request('GET', '/api/external/listings', { page, limit }).catch(err => {
    console.error('[API] getExternalListings 异常:', err);
    return { success: false, listings: [], error: err.error || '请求失败', _code: err.code || -99 };
  });
}

// ================================================================
// AI 解析 API
// ================================================================

/**
 * 调用后端 DeepSeek AI 解析自然语言输入
 * 失败时返回 { success: false, aiAvailable: false }，前端应回退到本地规则引擎
 *
 * @param {string} text - 用户输入的自然语言
 * @param {string} userRole - 用户角色 'supplier' | 'buyer' | ''
 * @returns {Object} { success, message, result, aiAvailable }
 */
async function parseAI(text, userRole = '') {
  try {
    const result = await request('POST', '/api/ai/parse', { text, userRole });
    return result;
  } catch (e) {
    console.error('[API] parseAI error:', e);
    return {
      success: false,
      message: 'AI 服务连接失败',
      result: null,
      aiAvailable: false,
    };
  }
}

/**
 * 检查 AI 服务是否可用
 */
async function checkAIStatus() {
  try {
    const result = await request('GET', '/api/ai/status');
    return result;
  } catch (e) {
    return { available: false };
  }
}

// ================================================================
// 通知 & 消息
// ================================================================

/**
 * 获取通知列表
 * @param {Object} params - { page, limit }
 * @returns {Object} { success, notifications, total, unread, page, limit }
 */
async function getNotifications(params = {}) {
  const { page = 1, limit = 20 } = params;
  const result = await request('GET', '/api/notifications', { page, limit });
  return result;
}

/**
 * 标记单条通知已读
 * @param {number} id - 通知 ID
 */
async function markNotificationRead(id) {
  const result = await request('PATCH', `/api/notifications/${id}/read`, {});
  return result;
}

/**
 * 全部标记已读
 */
async function markAllNotificationsRead() {
  const result = await request('PATCH', '/api/notifications/read-all', {});
  return result;
}

/**
 * 获取未读消息+通知数量
 * @returns {Object} { unreadMessages, unreadNotifications }
 */
async function getUnreadCount() {
  const result = await request('GET', '/api/messages/unread/count');
  return result;
}

// ================================================================
// 举报
// ================================================================

/**
 * 提交举报
 * @param {Object} data - { target_type: 'listing'|'user'|'message', target_id, reason, detail }
 */
async function submitReport(data) {
  const result = await request('POST', '/api/reports', data);
  return result;
}

// ================================================================
// 导出
// ================================================================

export default {
  // 基础方法
  request,
  getToken,
  setToken,
  removeToken,
  hasToken,

  // 认证
  login,
  getMe,
  updateProfile,
  getLocalUser,
  saveLocalUser,

  // 业务
  getMatches,
  getPrices,
  getListings,
  getExternalListings,
  publishSupply,
  publishDemand,

  // AI
  parseAI,
  checkAIStatus,

  // 通知
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getUnreadCount,

  // 举报
  submitReport,
};
