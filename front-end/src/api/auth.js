import request from 'src/api/request'

// POST /auth/login 登录，返回 { token, user }
export function login(data) {
  return request.post('/auth/login', data)
}

// GET /auth/profile 当前用户 + 菜单树 + 权限标识
export function getProfile() {
  return request.get('/auth/profile')
}

// GET /auth/menus 当前用户菜单树
export function getUserMenus() {
  return request.get('/auth/menus')
}
