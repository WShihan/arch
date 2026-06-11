import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import cliProgress from 'cli-progress';
import { x as extractTar } from 'tar';
import AdmZip from 'adm-zip';

// ==================== 常量定义 ====================
const VERSION = '8.30.1';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BIN_DIR = path.join(__dirname, 'bin/gitleaks');
const VERSION_FILE = path.join(BIN_DIR, 'VERSION');
const GITIGNORE_PATH = path.join(__dirname, '../.gitignore');
const BIN_IGNORE_PATTERN = `scripts/bin`;

// ==================== 工具函数 ====================
const shouldSkipDownload = () => {
  return process.env.CI === 'true' || process.env.SKIP_GITLEAKS_DOWNLOAD === 'true';
};

const isAlreadyInstalled = () => {
  const binaryName = os.platform() === 'win32' ? 'gitleaks.exe' : 'gitleaks';
  return fs.existsSync(path.join(BIN_DIR, binaryName));
};

const getAssetName = (platform, arch) => {
  if (platform === 'win32') {
    return `gitleaks_${VERSION}_windows_x64.zip`;
  }

  if (platform === 'darwin') {
    return arch === 'arm64' ? `gitleaks_${VERSION}_darwin_arm64.tar.gz` : `gitleaks_${VERSION}_darwin_x64.tar.gz`;
  }

  if (platform === 'linux') {
    return arch === 'arm64' ? `gitleaks_${VERSION}_linux_arm64.tar.gz` : `gitleaks_${VERSION}_linux_x64.tar.gz`;
  }

  throw new Error(`Unsupported platform: ${platform}`);
};

const shouldShowProgress = () => {
  const isTTY = process.stdout.isTTY;
  const isCI = !!process.env.CI;
  const isSilent = process.env.npm_config_loglevel === 'silent';
  return isTTY && !isCI && !isSilent;
};

