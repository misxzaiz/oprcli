/**
 * 文件工具类
 * 用于文件验证、MIME 类型识别等
 */
class FileHelper {
  /**
   * 验证文件是否存在且可读
   * @param {string} filePath - 文件路径
   * @returns {fs.Stats} 文件统计信息
   * @throws {Error} 如果文件不存在或不可读
   */
  static validateFile(filePath) {
    const fs = require('fs');

    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`路径不是文件: ${filePath}`);
    }

    return stats;
  }

  /**
   * 获取文件 MIME 类型
   * @param {string} filePath - 文件路径
   * @returns {string} MIME 类型
   */
  static getMimeType(filePath) {
    const path = require('path');
    const ext = path.extname(filePath).toLowerCase();

    const mimeMap = {
      // 图片
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
      '.svg': 'image/svg+xml',

      // 音频
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',

      // 视频
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
      '.mov': 'video/quicktime',
      '.wmv': 'video/x-ms-wmv',
      '.flv': 'video/x-flv',

      // 文档
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

      // 压缩文件
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed',
      '.7z': 'application/x-7z-compressed',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip',

      // 文本
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.yaml': 'application/x-yaml',
      '.yml': 'application/x-yaml',

      // 代码
      '.js': 'text/javascript',
      '.ts': 'text/typescript',
      '.py': 'text/x-python',
      '.java': 'text/x-java-source',
      '.c': 'text/x-c',
      '.cpp': 'text/x-c++',
      '.h': 'text/x-c',
      '.hpp': 'text/x-c++',
      '.cs': 'text/x-csharp',
      '.php': 'text/x-php',
      '.rb': 'text/x-ruby',
      '.go': 'text/x-go',
      '.rs': 'text/x-rust',
      '.swift': 'text/x-swift',
      '.kt': 'text/x-kotlin',
      '.dart': 'text/x-dart',

      // 配置文件
      '.ini': 'text/x-ini',
      '.cfg': 'text/plain',
      '.conf': 'text/plain',
      '.toml': 'application/toml',

      // 其他
      '.exe': 'application/x-msdownload',
      '.dll': 'application/x-msdownload',
      '.so': 'application/x-sharedlib',
      '.dylib': 'application/x-sharedlib'
    };

    return mimeMap[ext] || 'application/octet-stream';
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 文件大小（字节）
   * @returns {string} 格式化后的文件大小
   */
  static formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }

  /**
   * 获取文件扩展名
   * @param {string} filePath - 文件路径
   * @returns {string} 文件扩展名（包含点号）
   */
  static getExtension(filePath) {
    const path = require('path');
    return path.extname(filePath).toLowerCase();
  }

  /**
   * 判断是否为图片文件
   * @param {string} filePath - 文件路径
   * @returns {boolean} 是否为图片
   */
  static isImage(filePath) {
    const ext = this.getExtension(filePath);
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'];
    return imageExts.includes(ext);
  }

  /**
   * 判断是否为音频文件
   * @param {string} filePath - 文件路径
   * @returns {boolean} 是否为音频
   */
  static isAudio(filePath) {
    const ext = this.getExtension(filePath);
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    return audioExts.includes(ext);
  }

  /**
   * 判断是否为视频文件
   * @param {string} filePath - 文件路径
   * @returns {boolean} 是否为视频
   */
  static isVideo(filePath) {
    const ext = this.getExtension(filePath);
    const videoExts = ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv'];
    return videoExts.includes(ext);
  }

  /**
   * 根据文件路径自动检测文件类型
   * @param {string} filePath - 文件路径
   * @returns {string} 文件类型 (image/audio/video/file)
   */
  static detectFileType(filePath) {
    if (this.isImage(filePath)) return 'image';
    if (this.isAudio(filePath)) return 'audio';
    if (this.isVideo(filePath)) return 'video';
    return 'file';
  }

  /**
   * 检查文件大小是否超过限制
   * @param {string} filePath - 文件路径
   * @param {number} maxSize - 最大文件大小（字节）
   * @returns {boolean} 是否超过限制
   */
  static isFileSizeExceeded(filePath, maxSize = 100 * 1024 * 1024) {
    const stats = this.validateFile(filePath);
    return stats.size > maxSize;
  }

  /**
   * 生成安全的文件名
   * @param {string} filename - 原始文件名
   * @returns {string} 安全的文件名
   */
  static sanitizeFilename(filename) {
    const path = require('path');

    // 移除路径分隔符和特殊字符
    const basename = path.basename(filename)
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .trim();

    return basename || 'unnamed_file';
  }

  /**
   * 确保目录存在
   * @param {string} dirPath - 目录路径
   */
  static ensureDir(dirPath) {
    const fs = require('fs');
    const path = require('path');

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * 删除文件
   * @param {string} filePath - 文件路径
   * @returns {boolean} 是否删除成功
   */
  static deleteFile(filePath) {
    const fs = require('fs');

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`删除文件失败: ${error.message}`);
      return false;
    }
  }
}

module.exports = FileHelper;
