const { google } = require('googleapis');
const streamifier = require('streamifier');

// ---------------------------------------------------------------------
// AUTH
// ---------------------------------------------------------------------
function getAuthClient() {
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  console.log("EMAIL:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  console.log("KEY START:", privateKey.substring(0, 40));
  console.log("KEY END:", privateKey.substring(privateKey.length - 40));
  console.log("KEY LENGTH:", privateKey.length);
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

function getDriveClient() {
  const auth = getAuthClient();
  return google.drive({ version: 'v3', auth });
}

// ---------------------------------------------------------------------
// FOLDER MANAGEMENT
// ---------------------------------------------------------------------

/**
 * Cari folder by nama di dalam parentId. Kalau gak ada, bikin baru.
 * Dipakai supaya idempotent -> gak bikin folder dobel kalau dipanggil ulang.
 */
async function findOrCreateFolder(name, parentId) {
  const drive = getDriveClient();

  const escapedName = name.replace(/'/g, "\\'");
  const query = `name = '${escapedName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const existing = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  return created.data.id;
}

/**
 * Pastikan struktur folder lengkap buat 1 pengajuan mahasiswa:
 * MBKM/{NIM} - {Nama}/Logbook, /Dokumentasi, /Laporan Akhir, /PPT
 *
 * Panggil ini SEKALI waktu pengajuan disetujui (bukan tiap upload),
 * lalu simpan hasil id-nya ke kolom pengajuan.drive_*_folder_id.
 *
 * @returns {{ folderId, logbookFolderId, dokumentasiFolderId, laporanFolderId, pptFolderId }}
 */
async function ensureMahasiswaFolderStructure(nim, nama) {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const folderName = `${nim} - ${nama}`;

  const folderId = await findOrCreateFolder(folderName, rootFolderId);
  const logbookFolderId = await findOrCreateFolder('Logbook', folderId);
  const dokumentasiFolderId = await findOrCreateFolder('Dokumentasi', folderId);
  const laporanFolderId = await findOrCreateFolder('Laporan Akhir', folderId);
  const pptFolderId = await findOrCreateFolder('PPT', folderId);

  return { folderId, logbookFolderId, dokumentasiFolderId, laporanFolderId, pptFolderId };
}

/**
 * Pastikan folder foto profil untuk 1 user, dibuat otomatis saat upload
 * pertama: MBKM/Foto Profil/{userId}
 * Dipakai semua role (mahasiswa, dosen, kaprodi, staff_akademik) --
 * makanya keyed by userId (users.id), bukan NIM seperti folder mahasiswa.
 */
async function ensureFotoProfilFolder(userId) {
  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const fotoProfilRootId = await findOrCreateFolder('Foto Profil', rootFolderId);
  return findOrCreateFolder(userId, fotoProfilRootId);
}

// ---------------------------------------------------------------------
// FILE UPLOAD / REPLACE
// ---------------------------------------------------------------------

/**
 * Upload file baru (dipakai buat dokumentasi, PPT, laporan akhir -> selalu file baru).
 * @param {Buffer} buffer - isi file (dari multer memoryStorage, req.file.buffer)
 * @param {string} filename
 * @param {string} mimeType
 * @param {string} parentFolderId
 * @returns {{ id: string, link: string }}
 */
async function uploadFile(buffer, filename, mimeType, parentFolderId) {
  const drive = getDriveClient();

  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [parentFolderId],
    },
    media: {
      mimeType,
      body: streamifier.createReadStream(buffer),
    },
    fields: 'id, webViewLink',
  });

  return { id: response.data.id, link: response.data.webViewLink };
}

/**
 * Replace ISI file yang sudah ada (dipakai khusus buat logbook Word yang
 * di-generate ulang tiap submit, dan sekarang juga foto profil) -> file
 * ID & link TETAP SAMA, cuma isinya diganti. Permission (misal public
 * access foto profil) ikut file, jadi gak perlu di-set ulang.
 * @param {string} fileId
 * @param {Buffer} buffer
 * @param {string} mimeType
 */
async function replaceFile(fileId, buffer, mimeType) {
  const drive = getDriveClient();

  const response = await drive.files.update({
    fileId,
    media: {
      mimeType,
      body: streamifier.createReadStream(buffer),
    },
    fields: 'id, webViewLink',
  });

  return { id: response.data.id, link: response.data.webViewLink };
}

/**
 * Helper untuk logbook: kalau belum pernah ada file (drive_logbook_file_id masih NULL),
 * upload baru. Kalau sudah ada, replace isinya. Backend cukup panggil fungsi ini
 * tanpa perlu tau apakah ini submit pertama atau bukan.
 */
async function uploadOrReplaceLogbook(existingFileId, buffer, filename, folderId) {
  const mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  if (existingFileId) {
    return replaceFile(existingFileId, buffer, mimeType);
  }
  return uploadFile(buffer, filename, mimeType, folderId);
}

// ---------------------------------------------------------------------
// PERMISSIONS (dosen pembimbing per-mahasiswa, kaprodi/staff di-share manual sekali di root)
// ---------------------------------------------------------------------

/**
 * Kasih akses Viewer ke folder mahasiswa tertentu buat dosen pembimbing yang di-assign.
 * Panggil ini pas record `bimbingan` baru dibuat.
 * @returns {string} permissionId - simpan ini kalau nanti perlu di-revoke
 */
async function grantFolderAccess(folderId, email, role = 'reader') {
  const drive = getDriveClient();

  const response = await drive.permissions.create({
    fileId: folderId,
    sendNotificationEmail: false,
    requestBody: {
      type: 'user',
      role, // 'reader' = Viewer, 'writer' = Editor, 'commenter' = Commenter
      emailAddress: email,
    },
    fields: 'id',
  });

  return response.data.id;
}

/**
 * Cabut akses dosen dari folder mahasiswa. Dipanggil pas record `bimbingan`
 * diganti/dicabut (dosen pembimbing diganti ke orang lain).
 */
async function revokeFolderAccess(folderId, email) {
  const drive = getDriveClient();

  const permissions = await drive.permissions.list({
    fileId: folderId,
    fields: 'permissions(id, emailAddress)',
  });

  const target = (permissions.data.permissions || []).find((p) => p.emailAddress === email);
  if (!target) return false;

  await drive.permissions.delete({
    fileId: folderId,
    permissionId: target.id,
  });

  return true;
}

/**
 * Bikin file bisa diakses publik ("anyone with link", read-only).
 * Dipanggil SEKALI waktu file baru dibuat -- perlu, karena file yang
 * diupload service account defaultnya private, padahal foto profil
 * harus bisa dibuka langsung lewat <img src> di frontend.
 */
async function makeFilePublic(fileId) {
  const drive = getDriveClient();
  await drive.permissions.create({
    fileId,
    requestBody: { type: 'anyone', role: 'reader' },
    fields: 'id',
  });
}

/**
 * Link gambar yang bisa langsung dipasang di <img src>. BEDA dari
 * webViewLink (link ke halaman viewer Drive, bukan file gambar langsung
 * -- gak akan render kalau dipasang di <img>). File harus sudah public
 * (lihat makeFilePublic) supaya link ini bisa dibuka tanpa login.
 */
function getThumbnailLink(fileId) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`;
}

/**
 * Upload/replace foto profil. Dipakai semua role lewat authController.updateProfile.
 * - Kalau existingFileId ada (user sudah pernah upload foto): replace isi
 *   file itu -> id & link tetap sama, foto lama otomatis kegantI (gak
 *   numpuk file baru di Drive tiap ganti foto).
 * - Kalau belum ada: bikin folder per-user (sekali, otomatis) + upload
 *   file baru + set public sekali.
 * @returns {{ id: string, link: string }} link = thumbnail link, siap pakai langsung di <img src>
 */
async function uploadOrReplaceFotoProfil(existingFileId, buffer, filename, mimeType, userId) {
  if (existingFileId) {
    const result = await replaceFile(existingFileId, buffer, mimeType);
    return { id: result.id, link: getThumbnailLink(result.id) };
  }

  const folderId = await ensureFotoProfilFolder(userId);
  const result = await uploadFile(buffer, filename, mimeType, folderId);
  await makeFilePublic(result.id);
  return { id: result.id, link: getThumbnailLink(result.id) };
}

module.exports = {
  getDriveClient,
  findOrCreateFolder,
  ensureMahasiswaFolderStructure,
  ensureFotoProfilFolder,
  uploadFile,
  replaceFile,
  uploadOrReplaceLogbook,
  uploadOrReplaceFotoProfil,
  makeFilePublic,
  getThumbnailLink,
  grantFolderAccess,
  revokeFolderAccess,
};