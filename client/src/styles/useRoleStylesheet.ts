import { useLayoutEffect } from "react";
import type { Role } from "../context/AuthContext";
import loginCss from "./login.css?inline";
import adminCss from "./roles/admin.css?inline";
import studentCss from "./roles/student.css?inline";
import supervisorCss from "./roles/supervisor.css?inline";

const stylesByRole: Record<Role, string> = {
  STUDENT: studentCss,
  SUPERVISOR: supervisorCss,
  ADMIN: adminCss,
};

const styleElementId = "talon-role-styles";

export function useRoleStylesheet(role?: Role): void {
  useLayoutEffect(() => {
    document.documentElement.dataset.role = role?.toLowerCase() ?? "login";

    let element = document.getElementById(styleElementId);
    if (!element) {
      element = document.createElement("style");
      element.id = styleElementId;
      document.head.appendChild(element);
    }

    element.textContent = role ? stylesByRole[role] : loginCss;
  }, [role]);
}
