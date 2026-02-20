import { Hono } from "hono";
import { logger } from "hono/logger";
import { BookService } from "./services/book.ts";
import { BookMetadataService, GoogleDriveService } from "./types.ts";
import { CacheService } from "./services/cache.ts";
import { createBookRoutes } from "./routes/books.tsx";
import { createOpdsRoutes } from "./routes/opds.ts";

export interface AppDependencies {
  driveService: GoogleDriveService;
  metadataService: BookMetadataService;
  cache?: CacheService;
}

export function createApp(deps: AppDependencies): { app: Hono; bookService: BookService } {
  const cache = deps.cache || new CacheService();
  const bookService = new BookService(
    deps.driveService,
    deps.metadataService,
    cache,
  );

  const app = new Hono();

  app.use("*", logger());

  // Mount book routes
  const bookRoutes = createBookRoutes(bookService);
  app.route("/", bookRoutes);

  // Mount OPDS routes
  const opdsRoutes = createOpdsRoutes(bookService);
  app.route("/", opdsRoutes);

  return { app, bookService };
}
