const express = require("express");
const cors = require("cors");
const path = require("path");
const { startPeriodeCron } = require("./jobs/periodeCron");
require("dotenv").config();

const app = express();
app.set("etag", false);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  "https://e-mbkmitbss.online",
   "https://www.e-mbkmitbss.online",
  process.env.FRONTEND_URL, 
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
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

// Semua endpoint /api/* selalu no-store: browser (dan proxy di depannya,
// mis. OpenLiteSpeed) tidak boleh menyimpan/menyajikan ulang response API
// dari cache. File statis (/uploads dll) tidak kena aturan ini.
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/mahasiswa", require("./routes/mahasiswaRoutes"));
app.use("/api/dosen", require("./routes/dosenRoutes"));
app.use("/api/kaprodi", require("./routes/kaprodiRoutes"));
app.use("/api/staff", require("./routes/staffRoutes"));
app.use("/api/push", require("./routes/pushRoutes"));

app.get("/", (req, res) => {
  res.json({ message: "Capstone Project API is running!" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: err.message || "Internal Server Error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});

startPeriodeCron();

console.log("Static folder:", path.join(__dirname, "uploads"));