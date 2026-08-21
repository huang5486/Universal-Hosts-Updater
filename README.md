# Universal Hosts Updater
一键更新 Windows 系统 hosts 文件，解决中国大陆访问 GitHub、GitLab 及其关联生态缓慢或无法访问的问题。

---

**📮📮📮 非常抱歉，由于个人原因，本项目暂时停更。**

---

## 主要功能
本工具通过更新系统 hosts 文件，加速以下平台和生态在中国大陆地区的访问：
- **代码托管与开发平台**
  - GitHub 全生态（github.com、api.github.com、raw.githubusercontent.com、gist.github.com、github.io 等）
  - GitLab 全生态（gitlab.com、registry.gitlab.com、gitlab.io 等）
- **AI / ML 平台**
  - Hugging Face（huggingface.co、spaces.huggingface.co、api.huggingface.co 等）
- **部署与托管平台**
  - Vercel、Netlify、Render、Railway、Fly.io
- **游戏平台**
  - Steam（社区、商店、CDN）
  - Twitch（直播、聊天、视频、API）
  - Origin / Uplay（Ubisoft 商店）
  - Roblox、mod.io、Nexus Mods
- **媒体与内容平台**
  - Spotify、YouTube 图片、Pinterest、ArtStation、Imgur、Fandom
- **网络服务与公共 CDN**
  - Google 字体、Google 翻译、Google 搜索
  - Gravatar、Bootstrap CDN
  - hCaptcha、Arkose Labs 验证码
  - Docker Hub、GreasyFork
  - OneDrive、MEGA、Dropbox
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
- 确保关闭VPN、代理
- 确保关闭浏览器的安全hosts
  - Chrome：Chrome 设置 → 隐私和安全 → 安全 → 关闭"使用安全 DNS"
  - Edge：Edge 设置 → 隐私、搜索和服务 → 安全性 → 关闭"使用安全的 DNS"
## 快速开始
1. 确保已安装 [Node.js](https://nodejs.org/zh-cn/download)。 并添加到环境变量。
2. 双击 [Runner.bat](Runner.bat)：
   - 自动检测 Node.js
   - 请求管理员权限
   - 最小化到后台运行
   - 运行结束后自动关闭窗口
3. ~~运行结束后在终端输入 `ipconfig /flushdns`~~  
   **在1.2.0版本中刷新DNS缓存已写入Runner.bat**
4. 在Cmd/Powershell写入
   ```powershell
   ping github.com # 测试加速网站是否正常访问
   ```
   如果显示`0% 丢失`，则加速成功(如图)
   ![Snipaste 2026 08 21 11 58 42](https://imgur.la/images/2026/08/21/Snipaste_2026-08-21_11-58-42.jpg)
5. 重启浏览器
## 命令行用法
```powershell
node universal_hosts_updater.js                           # 立即更新一次 hosts
node universal_hosts_updater.js --dry-run                 # 演练模式，只显示不写入
node universal_hosts_updater.js --watch                   # 后台守护模式
node universal_hosts_updater.js --install                 # 创建开机自启动任务
node universal_hosts_updater.js --uninstall               # 删除开机自启动任务 
node universal_hosts_updater.js --services github,gitlab  # 仅加速指定服务
node universal_hosts_updater.js --help                    # 显示帮助
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
## 日志
运行日志默认保存在：
```text
%TEMP%\universal_hosts_updater.log
```
## 注意事项
- 本工具修改的是系统 hosts 文件，必须以管理员身份运行。
- 首次运行或网络不稳定时，可能需要等待 TCP 探测完成。
- 若已安装 Steam++、SwitchHosts 等同类工具，建议先关闭，避免 hosts 条目冲突。

---

> 本次代码纯 Vibe Coding 项目，主要代码由 Trae AI 辅助生成，人工审查后上线

> 1.2.0 更新内容
> ---
> - 刷新DNS缓存功能已写入Runner.bat