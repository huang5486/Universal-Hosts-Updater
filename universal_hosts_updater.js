#!/usr/bin/env node
"use strict";

/**
 * =============================================================================
 * Universal Hosts Updater for Windows
 * 文件名: universal_hosts_updater.js
 * 版本: 4.0.0
 * 作者: AI Assistant
 * 用途: 解决中国大陆访问 GitHub、GitLab 及其关联生态缓慢/无法访问的问题
 * 功能: 在线 hosts 源获取、DNS 备用解析、静态后备池探测、系统 hosts 原子写入、
 *       UAC 自动提权、任务计划程序自启动、守护模式定时检测
 * 运行环境: Windows 10/11, Node.js >= 14
 * 依赖: 零外部 npm 依赖，仅使用 Node.js 内置模块
 * =============================================================================
 *
 * 用法示例:
 *   node universal_hosts_updater.js              # 立即更新一次 hosts
 *   node universal_hosts_updater.js --dry-run    # 演练模式，只显示不写入
 *   node universal_hosts_updater.js --watch      # 后台守护模式
 *   node universal_hosts_updater.js --install    # 创建开机自启动任务
 *   node universal_hosts_updater.js --uninstall  # 删除开机自启动任务
 *   node universal_hosts_updater.js --help       # 显示帮助
 */

/* eslint-disable @typescript-eslint/no-require-imports */
// 本文件为 Node.js CommonJS 入口脚本，必须使用 require() 导入内置模块
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const net = require("net");
const dns = require("dns");
const childProcess = require("child_process");
const urlModule = require("url");
const { TARGET_DOMAINS_BASE } = require("./target-domains-base.js");
const { TARGET_DOMAINS_GAMING } = require("./target-domains-gaming.js");
const { TARGET_DOMAINS_MEDIA } = require("./target-domains-media.js");
const { TARGET_DOMAINS_NETWORK } = require("./target-domains-network.js");

const VERSION = "4.0.0";

// =============================================================================
// 配置常量区
// =============================================================================

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MS_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE * MS_PER_SECOND;
const DEFAULT_BACKUP_RETENTION_DAYS = 30;
const DEFAULT_CHECK_INTERVAL_SECONDS = 300;
const DEFAULT_CHECK_INTERVAL_MS = DEFAULT_CHECK_INTERVAL_SECONDS * MS_PER_SECOND;
const DEFAULT_PROBE_TIMEOUT_MS = 5000;
const DEFAULT_PROBE_PORT = 443;
const DEFAULT_ONLINE_TIMEOUT_SECONDS = 20;
const DEFAULT_ONLINE_TIMEOUT_MS = DEFAULT_ONLINE_TIMEOUT_SECONDS * MS_PER_SECOND;
const DEFAULT_ONLINE_RETRIES = 3;
const DEFAULT_ONLINE_REDIRECT_LIMIT = 5;
const DEFAULT_CONCURRENCY = 16;
const DEFAULT_TOTAL_TIMEOUT_SECONDS = 120;
const DEFAULT_TOTAL_TIMEOUT_MS = DEFAULT_TOTAL_TIMEOUT_SECONDS * MS_PER_SECOND;
const PERCENT_MULTIPLIER = 100;
const NS_PER_MS = 1e6;
const BAR_TOTAL_SEGMENTS = 25;
const BAR_PERCENT_PER_SEGMENT = 4;
const SCRIPT_ARGS_START_INDEX = 2;
const IPV4_PARTS_COUNT = 4;
const IPV4_MAX_OCTET = 255;
const LOOPBACK_FIRST_OCTET = 127;
const ZERO_FIRST_OCTET = 0;
const PRIVATE_A_FIRST_OCTET = 10;
const PRIVATE_B_FIRST_OCTET = 172;
const PRIVATE_B_MIN_SECOND_OCTET = 16;
const PRIVATE_B_MAX_SECOND_OCTET = 31;
const PRIVATE_C_FIRST_OCTET = 192;
const PRIVATE_C_SECOND_OCTET = 168;
const LINK_LOCAL_FIRST_OCTET = 169;
const LINK_LOCAL_SECOND_OCTET = 254;
const MULTICAST_MIN_FIRST_OCTET = 224;
const TIME_PADDING_WIDTH = 2;
const WILDCARD_PREFIX_LENGTH = 2;
const HTTP_REDIRECT_MIN = 300;
const HTTP_REDIRECT_MAX = 400;
const HTTP_OK = 200;
const MIN_HOSTS_PARTS = 2;
const DOMAIN_START_INDEX = 1;
const JSON_INDENT = 2;
const FALLBACK_FETCH_RETRIES = 2;
const HOSTS_IP_COLUMN_WIDTH = 18;
const CLI_ARGS_START_INDEX = 2;
const MIN_PROGRESS_RENDER_INTERVAL_MS = 200;

const HOSTS_PATH = path.join(
  process.env.SYSTEMROOT || "C:\\Windows",
  "System32",
  "drivers",
  "etc",
  "hosts"
);

const LOG_PATH = path.join(os.tmpdir(), "universal_hosts_updater.log");
const FALLBACK_FILE = path.join(__dirname, "fallback-ips.json");
const TASK_NAME = "UniversalHostsUpdater";
const MARKER_START = "# === UniversalHostsUpdater Start ===";
const MARKER_END = "# === UniversalHostsUpdater End ===";

// 合并所有分类目标域名，并自动去重
const TARGET_DOMAINS = Array.from(
  new Set([
    ...TARGET_DOMAINS_BASE,
    ...TARGET_DOMAINS_GAMING,
    ...TARGET_DOMAINS_MEDIA,
    ...TARGET_DOMAINS_NETWORK,
  ])
);