// ==================== 下载相关函数 ====================
const downloadFile = async (url, outputPath, showProgress) => {
  console.log(`Downloading ${path.basename(outputPath)}`);

  const response = await fetch(url, {
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }

  if (!response.body) {
    throw new Error('Response body is empty');
  }

  const total = Number(response.headers.get('content-length'));

  const fileStream = fs.createWriteStream(outputPath);

  const reader = response.body.getReader();

  let downloaded = 0;
  let lastPrint = 0;
  let progressBar;

  if (showProgress) {
    progressBar = new cliProgress.SingleBar(
      {
        format: 'Downloading |{bar}| {percentage}% | {value}/{total} bytes',
        hideCursor: true,
      },
      cliProgress.Presets.shades_classic,
    );

    progressBar.start(total || 0, 0);
  } else {
    console.log('Downloading... (pnpm/CI mode)');
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    fileStream.write(value);

    downloaded += value.length;

    if (showProgress) {
      progressBar.update(downloaded);
    } else {
      const now = Date.now();

      if (now - lastPrint > 500) {
        process.stdout.write(`\rDownloaded ${(downloaded / 1024 / 1024).toFixed(2)} MB`);
        lastPrint = now;
      }
    }
  }

  fileStream.end();

  await new Promise(resolve => fileStream.on('finish', resolve));

  if (showProgress) {
    progressBar.stop();
  } else {
    process.stdout.write('\n');
  }

  console.log('Download complete');
};

// ==================== 解压相关函数 ====================
const extractArchive = async (archivePath, assetName) => {
  console.log('Extracting...');

  if (assetName.endsWith('.zip')) {
    const zip = new AdmZip(archivePath);
    zip.extractAllTo(BIN_DIR, true);
  } else {
    await extractTar({
      file: archivePath,
      cwd: BIN_DIR,
    });
  }

  fs.rmSync(archivePath, { force: true });
};

const findBinary = () => {
  const platform = os.platform();
  const files = fs.readdirSync(BIN_DIR);
  const binaryName = platform === 'win32' ? 'gitleaks.exe' : 'gitleaks';
  const binary = files.find(file => file === binaryName);

  if (!binary) {
    throw new Error('Binary not found');
  }

  return binary;
};

const setBinaryPermissions = binary => {
  const platform = os.platform();
  if (platform !== 'win32') {
    fs.chmodSync(path.join(BIN_DIR, binary), 0o755);
  }
};

// ==================== Gitignore 相关函数 ====================
const ensureGitignoreHasBinRule = () => {
  if (fs.existsSync(GITIGNORE_PATH)) {
    const gitignoreContent = fs.readFileSync(GITIGNORE_PATH, 'utf8');
    const lines = gitignoreContent.split(/\r?\n/);
    const alreadyIgnored = lines.some(line => line.trim() === BIN_IGNORE_PATTERN);

    if (alreadyIgnored) {
      console.log(`✓ '${BIN_IGNORE_PATTERN}' already in .gitignore`);
      return;
    }

    let newContent = gitignoreContent;
    if (!newContent.endsWith('\n')) {
      newContent += '\n';
    }
    newContent += `${BIN_IGNORE_PATTERN}\n`;
    fs.writeFileSync(GITIGNORE_PATH, newContent);
  } else {
    fs.writeFileSync(GITIGNORE_PATH, `${BIN_IGNORE_PATTERN}\n`);
  }

  console.log(`✓ Added '${BIN_IGNORE_PATTERN}' to .gitignore`);
};

/**
 * 创建 .gitleaks.toml 配置文件
 * @param {string} projectRoot - 项目根目录路径
 * @param {string} projectTitle - 项目标题（可选，默认为项目根目录名称）
 * @returns {string} 创建的文件路径
 */
const createGitleaksConfig = (projectRoot, projectTitle = null) => {
  const configPath = path.join(projectRoot, '.gitleaks.toml');

  if (fs.existsSync(configPath)) {
    console.log(`⚠️  .gitleaks.toml already exists at ${configPath}`);
    return configPath;
  }

  // 获取项目标题（如果未提供，使用目录名）
  const title = projectTitle || path.basename(projectRoot);

  // 配置文件内容
  const configContent = `title = "${title}"

# 继承 Gitleaks 的所有默认规则
[extend]
useDefault = true

# 忽略路径配置
[allowlist]
paths = [
    "tests/.*",
    "node_modules/.*"
]
`;

  // 写入配置文件
  fs.writeFileSync(configPath, configContent, 'utf8');
  console.log(`✓ Created .gitleaks.toml at ${configPath}`);

  return configPath;
};

// ==================== 主流程函数 ====================
const setupDirectories = () => {
  fs.mkdirSync(BIN_DIR, { recursive: true });
};

const installGitleaks = async () => {
  // vercel环境跳过
  if (process.env.VERCEL) {
    return;
  }
  // 检查是否需要跳过
  if (shouldSkipDownload()) {
    console.log('CI environment detected, skipping Gitleaks download.');
    return;
  }

  // 创建目录
  setupDirectories();

  // 检查是否已安装
  if (isAlreadyInstalled()) {
    console.log(`✓ Gitleaks ${VERSION} already installed`);
    return;
  }

  // 获取平台信息
  const platform = os.platform();
  const arch = os.arch();
  const assetName = getAssetName(platform, arch);
  const url = `https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/${assetName}`;
  const archiveFile = path.join(BIN_DIR, assetName);
  const showProgress = shouldShowProgress();

  // 下载
  await downloadFile(url, archiveFile, showProgress);

  // 解压
  await extractArchive(archiveFile, assetName);

  // 处理二进制文件
  const binary = findBinary();
  setBinaryPermissions(binary);

  // 写入版本文件
  fs.writeFileSync(VERSION_FILE, VERSION);

  createGitleaksConfig(path.join(__dirname, '../'), 'my-frontend-project');

  // 更新 .gitignore
  ensureGitignoreHasBinRule();

  console.log(`✓ Gitleaks ${VERSION} installed`);
};

// ==================== 执行主函数 ====================
installGitleaks().catch(error => {
  console.error('Installation failed:', error.message);
  process.exit(1);
});
