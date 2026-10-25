import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { backend, getAuthenticatedUsername } from './backend'
import { AuthenticatedView, View } from './views'

const app = new Hono()

app.get('/static/*', serveStatic({ root: './dist' }))

app.get('/', (c) => {
  const username = getAuthenticatedUsername(c)
  if (username) return c.html(<AuthenticatedView username={username} />)

  return c.html(<View />)
})
app.route('/api', backend)

export default app
