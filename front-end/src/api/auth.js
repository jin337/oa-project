import request from 'src/api/request'

// POST /auth/login 登录，返回 { token, user }
export function login(data) {
  return request.post('/auth/login', data)
}

// GET /auth/profile 当前用户 + 菜单树 + 权限标识
export function getProfile() {
  return request.get('/auth/profile')
}

// POST /auth/logout 登出：后端吊销当前用户全部已签发 token
export function logout() {
  return request.post('/auth/logout')
}

// GET /auth/menus 当前用户菜单树
export function getUserMenus() {
  return request.get('/auth/menus')
}
