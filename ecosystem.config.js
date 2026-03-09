/**
 * PM2 配置文件
 * 用法: pm2 start ecosystem.config.js
 */
module.exports = {
  apps: [
    {
      name: 'oprcli-prod',
      script: './server.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      // 日志配置
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      // 重启策略
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 1000
    }
  ]
}
