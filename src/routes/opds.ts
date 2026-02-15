import { Hono } from "hono";
import { BookService } from "../services/book.ts";
import { DriveFile } from "../types.ts";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateEntry(book: DriveFile, baseUrl: string): string {
  const title = book.properties?.title || book.name;
  const authors = book.properties?.authors || "";
  const publisher = book.properties?.publisher || "";
  const publishedDate = book.properties?.published_date || "";
  const isbn = book.properties?.isbn || "";
  const coverFileId = book.properties?.cover_file_id;

  const mimeType = book.mimeType === "application/epub+zip"
    ? "application/epub+zip"
    : book.mimeType === "application/pdf"
    ? "application/pdf"
    : "application/octet-stream";

  const authorEntries = authors
    ? authors.split("-").map((a) =>
      `    <author><name>${escapeXml(a.trim())}</name></author>`
    ).join("\n")
    : "";

  const coverLink = coverFileId
    ? `    <link rel="http://opds-spec.org/image" href="${baseUrl}/books/${book.id}/cover" type="image/jpeg"/>\n    <link rel="http://opds-spec.org/image/thumbnail" href="${baseUrl}/books/${book.id}/cover" type="image/jpeg"/>`
    : "";

  return `  <entry>
    <title>${escapeXml(title)}</title>
    <id>urn:isbn:${escapeXml(isbn || book.id)}</id>
    <updated>${publishedDate || new Date().toISOString()}</updated>
${authorEntries}
${publisher ? `    <dc:publisher>${escapeXml(publisher)}</dc:publisher>` : ""}
${coverLink}
    <link rel="http://opds-spec.org/acquisition" href="${baseUrl}/books/${book.id}/download" type="${mimeType}"/>
  </entry>`;
}

function generateFeed(
  books: DriveFile[],
  baseUrl: string,
  title: string = "蔵書管理",
  searchQuery?: string,
): string {
  const entries = books.map((b) => generateEntry(b, baseUrl)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:dc="http://purl.org/dc/terms/"
      xmlns:opds="http://opds-spec.org/2010/catalog"
      xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
  <id>urn:uuid:gdrive-book-manager</id>
  <title>${escapeXml(title)}</title>
  <updated>${new Date().toISOString()}</updated>
  <link rel="self" href="${baseUrl}/opds${searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : ""}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="${baseUrl}/opds" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="search" href="${baseUrl}/opds/opensearch.xml" type="application/opensearchdescription+xml"/>
  <opensearch:totalResults>${books.length}</opensearch:totalResults>
  <opensearch:startIndex>0</opensearch:startIndex>
  <opensearch:itemsPerPage>${books.length}</opensearch:itemsPerPage>
${entries}
</feed>`;
}

function generateOpenSearchDescription(baseUrl: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>蔵書管理</ShortName>
  <Description>蔵書管理アプリの書籍検索</Description>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition" template="${baseUrl}/opds?q={searchTerms}"/>
</OpenSearchDescription>`;
}

export function createOpdsRoutes(bookService: BookService): Hono {
  const app = new Hono();

  app.get("/opds", async (c) => {
    const query = c.req.query("q");
    const baseUrl = `${c.req.header("x-forwarded-proto") || "http"}://${c.req.header("host") || "localhost:8000"}`;

    let books;
    if (query) {
      const result = await bookService.searchBooks(query);
      books = result.files;
    } else {
      // Get all books (iterate through pages)
      const allBooks = [];
      let pageToken: string | undefined;
      do {
        const result = await bookService.listBooks(pageToken, 100);
        allBooks.push(...result.files);
        pageToken = result.nextPageToken;
      } while (pageToken);
      books = allBooks;
    }

    const feed = generateFeed(books, baseUrl, "蔵書管理", query);
    return new Response(feed, {
      headers: {
        "Content-Type": "application/atom+xml; charset=utf-8",
      },
    });
  });

  app.get("/opds/opensearch.xml", (c) => {
    const baseUrl = `${c.req.header("x-forwarded-proto") || "http"}://${c.req.header("host") || "localhost:8000"}`;
    const xml = generateOpenSearchDescription(baseUrl);
    return new Response(xml, {
      headers: {
        "Content-Type": "application/opensearchdescription+xml; charset=utf-8",
      },
    });
  });

  return app;
}

export { generateFeed, generateEntry, generateOpenSearchDescription, escapeXml };
