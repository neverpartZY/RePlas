/**
 * 存储工厂 — 根据 STORAGE_TYPE 环境变量自动选择本地或 COS
 *
 * 本地开发: STORAGE_TYPE=local (默认，使用本地磁盘)
 * 云托管:    STORAGE_TYPE=cos (使用 CloudBase COS 存储)
 */

const STORAGE_TYPE = (process.env.STORAGE_TYPE || 'local').toLowerCase();

let storage;

if (STORAGE_TYPE === 'cos') {
  console.log('[Storage] Using COS (CloudBase) adapter');
  storage = require('./cos');
} else {
  console.log('[Storage] Using local filesystem adapter');
  storage = require('./local');
}

module.exports = storage;
module.exports.STORAGE_TYPE = STORAGE_TYPE;
