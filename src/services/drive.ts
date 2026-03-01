import { Readable } from "node:stream";
import { Buffer } from "node:buffer";
import { DriveFile, DriveFileList, GoogleDriveService } from "../types.ts";

const MY_LIBRARY_FOLDER_NAME = "MyLibrary";
const APP_TYPE_VALUE = "my_library_book";
const PROPERTY_MAX_BYTES = 124;

function truncateToBytes(str: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  if (encoded.length <= maxBytes) return str;
  // Find a safe cut point that doesn't split a multi-byte character
  let end = maxBytes;
  // Walk back to avoid splitting a multi-byte character
  // UTF-8 continuation bytes start with 10xxxxxx (0x80-0xBF)
  while (end > 0 && (encoded[end] & 0xC0) === 0x80) {
    end--;
  }
  const decoder = new TextDecoder();
  return decoder.decode(encoded.slice(0, end));
}

export function sanitizeProperties(
  properties: Record<string, string>,
): Record<string, string> {
  const encoder = new TextEncoder();
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    const keyBytes = encoder.encode(key).length;
    const maxValueBytes = Math.max(0, PROPERTY_MAX_BYTES - keyBytes);
    result[key] = truncateToBytes(value, maxValueBytes);
  }
  return result;
}

export function formatFileName(
  authors: string,
  title: string,
  extension: string,
): string {
  return `[${authors}] ${title}.${extension}`;
}

export function getFirstAuthor(authors: string): string {
  // Authors are separated by hyphens
  const parts = authors.split("-");
  return parts[0].trim();
}

export function getExtension(mimeType: string): string {
  if (mimeType === "application/epub+zip") return "epub";
  if (mimeType === "application/pdf") return "pdf";
  const parts = mimeType.split("/");
  return parts[parts.length - 1];
}

export class RealGoogleDriveService implements GoogleDriveService {
  // deno-lint-ignore no-explicit-any
  private drive: any;

  // deno-lint-ignore no-explicit-any
  constructor(driveClient: any) {
    this.drive = driveClient;
  }

  async ensureMyLibraryFolder(): Promise<string> {
    const res = await this.drive.files.list({
      q: `name='${MY_LIBRARY_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name)",
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    const folder = await this.drive.files.create({
      requestBody: {
        name: MY_LIBRARY_FOLDER_NAME,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });

    return folder.data.id;
  }

  async ensureAuthorFolder(
    myLibraryFolderId: string,
    authorName: string,
  ): Promise<string> {
    const res = await this.drive.files.list({
      q: `name='${authorName}' and '${myLibraryFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id, name)",
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0].id;
    }

    const folder = await this.drive.files.create({
      requestBody: {
        name: authorName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [myLibraryFolderId],
      },
      fields: "id",
    });

    return folder.data.id;
  }

