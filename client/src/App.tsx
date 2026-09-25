import { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { SiteFooter } from "./components/SiteFooter";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { AccessibilityPage } from "./pages/AccessibilityPage";
import { useAuth } from "./context/AuthContext";
import { useRoleStylesheet } from "./styles/useRoleStylesheet";

export default function App() {
  const { user, loading } = useAuth();
  const location = useLocation();
  useRoleStylesheet(user?.role, location.pathname);

  useEffect(() => {
    const titles: Record<string, string> = {
      "/": "Dashboard | Talon",
      "/login": "Sign In | Talon",
      "/privacy": "Privacy Notice | Talon",
      "/accessibility": "Accessibility Statement | Talon",
    };
    document.title = titles[location.pathname] ?? "Page Not Found | Talon";
  }, [location.pathname]);

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {(location.pathname === "/" || user) && <NavBar />}
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/accessibility" element={<AccessibilityPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DashboardPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {(!loading || location.pathname !== "/") && <SiteFooter />}
    </>
  );
}