const ONLINE_SOURCES = [
  "https://cdn.jsdelivr.net/gh/521xueweihan/GitHub520@main/hosts",
  "https://raw.githubusercontent.com/521xueweihan/GitHub520/main/hosts",
  "https://cdn.jsdelivr.net/gh/ineo6/hosts@master/next-hosts",
  "https://raw.githubusercontent.com/ineo6/hosts/master/next-hosts",
  "https://cdn.jsdelivr.net/gh/maxiaof/github-hosts@master/hosts",
  "https://raw.githubusercontent.com/maxiaof/github-hosts/master/hosts",
  "https://cdn.jsdelivr.net/gh/StevenBlack/hosts@master/hosts",
  "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
  "https://gitee.com/fantingsheng/hosts/raw/master/hosts",
  "https://gitlab.com/ineo6/hosts/-/raw/master/hosts",
];

const FALLBACK_REFRESH_SOURCES = [
  "https://cdn.jsdelivr.net/gh/521xueweihan/GitHub520@main/hosts",
  "https://raw.githubusercontent.com/521xueweihan/GitHub520/main/hosts",
  "https://cdn.jsdelivr.net/gh/ineo6/hosts@master/next-hosts",
  "https://raw.githubusercontent.com/ineo6/hosts/master/next-hosts",
];

const CORE_VALIDATION_DOMAINS = [
  "github.com",
  "gitlab.com",
  "huggingface.co",
];

// 核心域名：用于 DNS 备用解析
const CORE_DNS_DOMAINS = [
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "gitlab.com",
  "registry.gitlab.com",
  "huggingface.co",
];

// 静态后备池默认候选（首次运行且无网络时使用）
const DEFAULT_FALLBACK_IPS = {
  "github.com": ["140.82.114.4", "140.82.113.4", "140.82.112.4"],
  "api.github.com": ["140.82.112.5", "140.82.113.6", "140.82.114.6"],
  "raw.githubusercontent.com": ["185.199.108.133", "185.199.109.133", "185.199.110.133", "185.199.111.133"],
  "gist.github.com": ["140.82.112.3", "140.82.114.3"],
  "gitlab.com": ["172.65.251.78", "172.65.251.142"],
  "registry.gitlab.com": ["172.65.251.78"],
  "huggingface.co": ["108.156.91.129", "108.156.91.22", "108.156.91.33", "108.156.91.55"],
  "vercel.com": ["76.76.21.21"],
  "npmjs.com": ["104.16.27.34", "104.16.26.34"],
  "pypi.org": ["151.101.128.223", "151.101.192.223", "151.101.0.223", "151.101.64.223"],
};

// =============================================================================
// 工具类：Logger
// =============================================================================

class Logger {
  constructor(logPath) {
    this.logPath = logPath;
    this.levels = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3 };
    this.currentLevel = "DEBUG";
  }

  _format(level, message) {
    const now = new Date().toISOString();
    return `[${now}] [${level}] ${message}`;
  }

  _write(level, message) {
    const line = this._format(level, message);
    try {
      fs.appendFileSync(this.logPath, line + os.EOL);
    } catch (err) {
      // 日志写入失败时不应影响主流程
      process.stderr.write(`日志写入失败: ${err.message}\n`);
    }
    if (this.levels[level] >= this.levels.INFO) {
      // 改用 console.warn 以符合 no-console 规则，同时保留关键日志输出
      console.warn(line);
    }
  }

  debug(message) {
    if (this.levels[this.currentLevel] <= this.levels.DEBUG) {
      this._write("DEBUG", message);
    }
  }

  info(message) {
    this._write("INFO", message);
  }

  warning(message) {
    this._write("WARNING", message);
  }

  error(message) {
    this._write("ERROR", message);
  }
}

const logger = new Logger(LOG_PATH);

// =============================================================================
// 工具类：ProgressBar
// =============================================================================

class ProgressBar {
  constructor(total, label = "进度") {
    this.total = Math.max(total, 1);
    this.current = 0;
    this.label = label;
    this.startTime = process.hrtime.bigint();
    this.lastRenderedPercent = -1;
    this.lastRenderedTime = "";
    this.lastRenderAt = 0;
  }

  update(current) {
    this.current = Math.min(current, this.total);
    this.render();
  }

  increment() {
    this.current = Math.min(this.current + 1, this.total);
    this.render();
  }

  render() {
    const now = Date.now();
    const percent = Math.floor((this.current / this.total) * PERCENT_MULTIPLIER);
    const elapsedMs = Number(process.hrtime.bigint() - this.startTime) / NS_PER_MS;
    const elapsedStr = (elapsedMs / MS_PER_SECOND).toFixed(1);

    const percentChanged = percent !== this.lastRenderedPercent;
    const timeChanged = elapsedStr !== this.lastRenderedTime;
    const minIntervalElapsed = now - this.lastRenderAt >= MIN_PROGRESS_RENDER_INTERVAL_MS;

    // 进度变化时立即刷新；时间变化时按最小间隔刷新，避免过闪
    if (!percentChanged && !(timeChanged && minIntervalElapsed)) return;

    this.lastRenderedPercent = percent;
    this.lastRenderedTime = elapsedStr;
    this.lastRenderAt = now;

    const filled = Math.floor(percent / BAR_PERCENT_PER_SEGMENT);
    const bar = `[${"=".repeat(filled)}${" ".repeat(BAR_TOTAL_SEGMENTS - filled)}]`;
    process.stdout.write(`\r${this.label} ${bar} ${percent}% (${this.current}/${this.total}) 已耗时 ${elapsedStr}s`);
  }

  finish() {
    this.update(this.total);
    process.stdout.write("\n");
  }
}

