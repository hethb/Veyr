import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Documents } from "./pages/Documents";
import { Keys } from "./pages/Keys";
import { Landing } from "./pages/Landing";
import { PromptHelper } from "./pages/PromptHelper";
import { Settings } from "./pages/Settings";
import { Welcome } from "./pages/Welcome";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/welcome" element={<Welcome />} />

        <Route
          path="/dashboard"
          element={
            <AuthGate>
              <Layout>
                <Dashboard />
              </Layout>
            </AuthGate>
          }
        />
        <Route
          path="/prompt"
          element={
            <AuthGate>
              <Layout>
                <PromptHelper />
              </Layout>
            </AuthGate>
          }
        />
        <Route
          path="/documents"
          element={
            <AuthGate>
              <Layout>
                <Documents />
              </Layout>
            </AuthGate>
          }
        />
        <Route
          path="/keys"
          element={
            <AuthGate>
              <Layout>
                <Keys />
              </Layout>
            </AuthGate>
          }
        />
        <Route
          path="/settings"
          element={
            <AuthGate>
              <Layout>
                <Settings />
              </Layout>
            </AuthGate>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
