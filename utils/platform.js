/**
 * 平台检测工具模块
 * 提供跨平台的兼容性检查
 */

/**
 * 检查是否为 Windows 平台
 * @returns {boolean}
 */
function isWindows() {
  return process.platform === 'win32'
}

/**
 * 检查是否为 macOS 平台
 * @returns {boolean}
 */
function isMac() {
  return process.platform === 'darwin'
}

/**
 * 检查是否为 Linux 平台
 * @returns {boolean}
 */
function isLinux() {
  return process.platform === 'linux'
}

/**
 * 获取平台特定的进程终止命令
 * @param {number} pid - 进程 ID
 * @returns {{command: string, args: string[]}}
 */
function getKillCommand(pid) {
  if (isWindows()) {
    return {
      command: 'taskkill',
      args: ['/F', '/T', '/PID', pid.toString()]
    }
  }
  return {
    command: 'kill',
    args: ['-9', pid.toString()]
  }
}

module.exports = {
  isWindows,
  isMac,
  isLinux,
  getKillCommand
}
