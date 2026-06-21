const express = require('express');
const router = express.Router();
const { login, getProfile, gantiPassword, updateProfile } = require('../controllers/authController');
const { verifyToken } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storagePhoto = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/foto-profil/'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});

const uploadPhoto = multer({
  storage: storagePhoto,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Hanya file gambar yang diperbolehkan!'));
    }
  }
});

router.post('/login', login);
router.get('/profile', verifyToken, getProfile);
router.put('/ganti-password', verifyToken, gantiPassword);
router.put('/update-profile', verifyToken, uploadPhoto.single('foto'), updateProfile);

module.exports = router;