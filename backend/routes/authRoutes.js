const express = require('express');
const router = express.Router();
const { login, getProfile, gantiPassword, updateProfile } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');

router.post('/login', login);
router.get('/profile', verifyToken, getProfile);
router.put('/ganti-password', verifyToken, gantiPassword);
// PERUBAHAN: uploadToCloudinary dihapus dari chain lama. Upload foto profil
// sekarang ditangani langsung di authController.updateProfile lewat
// cloudinaryService (req.file.buffer), jadi req.uploadFolder juga sudah tidak
// dipakai lagi.
router.put('/update-profile', verifyToken, upload.single('foto'), updateProfile);

module.exports = router;