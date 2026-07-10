// ================================================================
// Email Service — 通用 SMTP（支持 QQ/163/Resend 等）
// ================================================================

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // 优先 Resend（通过 SMTP 网关，国内服务器 SMTP 465 端口可用）
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      secure: true,
      auth: { user: 'resend', pass: resendKey },
    });
    transporter.verify((err) => {
      if (err) console.error('[email] Resend SMTP verify failed:', err.message);
      else console.log('[email] Resend SMTP connected');
    });
    return transporter;
  }

  // 通用 SMTP（QQ/163 等）
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '465');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE !== 'false';

  if (!host || !user || !pass) {
    console.warn('[email] SMTP not configured (set SMTP_HOST/USER/PASS in .env)');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  transporter.verify((err) => {
    if (err) console.error('[email] SMTP verify failed:', err.message);
    else console.log('[email] SMTP connected —', host);
  });

  return transporter;
}

/**
 * 发送邮箱验证码
 * @param {string} to 接收邮箱
 * @param {string} code 6位验证码
 * @param {string} purpose 用途标签 (reset_password / register 等)
 */
async function sendVerificationCode(to, code, purpose) {
  const t = getTransporter();
  if (!t) throw new Error('邮件服务未配置');

  const label = purpose === 'reset_password' ? '密码重置' : '验证';
  const from = process.env.RESEND_FROM || process.env.SMTP_FROM;

  if (!from) throw new Error('发件地址未配置（设置 SMTP_FROM 或 RESEND_FROM）');

  await t.sendMail({
    from,
    to,
    subject: `再塑通 - ${label}验证码`,
    html: `
      <div style="max-width:480px;margin:0 auto;font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:#f8fafc;border-radius:12px;overflow:hidden">
        <div style="background:#22c55e;padding:28px 20px;text-align:center">
          <div style="font-size:22px;font-weight:700;color:#fff">再塑通</div>
          <div style="font-size:14px;color:rgba(255,255,255,.8);margin-top:4px">塑料再生撮合平台</div>
        </div>
        <div style="padding:32px 24px;text-align:center">
          <p style="font-size:15px;color:#334155;margin:0 0 8px">您正在${label}账号密码</p>
          <p style="font-size:14px;color:#64748b;margin:0 0 20px">验证码 5 分钟内有效，请勿泄露</p>
          <div style="background:#fff;border:2px dashed #22c55e;border-radius:10px;padding:16px;display:inline-block">
            <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#22c55e">${code}</span>
          </div>
          <p style="font-size:12px;color:#94a3b8;margin:24px 0 0">如非本人操作，请忽略此邮件</p>
        </div>
        <div style="background:#e2e8f0;padding:12px;text-align:center">
          <span style="font-size:11px;color:#94a3b8">再塑通 | 塑料再生行业智能撮合平台</span>
        </div>
      </div>
    `,
  });
}

module.exports = { sendVerificationCode };
