import { useLayoutEffect } from "react";
import type { Role } from "../context/AuthContext";
import loginCss from "../styles/login.css?inline";
import adminCss from "../styles/roles/admin.css?inline";
import studentCss from "../styles/roles/student.css?inline";
import supervisorCss from "../styles/roles/supervisor.css?inline";
import { DESIGN_MODE } from "./designMode";

const ROLE_CSS: Record<Role, string> = {
  STUDENT: studentCss,
  SUPERVISOR: supervisorCss,
  ADMIN: adminCss,
};

const STYLE_ELEMENT_ID = "talon-role-css";

/**
 * Applies the signed-in role's stylesheet, and only that one.
 *
 * Each role's look is owned by a different designer. Loading a single role's
 * sheet at a time means the Student designer restyling `.card` can never affect
 * what supervisors or admins see. Role sheets are unlayered and the base styles
 * sit in `@layer talon-base`, so the role sheet wins regardless of load order.
 */
export function useRoleStylesheet(role: Role | undefined): void {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.role = role?.toLowerCase() ?? "login";

    // In a standalone design file, <style id="talon-design"> is the source of
    // truth, so the bundled copy must not be applied on top of it.
    if (DESIGN_MODE) return;

    let element = document.getElementById(STYLE_ELEMENT_ID);
    if (!element) {
      element = document.createElement("style");
      element.id = STYLE_ELEMENT_ID;
      document.head.appendChild(element);
    }
    element.textContent = role ? ROLE_CSS[role] : loginCss;
  }, [role]);
}
