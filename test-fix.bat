@echo off
echo ========================================
echo 钉钉模式修复验证
echo ========================================
echo.
echo 步骤1：停止现有进程（如果有）
echo 请按 Ctrl+C 停止正在运行的钉钉服务
echo.
pause
echo.
echo 步骤2：启动修复后的服务
echo.
npm run dingtalk
echo.
echo 如果看到详细日志，说明修复已生效
echo 观察关键日志：[提取]、[发送]、[Webhook]
