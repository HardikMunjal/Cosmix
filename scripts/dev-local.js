#!/usr/bin/env node

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const useShell = process.platform === 'win32';
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const installMissing = !args.has('--no-install');

const optionalServiceNames = new Set(['wellness-service']);

const backendServices = [
  {
    name: 'api-gateway',
    cwd: path.join(repoRoot, 'apps', 'api-gateway'),
    port: 3000,
    command: [npmCommand, ['run', 'dev']],
  },
  {
    name: 'auth-service',
    cwd: path.join(repoRoot, 'services', 'auth-service'),
    port: 3001,
    command: [npmCommand, ['run', 'dev']],
  },
  {
    name: 'chat-service',
    cwd: path.join(repoRoot, 'services', 'chat-service'),
    port: 3002,
    command: [npmCommand, ['run', 'dev']],
  },
  {
    name: 'user-service',
    cwd: path.join(repoRoot, 'services', 'user-service'),
    port: 3003,
    command: [npmCommand, ['run', 'start:dev']],
  },
  {
    name: 'wellness-service',
    cwd: path.join(repoRoot, 'services', 'wellness-service'),
    port: 3004,
    command: [npmCommand, ['run', 'dev']],
  },
  {
    name: 'notification-service',
    cwd: path.join(repoRoot, 'services', 'notification-service'),
    port: 3006,
    command: [npmCommand, ['run', 'dev']],
  },
  {
    name: 'post-service',
    cwd: path.join(repoRoot, 'services', 'post-service'),
    port: 3007,
    command: [npmCommand, ['run', 'dev']],
  },
];

const webService = {
  name: 'web',
  cwd: path.join(repoRoot, 'apps', 'web'),
  port: 3005,
  command: [npmCommand, ['run', 'dev']],
};

const children = [];
let shuttingDown = false;

function stripWrappingQuotes(value) {
  if (!value) return value;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function loadEnvFile(filePath, targetEnv) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(trimmed.slice(separatorIndex + 1).trim());
    if (!key || Object.prototype.hasOwnProperty.call(targetEnv, key)) {
      continue;
    }
    targetEnv[key] = value;
  }

  return true;
}

function buildServiceEnv() {
  const serviceEnv = { ...process.env };
  const loadedFiles = [];
  const candidateFiles = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, 'infra', '.env'),
    path.join(repoRoot, 'apps', 'web', '.env.local'),
  ];

  for (const filePath of candidateFiles) {
    if (loadEnvFile(filePath, serviceEnv)) {
      loadedFiles.push(path.relative(repoRoot, filePath));
    }
  }

  if (!serviceEnv.DATABASE_URL) {
    const pgUser = serviceEnv.POSTGRES_USER || serviceEnv.DB_USER || '';
    const pgPassword = serviceEnv.POSTGRES_PASSWORD || serviceEnv.DB_PASSWORD || '';
    const pgDb = serviceEnv.POSTGRES_DB || serviceEnv.DB_NAME || serviceEnv.DATABASE_NAME || '';
    const pgHost = serviceEnv.POSTGRES_HOST || serviceEnv.DATABASE_HOST || serviceEnv.RDS_ENDPOINT || serviceEnv.POSTGRES_ENDPOINT || serviceEnv.DB_HOST || '';
    const pgPort = serviceEnv.POSTGRES_PORT || serviceEnv.DB_PORT || '5432';

    if (pgUser && pgPassword && pgDb && pgHost) {
      const ssl = pgHost.includes('rds.amazonaws.com') || serviceEnv.PGSSLMODE === 'require' || serviceEnv.USE_SSL === 'true';
      serviceEnv.DATABASE_URL = `postgres://${encodeURIComponent(pgUser)}:${encodeURIComponent(pgPassword)}@${pgHost}:${pgPort}/${pgDb}${ssl ? '?sslmode=require' : ''}`;
    }
  }

  return { serviceEnv, loadedFiles };
}

