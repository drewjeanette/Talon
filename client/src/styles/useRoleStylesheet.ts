import { useLayoutEffect } from "react";
import type { Role } from "../context/AuthContext";
import loginCss from "./login.css?inline";
import adminCss from "./roles/admin.css?inline";
import studentCss from "./roles/student.css?inline";
import supervisorCss from "./roles/supervisor.css?inline";
import { applyTheme, type ThemePreference } from "./theme";

const stylesByRole: Record<Role, string> = {
  STUDENT: studentCss,
  SUPERVISOR: supervisorCss,
  ADMIN: adminCss,
};

const styleElementId = "talon-role-styles";

export function useRoleStylesheet(role?: Role, pathname = "/", theme: ThemePreference = "light"): void {
  useLayoutEffect(() => {
    const isPolicyPage = pathname === "/privacy" || pathname === "/accessibility";
    applyTheme(role ? theme : "light");
    document.documentElement.dataset.role = role?.toLowerCase() ?? (isPolicyPage ? "public" : "login");

    let element = document.getElementById(styleElementId);
    if (!element) {
      element = document.createElement("style");
      element.id = styleElementId;
      document.head.appendChild(element);
    }

    element.textContent = role ? stylesByRole[role] : (isPolicyPage ? "" : loginCss);
  }, [role, pathname, theme]);
}
