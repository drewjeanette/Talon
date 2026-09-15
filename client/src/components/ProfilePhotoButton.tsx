import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { api, ApiError } from "../api/client";

const INPUT_LIMIT = 10 * 1024 * 1024;
const UPLOAD_LIMIT = 512 * 1024;
const ALLOWED_INPUTS = new Set(["image/jpeg", "image/png", "image/webp"]);

function asDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
}

async function preparePhoto(file: File): Promise<Blob> {
  if (!ALLOWED_INPUTS.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP photo.");
  if (file.size > INPUT_LIMIT) throw new Error("Choose a photo under 10 MB.");

  const source = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not open that photo."));
      image.src = source;
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Could not open that photo.");

    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare that photo.");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      256,
      256
    );

    const photo = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not prepare that photo.")), "image/jpeg", 0.82);
    });
    if (photo.size > UPLOAD_LIMIT) throw new Error("That photo is too large after resizing.");
    return photo;
  } finally {
    URL.revokeObjectURL(source);
  }
}

export function ProfilePhotoButton({ userId, onStatus }: { userId: number; onStatus: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPhotoUrl(null);
    api.getPhoto().then(asDataUrl).then((url) => {
      if (!cancelled) setPhotoUrl(url);
    }).catch((error) => {
      if (!cancelled && !(error instanceof ApiError && error.status === 404)) {
        onStatus("Could not load your profile photo.");
      }
    });
    return () => { cancelled = true; };
  }, [userId]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    onStatus("Uploading your photo…");
    try {
      const photo = await preparePhoto(file);
      await api.uploadPhoto(photo);
      setPhotoUrl(await asDataUrl(photo));
      onStatus("Profile photo saved.");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Could not save your profile photo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    onStatus("Removing your photo…");
    try {
      await api.removePhoto();
      setPhotoUrl(null);
      onStatus("Profile photo removed.");
    } catch (error) {
      onStatus(error instanceof ApiError ? error.message : "Could not remove your profile photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="dashboard__photo-control">
      <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} aria-label="Choose a profile photo" />
      <button type="button" className="dashboard__photo-button" onClick={() => input.current?.click()} disabled={busy} aria-label={photoUrl ? "Change profile photo" : "Upload profile photo"} title={photoUrl ? "Change profile photo" : "Upload profile photo"}>
        {photoUrl ? <img src={photoUrl} alt="" /> : <svg className="dashboard__photo-silhouette" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="35" r="19" /><path d="M17 94c2-25 14-38 33-38s31 13 33 38" /></svg>}
        <span className="dashboard__photo-camera" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h4l2-2h4l2 2h4v12H4z" /><circle cx="12" cy="13" r="3" /></svg></span>
      </button>
      {photoUrl && <button type="button" className="dashboard__photo-remove" onClick={remove} disabled={busy} aria-label="Remove profile photo" title="Remove profile photo">×</button>}
    </span>
  );
}
