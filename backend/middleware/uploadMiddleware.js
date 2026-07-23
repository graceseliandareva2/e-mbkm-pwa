const multer = require('multer');

// PERUBAHAN: semua upload (dokumen, logbook, bukti logbook, foto profil)
// sekarang lewat cloudinaryService (Cloudinary) -- Google Drive udah gak
// dipakai sama sekali lagi. Middleware ini gak berubah -- tetap cuma bungkus
// multer memoryStorage() biasa, karena cloudinaryService butuh req.file.buffer,
// bukan req.file.path dari disk.
const storage = multer.memoryStorage();

const ALLOWED_MIMETYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
];

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Hanya file PDF atau gambar (JPG/PNG) yang diperbolehkan!'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 20971520, // 20MB
  },
});

module.exports = { upload };