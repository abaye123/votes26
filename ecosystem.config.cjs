module.exports = {
  apps: [{
    name: 'votes26',
    script: './server.js',
    node_args: '--enable-source-maps',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 8026,
      HOST: '127.0.0.1'
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    time: true
  }]
};
