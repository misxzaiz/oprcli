/**
 * ToolManager - 工具管理器
 *
 * 管理可用的工具函数，供 AI Agent 调用
 */

const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process');

/**
 * 工具基类
 */
class Tool {
  constructor(name, description, parameters = {}) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
  }

  async execute(params) {
    throw new Error(`${this.name}.execute() 必须被实现`);
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters
    };
  }
}

/**
 * 文件读取工具
 */
class ReadFileTool extends Tool {
  constructor() {
    super('read_file', '读取文件内容', {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '文件路径（相对于工作目录或绝对路径）'
        }
      },
      required: ['filePath']
    });
  }

  async execute({ filePath }) {
    try {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);

      const content = await fs.readFile(fullPath, 'utf-8');
      return {
        success: true,
        content,
        size: content.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * 文件写入工具
 */
class WriteFileTool extends Tool {
  constructor() {
    super('write_file', '写入文件内容', {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: '文件路径'
        },
        content: {
          type: 'string',
          description: '文件内容'
        }
      },
      required: ['filePath', 'content']
    });
  }

  async execute({ filePath, content }) {
    try {
      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(process.cwd(), filePath);

      await fs.writeFile(fullPath, content, 'utf-8');
      return {
        success: true,
        message: `文件已写入: ${fullPath}`,
        size: content.length
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * 列出目录工具
 */
class ListDirectoryTool extends Tool {
  constructor() {
    super('list_directory', '列出目录内容', {
      type: 'object',
      properties: {
        dirPath: {
          type: 'string',
          description: '目录路径'
        }
      },
      required: ['dirPath']
    });
  }

  async execute({ dirPath }) {
    try {
      const fullPath = path.isAbsolute(dirPath)
        ? dirPath
        : path.resolve(process.cwd(), dirPath);

      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const items = entries.map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile()
      }));

      return {
        success: true,
        path: fullPath,
        items
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * 执行命令工具
 */
class ExecuteCommandTool extends Tool {
  constructor() {
    super('execute_command', '执行 shell 命令', {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: '要执行的命令'
        },
        timeout: {
          type: 'number',
          description: '超时时间（毫秒）',
          default: 30000
        }
      },
      required: ['command']
    });
  }

  async execute({ command, timeout = 30000 }) {
    return new Promise((resolve) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let killed = false;

      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGKILL');
      }, timeout);

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({
          success: !killed && code === 0,
          exitCode: code,
          stdout,
          stderr,
          timeout: killed
        });
      });

      child.on('error', (error) => {
        clearTimeout(timer);
        resolve({
          success: false,
          error: error.message
        });
      });
    });
  }
}

/**
 * 搜索文件工具
 */
class SearchFilesTool extends Tool {
  constructor() {
    super('search_files', '在目录中搜索包含特定内容的文件', {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: '搜索模式（正则表达式）'
        },
        dirPath: {
          type: 'string',
          description: '搜索目录（默认当前目录）',
          default: '.'
        }
      },
      required: ['pattern']
    });
  }

  async execute({ pattern, dirPath = '.' }) {
    try {
      const { glob } = require('glob');
      const files = await glob(`${dirPath}/**/*`, { nodir: true });

      const results = [];
      const regex = new RegExp(pattern, 'i');

      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');
          const matches = [];

          lines.forEach((line, index) => {
            if (regex.test(line)) {
              matches.push({
                line: index + 1,
                text: line.trim()
              });
            }
          });

          if (matches.length > 0) {
            results.push({
              file,
              matches
            });
          }
        } catch (err) {
          // 跳过无法读取的文件
        }
      }

      return {
        success: true,
        results,
        totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

/**
 * 工具管理器
 */
class ToolManager {
  constructor() {
    this.tools = new Map();
    this.registerDefaultTools();
  }

  /**
   * 注册默认工具
   */
  registerDefaultTools() {
    this.register(new ReadFileTool());
    this.register(new WriteFileTool());
    this.register(new ListDirectoryTool());
    this.register(new ExecuteCommandTool());
    this.register(new SearchFilesTool());
  }

  /**
   * 注册工具
   * @param {Tool} tool
   */
  register(tool) {
    this.tools.set(tool.name, tool);
    console.log(`[ToolManager] 注册工具: ${tool.name}`);
  }

  /**
   * 获取工具
   * @param {string} name
   * @returns {Tool}
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * 执行工具
   * @param {string} name
   * @param {Object} params
   * @returns {Promise<any>}
   */
  async execute(name, params) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`工具不存在: ${name}`);
    }
    return await tool.execute(params);
  }

  /**
   * 获取所有工具定义（用于发送给 AI）
   * @returns {Array}
   */
  getToolDefinitions() {
    return Array.from(this.tools.values()).map(tool => tool.toJSON());
  }

  /**
   * 列出所有工具
   * @returns {Array<string>}
   */
  listTools() {
    return Array.from(this.tools.keys());
  }
}

module.exports = {
  ToolManager,
  Tool,
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool,
  ExecuteCommandTool,
  SearchFilesTool
};
