import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { api, ApiError, type ProfilePhotoView } from "../api/client";

const INPUT_LIMIT = 10 * 1024 * 1024;
const UPLOAD_LIMIT = 512 * 1024;
const ALLOWED_INPUTS = new Set(["image/jpeg", "image/png", "image/webp"]);
const DEFAULT_VIEW: ProfilePhotoView = { zoom: 1, x: 0, y: 0 };

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
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare that photo.");
    // Resize the whole frame. The dashboard closeup is a view, never a stored crop.
    for (const maxSide of [1600, 1280, 960, 720]) {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.84, 0.72, 0.6]) {
        const photo = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not prepare that photo.")), "image/jpeg", quality);
        });
        if (photo.size <= UPLOAD_LIMIT) return photo;
      }
    }
    throw new Error("That photo is too large after resizing.");
  } finally {
    URL.revokeObjectURL(source);
  }
}

function framing(view: ProfilePhotoView): CSSProperties {
  const horizontal = 50 + view.x * 50;
  const vertical = 50 + view.y * 50;
  return {
    objectPosition: `${horizontal}% ${vertical}%`,
    transform: `scale(${view.zoom})`,
    transformOrigin: `${horizontal}% ${vertical}%`,
  };
}

export function ProfilePhotoButton({ userId, onStatus }: { userId: number; onStatus: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [savedView, setSavedView] = useState<ProfilePhotoView>(DEFAULT_VIEW);
  const [draftView, setDraftView] = useState<ProfilePhotoView>(DEFAULT_VIEW);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    setPhotoUrl(null);
    setLoading(true);
    setSavedView(DEFAULT_VIEW);
    setDraftView(DEFAULT_VIEW);
    Promise.all([api.getPhoto().then(asDataUrl), api.getPhotoView()]).then(([url, view]) => {
      if (!cancelled) {
        setPhotoUrl(url);
        setSavedView(view);
        setDraftView(view);
      }
    }).catch((error) => {
      if (!cancelled && !(error instanceof ApiError && error.status === 404)) {
        onStatus("Could not load your profile photo.");
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  function open() {
    setDraftView(savedView);
    setMessage("");
    dialog.current?.showModal();
  }

  function report(text: string) {
    setMessage(text);
    onStatus(text);
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setBusy(true);
    report("Uploading your photo…");
    try {
      const photo = await preparePhoto(file);
      await api.uploadPhoto(photo);
      setPhotoUrl(await asDataUrl(photo));
      setSavedView(DEFAULT_VIEW);
      setDraftView(DEFAULT_VIEW);
      report("Profile photo saved. Adjust the dashboard closeup below if you like.");
    } catch (error) {
      report(error instanceof Error ? error.message : "Could not save your profile photo.");
    } finally {
      setBusy(false);
    }
  }

  async function saveView() {
    setBusy(true);
    try {
      const saved = await api.savePhotoView(draftView);
      setSavedView(saved);
      setDraftView(saved);
      report("Dashboard closeup saved. Your full photo is unchanged.");
    } catch (error) {
      report(error instanceof ApiError ? error.message : "Could not save your closeup.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.removePhoto();
      setPhotoUrl(null);
      setSavedView(DEFAULT_VIEW);
      setDraftView(DEFAULT_VIEW);
      report("Profile photo removed.");
    } catch (error) {
      report(error instanceof ApiError ? error.message : "Could not remove your profile photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="dashboard__photo-control">
      <input ref={input} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} aria-label="Choose a profile photo" />
      <button type="button" className="dashboard__photo-button" onClick={open} aria-label={photoUrl ? "View and adjust profile photo" : "Add profile photo"} title={photoUrl ? "View profile photo" : "Add profile photo"}>
        <span className="dashboard__photo-image">
          {photoUrl ? <img src={photoUrl} alt="" style={framing(savedView)} /> : <svg className="dashboard__photo-silhouette" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="35" r="19" /><path d="M17 94c2-25 14-38 33-38s31 13 33 38" /></svg>}
        </span>
        <span className="dashboard__photo-camera" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h4l2-2h4l2 2h4v12H4z" /><circle cx="12" cy="13" r="3" /></svg></span>
      </button>
      {createPortal(
        <dialog ref={dialog} className="profile-photo-dialog" onClose={() => setDraftView(savedView)}>
          <div className="profile-photo-dialog__header">
            <h2>Your profile photo</h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Close profile photo viewer">Close</button>
          </div>
          {photoUrl ? <>
            <div className="profile-photo-dialog__full"><img src={photoUrl} alt="Your full profile photo" /></div>
            <p className="profile-photo-dialog__hint">Your full photo stays intact. Adjust only the square shown on your dashboard.</p>
            <div className="profile-photo-dialog__editor">
              <div className="profile-photo-dialog__preview" aria-label="Dashboard closeup preview"><img src={photoUrl} alt="" style={framing(draftView)} /></div>
              <div className="profile-photo-dialog__sliders">
                <label>Zoom <input type="range" min="1" max="3" step="0.05" value={draftView.zoom} onChange={(e) => setDraftView({ ...draftView, zoom: Number(e.target.value) })} /></label>
                <label>Move left or right <input type="range" min="-1" max="1" step="0.02" value={draftView.x} onChange={(e) => setDraftView({ ...draftView, x: Number(e.target.value) })} /></label>
                <label>Move up or down <input type="range" min="-1" max="1" step="0.02" value={draftView.y} onChange={(e) => setDraftView({ ...draftView, y: Number(e.target.value) })} /></label>
                <div className="button-row">
                  <button type="button" onClick={() => setDraftView(DEFAULT_VIEW)} disabled={busy}>Reset closeup</button>
                  <button type="button" onClick={saveView} disabled={busy || JSON.stringify(draftView) === JSON.stringify(savedView)}>Save closeup</button>
                </div>
              </div>
            </div>
          </> : <p className="profile-photo-dialog__empty">{loading ? "Loading your profile photo…" : "No profile photo yet. Add one to show it on your dashboard."}</p>}
          {message && <p className="profile-photo-dialog__message" role="status">{message}</p>}
          <div className="profile-photo-dialog__actions">
            <button type="button" onClick={() => input.current?.click()} disabled={busy || loading}>{photoUrl ? "Replace photo" : "Add photo"}</button>
            {photoUrl && <button type="button" className="button--danger" onClick={remove} disabled={busy}>Remove photo</button>}
          </div>
        </dialog>, document.body
      )}
    </span>
  );
}