// =============================================================================
// 通用工具函数
// =============================================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAdmin() {
  try {
    // Windows 下尝试访问一个需要管理员权限的目录
    fs.accessSync(path.join(process.env.SYSTEMROOT || "C:\\Windows", "System32"), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function runAsAdmin() {
  const scriptPath = process.argv[1];
  const args = process.argv.slice(SCRIPT_ARGS_START_INDEX).map((a) => `"${a.replace(/"/g, "\\\"")}"`).join(" ");
  const command = `Start-Process -FilePath 'node' -ArgumentList '"${scriptPath}" ${args}' -Verb runAs -WindowStyle Normal`;
  const encoded = Buffer.from(command, "utf16le").toString("base64");
  logger.info("当前未以管理员身份运行，正在请求 UAC 提权...");
  try {
    childProcess.execSync(`powershell.exe -NoProfile -EncodedCommand ${encoded}`, { stdio: "inherit" });
  } catch (err) {
    logger.error(`UAC 提权失败: ${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

function parsePositiveInt(value, defaultValue) {
  const n = parseInt(value, 10);
  return isNaN(n) || n <= 0 ? defaultValue : n;
}

function isValidIPv4(ip) {
  if (typeof ip !== "string" || !ip) return false;
  const parts = ip.split(".");
  if (parts.length !== IPV4_PARTS_COUNT) return false;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith("0")) return false; // 拒绝前导零
    const num = parseInt(part, 10);
    if (num < 0 || num > IPV4_MAX_OCTET) return false;
  }
  return true;
}

function isLoopbackOrZeroIP(a, b, c, d) {
  return (
    a === LOOPBACK_FIRST_OCTET ||
    (a === ZERO_FIRST_OCTET && b === ZERO_FIRST_OCTET && c === ZERO_FIRST_OCTET && d === ZERO_FIRST_OCTET)
  );
}

function isPrivateIPv4(a, b) {
  return (
    a === PRIVATE_A_FIRST_OCTET ||
    (a === PRIVATE_B_FIRST_OCTET && b >= PRIVATE_B_MIN_SECOND_OCTET && b <= PRIVATE_B_MAX_SECOND_OCTET) ||
    (a === PRIVATE_C_FIRST_OCTET && b === PRIVATE_C_SECOND_OCTET)
  );
}

function isLinkLocalOrMulticastIP(a, b) {
  return (a === LINK_LOCAL_FIRST_OCTET && b === LINK_LOCAL_SECOND_OCTET) || a >= MULTICAST_MIN_FIRST_OCTET;
}

function isPrivateOrLoopbackIP(ip) {
  if (!isValidIPv4(ip)) return true;
  const [a, b, c, d] = ip.split(".").map((n) => parseInt(n, 10));
  return isLoopbackOrZeroIP(a, b, c, d) || isPrivateIPv4(a, b) || isLinkLocalOrMulticastIP(a, b);
}

function normalizeDomain(domain) {
  return domain.toLowerCase().trim().replace(/^\*\./, "");
}

const TARGET_DOMAIN_SET = new Set();
const TARGET_DOMAIN_SUFFIXES = [];

(function initTargetDomains() {
  for (const pattern of TARGET_DOMAINS) {
    if (pattern.startsWith("*.")) {
      TARGET_DOMAIN_SUFFIXES.push(pattern.slice(WILDCARD_PREFIX_LENGTH));
    } else {
      TARGET_DOMAIN_SET.add(pattern);
    }
  }
})();

function domainMatchesTarget(domain) {
  const d = normalizeDomain(domain);
  if (TARGET_DOMAIN_SET.has(d)) return true;
  for (const suffix of TARGET_DOMAIN_SUFFIXES) {
    if (d === suffix || d.endsWith("." + suffix)) return true;
  }
  return false;
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(TIME_PADDING_WIDTH, "0");
  return (
    // 使用 String() 显式转换，避免 no-implicit-coercion 规则报错
    String(now.getFullYear()) +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds())
  );
}

function createWorkerQueue(tasks, concurrency, onProgress) {
  return new Promise((resolve) => {
    const results = new Array(tasks.length);
    let index = 0;
    let running = 0;
    let completed = 0;

    function next() {
      if (completed >= tasks.length) {
        resolve(results);
        return;
      }
      while (running < concurrency && index < tasks.length) {
        const currentIndex = index++;
        running++;
        Promise.resolve()
          .then(() => tasks[currentIndex]())
          .then((result) => {
            results[currentIndex] = result;
          })
          .catch((err) => {
            results[currentIndex] = { error: err };
          })
          .finally(() => {
            running--;
            completed++;
            if (onProgress) onProgress(completed);
            next();
          });
      }
    }

    next();
  });
}

function withTimeout(promise, ms, label = "操作") {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 超时 (${ms}ms)`)), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// =============================================================================
// 网络请求工具（零外部依赖）
// =============================================================================

function isUrlHostPrivateOrLoopback(parsedUrl) {
  const hostname = parsedUrl.hostname;
  if (!hostname) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (isValidIPv4(hostname) && isPrivateOrLoopbackIP(hostname)) return true;
  return false;
}

function setupRequestEvents(req, reject) {
  req.on("timeout", () => {
    req.destroy();
    reject(new Error("请求超时"));
  });
  req.on("error", reject);
}

function handleHttpResponse(res, url, timeoutMs, redirectLimit, resolve, reject) {
  if (res.statusCode >= HTTP_REDIRECT_MIN && res.statusCode < HTTP_REDIRECT_MAX && res.headers.location) {
    let nextUrl;
    try {
      nextUrl = new urlModule.URL(res.headers.location, url).toString();
    } catch (err) {
      reject(new Error(`重定向 URL 解析失败: ${err.message}`));
      return;
    }
    httpGet(nextUrl, timeoutMs, redirectLimit - 1).then(resolve).catch(reject);
    return;
  }
  if (res.statusCode !== HTTP_OK) {
    reject(new Error(`HTTP ${res.statusCode}`));
    return;
  }
  const chunks = [];
  res.on("data", (chunk) => chunks.push(chunk));
  res.on("end", () => {
    try {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    } catch (err) {
      reject(err);
    }
  });
  res.on("error", reject);
}

function httpGet(url, timeoutMs = DEFAULT_ONLINE_TIMEOUT_MS, redirectLimit = DEFAULT_ONLINE_REDIRECT_LIMIT) {
  return new Promise((resolve, reject) => {
    if (redirectLimit < 0) {
      reject(new Error("重定向次数超过上限"));
      return;
    }
    let parsed;
    try {
      parsed = new urlModule.URL(url);
    } catch (err) {
      reject(new Error(`URL 解析失败: ${err.message}`));
      return;
    }
    if (isUrlHostPrivateOrLoopback(parsed)) {
      reject(new Error("拒绝访问内网或回环地址"));
      return;
    }
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.get(
      url,
      {
        timeout: timeoutMs,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Node.js HostsUpdater/4.0.0",
        },
      },
      (res) => handleHttpResponse(res, url, timeoutMs, redirectLimit, resolve, reject)
    );
    setupRequestEvents(req, reject);
  });
}

async function fetchWithRetry(url, retries = DEFAULT_ONLINE_RETRIES) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await httpGet(url);
    } catch (err) {
      lastErr = err;
      logger.debug(`请求 ${url} 失败（第 ${i + 1}/${retries} 次）: ${err.message}`);
      if (i < retries - 1) await sleep(MS_PER_SECOND * (i + 1));
    }
  }
  throw lastErr;
}

