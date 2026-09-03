import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import accessRequestsHandler from './api/firebase/access-requests.js'
import ensureTeamStaffHandler from './api/firebase/ensure-team-staff.js'
import submitHandler from './api/submit.js'

function createVercelLikeResponse(res) {
  return {
    setHeader(name, value) {
      res.setHeader(name, value)
    },
    status(code) {
      res.statusCode = code
      return this
    },
    json(payload) {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(payload))
    },
    end(payload) {
      res.end(payload)
    },
  }
}

function viteEnvDevCompatibility() {
  return {
    name: 'vite-env-dev-compatibility',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split('?')[0]

        if (pathname === '/api/submit') {
          await submitHandler(req, createVercelLikeResponse(res))
          return
        }

        if (pathname === '/api/firebase/ensure-team-staff') {
          await ensureTeamStaffHandler(req, createVercelLikeResponse(res))
          return
        }

        if (pathname === '/api/firebase/access-requests') {
          await accessRequestsHandler(req, createVercelLikeResponse(res))
          return
        }

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
