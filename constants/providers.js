/**
 * 提供商常量
 * 统一管理 AI 提供商字符串
 */

const Providers = {
  CLAUDE: 'claude',
  IFLOW: 'iflow'
}

// 提供商显示名称映射
const ProviderNames = {
  [Providers.CLAUDE]: 'Claude Code',
  [Providers.IFLOW]: 'IFlow'
}

module.exports = {
  Providers,
  ProviderNames
}