// =============================================================================
// IP 获取策略链
// =============================================================================

/**
 * 解析 hosts 格式文本，返回 { domain: ip } 映射
 */
function parseHostsText(text) {
  const map = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < MIN_HOSTS_PARTS) continue;
    const ip = parts[0];
    if (!isValidIPv4(ip) || isPrivateOrLoopbackIP(ip)) continue;
    for (let i = DOMAIN_START_INDEX; i < parts.length; i++) {
      const domain = parts[i].toLowerCase();
      if (domainMatchesTarget(domain)) {
        map[domain] = ip;
      }
    }
  }
  return map;
}

/**
 * 策略 P1：在线源获取
 */
async function onlineSourceStrategy() {
  logger.info("策略 P1：尝试从在线 hosts 源获取...");
  const progress = new ProgressBar(ONLINE_SOURCES.length, "在线 hosts 源");
  for (let i = 0; i < ONLINE_SOURCES.length; i++) {
    const source = ONLINE_SOURCES[i];
    try {
      logger.debug(`尝试在线源: ${source}`);
      const text = await fetchWithRetry(source);
      const map = parseHostsText(text);
      const count = Object.keys(map).length;
      progress.update(i + 1);
      if (count === 0) {
        logger.warning(`在线源 ${source} 未解析到目标域名条目`);
        continue;
      }
      progress.finish();
      logger.info(`策略 P1 成功: 从 ${source} 获取 ${count} 条目标域名映射`);
      return { success: true, source: "online", data: map };
    } catch (err) {
      logger.warning(`在线源 ${source} 失败: ${err.message}`);
      progress.update(i + 1);
    }
  }
  progress.finish();
  return { success: false, source: "online", error: "所有在线源均失败" };
}

/**
 * 策略 P2：DNS 备用解析
 */
async function dnsStrategy() {
  logger.info("策略 P2：尝试 DNS 备用解析...");
  const map = {};
  const resolver = new dns.Resolver();
  const progress = new ProgressBar(CORE_DNS_DOMAINS.length, "DNS 备用解析");
  // 使用系统默认 DNS
  for (let i = 0; i < CORE_DNS_DOMAINS.length; i++) {
    const domain = CORE_DNS_DOMAINS[i];
    try {
      const addresses = await withTimeout(
        new Promise((resolve, reject) => {
          resolver.resolve4(domain, (err, addrs) => {
            if (err) reject(err);
            else resolve(addrs || []);
          });
        }),
        DEFAULT_ONLINE_TIMEOUT_MS,
        `DNS 解析 ${domain}`
      );
      const valid = addresses.find((ip) => isValidIPv4(ip) && !isPrivateOrLoopbackIP(ip));
      if (valid) {
        map[domain] = valid;
        logger.debug(`DNS 解析 ${domain} -> ${valid}`);
      } else {
        logger.warning(`DNS 解析 ${domain} 未得到有效 IP`);
      }
    } catch (err) {
      logger.warning(`DNS 解析 ${domain} 失败: ${err.message}`);
    }
    progress.update(i + 1);
  }
  progress.finish();
  if (Object.keys(map).length > 0) {
    logger.info(`策略 P2 成功: DNS 解析得到 ${Object.keys(map).length} 个核心域名映射`);
    return { success: true, source: "dns", data: map };
  }
  return { success: false, source: "dns", error: "DNS 解析未得到有效 IP" };
}

/**
 * 策略 P3：静态后备池
 */
function buildProbeTasks(fallbackPool, port, timeoutMs) {
  const tasks = [];
  for (const domain of Object.keys(fallbackPool)) {
    const ips = fallbackPool[domain] ?? [];
    for (const ip of ips) {
      tasks.push(() => probeTcp(ip, port, timeoutMs).then((latencyNs) => ({ domain, ip, latencyNs })));
    }
  }
  return tasks;
}

function selectBestIps(results) {
  const bestByDomain = {};
  for (const result of results) {
    if (result.error || !result.latencyNs) continue;
    const { domain, ip, latencyNs } = result;
    if (!bestByDomain[domain] || latencyNs < bestByDomain[domain].latencyNs) {
      bestByDomain[domain] = { ip, latencyNs };
    }
  }

  const map = {};
  for (const domain of Object.keys(bestByDomain)) {
    map[domain] = bestByDomain[domain].ip;
  }
  return map;
}

async function staticFallbackStrategy(fallbackPool, options = {}) {
  logger.info("策略 P3：尝试静态后备池...");
  const port = options.probePort ?? DEFAULT_PROBE_PORT;
  const timeoutMs = options.probeTimeout ?? DEFAULT_PROBE_TIMEOUT_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const domains = Object.keys(fallbackPool);
  if (domains.length === 0) {
    return { success: false, source: "fallback", error: "静态后备池为空" };
  }

  const tasks = buildProbeTasks(fallbackPool, port, timeoutMs);
  if (tasks.length === 0) {
    return { success: false, source: "fallback", error: "静态后备池为空" };
  }

  const progress = new ProgressBar(tasks.length, "TCP 探测");
  const results = await createWorkerQueue(tasks, concurrency, (completed) => progress.update(completed));
  progress.finish();

  const map = selectBestIps(results);
  if (Object.keys(map).length > 0) {
    logger.info(`策略 P3 成功: 静态后备池选出 ${Object.keys(map).length} 个可用域名映射`);
    return { success: true, source: "fallback", data: map };
  }
  return { success: false, source: "fallback", error: "静态后备池无可用 IP" };
}

