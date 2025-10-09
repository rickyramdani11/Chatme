module.exports = {
  apps: [
    {
      name: "api-server",
      script: "server/index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1500M",
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 4000,
      env: {
        NODE_ENV: "production",
        PORT: 5000
      },
      error_file: "./logs/api-server-error.log",
      out_file: "./logs/api-server-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true
    },
    {
      name: "gateway",
      script: "server/socket-gateway.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1500M",
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 4000,
      env: {
        NODE_ENV: "production",
        GATEWAY_PORT: 8000
      },
      error_file: "./logs/gateway-error.log",
      out_file: "./logs/gateway-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true
    }
  ]
};
