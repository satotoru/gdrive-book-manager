# Google Drive 蔵書管理アプリ

Google Driveをバックエンドストレージとして利用する、軽量なLAN内ホスティング型の蔵書管理Webアプリケーションです。

ローカルデータベースを持たず、Google Driveのカスタムプロパティを活用してメタデータを管理します。

## 技術スタック

- **Runtime:** Deno
- **Web Framework:** Hono（SSR）
- **UI:** htmx + TailwindCSS + DaisyUI
- **ストレージ:** Google Drive API
- **書誌情報取得:** OpenBD / Google Books API

## 機能一覧

### Phase 1: Web UI & CRUD

- **書籍登録** - ISBN検索による書誌情報自動補完（OpenBD → Google Booksフォールバック）、EPUB/PDFファイルアップロード
- **ライブラリ閲覧** - グリッド表示（カバー画像サムネイル付き）、タイトル・著者名・ファイル名検索、ページネーション
- **書籍編集** - メタデータ編集、ファイル名自動リネーム、フォルダ構成の自動更新
- **書籍削除** - 確認ダイアログ付き、カバー画像の同時削除
- **ダウンロード** - ブラウザ標準ダウンロード（ビューワー機能なし）

### Phase 2: OPDS & パフォーマンス

- **OPDSサーバー** - OPDS 1.2準拠のAtom Feed配信、OpenSearch対応
- **インメモリキャッシュ** - TTL 1時間、登録/編集/削除時の自動無効化

## セットアップ

### 前提条件

- [Deno](https://deno.land/) v2 以上
- Google Cloud Platform プロジェクト（Drive API有効化済み）

### 1. Denoのインストール

```bash
curl -fsSL https://deno.land/install.sh | sh
```

### 2. GCPプロジェクトの設定

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成
2. Google Drive API を有効化
3. OAuth 2.0 クライアントIDを作成（デスクトップアプリまたはWebアプリ）
4. クライアントID・クライアントシークレットを取得

### 3. 環境変数の設定

```bash
export GOOGLE_CLIENT_ID="your-client-id"
export GOOGLE_CLIENT_SECRET="your-client-secret"
export GOOGLE_REDIRECT_URI="http://localhost:8000/auth/callback"  # デフォルト
export PORT=8000  # オプション（デフォルト: 8000）
```

### 4. アプリの起動

```bash
deno task start
```

初回起動時はコンソールにOAuth認証URLが表示されます。ブラウザで開いて認証を完了してください。認証トークンは `token.json` に保存され、以降は自動的にリフレッシュされます。

### 開発モード（ファイル変更時に自動再起動）

```bash
deno task dev
```

## テストの実行

Google Drive APIのモックを使用したテストスイートが用意されています。実際のGoogle Drive APIへのアクセスは行いません。

```bash
deno task test
```

### テスト構成

```
tests/
├── services/
│   ├── drive_test.ts      # Google Driveサービス（モック）のテスト
│   ├── book_test.ts       # 書籍サービスのテスト
│   ├── cache_test.ts      # キャッシュサービスのテスト
│   └── metadata_test.ts   # 書誌情報取得サービスのテスト
├── routes/
│   ├── books_test.ts      # HTTPルートのテスト
│   └── opds_test.ts       # OPDSエンドポイントのテスト
└── e2e/
    └── scenarios_test.ts  # E2E統合テスト（全6シナリオ）
```

全135テストが検収項目書の各項目に対応しています。

## プロジェクト構成

```
src/
├── main.ts                # エントリーポイント
├── app.ts                 # Honoアプリケーション構成
├── types.ts               # 型定義
├── services/
│   ├── auth.ts            # Google OAuth2認証
│   ├── book.ts            # 書籍ビジネスロジック
│   ├── cache.ts           # インメモリキャッシュ
│   ├── drive.ts           # Google Drive APIクライアント
│   ├── drive_mock.ts      # Google Drive APIモック（テスト用）
│   └── metadata.ts        # 書誌情報取得（OpenBD / Google Books）
├── routes/
│   ├── books.tsx          # 書籍関連HTTPルート
│   └── opds.ts            # OPDSフィード生成
└── views/
    ├── layout.tsx          # 共通レイアウト
    ├── library.tsx         # ライブラリ一覧画面
    ├── register.tsx        # 書籍登録画面
    └── edit.tsx            # 書籍編集画面
```

## Google Driveのデータ構造

### フォルダ構成

```
MyLibrary/
├── 太宰治/
│   ├── [太宰治] 人間失格.epub
│   └── cover_xxx.jpg
├── 夏目漱石/
│   ├── [夏目漱石] 坊っちゃん.pdf
│   └── cover_yyy.jpg
└── ...
```

### カスタムプロパティ

各書籍ファイルに以下のプロパティが付与されます:

| キー | 説明 | 例 |
|------|------|-----|
| `app_type` | アプリ管理識別フラグ | `my_library_book` |
| `isbn` | ISBN | `9784101010014` |
| `title` | タイトル | `人間失格` |
| `authors` | 著者名（複数はハイフン区切り） | `太宰治` |
| `publisher` | 出版社 | `新潮社` |
| `published_date` | 出版日 | `1952-01-01` |

## OPDSの利用

OPDSリーダーアプリ（KOReader等）から以下のURLでカタログにアクセスできます:

```
http://<サーバーIP>:8000/opds
```

## ライセンス

MIT