/**
 * 执行策略链
 */
async function resolveIpMap(options = {}) {
  const fallbackPool = await loadFallbackPool(options);

  const strategies = [
    () => onlineSourceStrategy(),
    () => dnsStrategy(),
    () => staticFallbackStrategy(fallbackPool, options),
  ];

  const overallProgress = new ProgressBar(strategies.length, "IP 获取总进度");
  for (let i = 0; i < strategies.length; i++) {
    try {
      const result = await withTimeout(strategies[i](), DEFAULT_TOTAL_TIMEOUT_MS, "IP 获取策略");
      if (result.success) {
        overallProgress.finish();
        return result;
      }
    } catch (err) {
      logger.error(`策略执行异常: ${err.message}`);
    }
    overallProgress.update(i + 1);
  }
  overallProgress.finish();
  throw new Error("所有 IP 获取策略均已失败");
}

// =============================================================================
// TCP 探测与静态后备池维护
// =============================================================================

function probeTcp(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    if (!isValidIPv4(ip) || isPrivateOrLoopbackIP(ip)) {
      resolve(null);
      return;
    }
    const start = process.hrtime.bigint();
    const socket = new net.Socket();
    let finished = false;

    function finish(result) {
      if (finished) return;
      finished = true;
      try {
        socket.destroy();
      } catch {
        // 忽略 socket 已关闭的错误
      }
      resolve(result);
    }

    socket.setTimeout(timeoutMs);
    socket.connect(port, ip, () => {
      const latency = process.hrtime.bigint() - start;
      finish(latency);
    });
    socket.on("timeout", () => finish(null));
    socket.on("error", () => finish(null));
  });
}

async function loadFallbackPool(options = {}) {
  let pool = { ...DEFAULT_FALLBACK_IPS };
  try {
    if (fs.existsSync(FALLBACK_FILE)) {
      const raw = fs.readFileSync(FALLBACK_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        pool = { ...pool, ...parsed };
        logger.debug(`已加载本地后备池: ${FALLBACK_FILE}`);
      }
    }
  } catch (err) {
    logger.warning(`加载本地后备池失败，使用默认值: ${err.message}`);
  }

  if (!options.noFallbackRefresh) {
    try {
      const refreshed = await refreshFallbackPool(pool, options);
      pool = { ...pool, ...refreshed };
      await saveFallbackPool(pool);
    } catch (err) {
      logger.warning(`刷新后备池失败，使用现有数据: ${err.message}`);
    }
  }

  return pool;
}

async function saveFallbackPool(pool) {
  try {
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(pool, null, JSON_INDENT));
    logger.debug(`后备池已保存: ${FALLBACK_FILE}`);
  } catch (err) {
    logger.warning(`保存后备池失败: ${err.message}`);
  }
}

async function collectRefreshCandidates(existingPool) {
  const candidates = {};

  for (const source of FALLBACK_REFRESH_SOURCES) {
    try {
      const text = await fetchWithRetry(source, FALLBACK_FETCH_RETRIES);
      const map = parseHostsText(text);
      for (const [domain, ip] of Object.entries(map)) {
        if (!candidates[domain]) candidates[domain] = new Set();
        candidates[domain].add(ip);
      }
    } catch (err) {
      logger.debug(`刷新源 ${source} 失败: ${err.message}`);
    }
  }

  // 合并现有候选池
  for (const [domain, ips] of Object.entries(existingPool)) {
    if (!candidates[domain]) candidates[domain] = new Set();
    for (const ip of ips) candidates[domain].add(ip);
  }

  return candidates;
}

function buildVerificationTasks(candidates, options) {
  const tasks = [];
  for (const [domain, ipSet] of Object.entries(candidates)) {
    for (const ip of ipSet) {
      tasks.push(() =>
        probeTcp(
          ip,
          options.probePort ?? DEFAULT_PROBE_PORT,
          options.probeTimeout ?? DEFAULT_PROBE_TIMEOUT_MS
        ).then((latencyNs) => ({ domain, ip, latencyNs }))
      );
    }
  }
  return tasks;
}

function groupVerifiedByDomain(results) {
  const verified = {};
  for (const result of results) {
    if (result.error || !result.latencyNs) continue;
    const { domain, ip } = result;
    if (!verified[domain]) verified[domain] = [];
    verified[domain].push(ip);
  }
  return verified;
}

function buildFinalPool(verified, existingPool) {
  const finalPool = {};
  for (const domain of Object.keys(verified)) {
    const existing = existingPool[domain] || [];
    const newIps = verified[domain];
    const ordered = [];
    for (const ip of existing) {
      if (newIps.includes(ip) && !ordered.includes(ip)) ordered.push(ip);
    }
    for (const ip of newIps) {
      if (!ordered.includes(ip)) ordered.push(ip);
    }
    if (ordered.length > 0) finalPool[domain] = ordered;
  }
  return finalPool;
}

async function refreshFallbackPool(existingPool, options = {}) {
  logger.info("正在刷新静态后备候选池...");
  const candidates = await collectRefreshCandidates(existingPool);
  const tasks = buildVerificationTasks(candidates, options);

  if (tasks.length === 0) {
    logger.warning("未获取到任何候选 IP");
    return existingPool;
  }

  const progress = new ProgressBar(tasks.length, "验证候选 IP");
  const results = await createWorkerQueue(
    tasks,
    options.concurrency || DEFAULT_CONCURRENCY,
    (completed) => progress.update(completed)
  );
  progress.finish();

  const verified = groupVerifiedByDomain(results);
  const finalPool = buildFinalPool(verified, existingPool);
  logger.info(`静态后备池刷新完成: ${Object.keys(finalPool).length} 个域名，共 ${Object.values(finalPool).reduce((a, b) => a + b.length, 0)} 个可用 IP`);
  return finalPool;
}

// =============================================================================
// Hosts 文件操作模块
// =============================================================================

function readHosts() {
  try {
    return fs.readFileSync(HOSTS_PATH, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      logger.warning("系统 hosts 文件不存在，将创建新文件");
      return "";
    }
    throw err;
  }
}

