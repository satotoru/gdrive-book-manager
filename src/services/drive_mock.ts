import { DriveFile, DriveFileList, GoogleDriveService } from "../types.ts";
import { sanitizeProperties } from "./drive.ts";

const APP_TYPE_VALUE = "my_library_book";

interface StoredFile extends DriveFile {
  content?: Uint8Array;
}

function toDriveFile(file: StoredFile): DriveFile {
  const { content: _content, ...driveFile } = file;
  void _content;
  return {
    id: driveFile.id,
    name: driveFile.name,
    mimeType: driveFile.mimeType,
    properties: { ...driveFile.properties },
    parents: [...driveFile.parents],
    webContentLink: driveFile.webContentLink,
    thumbnailLink: driveFile.thumbnailLink,
    size: driveFile.size,
  };
}

export class MockGoogleDriveService implements GoogleDriveService {
  files: Map<string, StoredFile> = new Map();
  private nextId = 1;
  private myLibraryFolderId = "";
  shouldFail = false;

  private generateId(): string {
    return `file_${this.nextId++}`;
  }

  reset(): void {
    this.files.clear();
    this.nextId = 1;
    this.myLibraryFolderId = "";
    this.shouldFail = false;
  }

  async ensureMyLibraryFolder(): Promise<string> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    if (this.myLibraryFolderId) {
      return this.myLibraryFolderId;
    }

    for (const file of this.files.values()) {
      if (
        file.name === "MyLibrary" &&
        file.mimeType === "application/vnd.google-apps.folder"
      ) {
        this.myLibraryFolderId = file.id;
        return file.id;
      }
    }

    const id = this.generateId();
    this.files.set(id, {
      id,
      name: "MyLibrary",
      mimeType: "application/vnd.google-apps.folder",
      properties: {},
      parents: [],
    });
    this.myLibraryFolderId = id;
    return id;
  }

  async ensureAuthorFolder(
    myLibraryFolderId: string,
    authorName: string,
  ): Promise<string> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    for (const file of this.files.values()) {
      if (
        file.name === authorName &&
        file.mimeType === "application/vnd.google-apps.folder" &&
        file.parents.includes(myLibraryFolderId)
      ) {
        return file.id;
      }
    }

    const id = this.generateId();
    this.files.set(id, {
      id,
      name: authorName,
      mimeType: "application/vnd.google-apps.folder",
      properties: {},
      parents: [myLibraryFolderId],
    });
    return id;
  }

  async uploadFile(
    folderId: string,
    fileName: string,
    content: Uint8Array,
    mimeType: string,
    properties: Record<string, string>,
  ): Promise<DriveFile> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    const id = this.generateId();
    const file: StoredFile = {
      id,
      name: fileName,
      mimeType,
      properties: sanitizeProperties(properties),
      parents: [folderId],
      webContentLink: `https://drive.google.com/uc?id=${id}&export=download`,
      size: String(content.length),
      content,
    };
    this.files.set(id, file);
    return toDriveFile(file);
  }

  async uploadCoverImage(
    folderId: string,
    fileName: string,
    imageData: Uint8Array,
    mimeType: string,
  ): Promise<DriveFile> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    const id = this.generateId();
    const file: StoredFile = {
      id,
      name: fileName,
      mimeType,
      properties: {},
      parents: [folderId],
      webContentLink: `https://drive.google.com/uc?id=${id}&export=download`,
      content: imageData,
    };
    this.files.set(id, file);
    return toDriveFile(file);
  }

  async updateFileProperties(
    fileId: string,
    properties: Record<string, string>,
  ): Promise<DriveFile> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    const file = this.files.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);

    file.properties = {
      ...file.properties,
      ...sanitizeProperties(properties),
    };
    return toDriveFile(file);
  }

  async renameFile(fileId: string, newName: string): Promise<DriveFile> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    const file = this.files.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);

    file.name = newName;
    return toDriveFile(file);
  }

  async moveFile(
    fileId: string,
    newFolderId: string,
    oldFolderId: string,
  ): Promise<DriveFile> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    const file = this.files.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);

    file.parents = file.parents.filter((p) => p !== oldFolderId);
    file.parents.push(newFolderId);
    return toDriveFile(file);
  }

  async listBooks(
    pageToken?: string,
    pageSize: number = 20,
  ): Promise<DriveFileList> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    const allBooks: DriveFile[] = [];
    for (const file of this.files.values()) {
      if (file.properties?.app_type === APP_TYPE_VALUE) {
        allBooks.push(toDriveFile(file));
      }
    }

    allBooks.sort((a, b) => a.name.localeCompare(b.name));

    const startIndex = pageToken ? parseInt(pageToken) : 0;
    const endIndex = startIndex + pageSize;
    const pageFiles = allBooks.slice(startIndex, endIndex);
    const nextPageToken = endIndex < allBooks.length
      ? String(endIndex)
      : undefined;

    return { files: pageFiles, nextPageToken };
  }

  async searchBooks(
    query: string,
    pageToken?: string,
  ): Promise<DriveFileList> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    const lowerQuery = query.toLowerCase();
    const matchingBooks: DriveFile[] = [];

    for (const file of this.files.values()) {
      if (file.properties?.app_type !== APP_TYPE_VALUE) continue;

      const nameMatch = file.name.toLowerCase().includes(lowerQuery);
      const titleMatch = file.properties?.title?.toLowerCase().includes(lowerQuery);
      const authorMatch = file.properties?.authors?.toLowerCase().includes(lowerQuery);

      if (nameMatch || titleMatch || authorMatch) {
        matchingBooks.push(toDriveFile(file));
      }
    }

    const startIndex = pageToken ? parseInt(pageToken) : 0;
    const pageFiles = matchingBooks.slice(startIndex, startIndex + 20);

    return { files: pageFiles, nextPageToken: undefined };
  }

  async getFile(fileId: string): Promise<DriveFile> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    const file = this.files.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    return toDriveFile(file);
  }

  async getFileContent(fileId: string): Promise<Uint8Array> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    const file = this.files.get(fileId);
    if (!file) throw new Error(`File not found: ${fileId}`);
    return file.content || new Uint8Array();
  }

  async deleteFile(fileId: string): Promise<void> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    if (!this.files.has(fileId)) {
      throw new Error(`File not found: ${fileId}`);
    }
    this.files.delete(fileId);
  }

  async findBookByIsbn(isbn: string): Promise<DriveFile | null> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    for (const file of this.files.values()) {
      if (
        file.properties?.app_type === APP_TYPE_VALUE &&
        file.properties?.isbn === isbn
      ) {
        return toDriveFile(file);
      }
    }
    return null;
  }

  async findFilesByParent(folderId: string): Promise<DriveFile[]> {
    if (this.shouldFail) throw new Error("Drive API error");
    await Promise.resolve();

    const results: DriveFile[] = [];
    for (const file of this.files.values()) {
      if (file.parents.includes(folderId)) {
        results.push(toDriveFile(file));
      }
    }
    return results;
  }
}
