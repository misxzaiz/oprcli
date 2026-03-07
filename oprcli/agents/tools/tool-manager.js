/**
 * Tool Manager
 * 管理和执行所有工具
 */

const { getFileTools } = require('./file-tools');

class ToolManager {
  constructor(workDir) {
    this.workDir = workDir;
    this.tools = new Map();
    this.registerDefaultTools();
  }

  /**
   * 注册默认工具集
   */
  registerDefaultTools() {
    // 注册文件工具
    this.registerTools(getFileTools());

    // 可以在这里添加更多工具集
    // this.registerTools(getBrowserTools());
    // this.registerTools(getSystemTools());
  }

  /**
   * 批量注册工具
   */
  registerTools(tools) {
    tools.forEach(tool => {
      this.tools.set(tool.name, tool);
    });
  }

  /**
   * 注册单个工具
   */
  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  /**
   * 获取所有工具定义
   */
  getTools() {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具定义
   */
  getTool(name) {
    return this.tools.get(name);
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name) {
    return this.tools.has(name);
  }

  /**
   * 执行工具
   */
  async execute(toolName, args) {
    const tool = this.tools.get(toolName);

    if (!tool) {
      throw new Error(`工具不存在: ${toolName}`);
    }

    if (!tool.handler) {
      throw new Error(`工具 ${toolName} 没有处理器`);
    }

    try {
      const result = await tool.handler(args, this.workDir);
      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
        tool: toolName
      };
    }
  }

  /**
   * 生成工具列表描述（用于系统提示词）
   */
  getToolsDescription() {
    const tools = this.getTools();
    return tools
      .map(tool => `- ${tool.name}: ${tool.description}`)
      .join('\n');
  }

  /**
   * 获取工具统计信息
   */
  getStats() {
    return {
      total: this.tools.size,
      tools: Array.from(this.tools.keys())
    };
  }
}

module.exports = ToolManager;
