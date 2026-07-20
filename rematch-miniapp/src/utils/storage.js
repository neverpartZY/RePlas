/**
 * 本地存储工具函数
 * 对 uni.setStorageSync / getStorageSync 的封装，支持 JSON 序列化
 */

const PREFIX = 'rematch_';

/**
 * 设置存储（自动 JSON 序列化）
 */
function set(key, value) {
  try {
    const k = PREFIX + key;
    const v = typeof value === 'string' ? value : JSON.stringify(value);
    uni.setStorageSync(k, v);
    return true;
  } catch (error) {
    console.error('Storage set error:', error);
    return false;
  }
}

/**
 * 获取存储（自动 JSON 反序列化）
 */
function get(key, defaultValue = null) {
  try {
    const k = PREFIX + key;
    const v = uni.getStorageSync(k);
    if (!v) return defaultValue;
    try {
      return JSON.parse(v);
    } catch (e) {
      return v;
    }
  } catch (error) {
    console.error('Storage get error:', error);
    return defaultValue;
  }
}

/**
 * 删除存储
 */
function remove(key) {
  try {
    const k = PREFIX + key;
    uni.removeStorageSync(k);
    return true;
  } catch (error) {
    console.error('Storage remove error:', error);
    return false;
  }
}

/**
 * 清空所有 rematch_ 开头的存储
 */
function clear() {
  try {
    const info = uni.getStorageInfoSync();
    const keys = info.keys.filter(k => k.startsWith(PREFIX));
    keys.forEach(k => uni.removeStorageSync(k));
    return true;
  } catch (error) {
    console.error('Storage clear error:', error);
    return false;
  }
}

/**
 * 获取所有 rematch_ 开头的键值对
 */
function getAll() {
  try {
    const info = uni.getStorageInfoSync();
    const keys = info.keys.filter(k => k.startsWith(PREFIX));
    const result = {};
    keys.forEach(k => {
      const v = uni.getStorageSync(k);
      try {
        result[k.replace(PREFIX, '')] = JSON.parse(v);
      } catch (e) {
        result[k.replace(PREFIX, '')] = v;
      }
    });
    return result;
  } catch (error) {
    console.error('Storage getAll error:', error);
    return {};
  }
}

/**
 * 获取存储使用情况
 */
function getInfo() {
  try {
    return uni.getStorageInfoSync();
  } catch (error) {
    return { keys: [], currentSize: 0, limitSize: 0 };
  }
}

export default {
  set,
  get,
  remove,
  clear,
  getAll,
  getInfo
};
