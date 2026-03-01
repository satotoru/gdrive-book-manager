/** @jsxImportSource hono/jsx */

import { Hono } from "hono";
import { BookService } from "../services/book.ts";
import { Layout } from "../views/layout.tsx";
import { LibraryPage, BookGrid } from "../views/library.tsx";
import {
  RegisterPage,
  MetadataResult,
  RegisterSuccess,
  RegisterError,
  DuplicateIsbnWarning,
} from "../views/register.tsx";
import { EditPage, EditSuccess, EditError } from "../views/edit.tsx";
import { BookMetadata } from "../types.ts";

export function createBookRoutes(bookService: BookService): Hono {
  const app = new Hono();

  // Library list page
  app.get("/", async (c) => {
    try {
      const result = await bookService.listBooks();
      const baseUrl = "";
      return c.html(
        <Layout title="ライブラリ">
          <LibraryPage
            books={result.files}
            nextPageToken={result.nextPageToken}
            baseUrl={baseUrl}
          />
        </Layout>,
      );
    } catch (error) {
      return c.html(
        <Layout title="エラー">
          <div class="alert alert-error">
            <span>ライブラリの読み込みに失敗しました: {String(error)}</span>
          </div>
        </Layout>,
        500,
      );
    }
  });

  // Book list partial (for htmx pagination)
  app.get("/books/list", async (c) => {
    const pageToken = c.req.query("pageToken");
    const result = await bookService.listBooks(pageToken);
    return c.html(
      <BookGrid books={result.files} nextPageToken={result.nextPageToken} baseUrl="" />,
    );
  });

  // Search (htmx partial)
  app.get("/books/search", async (c) => {
    const query = c.req.query("q") || "";
    if (!query.trim()) {
      const result = await bookService.listBooks();
      return c.html(
        <BookGrid books={result.files} nextPageToken={result.nextPageToken} baseUrl="" />,
      );
    }
    const result = await bookService.searchBooks(query);
    return c.html(
      <BookGrid books={result.files} nextPageToken={result.nextPageToken} baseUrl="" />,
    );
  });

  // Registration page
  app.get("/books/new", (c) => {
    return c.html(
      <Layout title="書籍登録">
        <RegisterPage baseUrl="" />
      </Layout>,
    );
  });

  // Metadata lookup API
  app.get("/api/metadata", async (c) => {
    const isbn = c.req.query("isbn") || "";
    if (!isbn.trim()) {
      return c.html(<div></div>);
    }
    const metadata = await bookService.fetchMetadata(isbn);
    if (!metadata) {
      return c.html(<MetadataResult metadata={null} notFound={true} />);
    }
    return c.html(<MetadataResult metadata={metadata} notFound={false} />);
  });

  // Register a book
  app.post("/books", async (c) => {
    try {
      const formData = await c.req.formData();
      const title = formData.get("title") as string;
      const authors = formData.get("authors") as string || "";
      const publisher = formData.get("publisher") as string || "";
      const publishedDate = formData.get("publishedDate") as string || "";
      const description = formData.get("description") as string || "";
      const isbn = formData.get("isbn") as string || "";
      const coverImageUrl = formData.get("coverImageUrl") as string || "";
      const file = formData.get("file") as File | null;
      const overwrite = c.req.query("overwrite");

      if (!title || !title.trim()) {
        return c.html(
          <RegisterError message="タイトルは必須です" />,
          400,
        );
      }

      if (!file || file.size === 0) {
        return c.html(
          <RegisterError message="ファイルを選択してください" />,
          400,
        );
      }

      // Validate file type
      const validTypes = ["application/epub+zip", "application/pdf"];
      const fileName = file.name.toLowerCase();
      const isValidType = validTypes.includes(file.type) ||
        fileName.endsWith(".epub") || fileName.endsWith(".pdf");

      if (!isValidType) {
        return c.html(
          <RegisterError message="対応していないファイル形式です。EPUB または PDF ファイルのみ対応しています。" />,
          400,
        );
      }

      // Determine MIME type from extension if type is generic
      let mimeType = file.type;
      if (!validTypes.includes(mimeType)) {
        if (fileName.endsWith(".epub")) mimeType = "application/epub+zip";
        else if (fileName.endsWith(".pdf")) mimeType = "application/pdf";
      }

      // Check for duplicate ISBN
      if (isbn && !overwrite) {
        const existing = await bookService.findBookByIsbn(isbn);
        if (existing) {
          return c.html(
            <DuplicateIsbnWarning
              isbn={isbn}
              existingFileId={existing.id}
              baseUrl=""
            />,
          );
        }
      }

      // If overwriting, delete existing file first
      if (overwrite) {
        try {
          await bookService.deleteBook(overwrite);
        } catch {
          // Ignore if file doesn't exist
        }
      }

      const metadata: BookMetadata = {
        isbn,
        title: title.trim(),
        authors: authors.trim(),
        publisher: publisher.trim(),
        publishedDate: publishedDate.trim(),
        description: description.trim(),
        coverImageUrl: coverImageUrl.trim(),
      };

      const content = new Uint8Array(await file.arrayBuffer());
      await bookService.registerBook(metadata, content, mimeType);

      return c.html(<RegisterSuccess />);
    } catch (error) {
      return c.html(
        <RegisterError message={`登録に失敗しました: ${String(error)}`} />,
        500,
      );
    }
  });

  // Download a book
  app.get("/books/:id/download", async (c) => {
    try {
      const id = c.req.param("id");
      const { stream, file } = await bookService.downloadBookStream(id);

      const contentType = file.mimeType === "application/epub+zip"
        ? "application/epub+zip"
        : file.mimeType === "application/pdf"
        ? "application/pdf"
        : "application/octet-stream";

      const disposition = contentType === "application/pdf" ? "inline" : "attachment";

      const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(file.name)}"`,
      };
      if (file.size !== undefined) {
        headers["Content-Length"] = file.size;
      }

      return new Response(stream, { headers });
    } catch (error) {
      return c.text(`ダウンロードに失敗しました: ${String(error)}`, 500);
    }
  });

  // Cover image
  app.get("/books/:id/cover", async (c) => {
    try {
      const id = c.req.param("id");
      const file = await bookService.getBook(id);
      const coverFileId = file.properties?.cover_file_id;
      if (!coverFileId) {
        return c.notFound();
      }
      const content = await bookService.getCoverImageContent(coverFileId);
      return new Response(content.buffer as ArrayBuffer, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch {
      return c.notFound();
    }
  });

  // Edit page
  app.get("/books/:id/edit", async (c) => {
    try {
      const id = c.req.param("id");
      const book = await bookService.getBook(id);
      return c.html(
        <Layout title="書籍編集">
          <EditPage book={book} baseUrl="" />
        </Layout>,
      );
    } catch (error) {
      return c.html(
        <Layout title="エラー">
          <div class="alert alert-error">
            <span>書籍情報の取得に失敗しました: {String(error)}</span>
          </div>
        </Layout>,
        500,
      );
    }
  });

  // Update a book
  app.put("/books/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.parseBody();
      const metadata: Partial<BookMetadata> = {
        title: body.title as string,
        authors: body.authors as string,
        publisher: body.publisher as string,
        publishedDate: body.publishedDate as string,
      };
      await bookService.updateBook(id, metadata);
      return c.html(<EditSuccess />);
    } catch (error) {
      return c.html(
        <EditError message={`更新に失敗しました: ${String(error)}`} />,
        500,
      );
    }
  });

  // Delete a book
  app.delete("/books/:id", async (c) => {
    try {
      const id = c.req.param("id");
      await bookService.deleteBook(id);
      return c.html(
        <div class="toast toast-end">
          <div class="alert alert-success">
            <span>書籍を削除しました</span>
          </div>
        </div>,
      );
    } catch (error) {
      return c.html(
        <div class="alert alert-error">
          <span>削除に失敗しました: {String(error)}</span>
        </div>,
        500,
      );
    }
  });

  return app;
}
