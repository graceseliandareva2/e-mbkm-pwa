const multer = require('multer');


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
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 20971520, 
  },
});

module.exports = { upload };