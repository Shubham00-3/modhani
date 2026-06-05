/* global Buffer, process */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  Object.entries(env).forEach(([key, value]) => {
    if (process.env[key] === undefined) process.env[key] = value
  })

  return {
    plugins: [react(), localApiRoutes()],
  }
})

function localApiRoutes() {
  return {
    name: 'modhanios-local-api-routes',
    apply: 'serve',
    configureServer(server) {
      const apiRoot = path.resolve(process.cwd(), 'api')

      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        if (!requestUrl.pathname.startsWith('/api/')) {
          next()
          return
        }

        const relativeRoute = requestUrl.pathname.replace(/^\/api\//, '')
        const routePath = path.resolve(apiRoot, `${relativeRoute}.js`)
        if (!routePath.startsWith(apiRoot) || !fs.existsSync(routePath)) {
          next()
          return
        }

        try {
          req.query = Object.fromEntries(requestUrl.searchParams.entries())
          req.body = await readRequestBody(req)
          attachResponseHelpers(res)

          const routeModule = await import(`${pathToFileURL(routePath).href}?t=${Date.now()}`)
          if (typeof routeModule.default !== 'function') {
            res.status(500).json({ ok: false, error: `API route ${relativeRoute} has no default handler.` })
            return
          }

          await routeModule.default(req, res)
        } catch (error) {
          server.config.logger.error(error?.stack || error?.message || String(error))
          if (!res.headersSent) {
            attachResponseHelpers(res)
            res.status(500).json({ ok: false, error: error?.message || 'Local API route failed.' })
          }
        }
      })
    },
  }
}

async function readRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return {}

  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  req.rawBody = rawBody
  if (!rawBody) return {}

  const contentType = String(req.headers['content-type'] || '').toLowerCase()
  if (contentType.includes('application/json')) {
    return JSON.parse(rawBody)
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody).entries())
  }
  return rawBody
}

function attachResponseHelpers(res) {
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (payload) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(payload))
  }
  res.send = (payload) => {
    if (typeof payload === 'object' && payload !== null && !Buffer.isBuffer(payload)) {
      res.json(payload)
      return
    }
    res.end(payload)
  }
}
