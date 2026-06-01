module.exports = {
    apps: [{
      name: 'openstreetwalker',
      script: 'server.js',
      cwd: '/home/labie/TartuWalk/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        PYTHON_BIN: '/home/labie/TartuWalk/backend/venv/bin/python3'
      },
      error_file: '/home/labie/logs/osw-error.log',
      out_file:   '/home/labie/logs/osw-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }]
  };