import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// ==========================================
// EXISTING ROUTERS
// ==========================================
import AdminRouter from "./routers/AdminRouter.js";
import Esp32DataRouter from "./routers/Esp32DataRouter.js";
import LineRouter from "./routers/LineRouter.js";
import UserRouter from "./routers/UsersRouter.js";
import ForgotPasswordRouter from "./routers/ForgotPasswordRouter.js";
import SuperuserRouter from "./routers/SuperuserRoutes.js";

// ==========================================
// MES ROUTERS
// ==========================================
import orderRoutes from "./routers/orderRoutes.js";
import planRouter from "./routers/planRoutes.js";
import inventoryRoutes from "./routers/inventoryRoutes.js";
import capacityRoutes from "./routers/capacityRoutes.js";
import injectionRoutes from "./routers/injectionMachineRoutes.js";
import salesOrderRoutes from "./routers/salesOrderRoutes.js";
import machineCalendarRoutes from "./routers/machineCalendarRoutes.js";
import toolCalendarRoutes from "./routers/toolCalendarRoutes.js";
import productionPlanningRoutes from "./routers/productionPlanningRoutes.js";
import MouldsRouter from "./routers/MouldRoutes.js";

// ==========================================
// SERVICES
// ==========================================
import { startHeartbeatService } from "./services/heartbeatService.js";

// ==========================================
// ENVIRONMENT
// ==========================================
dotenv.config();

// ==========================================
// EXPRESS APP
// ==========================================
const app = express();

// ==========================================
// RENDER / REVERSE PROXY CONFIGURATION
// ==========================================
// Render sits behind a reverse proxy and sends
// X-Forwarded-For.
//
// "1" = trust the first proxy in front of Express.
// Required for express-rate-limit to correctly
// identify client IP addresses.
//
// IMPORTANT:
// This must be configured BEFORE rate-limit middleware.
// ==========================================
app.set("trust proxy", 1);

// ==========================================
// SECURITY HARDENING
// ==========================================
app.use(helmet());

// ==========================================
// CONFIGURATION
// ==========================================
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// ==========================================
// RATE LIMITER
// ==========================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,

  // Maximum 100 requests per IP in 15 minutes
  max: 100,

  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes",
  },

  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// CORS
// ==========================================
const allowedOrigins = ["http://localhost:3001", "http://localhost:5173", "http://127.0.0.1:3001", "http://192.168.0.154:3001", "https://flexicaredashbord.vercel.app"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Optional CORS logging
      if (process.env.LOG_CORS === "true") {
        console.log("🌐 Origin:", origin);
      }

      // Allow requests without Origin
      // Example: Postman, mobile apps, server-to-server
      if (!origin) {
        return callback(null, true);
      }

      // Allow known origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error("❌ Blocked by CORS:", origin);

      return callback(new Error("Not allowed by CORS"));
    },

    credentials: true,

    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],

    maxAge: 86400,
  }),
);

// ==========================================
// BODY PARSERS
// ==========================================
app.use(
  express.json({
    limit: "512kb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "512kb",
  }),
);

// ==========================================
// REQUEST LOGGER
// ==========================================
app.use((req, res, next) => {
  if (process.env.LOG_REQUESTS === "true") {
    console.log(`📥 ${req.method} ${req.originalUrl}`);
  }

  next();
});

// ==========================================
// LIGHTWEIGHT MEMORY MONITOR
// ==========================================
// Does not retain request/response data.
// Runs once every 60 seconds.
// ==========================================
const memoryMonitor = setInterval(() => {
  const memory = process.memoryUsage();

  const rss = Math.round(memory.rss / 1024 / 1024);

  const heapUsed = Math.round(memory.heapUsed / 1024 / 1024);

  const heapTotal = Math.round(memory.heapTotal / 1024 / 1024);

  const external = Math.round(memory.external / 1024 / 1024);

  console.log(`🧠 Memory RSS=${rss}MB ` + `heap=${heapUsed}/${heapTotal}MB ` + `external=${external}MB`);
}, 60000);

// Prevent timer from keeping Node alive
memoryMonitor.unref();

// ==========================================
// HEALTH CHECK
// ==========================================
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Flexicare Backend Running",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// AUTH RATE LIMITING
// ==========================================
// These must be registered before the routers.
// ==========================================

app.use("/api/users/login", authLimiter);

app.use("/api/users/register", authLimiter);

app.use("/api/auth", authLimiter);

// ==========================================
// EXISTING API ROUTES
// ==========================================

app.use("/api/admin", AdminRouter);

app.use("/api/esp32", Esp32DataRouter);

app.use("/api/lines", LineRouter);

