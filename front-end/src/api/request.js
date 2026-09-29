import axios from 'axios'
import { Message } from '@arco-design/web-react'
import { getToken, clearToken } from 'src/utils/auth'

// 后端统一返回：{ code, msg, data, timestamp }，code=0 为成功
const request = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
})

request.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 统一的登录态失效处理
function handleUnauthorized() {
  clearToken()
  Message.error('登录已过期，请重新登录')
  window.location.href = '/login'
}

request.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res && typeof res === 'object' && 'code' in res) {
      if (res.code === 0) {
        return res
      }
      if (res.code === 1) {
        // 业务结果型错误（如接口试调失败）：不弹全局提示，交由调用方展示
        return res
      }
      if (res.code === 401) {
        handleUnauthorized()
        return Promise.reject(new Error(res.msg || '未登录或登录已过期'))
      }
      Message.error(res.msg || '请求失败')
      return Promise.reject(new Error(res.msg || `业务错误码 ${res.code}`))
    }
    return res
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      handleUnauthorized()
      return Promise.reject(error)
    }
    const msg = error.response?.data?.msg || error.message || '网络请求失败'
    Message.error(msg)
    return Promise.reject(error)
  }
)

export default request
