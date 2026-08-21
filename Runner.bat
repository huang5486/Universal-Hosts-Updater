@echo off
chcp 65001 >nul

:: Runner.bat - 一键运行 universal_hosts_updater.js
:: 用途：检测 Node.js 环境、提供服务平台多选菜单、请求管理员权限、可选最小化运行

setlocal enabledelayedexpansion

title Universal Hosts Updater Runner

:: 设置脚本所在目录为工作目录
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%" || exit /b 1

:: 检查 Node.js 是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js ^(>= 14^) 并添加到环境变量。
    echo 下载地址：https://nodejs.org/
    pause
    exit /b 1
)

set "CONFIG_FILE=%TEMP%\uhu_runner_config.txt"

:: 如果通过 --run 参数启动，直接读取配置运行（用于 UAC 提权后的二次启动）
if "%~1"=="--run" goto :RUN_FROM_CONFIG

:: =============================================================================
:: 显示交互式服务平台选择菜单
:: =============================================================================
:SHOW_MENU
:: 通过 PowerShell 菜单收集用户选择并写入配置文件
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%RunnerMenu.ps1" -ConfigFile "%CONFIG_FILE%"

if not exist "%CONFIG_FILE%" (
    echo [错误] 配置保存失败，将使用默认设置运行。
    (
        echo SERVICES=all
        echo MINIMIZE=Y
    ) > "%CONFIG_FILE%"
)

:: =============================================================================
:: 检查管理员权限
:: =============================================================================
net session >nul 2>&1
if errorlevel 1 (
    echo [信息] 正在请求管理员权限...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--run' -Verb RunAs"
    exit /b 0
)

:: 已是管理员，直接运行
goto :RUN_FROM_CONFIG

:: =============================================================================
:: 从配置文件读取并运行
:: =============================================================================
:RUN_FROM_CONFIG
if not exist "%CONFIG_FILE%" (
    echo [错误] 未找到运行配置，请直接双击 Runner.bat 进行选择。
    pause
    exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%a in ("%CONFIG_FILE%") do (
    if "%%a"=="SERVICES" set "SERVICES_ARG=%%b"
    if "%%a"=="MINIMIZE" set "MINIMIZE_CHOICE=%%b"
)

if not defined SERVICES_ARG set "SERVICES_ARG=all"

:: 构建 node 参数
if /i "%SERVICES_ARG%"=="all" (
    set "NODE_ARGS="
) else (
    set "NODE_ARGS=--services %SERVICES_ARG%"
)

:: 进入 src 目录运行主程序
cd /d "%SCRIPT_DIR%\src" || exit /b 1

if /i "%MINIMIZE_CHOICE%"=="Y" (
    start /min "" node "universal_hosts_updater.js" %NODE_ARGS%
) else (
    node "universal_hosts_updater.js" %NODE_ARGS%
)

:: 刷新 DNS 缓存
ipconfig /flushdns

exit /b 0
