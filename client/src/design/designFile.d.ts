export type DesignRole = "login" | "student" | "supervisor" | "admin";

export interface DesignFileMeta {
  exportedAt: string;
  sourceFingerprint: string;
  baselineHash: string;
  baseHash: string;
}

export interface ParsedDesignFile {
  format: string;
  role: string;
  roleFromTitle: string;
  exportedAt: string;
  sourceFingerprint: string;
  baselineHash: string;
  baseHash: string;
  designCss: string | null;
  combinedCss: string;
  extraStyleCount: number;
  baseCss: string | null;
  hasApp: boolean;
  addedMarkup: boolean;
  looksLikeWord: boolean;
}

export const DESIGN_FILE_FORMAT: number;
export const ROLES: readonly DesignRole[];
export const ROLE_LABELS: Readonly<Record<DesignRole, string>>;

export function normalizeCss(css: string): string;
export function wrapDesignCss(css: string): string;
export function unwrapDesignCss(text: string): string;

export function buildDesignFile(input: {
  role: DesignRole;
  meta: DesignFileMeta;
  baseCss: string;
  designCss: string;
  appJs: string;
}): string;

export function readDesignFile(html: string): ParsedDesignFile;
