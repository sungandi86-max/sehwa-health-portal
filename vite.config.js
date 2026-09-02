import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function viteEnvDevCompatibility() {
  return {
    name: 'vite-env-dev-compatibility',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0]

        if (pathname !== '/node_modules/vite/dist/client/env.mjs') {
          next()
          return
        }

        const transformedEnv = await server.transformRequest('/@vite/env')

        if (!transformedEnv) {
          next()
          return
        }

        res.setHeader('Content-Type', 'application/javascript')
        res.end(transformedEnv.code)
      })
    },
  }
}

export default defineConfig({
  plugins: [viteEnvDevCompatibility(), react()],
})
