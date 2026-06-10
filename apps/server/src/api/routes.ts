import express from "express";
import {
  AdminDebugResponse,
  buildSimulationContextFromSample,
  DiagnosePayload,
  DiagnoseResponse,
  FinalizeDiagnosisPayload,
  HistoryResponse,
  ParseLogResponse,
  ResidualAnalysisResponse,
  ReportResponse,
  RetrievalResponse,
  sampleSolverCases,
  ValidationErrorResponse
} from "@aeroslm/shared";
import { assembleDiagnosisResult } from "../diagnosis/diagnosisAssembler.js";
import { buildDiagnosticReportDraft, createDiagnosticReport } from "../diagnosis/diagnosisEngine.js";
import { analyzeResidualTrends } from "../diagnosis/residualAnalysis.js";
import { parseLogToStructuredData, parseSolverLog } from "../parsing/solverLogParser.js";
import { buildRetrievalInput, retrieveEngineeringReferences } from "../retrieval/knowledgeRetriever.js";
import { knowledgeBase } from "../sample-data/knowledgeBase.js";
import { sampleSolverLog } from "../sample-data/sampleLog.js";
import { getSavedDiagnosisById, listHistory, saveReport } from "../storage/diagnosisStore.js";
import {
  validateDiagnosisRequest,
  validationRuleDescriptions
} from "../validation/diagnosisRequestValidator.js";

export const apiRouter = express.Router();

apiRouter.get("/health", (_request, response) => {
  response.json({ ok: true });
});

apiRouter.get("/history", (_request, response) => {
  const payload: HistoryResponse = {
    records: listHistory()
  };

  response.json(payload);
});

apiRouter.get("/reports/:id", (request, response) => {
  if (request.params.id === "demo") {
    const sample = sampleSolverCases[0];
    const diagnosis = createDiagnosticReport({
      question: sample.troubleshootingQuestion,
      context: buildSimulationContextFromSample(sample),
      logFile: {
        fileName: `${sample.id}.log`,
        content: sample.rawLogText,
        uploadedAt: new Date().toISOString()
      }
    });

    saveReport(diagnosis.report, {
      result: diagnosis.result,
      logFile: {
        fileName: `${sample.id}.log`,
        content: sample.rawLogText,
        uploadedAt: new Date().toISOString()
      }
    });
    const demoPayload: ReportResponse = {
      report: diagnosis.report,
      result: diagnosis.result
    };

    response.json(demoPayload);
    return;
  }

  const diagnosis = getSavedDiagnosisById(request.params.id);
  const payload: ReportResponse = diagnosis
    ? {
        report: diagnosis.report,
        result: diagnosis.result
      }
    : {
        report: null,
        result: null
      };

  response.json(payload);
});

apiRouter.get("/admin/debug", (_request, response) => {
  const payload: AdminDebugResponse = {
    snapshot: {
      sampleQuestion: "Why is my pressure correction diverging after CFL ramp-up?",
      parserPreview: parseSolverLog(sampleSolverLog),
      parserStructuredPreview: parseLogToStructuredData(sampleSolverLog),
      knowledgeBaseSize: knowledgeBase.length,
      validationRules: validationRuleDescriptions
    }
  };

  response.json(payload);
});

apiRouter.post("/diagnose", (request, response) => {
  const payload = request.body as Partial<DiagnosePayload>;
  const validationIssues = validateDiagnosisRequest(payload);

  if (validationIssues.length > 0) {
    const errorPayload: ValidationErrorResponse = {
      error: "Validation failed.",
      details: validationIssues
    };

    response.status(400).json(errorPayload);
    return;
  }

  const diagnosis = createDiagnosticReport(payload as DiagnosePayload);
  saveReport(diagnosis.report, {
    result: diagnosis.result,
    logFile: (payload as DiagnosePayload).logFile
  });

  const responsePayload: DiagnoseResponse = {
    report: diagnosis.report,
    result: diagnosis.result
  };
  response.status(201).json(responsePayload);
});

apiRouter.post("/workflow/parse", (request, response) => {
  const payload = request.body as Partial<DiagnosePayload>;
  const validationIssues = validateDiagnosisRequest(payload);

  if (validationIssues.length > 0) {
    const errorPayload: ValidationErrorResponse = {
      error: "Validation failed.",
      details: validationIssues
    };

    response.status(400).json(errorPayload);
    return;
  }

  const parseResponse: ParseLogResponse = {
    parsedLogData: parseLogToStructuredData((payload as DiagnosePayload).logFile.content),
    parsedLog: parseSolverLog((payload as DiagnosePayload).logFile.content)
  };

  response.status(200).json(parseResponse);
});

apiRouter.post("/workflow/residual-analysis", (request, response) => {
  const payload = request.body as { parsedLogData?: ReturnType<typeof parseLogToStructuredData> };

  if (!payload.parsedLogData) {
    response.status(400).json({ error: "Missing parsed log data." } satisfies ValidationErrorResponse);
    return;
  }

  const analysisResponse: ResidualAnalysisResponse = {
    residualAnalysis: analyzeResidualTrends(payload.parsedLogData)
  };

  response.status(200).json(analysisResponse);
});

apiRouter.post("/workflow/retrieve", (request, response) => {
  const payload = request.body as Partial<DiagnosePayload> & {
    parsedLogData?: ReturnType<typeof parseLogToStructuredData>;
    residualAnalysis?: ReturnType<typeof analyzeResidualTrends>;
  };

  if (!payload.context || !payload.question || !payload.parsedLogData || !payload.residualAnalysis) {
    response.status(400).json({
      error: "Missing retrieval inputs."
    } satisfies ValidationErrorResponse);
    return;
  }

  const retrievalResponse: RetrievalResponse = {
    retrievedReferences: retrieveEngineeringReferences(
      buildRetrievalInput(payload.residualAnalysis, payload.context, payload.question, payload.parsedLogData)
    )
  };

  response.status(200).json(retrievalResponse);
});

apiRouter.post("/workflow/finalize", (request, response) => {
  const input = request.body as Partial<FinalizeDiagnosisPayload> & {
    parsedLog?: ReturnType<typeof parseSolverLog>;
  };

  if (!input.payload || !input.parsedLogData || !input.residualAnalysis || !input.retrievedReferences) {
    response.status(400).json({
      error: "Missing finalize inputs."
    } satisfies ValidationErrorResponse);
    return;
  }

  const parsedLog = input.parsedLog ?? parseSolverLog(input.payload.logFile.content);
  const report = buildDiagnosticReportDraft({
    payload: input.payload,
    parsedLog,
    parsedLogData: input.parsedLogData,
    residualAnalysis: input.residualAnalysis,
    retrievedReferences: input.retrievedReferences
  });
  const result = assembleDiagnosisResult({
    payload: input.payload,
    parsedLogData: input.parsedLogData,
    residualAnalysis: input.residualAnalysis,
    retrievedReferences: input.retrievedReferences,
    summary: report.summary,
    report
  });

  saveReport(report, {
    result,
    logFile: input.payload.logFile
  });

  const responsePayload: DiagnoseResponse = {
    report,
    result
  };

  response.status(201).json(responsePayload);
});
