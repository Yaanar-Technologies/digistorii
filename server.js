// Load .env.local variables explicitly for the custom server
require("dotenv").config({ path: ".env.local" });
require("dotenv").config(); // Fallback to .env if present

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server } = require("socket.io");

// Use tsx/cjs hook to allow requiring TypeScript files inside CommonJS server.js
const { register } = require("tsx/cjs/api");
register();

const { ensureDB } = require("./src/lib/ensure-db");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  try {
    // Run DB initialization and cron startup ONCE here
    await ensureDB();

    // Initialize node-cron scheduler (every 5 minutes) if enabled and not already running
    if (process.env.ENABLE_CRON !== "false" && !global.cronInitialized) {
      global.cronInitialized = true;
      const cron = require("node-cron");
      cron.schedule("*/5 * * * *", async () => {
        console.log("[NodeCron] Running scheduled cleanup tasks...");
        try {
          const { runAllCleanupTasks } = require("./src/lib/reservationCleanup");
          const results = await runAllCleanupTasks();
          console.log("[NodeCron] Cleanup finished:", results);
        } catch (cronErr) {
          console.error("[NodeCron] Error during cleanup execution:", cronErr);
        }
      });
      console.log("[NodeCron] Cron scheduler initialized (running every 5 minutes)");
    }
  } catch (err) {
    console.error("Failed to initialize database on startup:", err);
    process.exit(1);
  }

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Same-origin only unless APP_ORIGINS lists extra tenant domains (comma separated).
  const allowedOrigins = [process.env.NEXT_PUBLIC_APP_URL, ...(process.env.APP_ORIGINS || "").split(",")]
    .map((o) => (o || "").trim())
    .filter(Boolean);

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins.length ? allowedOrigins : false,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  const { verifySession, STAFF_COOKIE_NAME } = require("./src/lib/session");

  function readCookie(header, name) {
    for (const part of String(header || "").split(";")) {
      const idx = part.indexOf("=");
      if (idx > 0 && part.slice(0, idx).trim() === name) {
        try {
          return decodeURIComponent(part.slice(idx + 1).trim());
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  // Only a signed staff session may connect; the room comes from the token, never the client.
  io.use(async (socket, nextMiddleware) => {
    const token = readCookie(socket.handshake.headers.cookie, STAFF_COOKIE_NAME);
    const session = await verifySession(token, "staff");
    const userId = session && (session.user_id ?? session.id);
    if (!userId) return nextMiddleware(new Error("Unauthorized"));
    socket.data.userId = Number(userId);
    nextMiddleware();
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.userId}`);

    socket.on("join_user_room", () => {
      // Kept for older clients; the room is already joined from the verified session.
      socket.join(`user:${socket.data.userId}`);
    });
  });

  global.io = io;

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log(`Database name: ${process.env.DATABASE_URL}`);
  });
});