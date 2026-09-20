import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as authApi from 'src/api/auth'
import { clearToken, getToken, setToken } from 'src/utils/auth'

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

  // Provider 挂载时自动拉取用户资料（含菜单树/权限），动态路由依赖 menus 生成，必须先于布局加载
  useEffect(() => {
    if (getToken()) {
      refreshProfile().catch(() => {})
    }
  }, [refreshProfile])

  // 局部更新当前用户信息（如切换部门后更新 dept_id），避免整包重新拉取
  const updateUser = useCallback((patch) => {
    setUser((prev) =>
      prev
        ? { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }
        : prev,
    )
  }, [])

  const logout = useCallback(() => {
    // 清理页签持久化缓存，避免下一位用户看到上一用户的页签
    sessionStorage.removeItem('oa-tabs')
    clearToken()
    setTokenState('')
    setUser(null)
    setMenus([])
    setPerms([])
    setMenusLoaded(false)
  }, [])

  // 判断是否拥有某个权限标识（按钮级权限）
  const hasPerm = useCallback((perm) => perms.includes(perm), [perms])

  // Context value 稳定引用：仅在实际状态/回调变化时更新，避免切换部门等局部更新波及所有消费者
  const contextValue = useMemo(
    () => ({
      token,
      user,
      menus,
      perms,
      menusLoaded,
      login,
      logout,
      refreshProfile,
      updateUser,
      hasPerm,
    }),
    [token, user, menus, perms, menusLoaded, login, logout, refreshProfile, updateUser, hasPerm],
  )

  return (
    <AuthContext.Provider value={contextValue}>
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