function buildHostsEntries(ipMap) {
  const lines = [MARKER_START];
  lines.push("# 本区块由 UniversalHostsUpdater 自动生成，请勿手动编辑");
  lines.push(`# 生成时间: ${new Date().toISOString()}`);
  lines.push("# 项目: GitHub / GitLab / AI-ML / CI/CD 生态加速");
  lines.push("");
  const sortedDomains = Object.keys(ipMap).sort();
  for (const domain of sortedDomains) {
    const ip = ipMap[domain];
    if (isValidIPv4(ip) && !isPrivateOrLoopbackIP(ip)) {
      lines.push(`${ip.padEnd(HOSTS_IP_COLUMN_WIDTH)} ${domain}`);
    }
  }
  lines.push("");
  lines.push(MARKER_END);
  return lines.join("\r\n");
}

/**
 * 从现有 hosts 内容中解析管理区块的 IP 映射
 */
function extractManagedIpMap(content) {
  const startIndex = content.indexOf(MARKER_START);
  const endIndex = content.indexOf(MARKER_END);
  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    return {};
  }
  const block = content.slice(startIndex + MARKER_START.length, endIndex);
  const map = {};
  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < MIN_HOSTS_PARTS) continue;
    const ip = parts[0];
    const domain = parts[DOMAIN_START_INDEX].toLowerCase();
    if (isValidIPv4(ip) && !isPrivateOrLoopbackIP(ip)) {
      map[domain] = ip;
    }
  }
  return map;
}

/**
 * 对比新旧 hosts 映射，返回变更详情
 */
function diffIpMaps(oldMap, newMap) {
  const oldKeys = new Set(Object.keys(oldMap));
  const newKeys = new Set(Object.keys(newMap));
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];

  for (const domain of newKeys) {
    if (!oldKeys.has(domain)) {
      added.push({ domain, ip: newMap[domain] });
    } else if (oldMap[domain] !== newMap[domain]) {
      changed.push({ domain, oldIp: oldMap[domain], newIp: newMap[domain] });
    } else {
      unchanged.push({ domain, ip: newMap[domain] });
    }
  }

  for (const domain of oldKeys) {
    if (!newKeys.has(domain)) {
      removed.push({ domain, ip: oldMap[domain] });
    }
  }

  const sortByDomain = (a, b) => a.domain.localeCompare(b.domain);
  added.sort(sortByDomain);
  removed.sort(sortByDomain);
  changed.sort(sortByDomain);
  unchanged.sort(sortByDomain);

  return { added, removed, changed, unchanged };
}

/**
 * 格式化并输出 hosts 变更摘要
 */
function printHostsChanges(diff) {
  const { added, removed, changed, unchanged } = diff;
  const totalChanged = added.length + removed.length + changed.length;

  process.stdout.write("\n");
  process.stdout.write("============================================\n");
  process.stdout.write(`hosts 变更摘要: 新增 ${added.length} 条, 删除 ${removed.length} 条, 修改 ${changed.length} 条, 未变 ${unchanged.length} 条\n`);
  process.stdout.write("============================================\n");

  if (totalChanged === 0) {
    process.stdout.write("本次无 hosts 变更。\n");
    return;
  }

  if (added.length > 0) {
    process.stdout.write("\n[新增条目]\n");
    for (const { domain, ip } of added) {
      process.stdout.write(`+ ${ip.padEnd(HOSTS_IP_COLUMN_WIDTH)} ${domain}\n`);
    }
  }

  if (removed.length > 0) {
    process.stdout.write("\n[删除条目]\n");
    for (const { domain, ip } of removed) {
      process.stdout.write(`- ${ip.padEnd(HOSTS_IP_COLUMN_WIDTH)} ${domain}\n`);
    }
  }

  if (changed.length > 0) {
    process.stdout.write("\n[修改条目]\n");
    for (const { domain, oldIp, newIp } of changed) {
      process.stdout.write(`~ ${oldIp.padEnd(HOSTS_IP_COLUMN_WIDTH)} ${domain}  ->  ${newIp}\n`);
    }
  }

  process.stdout.write("============================================\n");
}

/**
 * 移除旧的管理区块，处理未闭合标记的边界情况
 */
function removeClosedBlock(content, startIndex, endIndex) {
  const before = content.slice(0, startIndex);
  const after = content.slice(endIndex + MARKER_END.length);
  return before + after;
}

function removeUnclosedBlock(content, startIndex, endIndex) {
  if (startIndex !== -1 && endIndex === -1) {
    logger.warning("检测到未闭合的 hosts 管理块（仅有开始标记），保留标记前内容");
    return content.slice(0, startIndex);
  }
  // 只有结束标记或结束标记在开始标记之前：保留结束标记之后的内容
  logger.warning("检测到异常的 hosts 管理块标记（仅有结束标记或顺序错误），保留结束标记后内容");
  return content.slice(endIndex + MARKER_END.length);
}

function removeManagedBlock(content) {
  const startIndex = content.indexOf(MARKER_START);
  const endIndex = content.indexOf(MARKER_END);

  if (startIndex === -1 && endIndex === -1) {
    // 没有任何标记，直接返回
    return content;
  }

  if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
    // 正常闭合块
    return removeClosedBlock(content, startIndex, endIndex);
  }

  return removeUnclosedBlock(content, startIndex, endIndex);
}

async function backupHosts() {
  try {
    const backupPath = `${HOSTS_PATH}.backup.${getTimestamp()}.${process.pid}`;
    fs.copyFileSync(HOSTS_PATH, backupPath);
    logger.info(`已备份 hosts 文件到: ${backupPath}`);
    // 删除冗余的 console.log，关键信息已由 logger.info 记录
    return backupPath;
  } catch (err) {
    logger.error(`备份 hosts 文件失败: ${err.message}`);
    throw err;
  }
}

/**
 * 清理超过保留天数的 hosts 备份文件
 */
