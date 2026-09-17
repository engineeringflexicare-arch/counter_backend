import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// ==========================================
// පරණ Routers Import කිරීම
// ==========================================
import AdminRouter from "./routers/AdminRouter.js";
import Esp32DataRouter from "./routers/Esp32DataRouter.js";
import LineRouter from "./routers/LineRouter.js";
import UserRouter from "./routers/UsersRouter.js";
import ForgotPasswordRouter from "./routers/ForgotPasswordRouter.js";
import SuperuserRouter from "./routers/SuperuserRoutes.js";

// ==========================================
// අලුතින් සකස් කළ MES Routers Import කිරීම
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

import { startHeartbeatService } from "./services/heartbeatService.js";
import MouldsRouter from "./routers/MouldRoutes.js";

dotenv.config();

const app = express();

// ==========================================
// Security Hardening
// ==========================================
app.use(helmet());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // විනාඩි 15යි
  max: 100, // එක් IP එකකින් විනාඩි 15කට request 100ක් පමණි
  message: "Too many requests from this IP, please try again after 15 minutes",
});

// ==========================================
// Config
// ==========================================
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

// ==========================================
// CORS
// ==========================================
const allowedOrigins = ["http://localhost:3001", "http://localhost:5173", "http://127.0.0.1:3001", "http://192.168.0.154:3001", "https://flexicaredashbord.vercel.app"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Avoid high-volume production logging for every request.
      if (process.env.LOG_CORS === "true") console.log("🌐 Origin:", origin);

      // Postman / Mobile Apps / Server Requests
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 86400, // ✅ මෙතනට maxAge එක එකතු කරන ලදී
  }),
);

// ==========================================
// Body Parsers
// ==========================================
app.use(express.json({ limit: "512kb" }));
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

// ==========================================
// Logger
// ==========================================
app.use((req, res, next) => {
  if (process.env.LOG_REQUESTS === "true") console.log(`📥 ${req.method} ${req.originalUrl}`);
  next();
});

// Lightweight memory telemetry. Does not retain request/response payloads.
setInterval(() => {
  const m = process.memoryUsage();
  console.log(`🧠 Memory RSS=${Math.round(m.rss / 1024 / 1024)}MB heap=${Math.round(m.heapUsed / 1024 / 1024)}/${Math.round(m.heapTotal / 1024 / 1024)}MB external=${Math.round(m.external / 1024 / 1024)}MB`);
}, 60000).unref();

// ==========================================
// Health Check
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
// Rate Limiting (Routers වලට කලින් යෙදිය යුතුය)
// ==========================================
app.use("/api/users/login", authLimiter);
app.use("/api/users/register", authLimiter);
app.use("/api/auth", authLimiter); // Forgot Password routes සඳහා

// ==========================================
// Routes Configuration (End Points)
// ==========================================

// පරණ Endpoints
app.use("/api/admin", AdminRouter);
app.use("/api/esp32", Esp32DataRouter);
app.use("/api/lines", LineRouter);
app.use("/api/users", UserRouter);
app.use("/api/auth", ForgotPasswordRouter);
app.use("/api/superuser", SuperuserRouter);

// අලුතින් එක් කළ MES Endpoint
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
// 404 Route Not Found
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
// Global Error Handler
// ==========================================
app.use((err, req, res, next) => {
  console.error("🔥 ERROR:", err.message);

  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === "production" ? "Internal Server Error" : err.message,
  });
});

// ==========================================
// MongoDB Connection & Server Start
// ==========================================
async function startServer() {
  try {
    const mongoUri = process.env.MONGO_URI?.trim();

    console.log("=================================");
    console.log("🔍 MongoDB Environment Check");
    console.log("MONGO_URI exists:", !!mongoUri);

    if (mongoUri) {
      console.log("URI prefix:", mongoUri.substring(0, 20));
      console.log("URI length:", mongoUri.length);
    }
    console.log("=================================");

    if (!mongoUri) {
      throw new Error("MONGO_URI environment variable is missing");
    }

    if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
      throw new Error(`Invalid MongoDB URI format. URI must start with mongodb:// or mongodb+srv://`);
    }

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 30000,
      maxPoolSize: 5,
      minPoolSize: 0,
      maxConnecting: 2,
      compressors: ["zlib"],
    });

    console.log("=================================");
    console.log("🍃 MongoDB Connected Successfully");
    console.log("🏠 Host:", mongoose.connection.host);
    console.log("📚 Database:", mongoose.connection.name);
    console.log("=================================");

    app.listen(PORT, () => {
      console.log("=================================");
      console.log(`🚀 Server running on port ${PORT}`);

      startHeartbeatService();

      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`🔗 Port: ${PORT}`);
      console.log("=================================");
    });
  } catch (error) {
    console.error("=================================");
    console.error("❌ MongoDB Connection Failed");
    console.error("Message:", error.message);

    if (process.env.MONGO_URI) {
      const uri = process.env.MONGO_URI.trim();
      console.error("URI Prefix:", uri.substring(0, Math.min(30, uri.length)));
    }

    console.error(error);
    console.error("=================================");

    process.exit(1);
  }
}

startServer();
