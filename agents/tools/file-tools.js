/**
 * 文件操作工具集
 * 提供文件读写、目录列表等功能
 */

const fs = require('fs').promises;
const path = require('path');
const { glob } = require('glob');

/**
 * 获取文件工具定义
 */
function getFileTools() {
  return [
    {
      name: 'read_file',
      description: '读取文件内容，返回文件文本内容',
      input_schema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: '文件的相对路径或绝对路径'
          }
        },
        required: ['filePath']
      },
      handler: async (args, workDir) => {
        try {
          const fullPath = path.resolve(workDir, args.filePath);
          const content = await fs.readFile(fullPath, 'utf-8');
          return {
            success: true,
            content,
            path: fullPath
          };
        } catch (error) {
          return {
            success: false,
            error: `读取文件失败: ${error.message}`
          };
        }
      }
    },

    {
      name: 'write_file',
      description: '写入内容到文件，会覆盖已存在的文件',
      input_schema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: '文件的相对路径或绝对路径'
          },
          content: {
            type: 'string',
            description: '要写入的内容'
          }
        },
        required: ['filePath', 'content']
      },
      handler: async (args, workDir) => {
        try {
          const fullPath = path.resolve(workDir, args.filePath);
          const dir = path.dirname(fullPath);

          // 确保目录存在
          await fs.mkdir(dir, { recursive: true });

          // 写入文件
          await fs.writeFile(fullPath, args.content, 'utf-8');

          return {
            success: true,
            message: '文件写入成功',
            path: fullPath,
            bytes: Buffer.byteLength(args.content, 'utf-8')
          };
        } catch (error) {
          return {
            success: false,
            error: `写入文件失败: ${error.message}`
          };
        }
      }
    },

    {
      name: 'list_files',
      description: '列出目录中的文件，支持模式匹配',
      input_schema: {
        type: 'object',
        properties: {
          dirPath: {
            type: 'string',
            description: '目录路径，默认为工作目录'
          },
          pattern: {
            type: 'string',
            description: '文件匹配模式，如 *.js, **/*.json'
          }
        },
        required: []
      },
      handler: async (args, workDir) => {
        try {
          const targetDir = args.dirPath
            ? path.resolve(workDir, args.dirPath)
            : workDir;

          let files = [];

          if (args.pattern) {
            // 使用 glob 模式匹配
            files = await glob(args.pattern, {
              cwd: targetDir,
              absolute: false
            });
          } else {
            // 列出所有文件
            const entries = await fs.readdir(targetDir, { withFileTypes: true });
            files = entries
              .filter(entry => entry.isFile())
              .map(entry => entry.name);
          }

          return {
            success: true,
            files,
            count: files.length,
            directory: targetDir
          };
        } catch (error) {
          return {
            success: false,
            error: `列出文件失败: ${error.message}`
          };
        }
      }
    },

    {
      name: 'search_in_files',
      description: '在文件中搜索文本内容',
      input_schema: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: '搜索模式（正则表达式）'
          },
          filePattern: {
            type: 'string',
            description: '文件匹配模式，如 *.js'
          }
        },
        required: ['pattern']
      },
      handler: async (args, workDir) => {
        try {
          const { readFile } = require('fs/promises');

          // 查找匹配的文件
          const files = await glob(args.filePattern || '**/*', {
            cwd: workDir,
            absolute: true
          });

          const results = [];
          const regex = new RegExp(args.pattern, 'gi');

          for (const file of files) {
            try {
              const content = await readFile(file, 'utf-8');
              const matches = content.match(regex);

              if (matches && matches.length > 0) {
                results.push({
                  file: path.relative(workDir, file),
                  matches: matches.length
                });
              }
            } catch (err) {
              // 跳过无法读取的文件（二进制文件等）
            }
          }

          return {
            success: true,
            results,
            totalMatches: results.reduce((sum, r) => sum + r.matches, 0)
          };
        } catch (error) {
          return {
            success: false,
            error: `搜索失败: ${error.message}`
          };
        }
      }
    }
  ];
}

module.exports = { getFileTools };
