import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";

interface TimeEntry {
  id: number;
  clockIn: string;
  clockOut: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  jobId: number | null;
  jobTitle: string | null;
}

export interface Job {
  id: number;
  title: string;
  chargeAccount: { id: number; code: string; name: string } | null;
}

export function ClockWidget({ onChange }: { onChange?: () => void }) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobId, setJobId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [lastShiftDuration, setLastShiftDuration] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);
  const [switchTo, setSwitchTo] = useState<number | null>(null);

  async function load() {
    const data = await api.get<TimeEntry[]>("/timeclock/my-entries");
    setEntries(data);
  }

  useEffect(() => {
    load();
    api.get<Job[]>("/timeclock/my-jobs").then(setJobs).catch(() => setJobs([]));
  }, []);

  const openEntry = entries.find((e) => e.clockOut === null);
  const multipleJobs = jobs.length > 1;
  // The shift a "wrong job" fix applies to: the open one, else the latest still waiting for approval.
  const fixable = openEntry ?? (entries[0]?.status === "PENDING" ? entries[0] : undefined);

  useEffect(() => {
    if (!openEntry) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [openEntry?.id]);

  function formatDuration(milliseconds: number) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }

  async function handleClockIn() {
    if (multipleJobs && !jobId) {
      setMessage("Choose which job you are clocking in for.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api.post("/timeclock/clock-in", multipleJobs ? { jobId } : {});
      const job = jobs.find((item) => item.id === jobId);
      setMessage(job ? `Clocked in for ${job.title}.` : "Clocked in.");
      await load();
      onChange?.();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not clock in.");
    } finally {
      setBusy(false);
    }
  }

  async function handleClockOut() {
    setBusy(true);
    setMessage(null);
    try {
      const completed = await api.post<TimeEntry>("/timeclock/clock-out");
      if (completed.clockOut) {
        setLastShiftDuration(new Date(completed.clockOut).getTime() - new Date(completed.clockIn).getTime());
      }
      setMessage("Clocked out.");
      await load();
      onChange?.();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not clock out.");
    } finally {
      setBusy(false);
    }
  }

  function openSwitch() {
    setSwitching(true);
    setSwitchTo(null);
    setMessage(null);
  }

  async function moveShift() {
    if (!fixable || !switchTo) {
      setMessage("Choose the job this shift was really for.");
      return;
    }
    setBusy(true);
    try {
      const result = await api.patch<{ jobTitle: string }>(`/timeclock/my-entries/${fixable.id}/job`, { jobId: switchTo });
      setMessage(`Shift moved to ${result.jobTitle}.`);
      setSwitching(false);
      await load();
      onChange?.();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : "Could not move the shift.");
    } finally {
      setBusy(false);
    }
  }

  const jobLabel = (job: Job) => `${job.title}${job.chargeAccount ? ` (${job.chargeAccount.code})` : ""}`;

  return (
    <section aria-labelledby="clock-heading" className="card clock-widget">
      <h2 id="clock-heading">Web Clock</h2>
      <p className="clock-widget__status">
        Status:{" "}
        <strong>{openEntry ? `Clocked in${openEntry.jobTitle && multipleJobs ? ` for ${openEntry.jobTitle}` : ""} since ${new Date(openEntry.clockIn).toLocaleTimeString()}` : "Clocked out"}</strong>
      </p>
      {(openEntry || lastShiftDuration !== null) && (
        <p className="clock-widget__elapsed" aria-live="off">
          {openEntry ? "Current shift" : "Last shift"}:{" "}
          <strong>{formatDuration(openEntry ? now - new Date(openEntry.clockIn).getTime() : lastShiftDuration ?? 0)}</strong>
        </p>
      )}
      {multipleJobs && !openEntry && (
        <fieldset className="clock-widget__jobs">
          <legend>Which job are you clocking in for?</legend>
          {jobs.map((job) => (
            <label key={job.id} className="clock-widget__job">
              <input type="radio" name="clock-job" value={job.id} checked={jobId === job.id} onChange={() => setJobId(job.id)} />
              <span>{job.title}{job.chargeAccount && <small>{job.chargeAccount.code}</small>}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="button-row clock-widget__actions">
        <button type="button" onClick={handleClockIn} disabled={busy || !!openEntry} className="clock-widget__in">
          Clock In
        </button>
        <button type="button" onClick={handleClockOut} disabled={busy || !openEntry} className="clock-widget__out">
          Clock Out
        </button>
      </div>
      {multipleJobs && fixable && !switching && (
        <button type="button" className="button--secondary clock-widget__wrong-job" onClick={openSwitch}>
          Clocked in for the wrong job?
        </button>
      )}
      {switching && fixable && (
        <div className="clock-widget__switch" role="group" aria-labelledby="switch-job-heading">
          <h3 id="switch-job-heading">Move this shift to another job</h3>
          <p>
            Shift started {new Date(fixable.clockIn).toLocaleString()}
            {fixable.jobTitle ? `, now recorded as ${fixable.jobTitle}` : ""}.
          </p>
          <fieldset>
            <legend>Which job was it really for?</legend>
            {jobs.filter((job) => job.id !== fixable.jobId).map((job) => (
              <label key={job.id} className="clock-widget__job">
                <input type="radio" name="switch-job" value={job.id} checked={switchTo === job.id} onChange={() => setSwitchTo(job.id)} />
                <span>{jobLabel(job)}</span>
              </label>
            ))}
          </fieldset>
          <div className="button-row">
            <button type="button" onClick={moveShift} disabled={busy}>Move shift</button>
            <button type="button" className="button--secondary" onClick={() => setSwitching(false)}>Cancel</button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="status-message">
        {message}
      </p>
    </section>
  );
}
