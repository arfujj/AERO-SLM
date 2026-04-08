import type {
  AdminDebugResponse,
  DiagnosePayload,
  DiagnoseResponse,
  FinalizeDiagnosisPayload,
  HistoryResponse,
  ParseLogResponse,
  ResidualAnalysisResponse,
  ReportResponse,
  RetrievalResponse,
  ValidationErrorResponse
} from "@aeroslm/shared";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

async function unwrapResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as ValidationErrorResponse | null;
    throw new Error(errorPayload?.details?.join(" ") || errorPayload?.error || "Request failed.");
  }

  return response.json() as Promise<T>;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, init);
    return unwrapResponse<T>(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "AeroSLM could not reach the backend API. Start the server with `npm run dev` from the repo root or run `npm run dev --workspace @aeroslm/server`."
      );
    }

    throw error;
  }
}

export const api = {
  async diagnose(payload: DiagnosePayload): Promise<DiagnoseResponse> {
    return requestJson<DiagnoseResponse>("/diagnose", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  },
  async parseLog(payload: DiagnosePayload): Promise<ParseLogResponse> {
    return requestJson<ParseLogResponse>("/workflow/parse", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  },
  async analyzeResiduals(parsedLogData: ParseLogResponse["parsedLogData"]): Promise<ResidualAnalysisResponse> {
    return requestJson<ResidualAnalysisResponse>("/workflow/residual-analysis", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ parsedLogData })
    });
  },
  async retrieveReferences(input: {
    context: DiagnosePayload["context"];
    question: string;
    parsedLogData: ParseLogResponse["parsedLogData"];
    residualAnalysis: ResidualAnalysisResponse["residualAnalysis"];
  }): Promise<RetrievalResponse> {
    return requestJson<RetrievalResponse>("/workflow/retrieve", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });
  },
  async finalizeDiagnosis(input: FinalizeDiagnosisPayload & { parsedLog?: ParseLogResponse["parsedLog"] }): Promise<DiagnoseResponse> {
    return requestJson<DiagnoseResponse>("/workflow/finalize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });
  },
  async fetchHistory(): Promise<HistoryResponse> {
    return requestJson<HistoryResponse>("/history");
  },
  async fetchReport(id: string): Promise<ReportResponse> {
    return requestJson<ReportResponse>(`/reports/${id}`);
  },
  async fetchAdminDebug(): Promise<AdminDebugResponse> {
    return requestJson<AdminDebugResponse>("/admin/debug");
  }
};
