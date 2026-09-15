// src/app.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const path = require("path");

const authRoutes = require("./routes/auth");
const workRoutes = require("./routes/works");
const wearableRoutes = require("./routes/wearable");
const enquiryRoutes = require("./routes/enquiries");
const adminRoutes = require("./routes/admin");
const orderRoutes = require("./routes/orders");
const paymentRoutes = require("./routes/payments");

const app = express();

app.use(express.json({ limit: "100kb" })); // small cap — see docs/SECURITY.md input validation
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.PUBLIC_SITE_ORIGIN || "http://localhost:8000",
    credentials: true,
  })
);

// Basic secure headers. In production behind Vercel/another platform,
// most of this is set at the edge — see docs/DEPLOYMENT.md — but it costs
// nothing to also set them here so the API is safe to deploy standalone.
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/works", workRoutes);
app.use("/api/wearable", wearableRoutes);
app.use("/api", enquiryRoutes); // exposes /api/enquiries, /api/commissions, /api/wearable-notify, /api/admin/*
app.use("/api/admin", adminRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);

// Serve the simple admin panel as static files.
app.use("/admin", express.static(path.join(__dirname, "..", "admin")));

// Never leak stack traces to the client.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our end." });
});

module.exports = app;
