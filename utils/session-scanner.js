/**
 * 会话扫描器
 *
 * 扫描各 Provider 的历史会话：
 * - Claude: ~/.claude/projects/{encoded-workDir}/{uuid}.jsonl
 * - IFlow: ~/.iflow/projects/{encoded-workDir}/session-{uuid}.jsonl
 * - Codex: ~/.codex/sessions/{yyyy}/{MM}/{dd}/rollout-{ts}-{ulid}.jsonl
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class SessionScanner {
  constructor(logger) {
    this.logger = logger;
  }

  /**
   * 扫描所有 Provider 的会话
   * @param {string} workDir - 工作目录
   * @returns {Promise<Array>} 会话列表
   */
  async scanSessions(workDir) {
    const sessions = [];

    try {
      // 1. 扫描 Claude 会话
      const claudeSessions = await this._scanClaudeSessions(workDir);
      sessions.push(...claudeSessions.map(s => ({ ...s, provider: 'claude' })));

      // 2. 扫描 IFlow 会话
      const iflowSessions = await this._scanIFlowSessions(workDir);
      sessions.push(...iflowSessions.map(s => ({ ...s, provider: 'iflow' })));

      // 3. 扫描 Codex 会话（最近7天）
      const codexSessions = await this._scanCodexSessions();
      sessions.push(...codexSessions.map(s => ({ ...s, provider: 'codex' })));

      // 按时间排序（最新的在前）
      sessions.sort((a, b) => b.mtime - a.mtime);

      return sessions;
    } catch (error) {
      if (this.logger) {
        this.logger.error('[SessionScanner] 扫描失败:', error.message);
      }
      return [];
    }
  }

  /**
   * 扫描 Claude 会话
   * 路径：~/.claude/projects/{encoded-workDir}/{uuid}.jsonl
   */
  async _scanClaudeSessions(workDir) {
    const claudeDir = path.join(os.homedir(), '.claude', 'projects', this._encodePath(workDir));

    if (!fs.existsSync(claudeDir)) {
      if (this.logger) {
        this.logger.log(`[SessionScanner] Claude 目录不存在: ${claudeDir}`);
      }
      return [];
    }

    const sessions = [];
    const entries = fs.readdirSync(claudeDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const sessionId = entry.name.replace('.jsonl', '');
        const filePath = path.join(claudeDir, entry.name);
        const stat = fs.statSync(filePath);
        const preview = this._extractPreview(filePath);

        sessions.push({
          id: sessionId,
          mtime: stat.mtime.getTime(),
          size: stat.size,
          preview
        });
      }
    }

    return sessions;
  }

  /**
   * 扫描 IFlow 会话
   * 路径：~/.iflow/projects/{encoded-workDir}/session-{uuid}.jsonl
   * 注意：IFlow 的路径编码规则与 Claude 不同
   */
  async _scanIFlowSessions(workDir) {
    // IFlow 的编码规则：
    // 1. 替换 \ 为 /
    // 2. 替换 / 为 -
    // 3. 替换 : 为 空
    // 4. 在前面加 "-" 前缀
    // 注意：不执行替换 - 为 -- 的步骤
    // 例如：C:\Users\28409 -> -C-Users-28409
    const iflowDir = path.join(os.homedir(), '.iflow', 'projects', '-' + this._encodePathIFlow(workDir));

    if (!fs.existsSync(iflowDir)) {
      if (this.logger) {
        this.logger.log(`[SessionScanner] IFlow 目录不存在: ${iflowDir}`);
      }
      return [];
    }

    const sessions = [];
    const entries = fs.readdirSync(iflowDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith('session-') && entry.name.endsWith('.jsonl')) {
        // IFlow 需要 session- 前缀
        const sessionId = entry.name.replace('.jsonl', '');
        const filePath = path.join(iflowDir, entry.name);
        const stat = fs.statSync(filePath);
        const preview = this._extractPreview(filePath);

        sessions.push({
          id: sessionId,
          mtime: stat.mtime.getTime(),
          size: stat.size,
          preview
        });
      }
    }

    return sessions;
  }

  /**
   * 扫描 Codex 会话
   * 路径：~/.codex/sessions/{yyyy}/{MM}/{dd}/rollout-{ts}-{ulid}.jsonl
   */
  async _scanCodexSessions() {
    const codexDir = path.join(os.homedir(), '.codex', 'sessions');

    if (!fs.existsSync(codexDir)) {
      if (this.logger) {
        this.logger.log(`[SessionScanner] Codex 目录不存在: ${codexDir}`);
      }
      return [];
    }

    const sessions = [];

    // 扫描最近7天的会话
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);

      const datePath = path.join(
        codexDir,
        String(date.getFullYear()).padStart(4, '0'),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      );

      if (!fs.existsSync(datePath)) continue;

      const entries = fs.readdirSync(datePath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) {
          const fullFileName = entry.name.replace('.jsonl', '');

          // 提取 ULID 作为 sessionId（格式：rollout-{timestamp}-{ulid}.jsonl）
          // ULID 格式：8-4-4-4-12 (例如：019cbd93-66a8-7c70-a39e-929f1fed8bdb)
          // codex resume 命令需要 ULID 而非完整文件名
          const ulidMatch = fullFileName.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
          const sessionId = ulidMatch ? ulidMatch[1] : fullFileName;
          const shortId = sessionId.substring(0, 8);  // 用于显示的短 ID

          const filePath = path.join(datePath, entry.name);
          const stat = fs.statSync(filePath);
          const preview = this._extractPreview(filePath);

          sessions.push({
            id: sessionId,        // ULID，供 codex resume 使用
            shortId: shortId,     // 短 ID，用于显示
            fullFileName,         // 完整文件名（调试用）
            mtime: stat.mtime.getTime(),
            size: stat.size,
            preview
          });
        }
      }
    }

    return sessions;
  }

  /**
   * 从 JSONL 文件提取预览（首条用户消息）
   */
  _extractPreview(filePath) {
    try {
      // 限制读取大小（前 10KB）
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(Math.min(10240, fs.statSync(filePath).size));
      fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);

      const content = buffer.toString('utf8');
      const lines = content.split('\n').filter(Boolean);

      // 根据文件路径判断 Provider
      const isCodex = filePath.includes('.codex');

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          // 尝试多种消息格式
          let msg = null;

          // Claude/IFlow 格式：{"type":"user","message":{"content":"..."}}
          if (data.type === 'user' && data.message?.content) {
            msg = data.message.content;
          }
          // 通用格式1：{"type":"user_message","content":"..."}
          else if (data.type === 'user_message' && data.content) {
            msg = data.content;
          }
          // 通用格式2：{"role":"user","content":"..."}
          else if (data.role === 'user' && data.content) {
            msg = data.content;
          }
          // 通用格式3：{"message":"..."}
          else if (typeof data.message === 'string') {
            msg = data.message;
          }
          // Codex 格式：{"type":"user_query","payload":{"query":"..."}}
          else if (data.type === 'user_query' && data.payload?.query) {
            msg = data.payload.query;
          }

          if (msg && typeof msg === 'string') {
            const cleaned = msg.trim();

            // 跳过系统注入的消息
            if (this._isSystemMessage(cleaned)) {
              continue;
            }

            return cleaned.length > 50 ? cleaned.substring(0, 50) + '...' : cleaned;
          }
        } catch (parseError) {
          // 跳过解析失败的行
          continue;
        }
      }

      // Codex 降级：显示会话标识
      if (isCodex) {
        return '(Codex 会话)';
      }

      return '(无预览)';
    } catch (e) {
      if (this.logger) {
        this.logger.error(`[SessionScanner] 提取预览失败: ${filePath} - ${e.message}`);
      }
      return '(读取失败)';
    }
  }

  /**
   * 判断是否为系统消息
   */
  _isSystemMessage(content) {
    // 跳过系统注入的内容
    const systemPatterns = [
      '[RUNTIME_CONTEXT]',
      '[MODE_PROMPT]',
      '<command-',
      '<local-command-',
      '</command',
      '</local-command',
      '[system-reminder]'
    ];

    return systemPatterns.some(pattern => content.startsWith(pattern));
  }

  /**
   * 编码路径（替换 - 为 --，替换 / 为 -）
   * 示例：D:\space -> D--space
   */
  _encodePath(filePath) {
    return filePath
      .replace(/\\/g, '/')
      .replace(/\//g, '-')
      .replace(/:/g, '')
      .replace(/-/g, '--');
  }

  /**
   * IFlow 专用路径编码
   * 与 Claude 的区别：不执行替换 - 为 -- 的步骤
   * 例如：C:\Users\28409 -> C-Users-28409（不是 C--Users-28409）
   */
  _encodePathIFlow(filePath) {
    return filePath
      .replace(/\\/g, '/')
      .replace(/\//g, '-')
      .replace(/:/g, '');
  }
}

module.exports = SessionScanner;
