import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { AdminDebugPage } from "../pages/AdminDebugPage";
import { HistoryPage } from "../pages/HistoryPage";
import { LandingPage } from "../pages/LandingPage";
import { NewDiagnosisPage } from "../pages/NewDiagnosisPage";
import { ResultsPage } from "../pages/ResultsPage";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />} path="/">
        <Route index element={<LandingPage />} />
        <Route path="diagnose/new" element={<NewDiagnosisPage />} />
        <Route path="results/:reportId" element={<ResultsPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="admin/debug" element={<AdminDebugPage />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Route>
    </Routes>
  );
}
