# MCP Browser 工具使用指南

基于 Playwright + 系统微软 Edge 的浏览器自动化工具。

## 🎯 核心工具列表

| 工具名称 | 功能说明 | 使用场景 |
|---------|---------|---------|
| `launch_browser` | 启动浏览器 | 开始浏览器自动化 |
| `open_page` | 打开网页 | 导航到指定URL |
| `screenshot_page` | 页面截图 | 截取整个页面或特定元素 |
| `extract_content` | 提取内容 | 提取文本、HTML、标题等 |
| `evaluate_script` | 执行脚本 | 执行 JavaScript 代码 |
| `click_element` | 点击元素 | 模拟点击操作 |
| `fill_field` | 填写表单 | 自动填写输入框 |
| `get_pdf` | 导出 PDF | 将页面保存为 PDF |
| `close_browser` | 关闭浏览器 | 清理资源 |
| `browser_info` | 浏览器状态 | 获取浏览器信息 |

## 📖 使用场景示例

### 场景 1：网页快照
```javascript
launch_browser
  → open_page(url)
  → screenshot_page
  → close_browser
```

### 场景 2：数据抓取
```javascript
launch_browser
  → open_page(url)
  → extract_content(selector)
  → close_browser
```

### 场景 3：自动化搜索
```javascript
launch_browser
  → open_page(搜索引擎)
  → fill_field(搜索框, 关键词)
  → click_element(搜索按钮)
  → screenshot_page
```

## ⚙️ 配置说明

- **浏览器**：系统 Microsoft Edge
- **模式**：无头模式（headless）
- **视口**：1920x1080
- **超时**：60秒
- **截图保存**：`D:/space/mcp/mcp-browser/screenshots/`

## 💡 最佳实践

### 1. 资源管理
- ✅ 使用后及时关闭浏览器
- ✅ 截图完成后关闭页面
- ❌ 不要打开过多标签页

### 2. 错误处理
- ✅ 检查元素是否存在再操作
- ✅ 使用合理的等待时间
- ✅ 处理超时和异常情况

### 3. 性能优化
- ✅ 避免不必要的页面加载
- ✅ 复用浏览器实例（如需多次操作）
- ✅ 及时清理资源

## 🔧 常见操作代码

### 打开网页并截图
```javascript
// 完整流程
1. launch_browser()
2. open_page("https://example.com")
3. screenshot_page({ fullPage: true })
4. close_browser()
```

### 提取页面内容
```javascript
// 提取所有链接
extract_content("a")

// 提取特定元素
extract_content("#main-content")
```

### 填写表单
```javascript
// 填写输入框
fill_field(inputSelector, "内容")

// 点击按钮
click_element(buttonSelector)
```

### 执行 JavaScript
```javascript
evaluate_script(`
  document.querySelector('.element').textContent
`)
```

## ⚠️ 注意事项

1. **元素选择器**：使用稳定的 CSS 选择器
2. **等待时间**：动态内容可能需要等待加载
3. **截图路径**：自动保存到 mcp-browser/screenshots/
4. **资源限制**：同时只能有一个浏览器实例

## 📚 相关文档

- [项目架构](./architecture.md) - MCP 工具的架构说明
- [快速入门](./quick-start.md) - 快速上手指南

---

**提示**：本工具通过 MCP 协议调用，确保 mcp-browser 正确配置。
