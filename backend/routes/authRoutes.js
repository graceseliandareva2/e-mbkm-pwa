const express = require('express');
const router = express.Router();
const { login, getProfile, gantiPassword, updateProfile } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const { upload } = require('../middleware/uploadMiddleware');

router.post('/login', login);
router.get('/profile', verifyToken, getProfile);
router.put('/ganti-password', verifyToken, gantiPassword);
router.put('/update-profile', verifyToken, upload.single('foto'), updateProfile);

module.exports = router;