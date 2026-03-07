# oprcli 分析与改造方案（2026-03-07）

## 1. 现状结论
- `server.js` 单文件过大（7 万+ 字节），路由、业务、运维逻辑耦合。
- 钉钉会话状态原先仅内存保存，重启后会话丢失。
- 仓库内存在多套“历史实现”（如 `session-store.js`、`dingtalk-stream.js`），与主链路脱节，维护成本高。

## 2. 分阶段改造建议

### P0（本次已实现）
- 会话持久化从“仅内存”升级为“可持久化存储接口”。
- 新增存储驱动抽象：
  - 优先 `SQLite`（`node:sqlite` 可用时）
  - 自动回退 `JSON`（兼容低版本 Node 环境）
- 主链路接入 `integrations/dingtalk.js`，覆盖：
  - 启动恢复会话
  - 设置会话写入
  - 删除/清空/过期清理同步持久化

### P1（建议下一步）
- 按边界拆分 `server.js`：
  - `routes/`：API 路由注册
  - `services/command-service.js`：命令解析与执行
  - `services/session-service.js`：会话编排
  - `bootstrap/`：初始化连接器、监控、插件
- 迁移目标：保持现有 API 不变，仅做内部重构，避免破坏调用方。

### P2（质量与缺陷修复）
- 清理未接入主链路的历史模块，标记 `deprecated` 或移除。
- 增加启动自检：Node 版本、SQLite 可用性、存储驱动选择结果。
- 为持久化模块补充最小单元测试（增删改查、异常回退、恢复流程）。

## 3. 本次实现的关键文件
- `utils/session-persistence.js`：新增会话存储抽象（SQLite + JSON 回退）。
- `integrations/dingtalk.js`：主流程接入持久化与恢复能力。

## 4. 兼容性说明
- 默认驱动：`SESSION_STORE_DRIVER=sqlite`。
- 当运行环境不支持 `node:sqlite` 时自动回退 JSON，不阻塞服务启动。
- 可通过环境变量覆盖路径：
  - `SESSION_STORE_SQLITE_PATH`
  - `SESSION_STORE_JSON_PATH`
