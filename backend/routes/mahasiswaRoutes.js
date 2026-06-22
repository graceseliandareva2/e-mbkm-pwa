const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const { upload, uploadToCloudinary } = require('../middleware/uploadMiddleware');
const {
  getPengajuan, tambahPengajuan, updatePengajuan, hapusPengajuan,
  getLogbook, tambahLogbook, updateLogbook, hapusLogbook,
  getDokumen, uploadDokumen,
  getFeedback, getPenilaian, getNotifikasi, getPeriodeAktif
} = require('../controllers/mahasiswaController');

const auth = [verifyToken, authorizeRoles('mahasiswa')];

// Periode aktif
router.get('/periode-aktif', auth, getPeriodeAktif);

// Pengajuan capstone
router.get('/pengajuan', auth, getPengajuan);
router.post('/pengajuan', auth, tambahPengajuan);
router.put('/pengajuan/:id', auth, updatePengajuan);
router.delete('/pengajuan/:id', auth, hapusPengajuan);

// Logbook
router.get('/logbook', auth, getLogbook);
router.post('/logbook', auth, (req, res, next) => {
  req.uploadFolder = 'logbook-bukti';
  next();
}, upload.single('bukti'), uploadToCloudinary, tambahLogbook);
router.put('/logbook/:id', auth, updateLogbook);
router.delete('/logbook/:id', auth, hapusLogbook);

// Dokumen
router.get('/dokumen', auth, getDokumen);
router.post('/dokumen', auth, (req, res, next) => {
  req.uploadFolder = 'temp';
  next();
}, upload.single('file'), uploadToCloudinary, uploadDokumen);
router.delete('/dokumen/:id', auth, require('../controllers/mahasiswaController').hapusDokumen);

router.put('/dokumen/:id/resubmit', auth, (req, res, next) => {
  req.uploadFolder = 'temp';
  next();
}, upload.single('file'), uploadToCloudinary, require('../controllers/mahasiswaController').resubmitDokumen);

// Feedback & penilaian
router.get('/feedback', auth, getFeedback);
router.get('/penilaian', auth, getPenilaian);
router.get('/notifikasi', auth, getNotifikasi);

module.exports = router;