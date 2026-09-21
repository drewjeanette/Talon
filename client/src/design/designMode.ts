import type { DesignRole } from "./designFile.js";

/** True only in the standalone design-file build (npm run design:export). */
export const DESIGN_MODE = import.meta.env.VITE_DESIGN_MODE === "true";

type DashboardDesignRole = Exclude<DesignRole, "login">;

// Dashboard design files sign in automatically using the mock backend. The
// Login design file deliberately stays signed out.
export const DESIGN_ACCOUNTS: Record<DashboardDesignRole, { email: string; password: string }> = {
  student: { email: "student@tntech.edu", password: "password123" },
  supervisor: { email: "supervisor@tntech.edu", password: "password123" },
  admin: { email: "admin@tntech.edu", password: "password123" },
};

/** The view a design file was exported for, read from its <meta> tag. */
export function getDesignRole(): DesignRole | null {
  if (!DESIGN_MODE) return null;
  const value = document.querySelector('meta[name="talon-design-role"]')?.getAttribute("content");
  return value === "login" || value === "student" || value === "supervisor" || value === "admin"
    ? value
    : null;
}
