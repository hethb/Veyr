import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Keys } from "./pages/Keys";
import { Landing } from "./pages/Landing";
import { Settings } from "./pages/Settings";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />

        <Route
          path="/dashboard"
          element={
            <Layout>
              <Dashboard />
            </Layout>
          }
        />
        <Route
          path="/keys"
          element={
            <Layout>
              <Keys />
            </Layout>
          }
        />
        <Route
          path="/settings"
          element={
            <Layout>
              <Settings />
            </Layout>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
