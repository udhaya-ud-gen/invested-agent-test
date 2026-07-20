const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");

const licenseRoutes = require("./routes/licenseRoutes");
const { startLicenseExpiryJob } = require("./jobs/licenseExpiryJob");

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000"
  })
);
app.use(express.json());

app.get("/health", (_, res) => {
  res.json({ ok: true, service: "license-backend" });
});

app.use("/api/licenses", licenseRoutes);

const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/stock_play_admin";

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("MongoDB connected");

    startLicenseExpiryJob();
    console.log("License expiry cron started (every minute)");

    app.listen(PORT, () => {
      console.log(`License backend listening on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start backend:", error.message);
    process.exit(1);
  }
}

start();
