import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import router from "./routers/UsersRouter.js";
import ESP32DataRouter from "./routers/Esp32DataRouter.js";

dotenv.config();

const app = express();

// 1. නිවැරදි CORS Configuration
// පෝට් එක 3001 ලෙස නිවැරදි කර ඇත
app.use(
  cors({
    origin: ["http://localhost:3001", "http://localhost:3000"], // අවශ්‍ය පරිදි පෝට් එක දෙන්න
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

// 2. Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. API Routes
app.use("/api/users", router);
app.use("/api/esp32", ESP32DataRouter);

// 4. Global Error Handling
app.use((err, req, res, next) => {
  console.error("Server Error:", err.stack);
  res.status(500).json({ success: false, message: err.message || "Something broke!" });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
