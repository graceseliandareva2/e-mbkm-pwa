const express = require("express");
const router = express.Router();
const multer = require("multer");
const { verifyToken, authorizeRoles } = require("../middleware/authMiddleware");
const {
  getPengajuan,
  tambahPengajuan,
  updatePengajuan,
  hapusPengajuan,
  getDosenPA,
  getPelatihanAktif,
  getLogbook,
  tambahLogbook,
  updateLogbook,
  hapusLogbook,
  getDokumen,
  uploadDokumen,
  hapusDokumen,
  resubmitDokumen,
  getFeedback,
  getPenilaian,
  getNotifikasi,
  getPeriodeAktif,
} = require("../controllers/mahasiswaController");

const auth = [verifyToken, authorizeRoles("mahasiswa")];

// PERUBAHAN: file logbook & dokumen sekarang disimpan ke Cloudinary
// (cloudinaryService.uploadFile pakai req.file.buffer lewat upload_stream),
// jadi multer tetap pakai memoryStorage() -- bukan disk storage -- karena
// controller butuh buffer di memori, bukan path file di disk.
const uploadMemory = multer({ storage: multer.memoryStorage() });

// Periode aktif
router.get("/periode-aktif", auth, getPeriodeAktif);

// Pengajuan capstone
router.get("/pengajuan", auth, getPengajuan);
router.post("/pengajuan", auth, tambahPengajuan);
router.put("/pengajuan/:id", auth, updatePengajuan);
router.delete("/pengajuan/:id", auth, hapusPengajuan);

// BARU: daftar Dosen PA (is_dosen_pa = true) buat dropdown di form pengajuan
router.get("/dosen-pa", auth, getDosenPA);

// Pelatihan (dalam pengajuan yang disetujui) -- dipakai dropdown/tab di halaman Logbook
router.get("/pelatihan", auth, getPelatihanAktif);

// Logbook
// GET /logbook mendukung query opsional ?pelatihan_id=... untuk filter per pelatihan
router.get("/logbook", auth, getLogbook);
router.post(
  "/logbook",
  auth,
  uploadMemory.single("bukti"),
  tambahLogbook,
);
router.put(
  "/logbook/:id",
  auth,
  uploadMemory.single("bukti"),
  updateLogbook,
);
router.delete("/logbook/:id", auth, hapusLogbook);

// Dokumen
router.get("/dokumen", auth, getDokumen);
router.post(
  "/dokumen",
  auth,
  uploadMemory.single("file"),
  uploadDokumen,
);
router.delete("/dokumen/:id", auth, hapusDokumen);
router.put(
  "/dokumen/:id/resubmit",
  auth,
  uploadMemory.single("file"),
  resubmitDokumen,
);

// Feedback & penilaian
router.get("/feedback", auth, getFeedback);
router.get("/penilaian", auth, getPenilaian);
router.get("/notifikasi", auth, getNotifikasi);

module.exports = router;