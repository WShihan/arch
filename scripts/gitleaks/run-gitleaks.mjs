import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const platform = os.platform()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const __executeDir = './bin/gitleaks'
let executable

switch (platform) {
  case 'win32':
    executable = path.resolve(__dirname, __executeDir, 'gitleaks.exe')
    break

  case 'darwin':
    executable = path.resolve(__dirname, __executeDir, 'gitleaks')
    break

  case 'linux':
    executable = path.resolve(__dirname, __executeDir, 'gitleaks')
    break

  default:
    console.error(`Unsupported platform: ${platform}`)
    process.exit(1)
}

if (!existsSync(executable)) {
  console.error(
    `Gitleaks binary not found at ${executable}\n` + 'Run: pnpm postinstall  (or: node scripts/install-gitleaks.mjs)',
  )
  process.exit(1)
}

const result = spawnSync(executable, ['git', '--staged'], {
  stdio: 'inherit',
  shell: false,
})

process.exit(result.status ?? 1)
