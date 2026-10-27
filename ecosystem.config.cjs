// Konfigurasi PM2 untuk PPPoE Manager.
// Semua variabel (JWT_SECRET, ENCRYPTION_KEY, DB_*, PORT) dibaca dari file .env
// oleh server.ts, jadi tidak perlu diisi lagi di sini.
module.exports = {
  apps: [
    {
      name: 'pppoe-manager',
      script: 'server.ts',
      interpreter: './node_modules/.bin/tsx',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
