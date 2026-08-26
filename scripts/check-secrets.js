#!/usr/bin/env node

/**
 * Secret Detection Script
 * Scans tracked files for exposed secrets and sensitive patterns
 * 
 * Usage: node scripts/check-secrets.js
 * Exit codes: 0 = clean, 1 = secrets found
 */

const fs = require('fs');
const { execSync } = require('child_process');

// Patterns to detect (without capturing actual values)
const SECRET_PATTERNS = [
  {
    name: 'Google API Key',
    pattern: /AIza[0-9A-Za-z_-]{35}/,
    severity: 'CRITICAL'
  },
  {
    name: 'JWT Token (service_role)',
    pattern: /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*service_role[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/,
    severity: 'CRITICAL'
  },
  {
    name: 'JWT Token (anon)',
    pattern: /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*anon[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/,
    severity: 'HIGH'
  },
  {
    name: 'Supabase Project URL',
    pattern: /https:\/\/[a-z]{20}\.supabase\.co/,
    severity: 'MEDIUM'
  },
  {
    name: 'WhatsApp Phone Number ID (numeric)',
    pattern: /WHATSAPP_PHONE_NUMBER_ID\s*=\s*\d{10,}/,
    severity: 'HIGH'
  },
  {
    name: 'Real Webhook Token',
    pattern: /WEBHOOK_VERIFY_TOKEN\s*=\s*['"](?!your_|MOCK)[a-zA-Z0-9_-]{10,}['"]/,
    severity: 'HIGH'
  },
  {
    name: 'Real WhatsApp Token',
    pattern: /WHATSAPP_TOKEN\s*=\s*['"](?!your_|MOCK)[a-zA-Z0-9_-]{20,}['"]/,
    severity: 'CRITICAL'
  },
  {
    name: 'Real Google AI Key',
    pattern: /GOOGLE_AI_API_KEY\s*=\s*['"](?!your_|MOCK)[a-zA-Z0-9_-]{20,}['"]/,
    severity: 'CRITICAL'
  },
  {
    name: 'Real Supabase Service Role Key',
    pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"](?!your_|MOCK)[a-zA-Z0-9._-]{20,}['"]/,
    severity: 'CRITICAL'
  },
  {
    name: 'Real Admin Setup Key',
    pattern: /ADMIN_SETUP_KEY\s*=\s*['"](?!your_|sua_|MOCK)[a-zA-Z0-9_-]{10,}['"]/,
    severity: 'HIGH'
  },
  {
    name: 'Real DataJud API Key',
    pattern: /DATAJUD_API_KEY\s*=\s*['"](?!your_|sua_|MOCK)[A-Za-z0-9+/=]{20,}['"]/,
    severity: 'HIGH'
  },
  {
    name: 'Real Zapsign API Key (UUID)',
    pattern: /ZAPSIGN_API_KEY\s*=\s*['"][a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}['"]/,
    severity: 'HIGH'
  },
  {
    name: 'Real Calendar Encryption Key',
    pattern: /CALENDAR_ENCRYPTION_KEY\s*=\s*['"](?!your_|sua_|MOCK)[a-zA-Z0-9_-]{10,}['"]/,
    severity: 'HIGH'
  }
];

// Paths to ignore
const IGNORED_PATTERNS = [
  /^\.env$/,
  /^\.env\.local$/,
  /^\.env\.test$/,
  /^\.env\.production$/,
  /^\.env\./,
  /^node_modules\//,
  /^\.next\//,
  /^\.vercel\//,
  /^coverage\//,
  /^dist\//,
  /^build\//,
  /\.min\.js$/,
  /package-lock\.json$/,
  /yarn\.lock$/
];

/**
 * Get list of tracked files from git
 */
function getTrackedFiles() {
  try {
    const output = execSync('git ls-files', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return output.trim().split('\n').filter(f => f && !shouldIgnoreFile(f));
  } catch (error) {
    console.error('❌ Error listing tracked files. Ensure you are in a git repository.');
    process.exit(1);
  }
}

/**
 * Check if file should be ignored
 */
function shouldIgnoreFile(filePath) {
  return IGNORED_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Scan file for secret patterns
 */
function scanFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    // Skip binary or unreadable files
    return [];
  }

  const violations = [];

  SECRET_PATTERNS.forEach(({ name, pattern, severity }) => {
    if (pattern.test(content)) {
      violations.push({
        file: filePath,
        type: name,
        severity: severity,
        instruction: 'Replace with safe placeholder (e.g., your_key_here)'
      });
    }
  });

  return violations;
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Scanning tracked files for exposed secrets...\n');

  const trackedFiles = getTrackedFiles();
  console.log(`📁 Analyzing ${trackedFiles.length} tracked files...\n`);

  let allViolations = [];

  trackedFiles.forEach(file => {
    const violations = scanFile(file);
    allViolations = allViolations.concat(violations);
  });

  if (allViolations.length > 0) {
    console.error('❌ SECRETS DETECTED IN TRACKED FILES:\n');
    
    // Group by severity
    const critical = allViolations.filter(v => v.severity === 'CRITICAL');
    const high = allViolations.filter(v => v.severity === 'HIGH');
    const medium = allViolations.filter(v => v.severity === 'MEDIUM');

    if (critical.length > 0) {
      console.error('🔴 CRITICAL:');
      critical.forEach(({ file, type, instruction }) => {
        console.error(`   ${file}`);
        console.error(`   └─ Pattern: ${type}`);
        console.error(`   └─ Action: ${instruction}\n`);
      });
    }

    if (high.length > 0) {
      console.error('🟡 HIGH:');
      high.forEach(({ file, type, instruction }) => {
        console.error(`   ${file}`);
        console.error(`   └─ Pattern: ${type}`);
        console.error(`   └─ Action: ${instruction}\n`);
      });
    }

    if (medium.length > 0) {
      console.error('🟠 MEDIUM:');
      medium.forEach(({ file, type, instruction }) => {
        console.error(`   ${file}`);
        console.error(`   └─ Pattern: ${type}`);
        console.error(`   └─ Action: ${instruction}\n`);
      });
    }

    console.error(`\n⚠️  Total violations: ${allViolations.length}`);
    console.error('⚠️  Remove all secrets before committing.\n');
    process.exit(1);
  } else {
    console.log('✅ No secrets detected in tracked files.');
    console.log('✅ Repository is clean.\n');
    process.exit(0);
  }
}

main();
