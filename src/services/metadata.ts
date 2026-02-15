import { BookMetadata, BookMetadataService } from "../types.ts";

export class OpenBDService implements BookMetadataService {
  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    try {
      const res = await fetch(`https://api.openbd.jp/v1/get?isbn=${isbn}`);
      if (!res.ok) return null;

      const data = await res.json();
      if (!data || !data[0]) return null;

      const book = data[0];
      const summary = book.summary;
      if (!summary || !summary.title) return null;

      return {
        isbn: summary.isbn || isbn,
        title: summary.title || "",
        authors: summary.author || "",
        publisher: summary.publisher || "",
        publishedDate: summary.pubdate || "",
        description: book.onix?.CollateralDetail?.TextContent?.[0]?.Text || "",
        coverImageUrl: summary.cover || "",
      };
    } catch {
      return null;
    }
  }
}

export class GoogleBooksService implements BookMetadataService {
  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    try {
      const res = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`,
      );
      if (!res.ok) return null;

      const data = await res.json();
      if (!data.items || data.items.length === 0) return null;

      const volumeInfo = data.items[0].volumeInfo;
      return {
        isbn: isbn,
        title: volumeInfo.title || "",
        authors: (volumeInfo.authors || []).join("-"),
        publisher: volumeInfo.publisher || "",
        publishedDate: volumeInfo.publishedDate || "",
        description: volumeInfo.description || "",
        coverImageUrl: volumeInfo.imageLinks?.thumbnail || "",
      };
    } catch {
      return null;
    }
  }
}

export class CompositeMetadataService implements BookMetadataService {
  private services: BookMetadataService[];

  constructor(services: BookMetadataService[]) {
    this.services = services;
  }

  async fetchByIsbn(isbn: string): Promise<BookMetadata | null> {
    for (const service of this.services) {
      const result = await service.fetchByIsbn(isbn);
      if (result) return result;
    }
    return null;
  }
}
