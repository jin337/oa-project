/**
 * 全局常量
 */

// 后端 API 统一前缀：唯一真值来自 .env 的 VITE_API_PREFIX（版本号变更只改 .env）
export const API_PREFIX = import.meta.env.VITE_API_PREFIX || '/v1/api'

// 前端部署子路径（base path）：唯一真值来自 .env 的 VITE_BASE_PATH。
// 空字符串 = 根路径部署（默认）；部署到 /v1 等子目录时填 '/v1'，需同步 vite.config.js 的 base 与 Nginx location
export const BASE_PATH = import.meta.env.VITE_BASE_PATH || ''
