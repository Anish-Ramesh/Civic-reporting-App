// Script to gather detailed environment information
const fs = require('fs');
const path = require('path');

function getEnvInfo() {
  const info = {
    timestamp: new Date().toISOString(),
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
      execPath: process.execPath,
      cwd: process.cwd(),
      pid: process.pid,
      title: process.title,
      argv: process.argv,
      versions: process.versions
    },
    env: {
      NODE_ENV: process.env.NODE_ENV || 'not set',
      PATH: process.env.PATH ? 'Set' : 'Not set',
      ANDROID_HOME: process.env.ANDROID_HOME || 'Not set',
      JAVA_HOME: process.env.JAVA_HOME || 'Not set',
      USERPROFILE: process.env.USERPROFILE || 'Not set',
      HOMEPATH: process.env.HOMEPATH || 'Not set',
      TEMP: process.env.TEMP || 'Not set',
      SystemRoot: process.env.SystemRoot || 'Not set'
    },
    memory: {
      total: Math.round(process.memoryUsage().heapTotal / (1024 * 1024)) + ' MB',
      used: Math.round(process.memoryUsage().heapUsed / (1024 * 1024)) + ' MB',
      rss: Math.round(process.memoryUsage().rss / (1024 * 1024)) + ' MB'
    },
    files: {
      packageJson: fs.existsSync('package.json'),
      nodeModules: fs.existsSync('node_modules'),
      android: fs.existsSync('android'),
      ios: fs.existsSync('ios')
    }
  };

  return info;
}

const envInfo = getEnvInfo();
console.log(JSON.stringify(envInfo, null, 2));

// Write to file for further analysis
const outputFile = path.join(process.cwd(), 'env-info.json');
fs.writeFileSync(outputFile, JSON.stringify(envInfo, null, 2));
console.log(`\nEnvironment information saved to: ${outputFile}`);
