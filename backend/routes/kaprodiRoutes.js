const express = require('express');
const router = express.Router();
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');
const {
  getPeriode, tambahPeriode, updatePeriode, toggleForm,
  getDosenRosterMBKM,
   getDosenRosterPA, 
  assignDosen, unassignDosen,
  getVerifikasiPengajuan,
  verifikasiPengajuan, hapusPengajuan, verifikasiDokumen, getMonitoringDokumen, getDetailMonitoring,
  getDashboardStats,
  getPengajuanDisetujui,
  getRekapNilai,
  exportLogbookPdf,
} = require('../controllers/kaprodiController');

const {
  getDaftarMahasiswa, getDaftarDosen,
} = require('../controllers/staffController');

const auth = [verifyToken, authorizeRoles('kaprodi')];

router.get('/dashboard-stats', auth, getDashboardStats);

router.get('/periode', auth, getPeriode);
router.post('/periode', auth, tambahPeriode);
router.put('/periode/:id', auth, updatePeriode);
router.patch('/periode/:id/toggle-form', auth, toggleForm);

router.get('/dosen-roster-mbkm', auth, getDosenRosterMBKM);
router.get('/dosen-roster-pa',   auth, getDosenRosterPA);

router.get('/mahasiswa', auth, getDaftarMahasiswa);

router.get('/pengajuan-disetujui', auth, getPengajuanDisetujui);
router.get('/rekap-nilai', auth, getRekapNilai);

router.get('/verifikasi-pengajuan', auth, getVerifikasiPengajuan);

router.get('/dosen', auth, getDaftarDosen);

router.get('/monitoring', auth, getMonitoringDokumen);
router.get('/monitoring/:pengajuan_id', auth, getDetailMonitoring);
router.get('/logbook/export-pdf', auth, exportLogbookPdf);
router.post('/assign-dosen', auth, assignDosen);
router.patch('/pengajuan/:id/unassign-dosen', auth, unassignDosen);
router.patch('/pengajuan/:id/verifikasi', auth, verifikasiPengajuan);
router.patch('/dokumen/:id/verifikasi', auth, verifikasiDokumen);
router.delete('/pengajuan/:id', auth, hapusPengajuan);

module.exports = router;