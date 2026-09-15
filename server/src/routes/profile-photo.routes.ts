import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware/auth.js";
import { writeAuditLog } from "../services/audit.service.js";
import type { AppEnv } from "../types.js";

export const profilePhotoRoutes = new Hono<AppEnv>();
const MAX_PHOTO_BYTES = 512 * 1024;

function imageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

profilePhotoRoutes.get("/profile-photo", requireAuth, async (c) => {
  const row = await c.env.DB.prepare("SELECT mime_type, photo FROM user_profile_photos WHERE user_id = ?")
    .bind(c.get("user").id)
    .first<{ mime_type: "image/jpeg" | "image/png" | "image/webp"; photo: number[] }>();
  if (!row) throw new HTTPException(404, { message: "No profile photo uploaded." });

  return new Response(new Blob([Uint8Array.from(row.photo)], { type: row.mime_type }), {
    headers: {
      "Content-Type": row.mime_type,
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
});

profilePhotoRoutes.post(
  "/profile-photo",
  requireAuth,
  bodyLimit({
    maxSize: MAX_PHOTO_BYTES,
    onError: (c) => c.json({ error: "Profile photo must be no more than 512 KB." }, 413),
  }),
  async (c) => {
    const submittedType = (c.req.header("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(submittedType)) {
      throw new HTTPException(415, { message: "Use a JPEG, PNG, or WebP image." });
    }

    const bytes = new Uint8Array(await c.req.raw.arrayBuffer());
    if (bytes.length < 32 || bytes.length > MAX_PHOTO_BYTES || imageType(bytes) !== submittedType) {
      throw new HTTPException(400, { message: "Invalid or oversized profile photo." });
    }

    const userId = c.get("user").id;
    await c.env.DB.prepare(`
      INSERT INTO user_profile_photos (user_id, mime_type, photo, updated_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(user_id) DO UPDATE SET
        mime_type = excluded.mime_type,
        photo = excluded.photo,
        updated_at = excluded.updated_at
    `).bind(userId, submittedType, bytes).run();
    await writeAuditLog(c, "PROFILE_PHOTO_UPDATE", "User", userId);
    return c.json({ saved: true });
  }
);

profilePhotoRoutes.delete("/profile-photo", requireAuth, async (c) => {
  const userId = c.get("user").id;
  await c.env.DB.prepare("DELETE FROM user_profile_photos WHERE user_id = ?").bind(userId).run();
  await writeAuditLog(c, "PROFILE_PHOTO_REMOVE", "User", userId);
  return c.body(null, 204);
});
