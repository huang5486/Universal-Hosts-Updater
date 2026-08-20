# Universal Hosts Updater

一键更新 Windows 系统 hosts 文件，解决中国大陆访问 GitHub、GitLab 及其关联生态缓慢或无法访问的问题。

## 功能特性

- **多策略 IP 获取**：在线 hosts 源 → DNS 备用解析 → 静态后备池 TCP 探测
- **进度可视化**：在线源加载、DNS 解析、TCP 探测均带进度条显示
- **原子写入**：先备份再写入，失败不影响原 hosts 文件
- **自动清理备份**：超过 30 天的 hosts 备份文件自动删除
- **变更展示**：更新完成后显示新增 / 删除 / 修改的 hosts 条目
- **UAC 自动提权**：需要管理员权限时自动申请
- **开机自启动**：可选创建 Windows 任务计划程序，登录后自动更新
- **守护模式**：定时检测 IP 变化并自动更新
- **零外部 npm 依赖**：仅使用 Node.js 内置模块

## 运行环境

- Windows 10 / 11
- Node.js >= 14

## 快速开始

1. 确保已安装 [Node.js](https://nodejs.org/zh-cn/download)。 并添加到环境变量。
2. 双击 [Runner.bat](Runner.bat)：
   - 自动检测 Node.js
   - 请求管理员权限
   - 最小化到后台运行
   - 运行结束后自动关闭窗口

## 命令行用法

```powershell
node universal_hosts_updater.js              # 立即更新一次 hosts
node universal_hosts_updater.js --dry-run    # 演练模式，只显示不写入
node universal_hosts_updater.js --watch      # 后台守护模式
node universal_hosts_updater.js --install    # 创建开机自启动任务
node universal_hosts_updater.js --uninstall  # 删除开机自启动任务
node universal_hosts_updater.js --help       # 显示帮助
```

## 文件说明

| 文件 | 说明 |
|------|------|
| [universal_hosts_updater.js](universal_hosts_updater.js) | 主程序 |
| [Runner.bat](Runner.bat) | Windows 一键运行脚本 |
| [target-domains-base.js](target-domains-base.js) | 基础目标域名列表 |
| [target-domains-gaming.js](target-domains-gaming.js) | 游戏相关域名列表 |
| [target-domains-media.js](target-domains-media.js) | 媒体相关域名列表 |
| [target-domains-network.js](target-domains-network.js) | 网络/CDN 相关域名列表 |
| [fallback-ips.json](fallback-ips.json) | 静态后备 IP 池（自动刷新） |
| [tsconfig.json](tsconfig.json) | TypeScript 配置 |
| [eslint.config.mjs](eslint.config.mjs) | ESLint 配置 |

## 日志

运行日志默认保存在：

```text
%TEMP%\universal_hosts_updater.log
```

## 注意事项

- 本工具修改的是系统 hosts 文件，必须以管理员身份运行。
- 首次运行或网络不稳定时，可能需要等待 TCP 探测完成。
- 若已安装 Steam++、SwitchHosts 等同类工具，建议先关闭，避免 hosts 条目冲突。

## Tips

如果运行中有问题，欢迎提交 Issue。