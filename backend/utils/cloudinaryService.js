const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

// ---------------------------------------------------------------------
// KONFIGURASI
// ---------------------------------------------------------------------
// PERUBAHAN: semua file (dokumen, logbook Word, bukti logbook, foto profil)
// sekarang disimpan di Cloudinary. Google Drive sudah gak dipakai sama
// sekali lagi -- driveService.js bisa dihapus dari project.
//
// Butuh 3 env var: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
// CLOUDINARY_API_SECRET (lihat dashboard Cloudinary kamu -> Account Details).
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

// ---------------------------------------------------------------------
// DOKUMEN (laporan akhir, ppt, dokumen pendukung) & BUKTI LOGBOOK
// ---------------------------------------------------------------------
// PENTING: uploadMiddleware cuma izinin PDF/JPG/PNG (lihat ALLOWED_MIMETYPES),
// jadi resource_type selalu 'image' -- Cloudinary render PDF sebagai
// "image" resource (page-based), sama kayak JPG/PNG. Kalau nanti tipe file
// yang diizinkan ditambah (misal .docx/.pptx asli, bukan hasil export PDF),
// resource_type ini harus disesuaikan jadi 'auto' atau 'raw'.
//
// subfolder: 'dokumentasi' (bukti logbook & dokumen_pendukung), 'laporan', atau 'ppt'.

/**
 * Upload file baru. Dipakai buat: dokumen (laporan_akhir/ppt/dokumen_pendukung)
 * dan bukti logbook. SELALU file baru (public_id unik tiap upload) --
 * kalau ini replace file lama, panggil deleteFile() dulu buat hapus yang lama.
 * @returns {{ publicId: string, url: string }}
 */
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

/**
 * Hapus 1 file dari Cloudinary. Dipanggil pas dokumen/bukti logbook di-
 * replace atau dihapus, biar file lama gak numpuk (beda dari driveService
 * lama yang gak pernah hapus file lama pas re-upload).
 * Gagal hapus TIDAK dilempar ke caller -- upload baru tetap dianggap sukses
 * walau cleanup file lama gagal (mis. public_id sudah gak ada).
 */
async function deleteFile(publicId, resourceType = 'image') {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
  } catch (err) {
    console.error('Gagal hapus file lama di Cloudinary:', err.message);
  }
}

// ---------------------------------------------------------------------
// LOGBOOK WORD DOC (di-generate ulang & di-replace tiap submit/update/hapus)
// ---------------------------------------------------------------------

/**
 * Upload/replace SATU file Word logbook. public_id dibikin deterministik dari
 * NIM (bukan random kayak uploadFile) supaya overwrite konsisten ke file yang
 * sama persis -- gak numpuk file baru tiap logbook di-submit, sama kayak
 * `uploadOrReplaceLogbook` versi Drive dulu.
 * @param {string|null} existingPublicId - public_id lama (pengajuan.cloudinary_logbook_public_id), null kalau belum pernah ada
 * @returns {{ publicId: string, url: string }}
 */
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

// ---------------------------------------------------------------------
// FOTO PROFIL
// ---------------------------------------------------------------------

/**
 * Upload/replace foto profil. public_id deterministik dari userId (bukan
 * random) supaya upload berikutnya SELALU overwrite file yang sama persis --
 * gak numpuk file baru di Cloudinary tiap ganti foto, dan gak perlu nyimpen
 * publicId lama di DB dulu buat tau mau overwrite yang mana (beda dari
 * dokumen/logbook yang public_id-nya per-record).
 * @returns {{ publicId: string, url: string }}
 */
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