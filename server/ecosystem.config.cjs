module.exports = {
  apps: [{
    name: "trading-bot",
    script: "./server.js",
    env: {
      NODE_ENV: "production",
    },
    error_file: "./logs/err.log",
    out_file: "./logs/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    watch: false,
    max_memory_restart: "500M"
  }]
}
