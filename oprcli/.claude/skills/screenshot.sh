#!/bin/bash

# Screenshot Skill
# Usage: /screenshot [--safe]

SCRIPT_DIR="D:/temp"
SCREENSHOT_DIR="D:/temp/screenshots"

# 确保目录存在
mkdir -p "$SCREENSHOT_DIR"

# 解析参数
SAFE_MODE=false
if [[ "$1" == "--safe" ]]; then
  SAFE_MODE=true
fi

echo "📸 Taking screenshot..."

if [ "$SAFE_MODE" = true ]; then
  # 使用安全模式
  node "$SCRIPT_DIR/screenshot-safe.js"
else
  # 使用普通模式
  node "$SCRIPT_DIR/screenshot-cli.js"
fi

exit $?
