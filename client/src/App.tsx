import { Routes, Route } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { useAuth } from "./context/AuthContext";
import { useRoleStylesheet } from "./design/roleStyles";

export default function App() {
  const { user } = useAuth();
  useRoleStylesheet(user?.role);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <NavBar />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}
