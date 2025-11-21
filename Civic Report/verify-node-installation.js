// Verify Node.js installation and environment
console.log('=== Node.js Installation Verification ===');
console.log('1. Basic JavaScript test:');
console.log('   - 2 + 2 =', 2 + 2);

console.log('\n2. Process information:');
console.log('   - Node.js version:', process.version);
console.log('   - Platform:', process.platform, process.arch);
console.log('   - Current directory:', process.cwd());

console.log('\n3. Environment variables:');
console.log('   - NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('   - PATH:', process.env.PATH ? 'Set' : 'Not set');

console.log('\n4. File system access:');
try {
  const fs = require('fs');
  const files = fs.readdirSync('.');
  console.log('   - Current directory contains', files.length, 'items');
  console.log('   - First 5 items:', files.slice(0, 5).join(', '));
} catch (error) {
  console.error('   - Error accessing file system:', error.message);
}

console.log('\n=== Verification Complete ===');
