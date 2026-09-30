const TOKEN_KEY = 'rbac_token'
const CREDENTIALS_KEY = 'rbac_credentials'

// —— 记住密码：密码不落明文，AES-GCM 转译后存储 ——
// 安全上下文（https / localhost）下使用 Web Crypto AES-GCM（随机 IV + PBKDF2 派生密钥）；
// 非安全上下文（生产 http 部署）回退 Base64 编码，至少避免明文直读。
// 说明：密钥常驻前端，本方案防「明文直读 / 误触可见」，不防有意的调试者（前端加密的固有边界）。
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const IV_LEN = 12
const KEY_MATERIAL = 'rbac-remember-pwd'
const KEY_SALT = 'rbac-remember-salt'

let cachedKey = null

async function getKey() {
  if (cachedKey) return cachedKey
  const material = await crypto.subtle.importKey('raw', encoder.encode(KEY_MATERIAL), 'PBKDF2', false, [
    'deriveKey',
  ])
  cachedKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode(KEY_SALT), iterations: 10000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
  return cachedKey
}

function bytesToB64(bytes) {
  return btoa(String.fromCharCode(...bytes))
}

function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** 密码转译：enc:AES-GCM 密文 / b64:Base64（非安全上下文回退） */
export async function obfuscatePassword(plain) {
  if (crypto?.subtle) {
    const key = await getKey()
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(plain))
    const buf = new Uint8Array(cipher)
    const out = new Uint8Array(IV_LEN + buf.length)
    out.set(iv, 0)
    out.set(buf, IV_LEN)
    return 'enc:' + bytesToB64(out)
  }
  return 'b64:' + btoa(plain)
}

/** 还原密码：解析失败或旧明文数据返回 null（不回填，需手动输入） */
export async function restorePassword(encoded) {
  if (!encoded) return null
  try {
    if (encoded.startsWith('enc:')) {
      if (!crypto?.subtle) return null
      const raw = b64ToBytes(encoded.slice(4))
      const key = await getKey()
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: raw.slice(0, IV_LEN) },
        key,
        raw.slice(IV_LEN)
      )
      return decoder.decode(plain)
    }
    if (encoded.startsWith('b64:')) {
      return atob(encoded.slice(4))
    }
    return null
  } catch {
    return null
  }
}

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

// —— 记住密码：缓存 / 读取 / 清除用户名与转译密码 ——
export async function saveCredentials(username, password) {
  const pwd = password ? await obfuscatePassword(password) : ''
  localStorage.setItem(CREDENTIALS_KEY, JSON.stringify({ username, password: pwd }))
}

export async function getCredentials() {
  const raw = localStorage.getItem(CREDENTIALS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return { username: parsed.username || '', password: (await restorePassword(parsed.password)) || '' }
  } catch {
    return null
  }
}

export function clearCredentials() {
  localStorage.removeItem(CREDENTIALS_KEY)
}
