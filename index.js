import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import router from "./routers/UsersRouter.js";
import ESP32DataRouter from "./routers/Esp32DataRouter.js";

dotenv.config();

const app = express();

// CORS
const allowedOrigins = ["http://localhost:3000", "http://localhost:3001", "https://flexicaredashbord.vercel.app"];

app.use(
  cors({
    origin: [process.env.CLIENT_URL, "http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
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
app.use("/api/users", router);
app.use("/api/esp32", ESP32DataRouter);

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