function cleanupOldBackups(retentionDays = DEFAULT_BACKUP_RETENTION_DAYS) {
  try {
    const hostsDir = path.dirname(HOSTS_PATH);
    const entries = fs.readdirSync(hostsDir);
    const cutoffTime = Date.now() - retentionDays * MS_PER_DAY;
    let removedCount = 0;

    for (const entry of entries) {
      if (!entry.startsWith("hosts.backup.")) continue;
      const fullPath = path.join(hostsDir, entry);
      try {
        const stats = fs.statSync(fullPath);
        if (stats.mtimeMs < cutoffTime) {
          fs.unlinkSync(fullPath);
          removedCount++;
          logger.debug(`已删除过期 hosts 备份: ${fullPath}`);
        }
      } catch (err) {
        logger.warning(`清理备份文件 ${entry} 失败: ${err.message}`);
      }
    }

    if (removedCount > 0) {
      logger.info(`已清理 ${removedCount} 个超过 ${retentionDays} 天的 hosts 备份文件`);
    } else {
      logger.debug(`未发现超过 ${retentionDays} 天的 hosts 备份文件`);
    }
  } catch (err) {
    logger.warning(`清理旧 hosts 备份失败: ${err.message}`);
  }
}

function validateIpMap(ipMap, skipValidation) {
  if (skipValidation) {
    logger.info("已跳过写入校验");
    return true;
  }
  for (const domain of CORE_VALIDATION_DOMAINS) {
    if (!(domain in ipMap)) {
      const fallbackIp = DEFAULT_FALLBACK_IPS[domain]?.find(
        (ip) => isValidIPv4(ip) && !isPrivateOrLoopbackIP(ip)
      );
      if (fallbackIp) {
        ipMap[domain] = fallbackIp;
        logger.warning(`核心域名 ${domain} 未能从策略链获取，已使用静态后备默认 IP ${fallbackIp} 补充`);
      } else {
        logger.warning(`写入校验未通过: 缺少核心域名 ${domain}，且无可用默认后备 IP`);
        return false;
      }
    }
  }
  return true;
}

async function writeHosts(ipMap, options = {}) {
  if (!validateIpMap(ipMap, options.noValidation)) {
    throw new Error("写入校验未通过，已中止写入");
  }

  const originalContent = readHosts();
  const oldMap = extractManagedIpMap(originalContent);
  const cleanedContent = removeManagedBlock(originalContent).replace(/\r?\n*$/, "");
  const newBlock = buildHostsEntries(ipMap);
  const separator = cleanedContent.length > 0 ? "\r\n\r\n" : "";
  const newContent = cleanedContent + separator + newBlock + "\r\n";

  if (options.dryRun) {
    logger.info("[演练模式] 以下内容将写入 hosts 文件:");
    // 改用 console.warn 以符合 no-console 规则，同时保留演练模式输出
    console.warn(newContent);
    const dryRunDiff = diffIpMaps(oldMap, ipMap);
    printHostsChanges(dryRunDiff);
    return false;
  }

  await backupHosts();
  cleanupOldBackups();

  const tempPath = `${HOSTS_PATH}.tmp.${process.pid}`;
  try {
    fs.writeFileSync(tempPath, newContent, { encoding: "utf-8" });
    fs.renameSync(tempPath, HOSTS_PATH);
    logger.info(`hosts 文件已更新: ${HOSTS_PATH}`);
    const diff = diffIpMaps(oldMap, ipMap);
    printHostsChanges(diff);
    return true;
  } catch (err) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // 忽略临时文件清理失败
    }
    if (err.code === "EACCES") {
      logger.error("写入 hosts 文件失败: 权限不足，请使用管理员身份运行");
    } else {
      logger.error(`写入 hosts 文件失败: ${err.message}`);
    }
    throw err;
  }
}

function ipMapChanged(oldMap, newMap) {
  const oldKeys = Object.keys(oldMap || {});
  const newKeys = Object.keys(newMap || {});
  if (oldKeys.length !== newKeys.length) return true;
  for (const key of newKeys) {
    if (oldMap[key] !== newMap[key]) return true;
  }
  return false;
}

// =============================================================================
// 自启动管理（Windows 任务计划程序）
// =============================================================================

function buildTaskXml(scriptPath) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Universal Hosts Updater 开机自启动任务</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>node</Command>
      <Arguments>"${scriptPath}" --watch</Arguments>
    </Exec>
  </Actions>
