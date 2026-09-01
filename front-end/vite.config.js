import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { compression } from 'vite-plugin-compression2'
import { APP_NAME } from './src/config/app.js'

// 前端开发服务：固定端口 8181，/api 请求代理到后端 Go 服务（默认 8180）
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // 将全局配置中的系统名称注入 index.html 的 <title>，确保标题与运行时一致
    {
      name: 'inject-app-title',
      transformIndexHtml(html) {
        return html.replace(/<title>.*<\/title>/, `<title>${APP_NAME}</title>`)
      },
    },
    // 构建产物压缩：10KB 以上的资源额外生成 .gz / .br 文件，供 Nginx 等静态服务器直接下发
    compression({
      algorithms: ['gzip', 'brotliCompress'],
      threshold: 10240,
    }),
  ],
  server: {
    port: 8181,
    open: true,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8180',
        changeOrigin: true,
      },
      // 后端健康检查在根路径 GET /，映射到 /health 便于前端调用
      '/health': {
        target: 'http://localhost:8180',
        changeOrigin: true,
        rewrite: () => '/',
      },
    },
  },
  build: {
    // arco 组件库本身体积较大（约 640KB），单独分包后已可长期缓存，提高警告阈值避免噪音
    chunkSizeWarningLimit: 700,
    // 分包策略：大型依赖独立成包，浏览器可长期缓存，业务代码更新不牵连
    rollupOptions: {
      output: {
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/chunks/[name]-[hash].js',
        assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          const chunkMap = {
            'vendor-arco': ['@arco-design/web-react'],
            'vendor-react': ['react', 'react-dom', 'react-router-dom', 'scheduler'],
            'vendor-axios': ['axios']
          }

          for (const [chunkName, deps] of Object.entries(chunkMap)) {
            if (deps.some(dep => id.includes(`node_modules/${dep}`))) {
              return chunkName;
            }
          }
          return undefined
        },
      },
    },
  },
})
