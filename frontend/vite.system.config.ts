import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { fileURLToPath, URL } from 'node:url'

const SYSTEM_INDEX = '/index-system.html'

/** 将 SPA 路由回退到系统管理入口，避免落到业务端 index.html */
function systemIndexPlugin(): Plugin {
  return {
    name: 'system-index',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url || ''
        if (
          url === '/' ||
          url.startsWith('/?') ||
          (!url.includes('.') &&
            !url.startsWith('/api') &&
            !url.startsWith('/@') &&
            !url.startsWith('/src') &&
            !url.startsWith('/node_modules'))
        ) {
          req.url = SYSTEM_INDEX
        }
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url || ''
        if (url === '/' || url.startsWith('/?') || !url.includes('.')) {
          req.url = SYSTEM_INDEX
        }
        next()
      })
    },
  }
}

/** 系统管理端独立入口，默认端口 5174 */
export default defineConfig({
  plugins: [
    systemIndexPlugin(),
    vue(),
    AutoImport({ resolvers: [ElementPlusResolver()] }),
    Components({ resolvers: [ElementPlusResolver()] }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
  build: {
    outDir: 'dist-system',
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL('./index-system.html', import.meta.url)),
    },
  },
})
