import { ApiError } from "./errors";

// Production serves the React app and API from the same Worker/domain. Vite's
// development proxy sends this path to the local Worker during development.
const API_BASE_URL = "/api";

// Access token lives in memory only (never localStorage) to limit XSS blast
// radius; the refresh token is an httpOnly cookie the browser manages.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export interface ProfilePhotoView { zoom: number; x: number; y: number }

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401 && retry && path !== "/auth/refresh") {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, false);
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseErrorBody(res));
  }

  if (res.status === 204) return undefined as T;

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("text/csv")) {
    return (await res.blob()) as unknown as T;
  }
  if (contentType.startsWith("image/")) {
    return (await res.blob()) as unknown as T;
  }
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) return false;
    if (res.status === 204) return false;
    const data = await res.json();
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  getPhoto: () => request<Blob | undefined>("/auth/profile-photo"),
  getPhotoView: () => request<ProfilePhotoView>("/auth/profile-photo/view"),
  savePhotoView: (view: ProfilePhotoView) => request<ProfilePhotoView>("/auth/profile-photo/view", {
    method: "PATCH", body: JSON.stringify(view),
  }),
  uploadPhoto: (photo: Blob) => request<{ saved: boolean }>("/auth/profile-photo", {
    method: "POST",
    headers: { "Content-Type": photo.type },
    body: photo,
  }),
  removePhoto: () => request<void>("/auth/profile-photo", { method: "DELETE" }),
};

export { tryRefresh, ApiError };
