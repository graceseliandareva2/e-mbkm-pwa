const express = require('express');
const router = express.Router();
const { login, getProfile, gantiPassword, updateProfile } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const { upload, uploadToSupabase } = require('../middleware/uploadMiddleware');

router.post('/login', login);
router.get('/profile', verifyToken, getProfile);
router.put('/ganti-password', verifyToken, gantiPassword);
router.put('/update-profile', verifyToken, (req, res, next) => {
  req.uploadFolder = 'foto-profil';
  next();
}, upload.single('foto'), uploadToSupabase, updateProfile);

module.exports = router;