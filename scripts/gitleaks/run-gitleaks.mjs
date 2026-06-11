import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const platform = os.platform();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const __executeDir = './bin/gitleaks';
let executable;

switch (platform) {
  case 'win32':
    executable = path.resolve(__dirname, __executeDir, 'gitleaks.exe');
    break;

  case 'darwin':
    executable = path.resolve(__dirname, __executeDir, 'gitleaks');
    break;

  case 'linux':
    executable = path.resolve(__dirname, __executeDir, 'gitleaks');
    break;

  default:
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
}

if (!existsSync(executable)) {
  console.error(
    `Gitleaks binary not found at ${executable}\n` + 'Run: pnpm postinstall  (or: node scripts/install-gitleaks.mjs)',
  );
  process.exit(1);
}

const result = spawnSync(executable, ['git', '--staged'], {
  stdio: 'inherit',
  shell: false,
});

// 如果有泄露，输出友好提示
if (result.status !== 0) {
  console.log('\n\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  console.log('\x1b[31m❌ 提交失败：检测到敏感信息泄露！\x1b[0m');
  console.log('\x1b[31m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n');

  // 输出原始泄露信息（betterleaks 已经给出了具体文件、行号等信息）
  if (result.stdout) {
    console.log('\x1b[33m📋 泄露详情：\x1b[0m');
    console.log(result.stdout);
  }
  if (result.stderr) {
    console.log(result.stderr);
  }

  console.log('\n\x1b[36m💡 修复建议：\x1b[0m');
  console.log('  1. 根据上述信息找到并移除敏感内容');
  console.log('  2. 使用环境变量或配置文件（添加到 .gitignore）');
  console.log('  3. 如果已提交过，请立即更换泄露的密钥\n');

  process.exit(1);
}

process.exit(result.status ?? 1);
