const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const {
  getDashboardStats,
  getAktivitasTerbaru,
  getDaftarPengajuan,
  getDetailPengajuan,
  arsipkanPengajuan,
  exportPengajuanExcel,
  exportPengajuanPDF,
  getProfil,
  updateProfil,
  getPeriode,
} = require('../controllers/staffController');

const auth = [verifyToken, authorizeRoles('staff_akademik')];

// Dashboard
router.get('/dashboard-stats',   auth, getDashboardStats);
router.get('/aktivitas-terbaru', auth, getAktivitasTerbaru);

// Pengajuan MBKM
router.get('/pengajuan',               auth, getDaftarPengajuan);
router.get('/pengajuan/export-excel',  auth, exportPengajuanExcel);  // ← sebelum /:id
router.get('/pengajuan/export-pdf',    auth, exportPengajuanPDF);    // ← sebelum /:id
router.get('/pengajuan/:id',           auth, getDetailPengajuan);
router.post('/pengajuan/:id/arsipkan', auth, arsipkanPengajuan);

// Profil
router.get('/profil',   auth, getProfil);
router.patch('/profil', auth, updateProfil);

router.get('/periode', auth, getPeriode);

module.exports = router;