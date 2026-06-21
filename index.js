import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// ==========================================
// අලුතින් සකස් කළ Routers 5 Import කිරීම
// ==========================================
import AdminRouter from "./routers/AdminRouter.js";
import Esp32DataRouter from "./routers/Esp32DataRouter.js";
import LineRouter from "./routers/LineRouter.js";
import UserRouter from "./routers/UsersRouter.js";
import ForgotPasswordRouter from "./routers/ForgotPasswordRouter.js";

import { startHeartbeatService } from "./services/heartbeatService.js";
import SuperuserRouter from "./routers/SuperuserRoutes.js";

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
      console.log("🌐 Origin:", origin);

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
  }),
);

// ==========================================
// Body Parsers
// ==========================================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ==========================================
// Logger
// ==========================================
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.originalUrl}`);
  next();
});

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
// Routes Configuration
// ==========================================
app.use("/api/admin", AdminRouter); // Admin Operations
app.use("/api/esp32", Esp32DataRouter); // ESP32 & Firebase Data
app.use("/api/lines", LineRouter); // Line Management (Superuser/Admin)
app.use("/api/users", UserRouter); // User Management & Notifications
app.use("/api/auth", ForgotPasswordRouter); // OTP & Password Reset
app.use("/api/superuser", SuperuserRouter); // Superuser Operations
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
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
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
