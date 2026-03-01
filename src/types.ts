export interface BookMetadata {
  isbn: string;
  title: string;
  authors: string;
  publisher: string;
  publishedDate: string;
  description: string;
  coverImageUrl: string;
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  properties: Record<string, string>;
  parents: string[];
  webContentLink?: string;
  thumbnailLink?: string;
  size?: string;
}

export interface DriveFileList {
  files: DriveFile[];
  nextPageToken?: string;
}

export interface GoogleDriveService {
  ensureMyLibraryFolder(): Promise<string>;
  ensureAuthorFolder(myLibraryFolderId: string, authorName: string): Promise<string>;
  uploadFile(
    folderId: string,
    fileName: string,
    content: Uint8Array,
    mimeType: string,
    properties: Record<string, string>,
  ): Promise<DriveFile>;
  uploadCoverImage(
    folderId: string,
    fileName: string,
    imageData: Uint8Array,
    mimeType: string,
  ): Promise<DriveFile>;
  updateFileProperties(
    fileId: string,
    properties: Record<string, string>,
  ): Promise<DriveFile>;
  renameFile(fileId: string, newName: string): Promise<DriveFile>;
  moveFile(fileId: string, newFolderId: string, oldFolderId: string): Promise<DriveFile>;
  listBooks(pageToken?: string, pageSize?: number): Promise<DriveFileList>;
  searchBooks(query: string, pageToken?: string): Promise<DriveFileList>;
  getFile(fileId: string): Promise<DriveFile>;
  getFileContent(fileId: string): Promise<Uint8Array>;
  getFileStream(fileId: string): Promise<ReadableStream>;
  deleteFile(fileId: string): Promise<void>;
  findBookByIsbn(isbn: string): Promise<DriveFile | null>;
  findFilesByParent(folderId: string): Promise<DriveFile[]>;
}

export interface BookMetadataService {
  fetchByIsbn(isbn: string): Promise<BookMetadata | null>;
}

export interface CacheEntry<T> {
  data: T;
  expiry: number;
}
