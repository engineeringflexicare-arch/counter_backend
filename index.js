import express from "express";
import cors from "cors";

import router from "./routers/UsersRouter.js";
import ESP32DataRouter from "./routers/Esp32DataRouter.js";

const app = express();

// CORS
app.use(
  cors({
    origin: "*",
    credentials: true,
  }),
);

app.use(express.json());

app.use("/api/users", router);
app.use("/api/esp32", ESP32DataRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
