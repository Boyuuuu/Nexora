import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const openaiTarget = env.VITE_OPENAI_PROXY_TARGET || 'https://api.openai.com'

  return {
    plugins: [vue()],
    server: {
      proxy: {
        '/zhida': {
          target: 'https://developer.zhihu.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/zhida/, ''),
        },
        '/openai': {
          target: openaiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/openai/, ''),
        },
      },
    },
  }
})
