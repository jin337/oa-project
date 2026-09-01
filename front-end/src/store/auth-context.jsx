import { createContext, useCallback, useContext, useState } from 'react'
import * as authApi from '../api/auth'
import { clearToken, getToken, setToken } from '../utils/auth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setTokenState] = useState(getToken())
  const [user, setUser] = useState(null)
  const [menus, setMenus] = useState([])
  const [perms, setPerms] = useState([])
  // 菜单数据是否已从后端加载完成（用于路由权限校验，避免未加载时误判为无权限）
  const [menusLoaded, setMenusLoaded] = useState(false)

  // 登录：保存 token 并拉取用户资料（含菜单树与权限标识）
  const login = useCallback(async (form) => {
    const res = await authApi.login(form)
    setToken(res.data.token)
    setTokenState(res.data.token)
    setUser(res.data.user)
    await refreshProfile()
    return res.data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 拉取当前用户资料：{ user, menus, perms }
  const refreshProfile = useCallback(async () => {
    try {
      const res = await authApi.getProfile()
      setUser(res.data.user)
      setMenus(res.data.menus || [])
      setPerms(res.data.perms || [])
      return res.data
    } finally {
      setMenusLoaded(true)
    }
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setTokenState('')
    setUser(null)
    setMenus([])
    setPerms([])
    setMenusLoaded(false)
    window.location.reload()
  }, [])

  // 判断是否拥有某个权限标识（按钮级权限）
  const hasPerm = useCallback((perm) => perms.includes(perm), [perms])

  return (
    <AuthContext.Provider
      value={{ token, user, menus, perms, menusLoaded, login, logout, refreshProfile, hasPerm }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return ctx
}
