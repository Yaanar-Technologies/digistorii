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
  } catch (err) {
    console.error("Failed to initialize database on startup:", err);
    process.exit(1);
  }

  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join_user_room", (userId) => {
      if (userId) {
        socket.join(`user:${userId}`);
        console.log(`Socket ${socket.id} joined room user:${userId}`);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  global.io = io;

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});