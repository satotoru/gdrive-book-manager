# Google Drive Backend 蔵書管理アプリ 要件定義書

## 1. プロジェクト概要

既存のCalibre Web等が多機能・重量過多であるため、Google Driveをストレージおよびデータベース（Single Source of Truth）として利用する、軽量なLAN内ホスティング型蔵書管理Webアプリケーションを開発する。
ローカルデータベースを持たず、Google Drive APIを活用してメンテナンスコストを最小化することを目的とする。

## 2. システムアーキテクチャ方針

* **No SQL / No Local DB:** アプリケーションサーバーはステートレスに近い構成とし、永続化データは全てGoogle Driveに依存する。

* **Drive as a KVS:** 書誌情報（メタデータ）は、Google Driveのファイル固有の「カスタムプロパティ（Properties）」に保存し、検索もDrive API経由で行う。

* **LAN Hosting:** 自宅サーバー（Raspberry PiやNAS上のDockerコンテナ等を想定）で稼働させ、LAN内からのアクセスを主とする。

## 3. 機能要件

### Phase 1: Web UI & CRUD（基本機能）

#### 3.1 書籍登録 (Uploader)

* **ISBN検索・補完:**

  * ISBNを入力（またはバーコードリーダー入力）することで、外部API（OpenBD優先、Google Books APIフォールバック）から書誌情報を自動取得する。

  * 取得項目: タイトル、著者名、出版社、出版日、概要、カバー画像URL。

* **ファイルアップロード:**

  * EPUB / PDF ファイルをドラッグ＆ドロップで受け付ける。

  * 取得した書誌情報を確認・修正し、「登録」ボタンでアップロードを開始する。

* **Driveへの保存処理:**

  * ファイル名を `[著者名] タイトル.拡張子` の形式に自動リネームしてアップロード。

  * **重要:** アップロード完了後、Drive API `files.update` を用いて、カスタムプロパティにメタデータを書き込む。

#### 3.2 ライブラリ閲覧 (Browser)

* **一覧表示:**

  * Driveからアプリ管理対象のファイル（`app_type=book` プロパティを持つもの）を取得し、グリッドまたはリスト形式で表示する。

  * カバー画像（サムネイル）を目立たせて表示する。

* **検索機能:**

  * Web画面の検索バーへの入力を、Google Drive APIのクエリ言語（`q` パラメータ）に変換して送信する。

  * ファイル名およびメタデータ（著者名など）での検索を可能にする。

* **ダウンロード:**

  * ビューワー機能は実装しない。

  * クリックすることでブラウザ標準のダウンロードを開始する。

#### 3.3 認証・設定

* **Google認証:**

  * Google DriveへアクセスするためのOAuth2フロー、もしくはService Accountの設定。

  * （LAN内利用前提のため、アプリ自体のログイン機能は簡易的なもの、あるいはBasic認証等で当面は代替可とする）

### Phase 2: OPDS & Mobile Access（拡張機能）

#### 3.4 OPDSサーバー

* **OPDS Catalog生成:**

  * `/opds` エンドポイントにて、Drive上のファイルリストをOPDS 1.2規格のXML（Atom Feed）に変換して配信する。

  * 書誌情報、書影リンク、ダウンロードリンク（MIMEタイプ `application/epub+zip`, `application/pdf` を明示）を含める。

* **OPDS検索:**

  * OPDS OpenSearch記述を含め、リーダーアプリからの検索リクエストをDrive API検索へ中継する。

#### 3.5 パフォーマンス最適化

* **インメモリキャッシュ:**

  * Drive APIへのリクエスト回数を減らすため、ファイルリストや検索結果を一定時間サーバーメモリ上にキャッシュする機構を導入する。

## 4. データ設計（Google Drive Properties）

Google Drive上のファイルに対して、以下のカスタムプロパティを付与して管理する。

| Key | Value Example | 説明 |
| --- | --- | --- |
| `app_type` | `my_library_book` | **必須**。このアプリの管理対象であることを識別するフラグ。 |
| `isbn` | `978400xxxxxxx` | 書籍の一意なID。 |
| `title` | `人間失格` | 表示用タイトル。 |
| `authors` | `太宰治` | 著者名（複数ある場合はカンマ区切り等を検討）。 |
| `publisher` | `新潮社` | 出版社。 |
| `published_date` | `1952-01-01` | ソート用日付文字列。 |

* **フォルダ構成案:** `/MyLibrary/著者名/書籍タイトル/`

  * ※ アプリからの検索はフォルダ構造に依存しないが、人間がDriveを見た時の可読性のために整理して保存する。

## 5. 技術スタック案 (Updated)

* **Runtime:** Deno

  * TypeScriptネイティブサポート、セキュリティ機能、標準ライブラリ(`fetch`等)の充実を評価。

* **Web Framework:** Hono

  * Denoとの親和性が高く、軽量・高速。JSX Middlewareを使用したSSRを行う。

* **UI Architecture:** Server-Side Rendering (SSR) + htmx

  * **SSR:** Honoサーバー側でHTMLを生成して返すMPA（Multi-Page Application）構成。

  * **Interactivity:** 検索結果の動的更新やアップロードフォームの制御には `htmx` を利用し、SPAライクなUXを実現する。

* **Styling & Components:** TailwindCSS + DaisyUI

  * **DaisyUI:** Tailwind CSSのコンポーネントクラスプラグイン。

  * `btn`, `card`, `input` などのクラスを付与するだけでモダンなUIが構築でき、React等のJSフレームワークに依存しないため、HonoのSSRと非常に相性が良い。

* **Drive Client:** `googleapis` (via npm compatibility)

  * Denoの `npm:` 指定機能を用いて公式クライアントを利用。

* **Metadata Source:** Standard `fetch` API

## 6. 開発ロードマップ

### Step 1: 環境構築 & Google Drive API 疎通

* GCPプロジェクト作成、Drive API有効化。

* Denoプロジェクトのセットアップ (`deno.json`)。

* 簡単なDenoスクリプトで「ファイルアップロード＋プロパティ付与」と「プロパティ検索」ができることを確認する。

### Step 2: Web UI (Registration) 実装

* Hono + htmx による書籍登録フォームの作成。

* ISBN入力時の `hx-get` トリガーによる書誌情報取得・補完ロジックの実装。

* ファイルアップロード処理の実装。

### Step 3: Web UI (Browser) 実装

* ライブラリ一覧画面の作成（Grid Layout）。

* Driveからのリスト取得とSSR表示。

* 検索機能の `hx-trigger` によるリアルタイム/都度検索の実装。

* **ここまででPhase 1（自分用Webツールとしての完成）完了**

### Step 4: OPDS実装 (Phase 2)

* XML生成ロジックの実装。

* 主要なリーダーアプリ（iOS/Android）での接続テスト。

## 7. 制約事項・リスク（合意済み）

* **レスポンス速度:** ローカルDB構成に比べ、一覧表示や検索に数百ミリ秒〜数秒のラグが発生することを許容する。

* **データ整合性:** シリーズ管理や厳密なソート機能は提供せず、ファイル名や単純なメタデータ検索で代替する。

* **依存性:** インターネット接続（Google APIへのアクセス）が必須となる。
