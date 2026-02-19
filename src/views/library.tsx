/** @jsxImportSource hono/jsx */

import { DriveFile } from "../types.ts";

function BookCard(props: { book: DriveFile; baseUrl: string }) {
  const { book, baseUrl } = props;
  const title = book.properties?.title || book.name;
  const authors = book.properties?.authors || "不明";
  const coverFileId = book.properties?.cover_file_id;
  const coverUrl = coverFileId
    ? `${baseUrl}/books/${book.id}/cover`
    : null;

  return (
    <div class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow">
      <figure class="px-4 pt-4">
        {coverUrl
          ? (
            <img
              src={coverUrl}
              alt={title}
              class="rounded-xl h-64 w-44 object-cover"
            />
          )
          : (
            <div class="rounded-xl h-64 w-44 bg-base-300 flex items-center justify-center">
              <span class="text-base-content/50 text-sm text-center px-2">
                No Cover
              </span>
            </div>
          )}
      </figure>
      <div class="card-body p-4">
        <h2 class="card-title text-sm line-clamp-2">{title}</h2>
        <p class="text-xs text-base-content/70">{authors}</p>
        <div class="card-actions justify-end mt-2">
          <a
            href={`${baseUrl}/books/${book.id}/download`}
            target="_blank"
            class="btn btn-primary btn-xs"
          >
            DL
          </a>
          <a
            href={`${baseUrl}/books/${book.id}/edit`}
            class="btn btn-ghost btn-xs"
          >
            編集
          </a>
          <button
            class="btn btn-error btn-xs"
            hx-delete={`${baseUrl}/books/${book.id}`}
            hx-confirm="この書籍を削除してもよろしいですか？"
            hx-target="closest .card"
            hx-swap="outerHTML"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}

export function BookGrid(props: {
  books: DriveFile[];
  nextPageToken?: string;
  baseUrl: string;
}) {
  const { books, nextPageToken, baseUrl } = props;

  if (books.length === 0) {
    return (
      <div class="text-center py-16">
        <p class="text-lg text-base-content/50">書籍がありません</p>
        <a href="/books/new" class="btn btn-primary mt-4">
          書籍を登録する
        </a>
      </div>
    );
  }

  return (
    <div>
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {books.map((book) => (
          <BookCard book={book} baseUrl={baseUrl} />
        ))}
      </div>
      {nextPageToken && (
        <div class="text-center mt-6">
          <button
            class="btn btn-outline"
            hx-get={`${baseUrl}/books/list?pageToken=${nextPageToken}`}
            hx-target="#book-grid"
            hx-swap="innerHTML"
          >
            もっと読み込む
          </button>
        </div>
      )}
    </div>
  );
}

export function LibraryPage(props: {
  books: DriveFile[];
  nextPageToken?: string;
  query?: string;
  baseUrl: string;
}) {
  return (
    <div>
      <div class="mb-6">
        <div class="form-control">
          <div class="input-group flex gap-2">
            <input
              type="text"
              name="q"
              placeholder="タイトル・著者名で検索..."
              class="input input-bordered w-full"
              value={props.query || ""}
              hx-get="/books/search"
              hx-trigger="input changed delay:500ms, search"
              hx-target="#book-grid"
              hx-swap="innerHTML"
              hx-include="this"
            />
          </div>
        </div>
      </div>

      <div id="book-grid">
        <BookGrid
          books={props.books}
          nextPageToken={props.nextPageToken}
          baseUrl={props.baseUrl}
        />
      </div>
    </div>
  );
}
