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
      // 限制读取大小（前 30KB，增加匹配概率）
      const fd = fs.openSync(filePath, 'r');
      const bufferSize = Math.min(30720, fs.statSync(filePath).size);
      const buffer = Buffer.alloc(bufferSize);
      fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);

      const content = buffer.toString('utf8');

      // 根据文件路径判断 Provider
      const isCodex = filePath.includes('.codex');
      const isClaude = filePath.includes('.claude');
      const isIFlow = filePath.includes('.iflow');

      // 使用智能 JSON 解析（处理嵌入换行符的情况）
      const objects = this._parseJsonlObjects(content);

      for (const data of objects) {
        // 尝试多种消息格式
        let msg = null;

        // ===== Codex 格式 =====
        if (isCodex && data.type === 'response_item' && data.payload?.role === 'user') {
          const contentArr = data.payload.content;
          if (Array.isArray(contentArr)) {
            const texts = contentArr
              .filter(c => c.type === 'input_text' && c.text)
              .map(c => c.text);
            if (texts.length > 0) {
              msg = this._extractRealUserInput(texts.join('\n'));
            }
          }
        }
        else if (isCodex && data.type === 'user_query' && data.payload?.query) {
          msg = data.payload.query;
        }

        // ===== Claude/IFlow 格式 =====
        else if ((isClaude || isIFlow) && data.type === 'user' && data.message?.content) {
          const rawContent = data.message.content;
          // Claude 的 content 可能是字符串或数组
          if (typeof rawContent === 'string') {
            msg = rawContent;
          } else if (Array.isArray(rawContent)) {
            // 处理 content 数组
            const textParts = rawContent
              .filter(c => typeof c === 'string' || c.type === 'text')
              .map(c => typeof c === 'string' ? c : c.text);
            if (textParts.length > 0) {
              msg = textParts.join(' ');
            }
          }
        }

        // ===== 通用格式 =====
        else if (data.type === 'user_message' && data.content) {
          msg = typeof data.content === 'string' ? data.content : null;
        }
        else if (data.role === 'user' && data.content) {
          msg = typeof data.content === 'string' ? data.content : null;
        }
        else if (typeof data.message === 'string') {
          msg = data.message;
        }

        if (msg && typeof msg === 'string') {
          const cleaned = msg.trim().replace(/\n+/g, ' ');

          // 跳过系统注入的消息
          if (this._isSystemMessage(cleaned)) {
            continue;
          }

          // 截取前 80 个字符作为预览
          return cleaned.length > 80 ? cleaned.substring(0, 80) + '...' : cleaned;
        }
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
   * 智能解析 JSONL 对象（处理 JSON 中嵌入换行符的情况）
   */
  _parseJsonlObjects(content) {
    const results = [];
    let depth = 0;
    let inString = false;
    let escape = false;
    let start = 0;

    for (let i = 0; i < content.length; i++) {
      const c = content[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (c === '\\') {
        escape = true;
        continue;
      }

      if (c === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            const jsonStr = content.substring(start, i + 1);
            try {
              results.push(JSON.parse(jsonStr));
            } catch (e) {
              // 跳过解析失败的对象
            }
            start = i + 1;
          }
        }
      }
    }

    return results;
  }

  /**
   * 从 Codex 注入了对话历史的消息中提取真正的用户输入
   * 格式可能是：
   * **助手**: ...\n---\n**用户**: ...\n---\n[RUNTIME_CONTEXT]...真正的输入
   */
  _extractRealUserInput(text) {
    // 如果消息很短，直接返回
    if (text.length < 200) {
      return text;
    }

    // 尝试从消息末尾提取用户输入
    // 查找最后的分隔符后的内容
    const separators = ['\n---\n\n请继续上面对话。', '\n---\n', '---\n\n'];

    for (const sep of separators) {
      const lastSepIndex = text.lastIndexOf(sep);
      if (lastSepIndex > 0) {
        const afterSep = text.substring(lastSepIndex + sep.length).trim();
        // 检查是否是系统注入的消息
        if (afterSep && !this._isSystemMessage(afterSep)) {
          return afterSep;
        }
      }
    }

    // 尝试提取 [MODE_INSTRUCTION] 之后的内容
    const modeInstrMatch = text.match(/\[\/MODE_INSTRUCTION\]\s*\n+(.+?)(?:\n---|\n\*\*|$)/s);
    if (modeInstrMatch) {
      const extracted = modeInstrMatch[1].trim();
      if (extracted && !this._isSystemMessage(extracted)) {
        return extracted;
      }
    }

    // 降级：返回原始文本
    return text;
  }

  /**
   * 判断是否为系统消息（跳过系统注入的内容）
   */
  _isSystemMessage(content) {
    // 系统注入的模式（匹配开头）
    const startPatterns = [
      '[RUNTIME_CONTEXT]',
      '[MODE_PROMPT]',
      '[MODE_INSTRUCTION]',
      '<command-',
      '<local-command-',
      '<permissions',
      '<INSTRUCTIONS>',
      '<environment_context>',
      '<system-reminder>',
      '[system-reminder]'
    ];

    // 系统注入的模式（匹配包含）
    const containPatterns = [
      '# AGENTS.md instructions',
      '## Skills',
      '### Available skills',
      'You are Codex',
      'You are Claude Code',
      'You are iFlow CLI',
      'You and the user share the same workspace'
    ];

    // 检查开头模式
    if (startPatterns.some(pattern => content.startsWith(pattern))) {
      return true;
    }

    // 检查包含模式（对于长消息）
    if (content.length > 200 && containPatterns.some(pattern => content.includes(pattern))) {
      return true;
    }

    return false;
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
