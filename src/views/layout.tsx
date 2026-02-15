/** @jsxImportSource hono/jsx */

export function Layout(props: { title: string; children: unknown }) {
  return (
    <html lang="ja" data-theme="light">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{props.title} - 蔵書管理</title>
        <link
          href="https://cdn.jsdelivr.net/npm/daisyui@4/dist/full.min.css"
          rel="stylesheet"
          type="text/css"
        />
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/htmx.org@2"></script>
      </head>
      <body class="min-h-screen bg-base-200">
        <div class="navbar bg-base-100 shadow-lg">
          <div class="flex-1">
            <a href="/" class="btn btn-ghost text-xl">蔵書管理</a>
          </div>
          <div class="flex-none gap-2">
            <a href="/" class="btn btn-ghost btn-sm">ライブラリ</a>
            <a href="/books/new" class="btn btn-primary btn-sm">書籍登録</a>
          </div>
        </div>
        <main class="container mx-auto p-4 max-w-7xl">
          {props.children}
        </main>
      </body>
    </html>
  );
}
