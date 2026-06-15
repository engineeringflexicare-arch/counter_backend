import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import router from "./routers/UsersRouter.js";
import ESP32DataRouter from "./routers/Esp32DataRouter.js";
import UserRouter from "./routers/UsersRouter.js";
import SuperuserRouter from "./routers/SuperuserRoutes.js";
dotenv.config();

const app = express();

const allowedOrigins = ["http://192.168.0.154:3001", "http://localhost:3001", "https://flexicaredashbord.vercel.app"];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  }),
);

// Body Parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Flexicare Backend Running",
  });
});

// Routes
app.use("/api/users", UserRouter);
app.use("/api/esp32", ESP32DataRouter);
app.use("/api/superuser", SuperuserRouter);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});
// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});
