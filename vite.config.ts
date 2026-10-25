import devServer from '@hono/vite-dev-server'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [devServer({ entry: 'src/index.tsx' })],
  server: { port: 3000 },
  build: {
    rolldownOptions: {
      input: './src/frontend.tsx',
      output: { entryFileNames: 'static/frontend.js' },
    },
  },
})
