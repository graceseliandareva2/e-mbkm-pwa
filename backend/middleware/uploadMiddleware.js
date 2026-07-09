const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

const uploadToCloudinary = async (req, res, next) => {
  if (!req.file) return next();

  const folder = req.uploadFolder || 'dokumen-pendukung';
  const ext = path.extname(req.file.originalname).toLowerCase();
  const fileName = `${uuidv4()}${ext}`;
  const isPdf = req.file.mimetype === 'application/pdf';

  try {
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `embkm/${folder}`,
          public_id: fileName,
          resource_type: isPdf ? 'raw' : 'image',
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    req.file.path = result.secure_url;
    req.file.filename = result.public_id;

    next();
 } catch (err) {
    console.error('Cloudinary upload error FULL:', JSON.stringify(err, null, 2));
    return next(err);
  }
};

module.exports = { upload, uploadToCloudinary };