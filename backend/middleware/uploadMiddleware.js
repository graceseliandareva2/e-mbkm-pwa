const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Supabase client pakai service_role key (bypass RLS)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

const uploadToSupabase = async (req, res, next) => {
  if (!req.file) return next();

  const folder = req.uploadFolder || 'dokumen-pendukung';
  const ext = path.extname(req.file.originalname).toLowerCase();
  const fileName = `${uuidv4()}${ext}`;
  const filePath = `${folder}/${fileName}`;
  const bucket = process.env.SUPABASE_BUCKET || 'embkm-files';

  console.log('Uploading to Supabase:', JSON.stringify({
    bucket,
    filePath,
    mimetype: req.file.mimetype,
    size: req.file.size,
    bufferLength: req.file.buffer ? req.file.buffer.length : 'NO BUFFER',
  }));

  try {
    console.log('Calling supabase.storage.upload...');
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    console.log('Supabase upload selesai, error:', JSON.stringify(error));

    if (error) {
      console.log('Supabase upload error detail:', JSON.stringify(error));
      return next(error);
    }

    console.log('Supabase upload SUCCESS, getting public URL...');
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    console.log('Public URL:', data.publicUrl);

    req.file.path = data.publicUrl;
    req.file.filename = filePath;

    console.log('Middleware selesai, lanjut ke controller...');
    next();
  } catch (err) {
    console.log('Supabase upload exception:', err.message);
    return next(err);
  }
};

module.exports = { upload, uploadToSupabase };