/**
 * 全局常量
 */

// 后端 API 统一前缀：唯一真值来自 .env 的 VITE_API_PREFIX（版本号变更只改 .env）
export const API_PREFIX = import.meta.env.VITE_API_PREFIX || '/v1/api'
