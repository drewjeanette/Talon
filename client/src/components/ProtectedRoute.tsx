import { Navigate, Outlet } from "react-router-dom";
import { useAuth, type Role } from "../context/AuthContext";

export function ProtectedRoute({ allow }: { allow?: Role[] }) {
  const { user, loading } = useAuth();

  if (loading) return <p role="status">Loading session...</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(user.role) && user.role !== "ADMIN") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
