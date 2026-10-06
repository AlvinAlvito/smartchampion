// pm2: jalankan dengan `pm2 start ecosystem.config.cjs` dari folder wa-gateway.
// WAJIB 1 instance (fork): dua proses dengan sesi WA yang sama akan saling menendang (connectionReplaced).
module.exports = {
  apps: [
    {
      name: "pelatihan-wa",
      script: "server.mjs",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      max_memory_restart: "350M",
      exp_backoff_restart_delay: 2000,
      env: { NODE_ENV: "production" },
    },
  ],
};
