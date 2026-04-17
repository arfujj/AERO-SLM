import assert from "node:assert/strict";
import test from "node:test";
import { ingestTextLog, LogIngestionError, maxUploadBytes } from "./textIngestion.js";

test("ingestion accepts supported text logs and returns uploaded-log metadata", () => {
  const uploadedAt = "2026-04-15T12:00:00.000Z";
  const ingested = ingestTextLog({
    fileName: "case.log",
    mimeType: "text/plain",
    sizeBytes: 24,
    uploadedAt,
    rawText: "line 1\r\nline 2\rline 3\n"
  });

  assert.equal(ingested.fileName, "case.log");
  assert.equal(ingested.fileType, "log");
  assert.equal(ingested.mimeType, "text/plain");
  assert.equal(ingested.uploadedAt, uploadedAt);
  assert.equal(ingested.rawText, "line 1\nline 2\nline 3\n");
  assert.equal(ingested.content, ingested.rawText);
  assert.deepEqual(ingested.lines, ["line 1", "line 2", "line 3", ""]);
  assert.equal(ingested.lineCount, 4);
});

test("ingestion rejects unsupported file extensions with a helpful error", () => {
  assert.throws(
    () =>
      ingestTextLog({
        fileName: "case.csv",
        rawText: "header,value"
      }),
    (error) =>
      error instanceof LogIngestionError &&
      error.code === "unsupported-file-type" &&
      error.message.includes(".txt and .log")
  );
});

test("ingestion rejects empty and unreadable files cleanly", () => {
  assert.throws(
    () =>
      ingestTextLog({
        fileName: "empty.log",
        rawText: ""
      }),
    (error) => error instanceof LogIngestionError && error.code === "empty-file"
  );

  assert.throws(
    () =>
      ingestTextLog({
        fileName: "broken.log",
        rawText: null
      }),
    (error) => error instanceof LogIngestionError && error.code === "unreadable-file"
  );
});

test("ingestion enforces the MVP size limit", () => {
  assert.throws(
    () =>
      ingestTextLog({
        fileName: "huge.log",
        sizeBytes: maxUploadBytes + 1,
        rawText: "solver log"
      }),
    (error) => error instanceof LogIngestionError && error.code === "file-too-large"
  );
});

test("ingestion trims null bytes and broken control characters without corrupting normal text", () => {
  const ingested = ingestTextLog({
    fileName: "controls.txt",
    rawText: "\uFEFFalpha\u0000\u0007beta\r\ngamma\tdelta\n"
  });

  assert.equal(ingested.rawText, "alphabeta\ngamma\tdelta\n");
  assert.deepEqual(ingested.lines, ["alphabeta", "gamma\tdelta", ""]);
});
