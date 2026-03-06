# Codex CLI PowerShell 测试脚本

$ErrorActionPreference = "Continue"

$CODEX_PATH = "C:\Users\28409\AppData\Roaming\npm\codex.cmd"
$WORK_DIR = "D:\space"
$TEST_MESSAGE = "你好，请用一句话介绍你自己。"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Codex CLI PowerShell 测试" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "测试配置:" -ForegroundColor Cyan
Write-Host "Codex 路径: $CODEX_PATH"
Write-Host "工作目录: $WORK_DIR"
Write-Host ""

Write-Host "发送测试消息..." -ForegroundColor Cyan
Write-Host "消息: `"$TEST_MESSAGE`"" -ForegroundColor Yellow
Write-Host ""

try {
    # 设置工作目录
    Set-Location $WORK_DIR

    # 使用 PowerShell 的字符串输入
    $output = $TEST_MESSAGE | & $CODEX_PATH 2>&1

    if ($LASTEXITCODE -eq 0 -or $output) {
        Write-Host "✅ 成功!" -ForegroundColor Green
        Write-Host ""
        Write-Host "输出:" -ForegroundColor Cyan
        Write-Host "----------------------------------------" -ForegroundColor Cyan
        Write-Host $output
        Write-Host "----------------------------------------" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "✅ Codex CLI 工作正常！" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "❌ 失败，退出码: $LASTEXITCODE" -ForegroundColor Red
        Write-Host "输出: $output" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "❌ 错误: $_" -ForegroundColor Red
    exit 1
}
