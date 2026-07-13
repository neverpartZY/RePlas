/**
 * 本地文件系统存储适配器（multer diskStorage）
 * 用于本地开发环境
 */

const path = require('path');
const fs = require('fs');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// 确保目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * 保存文件到本地磁盘
 * @param {Buffer} buffer — 文件内容
 * @param {string} filename — 文件名（如 vision-123456-789.jpg）
 * @param {string} mimeType — MIME 类型
 * @returns {Promise<string>} 文件 URL 路径
 */
async function upload(buffer, filename, mimeType) {
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, buffer);
  return `/uploads/${filename}`;
}

/**
 * 删除本地文件
 * @param {string} url — 文件 URL（如 /uploads/vision-xxx.jpg）
 */
async function remove(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  const filename = url.replace('/uploads/', '');
  const filePath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * 获取公开访问 URL
 * @param {string} filename — 文件名
 * @returns {string} URL 路径
 */
function getURL(filename) {
  if (filename.startsWith('/uploads/')) return filename;
  return `/uploads/${filename}`;
}

/**
 * Multer diskStorage 配置
 */
function getMulterStorage() {
  const multer = require('multer');
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      cb(null, `vision-${unique}${ext}`);
    },
  });
}

module.exports = { upload, remove, getURL, getMulterStorage, UPLOAD_DIR };
