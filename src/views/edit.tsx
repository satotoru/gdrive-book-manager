/** @jsxImportSource hono/jsx */

import { DriveFile } from "../types.ts";

export function EditPage(props: { book: DriveFile; baseUrl: string }) {
  const { book, baseUrl } = props;
  const p = book.properties || {};

  return (
    <div class="max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold mb-6">書籍編集</h1>

      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <form
            hx-put={`${baseUrl}/books/${book.id}`}
            hx-target="#edit-result"
          >
            <div class="form-control mb-3">
              <label class="label">
                <span class="label-text">タイトル *</span>
              </label>
              <input
                type="text"
                name="title"
                class="input input-bordered"
                value={p.title || ""}
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
                class="input input-bordered"
                value={p.authors || ""}
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
                class="input input-bordered"
                value={p.publisher || ""}
              />
            </div>

            <div class="form-control mb-3">
              <label class="label">
                <span class="label-text">出版日</span>
              </label>
              <input
                type="text"
                name="publishedDate"
                class="input input-bordered"
                value={p.published_date || ""}
                placeholder="YYYY-MM-DD"
              />
            </div>

            <div class="form-control mt-6 flex-row gap-2 justify-end">
              <a href="/" class="btn btn-ghost">キャンセル</a>
              <button type="submit" class="btn btn-primary">保存</button>
            </div>
          </form>

          <div id="edit-result" class="mt-4"></div>
        </div>
      </div>
    </div>
  );
}

export function EditSuccess() {
  return (
    <div class="alert alert-success">
      <span>書籍情報を更新しました</span>
      <a href="/" class="btn btn-sm btn-primary">ライブラリへ</a>
    </div>
  );
}

export function EditError(props: { message: string }) {
  return (
    <div class="alert alert-error">
      <span>{props.message}</span>
    </div>
  );
}
