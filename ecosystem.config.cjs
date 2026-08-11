module.exports = {
  apps: [
    {
      name: 'qfnu-meeting-api',
      cwd: '/opt/qfnu-meeting/backend',
      script: 'dist/src/main.js',
      interpreter: '/root/.nvm/versions/node/v20.20.2/bin/node',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '512M',
    },
  ],
};
