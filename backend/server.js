const express = require("express");
const cors = require("cors");
const path = require("path");
const { startPeriodeCron, runAutoToggle } = require("./jobs/periodeCron");
require("dotenv").config();

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  "https://e-mbkmitbss.online",
  process.env.FRONTEND_URL, // buat production (Vercel)
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // origin undefined = request tanpa origin header (misal Postman/curl), tetep diizinkan
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS: " + origin));
      }
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static folder untuk akses file upload
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/uploads", express.static(path.join(__dirname, "uploads")));

// Routes (akan ditambahkan bertahap)
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/mahasiswa", require("./routes/mahasiswaRoutes"));
app.use("/api/dosen", require("./routes/dosenRoutes"));
app.use("/api/kaprodi", require("./routes/kaprodiRoutes"));
app.use("/api/staff", require("./routes/staffRoutes"));
app.use("/api/push", require("./routes/pushRoutes"));

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Capstone Project API is running!" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
startPeriodeCron();
runAutoToggle();
console.log("Static folder:", path.join(__dirname, "uploads"));
