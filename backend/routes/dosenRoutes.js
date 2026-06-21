const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const {
  getMahasiswaBimbingan, getAktivitasTerbaru, getLogbookMahasiswa, verifikasiLogbook,
  getDokumenMahasiswa, verifikasiDokumen, berikanPenilaian, berikanFeedback,
  eksporPenilaianPDF, eksporSemuaPenilaianPDF, getMahasiswaSiapDinilai,
} = require('../controllers/dosenController');
const auth = [verifyToken, authorizeRoles('dosen_pembimbing')];

router.get('/periode', auth, async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM periode ORDER BY created_at DESC");
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
});

router.get('/aktivitas-terbaru', auth, getAktivitasTerbaru);
router.get('/mahasiswa-bimbingan', auth, getMahasiswaBimbingan);
router.get('/logbook', auth, getLogbookMahasiswa);
router.patch('/logbook/:id/verifikasi', auth, verifikasiLogbook);
router.get('/dokumen', auth, getDokumenMahasiswa);
router.patch('/dokumen/:id/verifikasi', auth, verifikasiDokumen);
router.post('/penilaian', auth, berikanPenilaian);
router.post('/feedback', auth, berikanFeedback);
router.get('/penilaian/ekspor', auth, eksporPenilaianPDF);
router.get('/penilaian/ekspor-semua', auth, eksporSemuaPenilaianPDF);
router.get('/mahasiswa-siap-dinilai', auth, getMahasiswaSiapDinilai);
module.exports = router;