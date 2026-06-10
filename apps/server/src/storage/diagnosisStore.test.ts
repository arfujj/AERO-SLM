import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { DiagnosticReport } from "@aeroslm/shared";
import { diagnosisStoreTestInternals } from "./diagnosisStore.js";

function buildReport(id: string, createdAt: string): DiagnosticReport {
  return {
    id,
    createdAt,
    question: "Why is continuity diverging?",
    context: {
      solverName: "OpenFOAM",
      solverVersion: "v2312",
      caseDescription: "External aero validation case",
      flowRegime: "transonic",
      meshCells: 1200000,
      turbulenceModel: "k-omega SST"
    },
    summary: "Continuity residuals are diverging.",
    residualAnalysis: [],
    likelyRootCauses: [],
    stabilizationPlan: ["Reduce CFL ramp."],
    followUpChecks: ["Inspect continuity residuals."],
    parsedLog: {
      runStatus: "failed",
      residualSignals: [],
      warnings: [],
      errors: ["Divergence detected"],
      timestepsObserved: 12
    },
    retrievedReferences: []
  };
}

describe("diagnosisStore", () => {
  it("persists reports and uploaded logs to disk", () => {
    const dataDirectory = mkdtempSync(join(tmpdir(), "aeroslm-store-"));
    const report = buildReport("diag_persistent", "2026-06-07T12:00:00.000Z");

    try {
      diagnosisStoreTestInternals.saveReportWithDataDirectory(
        report,
        {
          logFile: {
            fileName: "pressure divergence.log",
            content: "Time = 12\nDivergence detected",
            uploadedAt: "2026-06-07T12:00:00.000Z"
          }
        },
        dataDirectory
      );

      const paths = diagnosisStoreTestInternals.getStorePaths(dataDirectory);
      const document = diagnosisStoreTestInternals.readStore(dataDirectory);
      const storedDiagnosis = document.diagnoses[0];

      assert.equal(document.schemaVersion, 1);
      assert.equal(storedDiagnosis.report.id, "diag_persistent");
      assert.equal(storedDiagnosis.logAsset?.fileName, "pressure divergence.log");
      assert.equal(storedDiagnosis.logAsset?.sizeBytes, 29);
      assert.ok(existsSync(paths.indexPath));
      assert.ok(storedDiagnosis.logAsset?.storagePath);
      assert.ok(existsSync(storedDiagnosis.logAsset.storagePath));
    } finally {
      rmSync(dataDirectory, { recursive: true, force: true });
    }
  });
});
