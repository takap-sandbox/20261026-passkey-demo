import type { Child } from 'hono/jsx'

const Layout = ({ title, children }: { title: string; children: Child }) => (
  <html lang="ja">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title}</title>
      <style>{`
        body { margin-top: 80px; text-align: center; }
      `}</style>
    </head>
    <body>{children}</body>
  </html>
)

export const View = () => (
  <Layout title="Passkey Demo">
    <div id="app" />
    <script
      type="module"
      src={import.meta.env?.DEV ? '/src/frontend.tsx' : '/static/frontend.js'}
    ></script>
  </Layout>
)

export const AuthenticatedView = ({ username }: { username: string }) => (
  <Layout title="認証済み | Passkey Demo">
    <main>
      <span class="badge">認証済み</span>
      <h1>ようこそ、{username}さん</h1>
      <p>パスキーによる認証が完了しています。</p>
      <form method="post" action="/api/logout">
        <button type="submit">ログアウト</button>
      </form>
    </main>
  </Layout>
)

