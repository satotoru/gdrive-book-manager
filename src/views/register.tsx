/** @jsxImportSource hono/jsx */

import { BookMetadata } from "../types.ts";

export function RegisterPage(props: { baseUrl: string }) {
  return (
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold mb-6">書籍登録</h1>

      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          {/* ISBN Search Section */}
          <div class="form-control mb-4">
            <label class="label">
              <span class="label-text font-semibold">ISBN</span>
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                name="isbn"
                id="isbn-input"
                placeholder="ISBNを入力（例: 9784101010014）"
                class="input input-bordered flex-1"
                hx-get={`${props.baseUrl}/api/metadata`}
                hx-trigger="input changed delay:1000ms"
                hx-target="#metadata-result"
                hx-include="this"
                hx-indicator="#isbn-loading"
              />
              <span id="isbn-loading" class="htmx-indicator loading loading-spinner"></span>
            </div>
          </div>

          <div id="metadata-result"></div>

          {/* Registration Form */}
          <form
            id="register-form"
            hx-post={`${props.baseUrl}/books`}
            hx-encoding="multipart/form-data"
            hx-target="#register-result"
            hx-indicator="#register-loading"
          >
            <input type="hidden" name="isbn" id="form-isbn" value="" />

            <div class="form-control mb-3">
              <label class="label">
                <span class="label-text">タイトル *</span>
              </label>
              <input
                type="text"
                name="title"
                id="form-title"
                class="input input-bordered"
                required
              />
            </div>

            <div class="form-control mb-3">
              <label class="label">
                <span class="label-text">著者名</span>
              </label>
              <input
                type="text"
                name="authors"
                id="form-authors"
                class="input input-bordered"
                placeholder="複数著者はハイフン(-)区切り"
              />
            </div>

            <div class="form-control mb-3">
              <label class="label">
                <span class="label-text">出版社</span>
              </label>
              <input
                type="text"
                name="publisher"
                id="form-publisher"
                class="input input-bordered"
              />
            </div>

            <div class="form-control mb-3">
              <label class="label">
                <span class="label-text">出版日</span>
              </label>
              <input
                type="text"
                name="publishedDate"
                id="form-published-date"
                class="input input-bordered"
                placeholder="YYYY-MM-DD"
              />
            </div>

            <div class="form-control mb-3">
              <label class="label">
                <span class="label-text">概要</span>
              </label>
              <textarea
                name="description"
                id="form-description"
                class="textarea textarea-bordered"
                rows={3}
              ></textarea>
            </div>

            <input
              type="hidden"
              name="coverImageUrl"
              id="form-cover-url"
              value=""
            />

            <div class="form-control mb-4">
              <label class="label">
                <span class="label-text">ファイル（EPUB/PDF）*</span>
              </label>
              <input
                type="file"
                name="file"
                id="form-file"
                accept=".epub,.pdf,application/epub+zip,application/pdf"
                class="file-input file-input-bordered w-full"
                required
              />
              <label class="label">
                <span class="label-text-alt">EPUB, PDF形式のファイルのみ対応</span>
              </label>
            </div>

            <div class="form-control mt-6">
              <button type="submit" class="btn btn-primary">
                <span id="register-loading" class="htmx-indicator loading loading-spinner loading-sm"></span>
                登録
              </button>
            </div>
          </form>

          <div id="register-result" class="mt-4"></div>
        </div>
      </div>
    </div>
  );
}

export function MetadataResult(props: {
  metadata: BookMetadata | null;
  notFound: boolean;
}) {
  if (props.notFound) {
    return (
      <div class="alert alert-warning mb-4">
        <span>書誌情報が見つかりませんでした。手動で入力してください。</span>
      </div>
    );
  }

  if (!props.metadata) return <div></div>;

  const m = props.metadata;
  return (
    <div class="alert alert-success mb-4">
      <div>
        <span>書誌情報を取得しました</span>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `
          document.getElementById('form-isbn').value = ${JSON.stringify(m.isbn)};
          document.getElementById('form-title').value = ${JSON.stringify(m.title)};
          document.getElementById('form-authors').value = ${JSON.stringify(m.authors)};
          document.getElementById('form-publisher').value = ${JSON.stringify(m.publisher)};
          document.getElementById('form-published-date').value = ${JSON.stringify(m.publishedDate)};
          document.getElementById('form-description').value = ${JSON.stringify(m.description)};
          document.getElementById('form-cover-url').value = ${JSON.stringify(m.coverImageUrl)};
        `,
        }}
      />
    </div>
  );
}

export function RegisterSuccess() {
  return (
    <div class="alert alert-success">
      <span>書籍の登録が完了しました</span>
      <div>
        <a href="/books/new" class="btn btn-sm btn-ghost">続けて登録</a>
        <a href="/" class="btn btn-sm btn-primary">ライブラリへ</a>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById('register-form').reset();`,
        }}
      />
    </div>
  );
}

export function RegisterError(props: { message: string }) {
  return (
    <div class="alert alert-error">
      <span>{props.message}</span>
    </div>
  );
}

export function DuplicateIsbnWarning(props: {
  isbn: string;
  existingFileId: string;
  baseUrl: string;
}) {
  return (
    <div class="alert alert-warning">
      <span>
        ISBN {props.isbn}
        の書籍は既に登録されています。上書きしますか？
      </span>
      <div>
        <button
          class="btn btn-sm btn-warning"
          hx-post={`${props.baseUrl}/books?overwrite=${props.existingFileId}`}
          hx-encoding="multipart/form-data"
          hx-include="#register-form"
          hx-target="#register-result"
        >
          上書き
        </button>
        <button class="btn btn-sm btn-ghost" onclick="this.closest('.alert').remove()">
          キャンセル
        </button>
      </div>
    </div>
  );
}