app.use("/api/users", UserRouter);

app.use("/api/auth", ForgotPasswordRouter);

app.use("/api/superuser", SuperuserRouter);

// ==========================================
// MES API ROUTES
// ==========================================

app.use("/api/injection-machines", injectionRoutes);

app.use("/api/v1/orders", orderRoutes);

app.use("/api/v1/production-plans", planRouter);

app.use("/api/v1/inventory", inventoryRoutes);

app.use("/api/v1/capacity-planning", capacityRoutes);

app.use("/api/v1/moulds", MouldsRouter);

app.use("/api/v1/sales-orders", salesOrderRoutes);

app.use("/api/v1/machine-calendar", machineCalendarRoutes);

app.use("/api/v1/tool-calendar", toolCalendarRoutes);

app.use("/api/v1/production-planning", productionPlanningRoutes);

// ==========================================
// 404 HANDLER
// ==========================================
app.use((req, res) => {
  console.log("❌ Route Not Found:", req.originalUrl);

  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

// ==========================================
// GLOBAL ERROR HANDLER
// ==========================================
app.use((err, req, res, next) => {
  console.error("🔥 ERROR:", err?.message || err);

  const statusCode = err?.status || 500;

  res.status(statusCode).json({
    success: false,

    message: process.env.NODE_ENV === "production" ? "Internal Server Error" : err?.message || "Internal Server Error",
  });
});

// ==========================================
// MONGODB CONNECTION
// ==========================================
async function connectMongoDB() {
  const mongoUri = process.env.MONGO_URI?.trim();

  // ----------------------------------------
  // Environment Check
  // ----------------------------------------
  console.log("=================================");

  console.log("🔍 MongoDB Environment Check");

  console.log("MONGO_URI exists:", Boolean(mongoUri));

  console.log("=================================");

  // ----------------------------------------
  // Missing URI
  // ----------------------------------------
  if (!mongoUri) {
    throw new Error("MONGO_URI environment variable is missing");
  }

  // ----------------------------------------
  // URI Validation
  // ----------------------------------------
  if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    throw new Error("Invalid MongoDB URI format. URI must start with mongodb:// or mongodb+srv://");
  }

  // ----------------------------------------
  // Connect
  // ----------------------------------------
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000,

    socketTimeoutMS: 30000,

    maxPoolSize: 5,

    minPoolSize: 0,

    maxConnecting: 2,

    compressors: ["zlib"],
  });

  // ----------------------------------------
  // Success
  // ----------------------------------------
  console.log("=================================");

  console.log("🍃 MongoDB Connected Successfully");

  console.log("🏠 Host:", mongoose.connection.host);

  console.log("📚 Database:", mongoose.connection.name);

  console.log("=================================");
}

// ==========================================
// MONGODB EVENTS
// ==========================================

mongoose.connection.on("error", (error) => {
  console.error("🍃 MongoDB Error:", error.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB Disconnected");
});

mongoose.connection.on("reconnected", () => {
  console.log("🔄 MongoDB Reconnected");
});

// ==========================================
// START SERVER
// ==========================================
async function startServer() {
  try {
    // --------------------------------------
    // MongoDB
    // --------------------------------------
    await connectMongoDB();

    // --------------------------------------
    // HTTP Server
    // --------------------------------------
    app.listen(PORT, () => {
      console.log("=================================");

      console.log(`🚀 Server running on port ${PORT}`);

      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);

      console.log(`🔗 Port: ${PORT}`);

      console.log("=================================");

      // ------------------------------------
      // Heartbeat Service
      // ------------------------------------
      try {
        startHeartbeatService();

        console.log("⏱️ Heartbeat monitoring service started (memory-safe mode).");
      } catch (heartbeatError) {
        console.error("❌ Failed to start heartbeat service:", heartbeatError?.message || heartbeatError);
      }
    });
  } catch (error) {
    console.error("=================================");

    console.error("❌ Server Startup Failed");

    console.error("Message:", error?.message || error);

    console.error("=================================");

    process.exit(1);
  }
}

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
async function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} received`);

  try {
    // Stop accepting new MongoDB operations
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();

      console.log("🍃 MongoDB connection closed");
    }

    console.log("✅ Graceful shutdown completed");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during shutdown:", error?.message || error);

    process.exit(1);
  }
}

// ==========================================
// PROCESS SIGNALS
// ==========================================
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ==========================================
// UNHANDLED ERRORS
// ==========================================
process.on("unhandledRejection", (reason) => {
  console.error("🔥 Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("🔥 Uncaught Exception:", error);

  process.exit(1);
});

// ==========================================
// START APPLICATION
// ==========================================
startServer();
