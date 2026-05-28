import express from "express";
import cors from "cors";

import { ALLOWED_ORIGINS, HTTP_PORT } from "./config";
import { handleReadId } from "./reader";

export function startHttpServer(): Promise<{
  close: () => Promise<void>;
}> {
  const app = express();
  app.disable("x-powered-by");

  app.use(
    cors({
      origin(origin, cb) {
        // Browser tools and direct curl have no Origin header — let those
        // through so the user can self-test with `curl localhost:8765/read-id`.
        if (!origin) return cb(null, true);
        if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        return cb(new Error(`origin ${origin} not allowed`));
      },
      methods: ["GET", "OPTIONS"],
    }),
  );

  // Simple health probe used by the frontend "is the agent installed?" UI
  // and by the system-tray menu to verify the server is still listening.
  app.get("/health", (_req, res) => {
    res.json({ ok: true, version: "0.1.0" });
  });

  app.get("/read-id", handleReadId);

  return new Promise((resolve, reject) => {
    const server = app.listen(HTTP_PORT, "127.0.0.1", () => {
      resolve({
        close: () =>
          new Promise<void>((r, j) =>
            server.close((err) => (err ? j(err) : r())),
          ),
      });
    });
    server.on("error", reject);
  });
}
