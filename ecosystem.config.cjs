module.exports = {
  apps: [{
    name: 'assemble',
    script: 'server/index.ts',
    interpreter: 'node',
    node_args: '--import tsx',
    cwd: __dirname,
    env: { NODE_ENV: 'production', PORT: 3000 },
    max_restarts: 50,
  }],
};
