const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const {
  getPeriode, tambahPeriode, updatePeriode, toggleForm,
  importMahasiswa, importDosen,
  tambahMahasiswa, tambahDosen, updateDosen,
  assignDosen, getDaftarMahasiswa, getDaftarDosen,
  getVerifikasiPengajuan,
  verifikasiPengajuan, hapusPengajuan, verifikasiDokumen, getMonitoringDokumen,
  getDashboardStats,
  getPengajuanDisetujui,
} = require('../controllers/kaprodiController');

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

const auth = [verifyToken, authorizeRoles('kaprodi')];

router.get('/dashboard-stats', auth, getDashboardStats);

router.get('/periode', auth, getPeriode);
router.post('/periode', auth, tambahPeriode);
router.put('/periode/:id', auth, updatePeriode);
router.patch('/periode/:id/toggle-form', auth, toggleForm);

router.post('/import-mahasiswa', auth, uploadImport.single('file'), importMahasiswa);
router.post('/import-dosen', auth, uploadImport.single('file'), importDosen);

router.get('/mahasiswa', auth, getDaftarMahasiswa);
router.post('/mahasiswa', auth, tambahMahasiswa);
router.get('/mahasiswa', auth, getDaftarMahasiswa);
router.post('/mahasiswa', auth, tambahMahasiswa);
router.get('/pengajuan-disetujui', auth, getPengajuanDisetujui);

router.get('/verifikasi-pengajuan', auth, getVerifikasiPengajuan);

router.get('/dosen', auth, getDaftarDosen);
router.post('/dosen', auth, tambahDosen);
router.put('/dosen/:id', auth, updateDosen);

router.get('/monitoring', auth, getMonitoringDokumen);
router.post('/assign-dosen', auth, assignDosen);
router.patch('/pengajuan/:id/verifikasi', auth, verifikasiPengajuan);
router.patch('/dokumen/:id/verifikasi', auth, verifikasiDokumen);
router.delete('/pengajuan/:id', auth, hapusPengajuan);

module.exports = router;