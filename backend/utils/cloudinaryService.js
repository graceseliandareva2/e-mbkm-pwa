const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

function folderMahasiswa(nim, nama) {
  return `mbkm/${nim} - ${nama}`;
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

async function uploadFile(buffer, filename, nim, nama, subfolder) {
  const result = await uploadBuffer(buffer, {
    folder: `${folderMahasiswa(nim, nama)}/${subfolder}`,
    resource_type: 'image',
    use_filename: true,
    unique_filename: true,
    filename_override: filename,
  });
  return { publicId: result.public_id, url: result.secure_url };
}

async function deleteFile(publicId, resourceType = 'image') {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
  } catch (err) {
    console.error('Gagal hapus file lama di Cloudinary:', err.message);
  }
}


async function uploadOrReplaceLogbook(existingPublicId, buffer, nim, nama) {
  const publicId = existingPublicId || `${folderMahasiswa(nim, nama)}/logbook/Logbook ${nama}`;

  const result = await uploadBuffer(buffer, {
    public_id: publicId,
    resource_type: 'raw',
    overwrite: true,
    invalidate: true,
    format: 'docx',
  });

  return { publicId: result.public_id, url: result.secure_url };
}
 
async function uploadOrReplaceFotoProfil(userId, buffer) {
  const result = await uploadBuffer(buffer, {
    public_id: `mbkm/foto-profil/${userId}`,
    resource_type: 'image',
    overwrite: true,
    invalidate: true,
  });
  return { publicId: result.public_id, url: result.secure_url };
}

module.exports = {
  uploadFile,
  deleteFile,
  uploadOrReplaceLogbook,
  uploadOrReplaceFotoProfil,
};