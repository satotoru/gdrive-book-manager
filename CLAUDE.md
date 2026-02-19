# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Google Drive-backed book management system built with Deno, Hono, and htmx. Uses Google Drive as the only persistence layer (no local database). Supports OPDS protocol for e-reader app integration.

## Commands

```bash
deno task start      # Production server with real Google Drive
deno task dev        # Development with file watch (auto-reload)
deno task dev:mock   # Development with mock data (no GCP setup needed)
deno task test       # Run all 135 tests
deno task verify     # Verify Google Drive API connectivity
```

To run a single test file:
```bash
deno test --allow-net --allow-env --allow-read --allow-write tests/services/book_test.ts
```

## Architecture

### No Local Database
All data persists exclusively to Google Drive. Books are stored as files in `MyLibrary/[Author]/[BookFile]` folder hierarchy. Metadata (ISBN, title, authors, etc.) is stored in Google Drive file custom properties, with automatic UTF-8 safe truncation to 124 bytes per property.

### Service Layer
- **`src/services/drive.ts`** — Real Google Drive API client (implements `GoogleDriveService` interface)
- **`src/services/drive_mock.ts`** — Mock implementation for testing/dev
- **`src/services/book.ts`** — Business logic; all CRUD goes through here
- **`src/services/cache.ts`** — In-memory TTL cache (1 hour default); invalidated on write operations
- **`src/services/metadata.ts`** — ISBN lookup: tries OpenBD first, falls back to Google Books API

### Dependency Injection
`src/app.ts` is the factory that wires services together and creates the Hono app. Both production and test code use this factory with different `GoogleDriveService` implementations injected.

### SSR + htmx
Views in `src/views/` are Hono JSX components rendered server-side. htmx handles AJAX updates (search, pagination) without a full page reload. No frontend build step—CSS/JS via CDN.

### OPDS
`src/routes/opds.ts` implements OPDS 1.2 (Atom Feed XML) at `/opds`. Used for e-reader app integration.

## Testing

Tests use `@std/assert` and Deno's built-in test runner. The `MockGoogleDriveService` replaces real Drive API calls in all unit/integration tests. E2E scenarios in `tests/e2e/scenarios_test.ts` test 6 full user workflows end-to-end using the mock.

## Authentication

Google OAuth2 flow. On startup, `src/main.ts` auto-discovers `client_secret_*.json` in the project root. Tokens are stored in `token.json` (auto-refreshed). For local dev without GCP, use `deno task dev:mock`.

## Key Types

Core interfaces are in `src/types.ts`: `BookMetadata`, `DriveFile`, `GoogleDriveService`, `BookMetadataService`.

## JSX Configuration

Hono JSX is used (not React). `deno.json` sets `"jsxImportSource": "hono/jsx"`. Import from `"hono/jsx"` not `"react"`.

## Development Rules

- **Google Drive API**: 原則として実際のGoogle Drive APIを直接呼び出してはならない。開発・テストでは必ずモック (`MockGoogleDriveService`) を使うこと。やむを得ず実APIを使う場合は `MyLibrary` フォルダ以外は絶対に編集しないこと。
- **TDD**: 受け入れ試験 (`docs/acceptance-criteria.md`) を完全に満たすように開発すること。テストによって振る舞いを定義し、テストが通るまで修正を繰り返すこと。新機能・バグ修正ともにテストファーストで進める。
