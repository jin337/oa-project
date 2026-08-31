const TOKEN_KEY = 'rbac_token'
const CREDENTIALS_KEY = 'rbac_credentials'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function isLoggedIn() {
  return Boolean(getToken())
}

// —— 记住密码：缓存 / 读取 / 清除用户名与密码 ——
export function saveCredentials(username, password) {
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ username, password }))
}

export function getCredentials() {
  const raw = localStorage.getItem(CREDENTIALS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearCredentials() {
  localStorage.removeItem(CREDENTIALS_KEY)
}
