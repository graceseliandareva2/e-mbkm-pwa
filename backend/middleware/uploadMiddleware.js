const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

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

const uploadToCloudinary = (req, res, next) => {
  if (!req.file) return next();

  const folder = req.uploadFolder || 'dokumen-pendukung';
  const isImage = req.file.mimetype.startsWith('image/');

  const stream = cloudinary.uploader.upload_stream(
    {
      folder: `embkm/${folder}`,
      resource_type: isImage ? 'image' : 'raw',
    },
    (error, result) => {
      if (error) return next(error);
      req.file.path = result.secure_url;
      req.file.filename = result.public_id;
      next();
    }
  );

  Readable.from(req.file.buffer).pipe(stream);
};

module.exports = { upload, uploadToCloudinary };