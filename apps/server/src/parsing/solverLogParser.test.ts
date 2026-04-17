import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ingestTextLog } from "./ingestion/textIngestion.js";
import { routeLogParser } from "./parserRouter.js";
import { parseLogToStructuredData, parseUploadedLogToStructuredData, parseSolverLog } from "./solverLogParser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, "fixtures");

function readFixture(name: string): string {
  return readFileSync(path.join(fixturesDir, name), "utf8");
}

test("text ingestion normalizes uploaded text for parsing", () => {
  const ingested = ingestTextLog({
    fileName: "solver.log",
    rawText: "line-1\r\nline-2\rline-3\n"
  });

  assert.equal(ingested.rawText, "line-1\nline-2\nline-3\n");
  assert.equal(ingested.normalizedText, "line-1\nline-2\nline-3\n");
  assert.deepEqual(ingested.lines.slice(0, 3), ["line-1", "line-2", "line-3"]);
});

test("parser router detects OpenFOAM logs and returns structured OpenFOAM coverage", () => {
  const rawText = readFixture("openfoam-pitzdaily.log");
  const parsed = routeLogParser({
    fileName: "openfoam-pitzdaily.log",
    rawText
  });

  assert.equal(parsed.parserType, "openfoam-v1");
  assert.equal(parsed.solverDetected, "OpenFOAM");
  assert.equal(parsed.parseStatus, "parsed");
  assert.equal(parsed.metadata.exec, "simpleFoam");
  assert.ok(parsed.iterations.length >= 2);
  assert.ok(parsed.residualEntries.some((entry) => entry.field === "Ux"));
  assert.ok(parsed.cflEntries.some((entry) => entry.metric === "Courant max"));
  assert.equal(parsed.rawText, rawText);
  assert.equal(parsed.lines.length, parsed.lineCount);
});

test("parser router falls back to generic text parser when solver markers are unknown", () => {
  const rawText = readFixture("generic-unknown.log");
  const parsed = routeLogParser({
    fileName: "generic-unknown.log",
    rawText
  });

  assert.equal(parsed.parserType, "generic-text-v1");
  assert.equal(parsed.solverDetected, "Unknown");
  assert.ok(["partial", "unsupported"].includes(parsed.parseStatus));
  assert.equal(parsed.iterations.at(-1), 10);
  assert.ok(parsed.warnings.some((warning) => warning.includes("oscillation")));
  assert.ok(parsed.residualEntries.some((entry) => entry.field === "Continuity"));
  assert.ok(parsed.missingFields.includes("cflEntries"));
});

test("compatibility parser exports still return legacy ParsedSolverLog view", () => {
  const rawText = readFixture("openfoam-pitzdaily.log");
  const parsed = parseLogToStructuredData(rawText);
  const legacy = parseSolverLog(rawText);

  assert.equal(parsed.parserType, "openfoam-v1");
  assert.equal(legacy.runStatus, parsed.status);
  assert.ok(legacy.residualSignals.length >= 2);
  assert.equal(legacy.timestepsObserved, parsed.lastIteration);
});

test("uploaded parser entry point accepts file metadata and validates extensions", () => {
  const rawText = readFixture("generic-unknown.log");
  const parsed = parseUploadedLogToStructuredData({
    fileName: "case.txt",
    rawText
  });

  assert.equal(parsed.parserType, "generic-text-v1");

  assert.throws(
    () =>
      parseUploadedLogToStructuredData({
        fileName: "case.csv",
        rawText
      }),
    /Unsupported file type/
  );
});