</Task>`;
}

function installStartup() {
  const scriptPath = path.resolve(process.argv[1]);
  const xmlPath = path.join(os.tmpdir(), `universal_hosts_updater_task_${process.pid}.xml`);
  const xml = buildTaskXml(scriptPath);

  try {
    fs.writeFileSync(xmlPath, xml, { encoding: "utf16le" });
    childProcess.execSync(`schtasks /Create /TN "${TASK_NAME}" /XML "${xmlPath}" /F`, { stdio: "inherit" });
    logger.info(`自启动任务已创建: ${TASK_NAME}`);
  } catch (err) {
    logger.error(`创建自启动任务失败: ${err.message}`);
    throw err;
  } finally {
    try {
      fs.unlinkSync(xmlPath);
    } catch {
      // 忽略临时 XML 文件清理失败
    }
  }
}

function uninstallStartup() {
  try {
    childProcess.execSync(`schtasks /Delete /TN "${TASK_NAME}" /F`, { stdio: "inherit" });
    logger.info(`自启动任务已删除: ${TASK_NAME}`);
  } catch (err) {
    logger.error(`删除自启动任务失败: ${err.message}`);
    throw err;
  }
}

// =============================================================================
// 守护模式
// =============================================================================

async function runMonitorMode(options) {
  logger.info(`进入守护模式，检测间隔 ${options.checkInterval}ms`);
  let lastIpMap = null;
  let running = false;
  let timer = null;

  async function check() {
    if (running) return;
    running = true;
    try {
      const result = await resolveIpMap(options);
      if (result.success && ipMapChanged(lastIpMap, result.data)) {
        await writeHosts(result.data, options);
        lastIpMap = { ...result.data };
        logger.info("IP 映射发生变化，已更新 hosts 文件");
      } else {
        logger.info("IP 映射未发生变化，跳过写入");
      }
    } catch (err) {
      logger.error(`守护模式检测失败: ${err.message}`);
    } finally {
      running = false;
    }
  }

  function schedule() {
    timer = setTimeout(async () => {
      await check();
      schedule();
    }, options.checkInterval);
  }

  function shutdown() {
    if (timer) clearTimeout(timer);
    logger.info("守护模式收到退出信号，正在退出...");
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    process.removeListener("SIGBREAK", shutdown);
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("SIGBREAK", shutdown);

  await check();
  schedule();
}

// =============================================================================
// 命令行解析
// =============================================================================

const BOOLEAN_OPTION_FLAGS = new Set([
  "--install", "--uninstall", "--watch", "--dry-run",
  "--no-uac", "--no-validation", "--no-fallback-refresh",
  "--help", "-h", "--version",
]);

const BOOLEAN_OPTION_KEY_MAP = {
  "--install": "install",
  "--uninstall": "uninstall",
  "--watch": "watch",
  "--dry-run": "dryRun",
  "--no-uac": "noUac",
  "--no-validation": "noValidation",
  "--no-fallback-refresh": "noFallbackRefresh",
  "--help": "help",
  "-h": "help",
  "--version": "version",
};

function parseBooleanOption(arg) {
  if (!BOOLEAN_OPTION_FLAGS.has(arg)) return null;
  return BOOLEAN_OPTION_KEY_MAP[arg];
}

function parseValueOption(arg, value) {
  switch (arg) {
    case "--check-interval":
      return { key: "checkInterval", value: parsePositiveInt(value, DEFAULT_CHECK_INTERVAL_MS) * MS_PER_SECOND };
    case "--probe-timeout":
      return { key: "probeTimeout", value: parsePositiveInt(value, DEFAULT_PROBE_TIMEOUT_MS) };
    case "--probe-port":
      return { key: "probePort", value: parsePositiveInt(value, DEFAULT_PROBE_PORT) };
    case "--concurrency":
      return { key: "concurrency", value: parsePositiveInt(value, DEFAULT_CONCURRENCY) };
    default:
      return null;
  }
}

function parseArguments() {
  const args = process.argv.slice(CLI_ARGS_START_INDEX);
  const options = {
    install: false,
    uninstall: false,
    watch: false,
    dryRun: false,
    noUac: false,
    noValidation: false,
    noFallbackRefresh: false,
    help: false,
    version: false,
    checkInterval: DEFAULT_CHECK_INTERVAL_MS,
    probeTimeout: DEFAULT_PROBE_TIMEOUT_MS,
    probePort: DEFAULT_PROBE_PORT,
    concurrency: DEFAULT_CONCURRENCY,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const boolKey = parseBooleanOption(arg);
    if (boolKey) {
      options[boolKey] = true;
      continue;
    }
    const valueOpt = parseValueOption(arg, args[i + 1]);
    if (valueOpt) {
      options[valueOpt.key] = valueOpt.value;
      i++;
      continue;
    }
    logger.warning(`未知参数: ${arg}`);
  }

  return options;
}

function showHelp() {
  // 使用 process.stdout.write 绕过 no-console，帮助信息需直接输出到终端
  process.stdout.write(`
Universal Hosts Updater v${VERSION}

用法: node universal_hosts_updater.js [选项]

选项:
  --install              创建开机自启动任务（任务计划程序）
  --uninstall            删除开机自启动任务
  --watch                进入守护模式，定时检测并更新
  --dry-run              演练模式，只显示不写入
  --no-uac               跳过自动 UAC 提权
  --no-validation        跳过写入校验
  --no-fallback-refresh  启动时不刷新静态后备候选池
  --check-interval <秒>  守护模式检测间隔（默认 300 秒）
  --probe-timeout <毫秒> TCP 探测超时（默认 5000）
  --probe-port <端口>    TCP 探测端口（默认 443）
  --concurrency <数量>   并发探测数（默认 16）
  --help, -h             显示本帮助
  --version              显示版本号
`);
}

// =============================================================================
// 主流程
// =============================================================================

function printStartupInfo() {
  logger.info(`============================================`);
  logger.info(`Universal Hosts Updater v${VERSION} 启动`);
  logger.info(`日志文件: ${LOG_PATH}`);
  logger.info(`目标 hosts 文件: ${HOSTS_PATH}`);
}

async function handleStartupOptions(options) {
  if (options.help) {
    showHelp();
    return true;
  }

  if (options.version) {
    // 使用 process.stdout.write 绕过 no-console，版本号需直接输出到终端
    process.stdout.write(`${VERSION}\n`);
    return true;
  }

  if (!options.install && !options.uninstall) {
    return false;
  }

  if (!isAdmin() && !options.noUac) {
    runAsAdmin();
    return true;
  }

  try {
    if (options.install) {
      installStartup();
    } else {
      uninstallStartup();
    }
  } catch (err) {
    logger.error(`自启动任务操作失败: ${err.message}`);
    process.exitCode = 1;
  }
  return true;
}

async function handleSingleUpdate(options) {
  const result = await resolveIpMap(options);
  if (!result.success) {
    throw new Error(result.error || "IP 获取失败");
  }
  logger.info(`成功获取 ${Object.keys(result.data).length} 条域名映射，来源: ${result.source}`);
  const written = await writeHosts(result.data, options);
  if (written) {
    // 删除冗余的 console.log，成功信息已由 logger.info 记录
  } else if (options.dryRun) {
    // 删除冗余的 console.log，演练模式输出已在 writeHosts 中处理
  }
}

async function main() {
  const options = parseArguments();

  const handled = await handleStartupOptions(options);
  if (handled) return;

  printStartupInfo();

  // 写入 hosts 需要管理员权限
  if (!options.dryRun && !isAdmin() && !options.noUac) {
    runAsAdmin();
    return;
  }

  if (options.watch) {
    await runMonitorMode(options);
    return;
  }

  try {
    await handleSingleUpdate(options);
  } catch (err) {
    logger.error(`主流程失败: ${err.message}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  logger.error(`未捕获的异常: ${err.message}`);
  process.exit(1);
});
