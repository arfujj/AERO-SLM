# AeroSLM - under construction

AeroSLM is a physics-aware CFD diagnostic copilot MVP. A user uploads a text solver log, adds simulation context, asks a troubleshooting question, and receives a structured diagnosis report with parsed evidence, residual analysis, retrieved engineering references, validation flags, and recommended next actions.

## App overview

Main user flows:
- Landing page with product overview and demo-report entry point
- New Diagnosis intake with file upload, simulation context, inline validation, and seeded sample logs
- Results page with staged run progress, structured report rendering, and PDF export
- History page with persisted local runs, search/filter controls, duplication into a new diagnosis, and deletion
- Admin/Debug page for internal QA inspection of raw log text, parsed output, retrieval behavior, validation hits, and final diagnosis payload

## Architecture

Workspace layout:

```text
aeroslm/
  apps/
    server/
      src/
        api/              Express routes for diagnose/history/debug workflow endpoints
        app/              Server bootstrap
        diagnosis/        Residual analysis, diagnosis assembly, final report generation
        domain/           Workflow contract helpers
        parsing/          Solver log parser and parse tests
        retrieval/        Deterministic seeded-reference retrieval
        sample-data/      Starter sample logs and knowledge base
        storage/          In-memory server-side report storage
        validation/       Request validation and physics validation rules
    web/
      src/
        app/              Router setup
        components/       Reusable shell, header, status, parser summary, empty state
        lib/              API client, run store, workflow orchestration, PDF export, display helpers
        pages/            Landing, diagnosis, results, history, admin/debug
        ui/               Shared styling
  packages/
    shared/
      src/
        domain-models/    Shared CFD/domain entities and diagnosis result types
        sample-data/      Shared seeded demo cases and references
        types/            Shared API request/response contracts
```

Runtime flow:

```text
validation -> parsing -> residual analysis -> retrieval -> diagnosis assembly -> physics validation -> final report/result
```

## Key modules

Frontend:
- [apps/web/src/pages/NewDiagnosisPage.tsx](/Users/arfaanjeddy/Desktop/AERO%20SLM/apps/web/src/pages/NewDiagnosisPage.tsx): intake form, upload handling, sample loading
- [apps/web/src/lib/diagnosisWorkflow.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/apps/web/src/lib/diagnosisWorkflow.ts): staged client-side workflow orchestration
- [apps/web/src/lib/diagnosisRunStore.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/apps/web/src/lib/diagnosisRunStore.ts): persisted local run history and lifecycle updates
- [apps/web/src/pages/ResultsPage.tsx](/Users/arfaanjeddy/Desktop/AERO%20SLM/apps/web/src/pages/ResultsPage.tsx): technical report UI and export hooks
- [apps/web/src/lib/pdfExport.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/apps/web/src/lib/pdfExport.ts): on-demand PDF export from real diagnosis data

Backend:
- [apps/server/src/api/routes.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/apps/server/src/api/routes.ts): main API and staged workflow endpoints
- [apps/server/src/parsing/solverLogParser.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/apps/server/src/parsing/solverLogParser.ts): generic solver-log parser
- [apps/server/src/diagnosis/residualAnalysis.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/apps/server/src/diagnosis/residualAnalysis.ts): transparent residual heuristics
- [apps/server/src/retrieval/knowledgeRetriever.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/apps/server/src/retrieval/knowledgeRetriever.ts): deterministic seeded-reference ranking
- [apps/server/src/validation/physicsValidation.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/apps/server/src/validation/physicsValidation.ts): recommendation sanity checks and suppression
- [apps/server/src/diagnosis/diagnosisAssembler.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/apps/server/src/diagnosis/diagnosisAssembler.ts): final `DiagnosisResult` assembly

Shared contracts:
- [packages/shared/src/domain-models/diagnosis-run.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/packages/shared/src/domain-models/diagnosis-run.ts)
- [packages/shared/src/domain-models/cfd.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/packages/shared/src/domain-models/cfd.ts)
- [packages/shared/src/types/api.ts](/Users/arfaanjeddy/Desktop/AERO%20SLM/packages/shared/src/types/api.ts)

## Exact local setup

Requirements:
- Node.js 18+ recommended
- npm 9+ recommended

Install dependencies from the repo root:

```bash
npm install
```

Start both the frontend and backend:

```bash
npm run dev
```

By default, backend diagnosis reports and uploaded logs are persisted locally under:

```text
apps/server/data/
  diagnoses.json
  uploads/
```

To store runtime data elsewhere, set `AEROSLM_DATA_DIR` before starting the server.

Verification commands:

```bash
npm run check --workspace @aeroslm/shared
npm run check --workspace @aeroslm/server
npm run check --workspace @aeroslm/web
npm run test --workspace @aeroslm/server
npm run build --workspace @aeroslm/web
```

## What the MVP currently does

- Accepts `.txt` and `.log` CFD solver logs in the browser
- Stores run history locally in the browser and persists backend reports plus uploaded logs on disk
- Parses generic text solver logs for iterations, residuals, warnings, errors, and convergence patterns
- Classifies residual behavior into divergence, oscillation, stagnation, or slow convergence when data supports it
- Retrieves seeded engineering references deterministically
- Assembles likely causes, recommendations, supporting references, and validation flags into a single diagnosis result
- Exports a diagnosis report to PDF from real result data

## Known limitations

- The parser is still heuristic and generic; solver-specific coverage is limited
- Retrieval is seeded and deterministic, not model-backed
- Diagnosis history is still browser-local; backend report and upload storage is local-disk based
- Authentication and role-based access control are not implemented
- The admin/debug page is intended for internal use but is not gated
- PDF export works from the browser, but still adds a non-trivial dependency footprint
- The backend does not yet use a managed database, object store, or multi-user tenancy model

## Recommended next engineering steps

1. Move local persisted reports/uploads into Postgres plus object storage when deployment needs it.
2. Expand parser adapters for Fluent, OpenFOAM, SU2, and solver-specific residual formats.
3. Move from heuristic diagnosis logic to model-backed reasoning with source citations.
4. Add auth and internal-only protection for admin/debug tooling.
5. Replace polling-style UI updates with a cleaner event-driven run-state mechanism.
6. Add UI and API integration tests for upload, report generation, history actions, and export flows.
