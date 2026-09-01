/**
 * PM2 process definitions for Midas Learning Cloud.
 *
 * Usage on the VPS:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save
 *   pm2 startup            # generate the systemd unit so PM2 survives reboot
 *
 * Processes
 *   midas-api — the Express/TypeScript API (compiled to backend/dist)
 *
 * frontend/dist is served directly by nginx (see docs/DEPLOYMENT.md), which is
 * faster at static files and handles TLS termination.
 */
module.exports = {
  apps: [
    {
      name: 'midas-api',
      cwd: './backend',
      script: './dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      // Switch to cluster mode once you have verified the app is stateless:
      //   instances: 'max', exec_mode: 'cluster'
      // Sessions are JWT-based and rate limiting is DB/memory backed, so review
      // docs/DEPLOYMENT.md before enabling cluster mode.
      autorestart: true,
      watch: false,
      max_memory_restart: '600M',
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
