@echo off
chcp 65001 >nul

:: Runner.bat - 一键运行 universal_hosts_updater.js
:: 用途：检测 Node.js 环境、请求管理员权限、最小化到后台运行，运行结束后自动关闭窗口

title Universal Hosts Updater Runner

:: 设置脚本所在目录为工作目录
cd /d "%~dp0"

:: 检查 Node.js 是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js ^(>= 14^) 并添加到环境变量。
    echo 下载地址：https://nodejs.org/
    pause
    exit /b 1
)

:: 检查是否已以管理员身份运行
net session >nul 2>&1
if errorlevel 1 (
    echo [信息] 正在请求管理员权限...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b 0
)

:: 已是管理员：最小化窗口并在后台运行，运行结束后自动关闭
start /min "" node "universal_hosts_updater.js"
exit /b 0
