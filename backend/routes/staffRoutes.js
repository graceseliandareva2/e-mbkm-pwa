const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const {
  importMahasiswa, tambahMahasiswa,
  importDosen, tambahDosen, updateDosen,
  updateMahasiswa, hapusMahasiswa, resetPasswordMahasiswa,
  getDaftarMahasiswa, getDaftarDosen,
  getDashboardStats,
  getAktivitasTerbaru,
  getDaftarPengajuan,
  getDetailPengajuan,
  exportPengajuanExcel,
  exportPengajuanPDF,
  getProfil,
  updateProfil,
  getPeriode,
  getRekapNilai,
  getDaftarMahasiswaMBKM,
  getLogbookMahasiswa,
  getDokumenMahasiswa,
  getNilaiMahasiswa,
  exportLogbookPdf,
} = require('../controllers/staffController');


const uploadImport = multer({
  dest: 'uploads/temp/',
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file Excel atau CSV yang diperbolehkan!'));
    }
  }
});

const auth = [verifyToken, authorizeRoles('staff_akademik')];

// Dashboard
router.get('/dashboard-stats',   auth, getDashboardStats);
router.get('/aktivitas-terbaru', auth, getAktivitasTerbaru);

router.post('/import-mahasiswa', auth, uploadImport.single('file'), importMahasiswa);
router.post('/import-dosen',     auth, uploadImport.single('file'), importDosen);

router.get('/mahasiswa', auth, getDaftarMahasiswa);
router.post('/mahasiswa', auth, tambahMahasiswa);
router.put('/mahasiswa/:id', auth, updateMahasiswa);
router.delete('/mahasiswa/:id', auth, hapusMahasiswa);
router.patch('/mahasiswa/:id/reset-password', auth, resetPasswordMahasiswa);

router.get('/dosen', auth, getDaftarDosen);
router.post('/dosen', auth, tambahDosen);
router.put('/dosen/:id', auth, updateDosen);

// Pengajuan MBKM
router.get('/pengajuan',               auth, getDaftarPengajuan);
router.get('/pengajuan/export-excel',  auth, exportPengajuanExcel);  
router.get('/pengajuan/export-pdf',    auth, exportPengajuanPDF);    
router.get('/pengajuan/:id',           auth, getDetailPengajuan);
router.get('/rekap-nilai', auth, getRekapNilai);

// Menu Logbook & Dokumen (view-only)
router.get('/mahasiswa-mbkm',       auth, getDaftarMahasiswaMBKM);
router.get('/logbook',              auth, getLogbookMahasiswa);
router.get('/logbook/export-pdf',   auth, exportLogbookPdf);
router.get('/dokumen',              auth, getDokumenMahasiswa);

// Nilai Mahasiswa (view-only)
router.get('/nilai', auth, getNilaiMahasiswa);

// Profil
router.get('/profil',   auth, getProfil);
router.patch('/profil', auth, updateProfil);

router.get('/periode', auth, getPeriode);

module.exports = router;