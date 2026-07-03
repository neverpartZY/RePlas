/**
 * PM2 进程管理配置
 * 再塑通 RePlasMatch v5.0
 *
 * 首次部署：
 *   pm2 start ecosystem.config.js
 *   pm2 save                        # 保存进程列表，重启自动恢复
 *   pm2 startup                     # 设置开机自启
 *
 * 日常运维：
 *   pm2 reload ecosystem.config.js  # 零停机重启（推荐）
 *   pm2 restart zaisutong           # 硬重启
 *   pm2 stop zaisutong              # 停止
 *   pm2 logs zaisutong              # 查看日志
 *   pm2 monit                       # 实时监控面板
 *   pm2 status                      # 查看状态
 */

module.exports = {
  apps: [{
    name: 'zaisutong',
    script: 'server.js',
    cwd: __dirname,

    // 单实例（SQLite 不支持多进程写入，用 fork 模式）
    instances: 1,
    exec_mode: 'fork',

    // 不启用文件监听（手动 deploy）
    watch: false,

    // 内存超过 512MB 自动重启
    max_memory_restart: '512M',

    // 环境变量
    env: {
      NODE_ENV: 'production',
      PORT: 3456,
    },

    // 日志配置
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,

    // 日志轮转：单文件最大 10MB，保留 5 个历史文件（需 pm2-logrotate）
    max_size: '10M',
    retain: 5,

    // 自动重启策略
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,         // 异常重启间隔 5s
    kill_timeout: 10000,         // 优雅关闭等待 10s
    listen_timeout: 30000,       // 启动超时 30s

    // 优雅关闭信号
    kill_retry_time: 3000,
    wait_ready: true,
  }],
};
