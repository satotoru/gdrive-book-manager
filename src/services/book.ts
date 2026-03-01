import { BookMetadata, BookMetadataService, DriveFile, DriveFileList, GoogleDriveService } from "../types.ts";
import { formatFileName, getExtension, getFirstAuthor } from "./drive.ts";
import { CacheService } from "./cache.ts";

const CACHE_KEY_LIST = "books:list";
const CACHE_KEY_SEARCH_PREFIX = "books:search:";

export class BookService {
  constructor(
    private driveService: GoogleDriveService,
    private metadataService: BookMetadataService,
    private cache: CacheService,
  ) {}

  async fetchMetadata(isbn: string): Promise<BookMetadata | null> {
    return await this.metadataService.fetchByIsbn(isbn);
  }

  async registerBook(
    metadata: BookMetadata,
    fileContent: Uint8Array,
    fileMimeType: string,
  ): Promise<DriveFile> {
    const myLibraryId = await this.driveService.ensureMyLibraryFolder();

    const firstAuthor = getFirstAuthor(metadata.authors);
    const authorFolderId = await this.driveService.ensureAuthorFolder(
      myLibraryId,
      firstAuthor,
    );

    const extension = getExtension(fileMimeType);
    const fileName = formatFileName(metadata.authors, metadata.title, extension);

    const properties: Record<string, string> = {
      app_type: "my_library_book",
      isbn: metadata.isbn || "",
      title: metadata.title,
      authors: metadata.authors,
      publisher: metadata.publisher || "",
      published_date: metadata.publishedDate || "",
    };

    if (metadata.description) {
      properties.description = metadata.description;
    }

    const file = await this.driveService.uploadFile(
      authorFolderId,
      fileName,
      fileContent,
      fileMimeType,
      properties,
    );

    // Upload cover image if available
    if (metadata.coverImageUrl) {
      try {
        const coverData = await this.fetchCoverImage(metadata.coverImageUrl);
        if (coverData) {
          const coverFileName = `cover_${file.id}.jpg`;
          const coverFile = await this.driveService.uploadCoverImage(
            authorFolderId,
            coverFileName,
            coverData,
            "image/jpeg",
          );
          // Store cover file ID in properties for later reference
          await this.driveService.updateFileProperties(file.id, {
            ...properties,
            cover_file_id: coverFile.id,
          });
          file.properties.cover_file_id = coverFile.id;
        }
      } catch {
        // Cover image upload failure should not fail the registration
      }
    }

    this.invalidateListCache();
    return file;
  }

  private async fetchCoverImage(url: string): Promise<Uint8Array | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buffer = await res.arrayBuffer();
      return new Uint8Array(buffer);
    } catch {
      return null;
    }
  }

  async listBooks(pageToken?: string, pageSize?: number): Promise<DriveFileList> {
    const cacheKey = `${CACHE_KEY_LIST}:${pageToken || ""}:${pageSize || 20}`;
    const cached = this.cache.get<DriveFileList>(cacheKey);
    if (cached) return cached;

    const result = await this.driveService.listBooks(pageToken, pageSize);
    this.cache.set(cacheKey, result);
    return result;
  }

  async searchBooks(query: string, pageToken?: string): Promise<DriveFileList> {
    const cacheKey = `${CACHE_KEY_SEARCH_PREFIX}${query}:${pageToken || ""}`;
    const cached = this.cache.get<DriveFileList>(cacheKey);
    if (cached) return cached;

    const result = await this.driveService.searchBooks(query, pageToken);
    this.cache.set(cacheKey, result);
    return result;
  }

  async getBook(fileId: string): Promise<DriveFile> {
    return await this.driveService.getFile(fileId);
  }

  async downloadBook(fileId: string): Promise<{ content: Uint8Array; file: DriveFile }> {
    const file = await this.driveService.getFile(fileId);
    const content = await this.driveService.getFileContent(fileId);
    return { content, file };
  }

  async downloadBookStream(fileId: string): Promise<{ stream: ReadableStream; file: DriveFile }> {
    const file = await this.driveService.getFile(fileId);
    const stream = await this.driveService.getFileStream(fileId);
    return { stream, file };
  }

  async deleteBook(fileId: string): Promise<void> {
    // Also delete cover image if exists
    const file = await this.driveService.getFile(fileId);
    if (file.properties?.cover_file_id) {
      try {
        await this.driveService.deleteFile(file.properties.cover_file_id);
      } catch {
        // Cover image may already be deleted
      }
    }
    await this.driveService.deleteFile(fileId);
    this.invalidateListCache();
  }

  async updateBook(
    fileId: string,
    metadata: Partial<BookMetadata>,
  ): Promise<DriveFile> {
    const existingFile = await this.driveService.getFile(fileId);

    const properties: Record<string, string> = { ...existingFile.properties };
    if (metadata.title !== undefined) properties.title = metadata.title;
    if (metadata.authors !== undefined) properties.authors = metadata.authors;
    if (metadata.publisher !== undefined) {
      properties.publisher = metadata.publisher;
    }
    if (metadata.publishedDate !== undefined) {
      properties.published_date = metadata.publishedDate;
    }

    const updatedFile = await this.driveService.updateFileProperties(
      fileId,
      properties,
    );

    // Rename file if title or authors changed
    const title = metadata.title || existingFile.properties?.title || "";
    const authors = metadata.authors || existingFile.properties?.authors || "";
    const extension = existingFile.name.split(".").pop() || "epub";
    const newFileName = formatFileName(authors, title, extension);

    if (newFileName !== existingFile.name) {
      await this.driveService.renameFile(fileId, newFileName);
    }

    // Move to new author folder if authors changed
    if (
      metadata.authors &&
      metadata.authors !== existingFile.properties?.authors
    ) {
      const myLibraryId = await this.driveService.ensureMyLibraryFolder();
      const newFirstAuthor = getFirstAuthor(metadata.authors);
      const newFolderId = await this.driveService.ensureAuthorFolder(
        myLibraryId,
        newFirstAuthor,
      );
      const oldFolderId = existingFile.parents?.[0];
      if (oldFolderId && oldFolderId !== newFolderId) {
        await this.driveService.moveFile(fileId, newFolderId, oldFolderId);
      }
    }

    this.invalidateListCache();
    return updatedFile;
  }

  async findBookByIsbn(isbn: string): Promise<DriveFile | null> {
    return await this.driveService.findBookByIsbn(isbn);
  }

  async getCoverImageContent(fileId: string): Promise<Uint8Array> {
    return await this.driveService.getFileContent(fileId);
  }

  private invalidateListCache(): void {
    this.cache.invalidateByPrefix(CACHE_KEY_LIST);
    this.cache.invalidateByPrefix(CACHE_KEY_SEARCH_PREFIX);
  }
}