  async uploadFile(
    folderId: string,
    fileName: string,
    content: Uint8Array,
    mimeType: string,
    properties: Record<string, string>,
  ): Promise<DriveFile> {
    const res = await this.drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
        properties: sanitizeProperties(properties),
      },
      media: {
        mimeType,
        body: Readable.from(Buffer.from(content)),
      },
      fields: "id, name, mimeType, properties, parents, webContentLink, size",
    });

    return res.data;
  }

  async uploadCoverImage(
    folderId: string,
    fileName: string,
    imageData: Uint8Array,
    mimeType: string,
  ): Promise<DriveFile> {
    const res = await this.drive.files.create({
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: Readable.from(Buffer.from(imageData)),
      },
      fields: "id, name, mimeType, parents, webContentLink",
    });

    return res.data;
  }

  async updateFileProperties(
    fileId: string,
    properties: Record<string, string>,
  ): Promise<DriveFile> {
    const res = await this.drive.files.update({
      fileId,
      requestBody: {
        properties: sanitizeProperties(properties),
      },
      fields: "id, name, mimeType, properties, parents, webContentLink, size",
    });

    return res.data;
  }

  async renameFile(fileId: string, newName: string): Promise<DriveFile> {
    const res = await this.drive.files.update({
      fileId,
      requestBody: { name: newName },
      fields: "id, name, mimeType, properties, parents, webContentLink, size",
    });
    return res.data;
  }

  async moveFile(
    fileId: string,
    newFolderId: string,
    oldFolderId: string,
  ): Promise<DriveFile> {
    const res = await this.drive.files.update({
      fileId,
      addParents: newFolderId,
      removeParents: oldFolderId,
      fields: "id, name, mimeType, properties, parents, webContentLink, size",
    });
    return res.data;
  }

  /**
   * MyLibrary配下の有効なフォルダIDセットを返す（MyLibrary自身＋著者フォルダ）
   */
  private async getMyLibraryFolderIds(): Promise<Set<string>> {
    const myLibraryId = await this.ensureMyLibraryFolder();
    const ids = new Set<string>([myLibraryId]);

    const res = await this.drive.files.list({
      q: `'${myLibraryId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: "files(id)",
    });

    for (const folder of (res.data.files || [])) {
      ids.add(folder.id);
    }
    return ids;
  }

  /**
   * ファイル一覧をMyLibrary配下のもののみにフィルタする
   */
  private filterByMyLibrary(
    files: DriveFile[],
    validFolderIds: Set<string>,
  ): DriveFile[] {
    return files.filter((file) => {
      const parents = file.parents;
      if (!parents || parents.length === 0) return false;
      return parents.some((pid: string) => validFolderIds.has(pid));
    });
  }

  async listBooks(
    pageToken?: string,
    pageSize: number = 20,
  ): Promise<DriveFileList> {
    const validFolderIds = await this.getMyLibraryFolderIds();
    const res = await this.drive.files.list({
      q: `properties has { key='app_type' and value='${APP_TYPE_VALUE}' } and trashed=false`,
      fields:
        "nextPageToken, files(id, name, mimeType, properties, parents, webContentLink, thumbnailLink, size)",
      pageSize,
      pageToken,
      spaces: "drive",
      orderBy: "name",
    });

    return {
      files: this.filterByMyLibrary(res.data.files || [], validFolderIds),
      nextPageToken: res.data.nextPageToken,
    };
  }

  async searchBooks(
    query: string,
    pageToken?: string,
  ): Promise<DriveFileList> {
    const validFolderIds = await this.getMyLibraryFolderIds();
    const escapedQuery = query.replace(/'/g, "\\'");
    const res = await this.drive.files.list({
      q: `properties has { key='app_type' and value='${APP_TYPE_VALUE}' } and (name contains '${escapedQuery}' or properties has { key='title' and value='${escapedQuery}' } or properties has { key='authors' and value='${escapedQuery}' }) and trashed=false`,
      fields:
        "nextPageToken, files(id, name, mimeType, properties, parents, webContentLink, thumbnailLink, size)",
      pageToken,
      spaces: "drive",
    });

    return {
      files: this.filterByMyLibrary(res.data.files || [], validFolderIds),
      nextPageToken: res.data.nextPageToken,
    };
  }

  async getFile(fileId: string): Promise<DriveFile> {
    const res = await this.drive.files.get({
      fileId,
      fields:
        "id, name, mimeType, properties, parents, webContentLink, thumbnailLink, size",
    });
    return res.data;
  }

  async getFileContent(fileId: string): Promise<Uint8Array> {
    const res = await this.drive.files.get({
      fileId,
      alt: "media",
    }, { responseType: "arraybuffer" });
    return new Uint8Array(res.data);
  }

  async getFileStream(fileId: string): Promise<ReadableStream> {
    const res = await this.drive.files.get(
      { fileId, alt: "media" },
      { responseType: "stream" },
    );
    return ReadableStream.from(res.data as Readable);
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.drive.files.delete({ fileId });
  }

  async findBookByIsbn(isbn: string): Promise<DriveFile | null> {
    const res = await this.drive.files.list({
      q: `properties has { key='app_type' and value='${APP_TYPE_VALUE}' } and properties has { key='isbn' and value='${isbn}' } and trashed=false`,
      fields:
        "files(id, name, mimeType, properties, parents, webContentLink, size)",
    });

    if (res.data.files && res.data.files.length > 0) {
      return res.data.files[0];
    }
    return null;
  }

  async findFilesByParent(folderId: string): Promise<DriveFile[]> {
    const res = await this.drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, properties, parents)",
    });
    return res.data.files || [];
  }
}
