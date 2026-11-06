import { Button, Result, Space } from '@arco-design/web-react'
import { Component } from 'react'

/**
 * 页面错误边界：捕获子树渲染期抛出的异常，降级为可恢复的错误提示，避免整页白屏。
 * 覆盖范围：React 渲染/生命周期/构造器内的错误（Suspense 之外此前无任何兜底）。
 * 不捕获：事件回调、异步请求失败——这类错误由请求拦截器/业务代码自行处理。
 *
 * 用法：<ErrorBoundary>{page}</ErrorBoundary>，key 变化即重置错误态（切页签/切路由自动恢复）。
 * 错误详情 console.error 输出，便于排查；界面只展示概要，不泄露堆栈给用户。
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] 页面渲染异常:', error, info?.componentStack)
  }

  handleReset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (error) {
      return (
        <Result
          status="error"
          title="页面出错了"
          subTitle={`该页面渲染时发生异常${error.message ? `：${error.message}` : ''}，可尝试重试；若反复出现请联系管理员`}
          extra={
            <Space>
              <Button type="primary" onClick={this.handleReset}>
                重试
              </Button>
              <Button
                onClick={() => {
                  window.location.reload()
                }}
              >
                刷新页面
              </Button>
            </Space>
          }
        >
          <div className="text-center text-gray-400 text-xs">
            提示：若该页面由页签缓存产生，关闭当前页签重新打开也可恢复
          </div>
        </Result>
      )
    }
    return this.props.children
  }
}
