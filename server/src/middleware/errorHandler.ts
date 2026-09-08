import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found." });
}

// Centralized error handler - the response body NEVER contains stack traces,
// file paths, or raw driver errors (e.g. Prisma connection failures), even in
// development. Full detail is logged server-side only, where a developer can
// read it without exposing it to whatever is calling the API.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed.", details: err.flatten() });
  }

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      const fields = (err.meta?.target as string[] | undefined)?.join(", ") ?? "field";
      return res.status(409).json({ error: `A record with that ${fields} already exists.` });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Record not found." });
    }
  }

  console.error(err);
  if (env.NODE_ENV !== "production") {
    console.error("(full detail above is server-log only; the client response stays generic)");
  }
  res.status(500).json({ error: "Internal server error." });
}