const { serviceEnv, loadedFiles: loadedEnvFiles } = buildServiceEnv();

function log(message) {
  process.stdout.write(`[dev-local] ${message}\n`);
}

function logError(message) {
  process.stderr.write(`[dev-local] ${message}\n`);
}

function attachPrefixedOutput(stream, prefix, writer) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      writer(`[${prefix}] ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (buffer) {
      writer(`[${prefix}] ${buffer}\n`);
    }
  });
}

function ensureDependencies(service) {
  const nodeModulesPath = path.join(service.cwd, 'node_modules');
  if (fs.existsSync(nodeModulesPath) || !installMissing) {
    return;
  }

  log(`Installing dependencies for ${service.name}...`);
  const result = spawnSync(npmCommand, ['install'], {
    cwd: service.cwd,
    stdio: 'inherit',
    shell: useShell,
  });

  if (result.status !== 0) {
    throw new Error(`npm install failed for ${service.name}`);
  }
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(400);
    socket.once('connect', () => {
      socket.end();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        resolve(true);
        return;
      }
      resolve(false);
    });
  });
}

function waitForPort(port, timeoutMs) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function tryConnect() {
      const socket = net.createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for port ${port}`));
          return;
        }
        setTimeout(tryConnect, 500);
      });
    }

    tryConnect();
  });
}

function killChild(child) {
  if (!child || child.exitCode != null) {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
      shell: false,
    });
    return;
  }

  child.kill('SIGTERM');
}

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    killChild(child.process);
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 200);
}

function spawnService(service) {
  ensureDependencies(service);

  if (dryRun) {
    log(`Would start ${service.name} in ${path.relative(repoRoot, service.cwd)} with: ${service.command[0]} ${service.command[1].join(' ')}`);
    return null;
  }

  log(`Starting ${service.name}...`);
  const child = spawn(service.command[0], service.command[1], {
    cwd: service.cwd,
    env: serviceEnv,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: useShell,
  });

  attachPrefixedOutput(child.stdout, service.name, (line) => process.stdout.write(line));
  attachPrefixedOutput(child.stderr, service.name, (line) => process.stderr.write(line));

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code}`;
    if (optionalServiceNames.has(service.name)) {
      logError(`${service.name} exited (${reason}). Other services keep running; wellness API may use WELLNESS_SERVICE_URL.`);
      return;
    }
    logError(`${service.name} exited unexpectedly with ${reason}.`);
    shutdown(code || 1);
  });

  children.push({ name: service.name, process: child });
  return child;
}

async function main() {
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  if (loadedEnvFiles.length) {
    log(`Loaded env from: ${loadedEnvFiles.join(', ')}`);
  }
  if (!serviceEnv.DATABASE_URL) {
    log('DATABASE_URL not set. Services will use local file storage.');
  }

  const portsToCheck = [...backendServices, webService];
  const busyPorts = [];
  for (const service of portsToCheck) {
    const available = await checkPortAvailable(service.port);
    if (!available) {
      busyPorts.push(`${service.name}:${service.port}`);
    }
  }

  if (busyPorts.length && !dryRun) {
    logError(`Ports already in use: ${busyPorts.join(', ')}`);
    logError('Stop Docker Compose or any existing local servers first, then run npm run dev again.');
    process.exit(1);
  }

  log('Starting backend services first...');
  for (const service of backendServices) {
    spawnService(service);
  }

  if (dryRun) {
    log('Dry run complete.');
    return;
  }

  log('Waiting for backend ports 3000, 3001, 3002, and 3003...');
  await Promise.all(backendServices.map((service) => waitForPort(service.port, 45000)));

  log('Backend services are up. Starting web...');
  spawnService(webService);

  log('Local environment is starting.');
  log('Web: http://localhost:3005');
  log('API Gateway: http://localhost:3000');
  log('Press Ctrl+C to stop all started processes.');
}

main().catch((error) => {
  logError(error.message);
  shutdown(1);
});