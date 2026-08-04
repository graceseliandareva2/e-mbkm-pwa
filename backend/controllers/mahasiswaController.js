const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const cloudinaryService = require("../utils/cloudinaryService");
const { generateLogbookDocx } = require("../utils/logbookDocxGenerator");

// Gate resmi: mahasiswa boleh isi logbook/upload dokumen HANYA kalau
// pengajuan.status='disetujui_kaprodi' DAN pengajuan.dosen_id IS NOT NULL.
// (bukan tabel bimbingan lagi -- itu sudah dihapus)

async function getMahasiswaProfile(userId) {
  // Profil mahasiswa sekarang cuma baris users dengan role='mahasiswa' -- tidak ada lagi
  // tabel mahasiswa terpisah.
  const [rows] = await db.query(
    `SELECT id_users AS id, nim, nama, email, program_studi
     FROM users
     WHERE id_users = ? AND role = 'mahasiswa'`,
    [userId]
  );
  return rows[0] || null;
}

async function getPengajuanDisetujui(mahasiswaId) {
  const [rows] = await db.query(
    `SELECT p.id_pengajuan AS pengajuan_id, p.status, p.dosen_id,
            p.cloudinary_logbook_public_id, p.cloudinary_logbook_link,
            dp.penyelenggara, dp.waktu_studi_independen, dp.judul,
            dp.nama_pelatihan, dp.link_pelatihan, dp.durasi_pelatihan_jam
     FROM pengajuan p
     LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
     WHERE p.mahasiswa_id = ? AND p.status = 'disetujui_kaprodi' AND p.dosen_id IS NOT NULL
     ORDER BY p.created_at DESC
     LIMIT 1`,
    [mahasiswaId]
  );
  return rows[0] || null;
}

// Tabel pelatihan sudah dihapus -- 1 pengajuan = 1 pelatihan, jadi getPelatihanList()
// tidak diperlukan lagi (dihapus dari file ini).

async function getDosenPembimbingCapstone(pengajuanId) {
  // Dulu lewat tabel bimbingan; sekarang langsung dari pengajuan.dosen_id.
  const [rows] = await db.query(
    `SELECT u.nama, u.id_dosen AS nidn
     FROM pengajuan p
     JOIN users u ON u.id_users = p.dosen_id
     WHERE p.id_pengajuan = ?`,
    [pengajuanId]
  );
  return rows[0] || null;
}

async function regenerateLogbookDocx(pengajuan, mahasiswa) {
  // hasil & kendala sudah dihapus dari logbook -- jangan di-SELECT lagi.
  const [entries] = await db.query(
    `SELECT tanggal, jam_mulai, jam_selesai, kegiatan, deskripsi, status
     FROM logbook
     WHERE pengajuan_id = ?
     ORDER BY tanggal ASC, jam_mulai ASC`,
    [pengajuan.pengajuan_id]
  );

  const dosenPembimbing = await getDosenPembimbingCapstone(pengajuan.pengajuan_id);

  const buffer = await generateLogbookDocx({
    mahasiswa: { nim: mahasiswa.nim, nama: mahasiswa.nama },
    detailPengajuan: {
      penyelenggara: pengajuan.penyelenggara,
      waktu_studi_independen: pengajuan.waktu_studi_independen,
      judul: pengajuan.judul,
    },
    dosenPembimbing,
    logbookEntries: entries,
  });

  const result = await cloudinaryService.uploadOrReplaceLogbook(
    pengajuan.cloudinary_logbook_public_id,
    buffer,
    mahasiswa.nim,
    mahasiswa.nama
  );

  if (result.publicId !== pengajuan.cloudinary_logbook_public_id) {
    await db.query(
      `UPDATE pengajuan SET cloudinary_logbook_public_id = ?, cloudinary_logbook_link = ? WHERE id_pengajuan = ?`,
      [result.publicId, result.url, pengajuan.pengajuan_id]
    );
  }

  return result;
}

async function _notifikasiDokumenKeReviewer(pengajuanId, mahasiswa, jenisLabel, pesanTambahan = "") {
  try {
    // Dosen penerima notifikasi = pengajuan.dosen_id langsung (bukan lagi lewat tabel bimbingan).
    const [pengajuanRows] = await db.query(
      `SELECT dosen_id FROM pengajuan WHERE id_pengajuan = ?`,
      [pengajuanId]
    );

    const pesan = `${mahasiswa.nama} (${mahasiswa.nim}) telah ${pesanTambahan}mengupload dokumen ${jenisLabel}.`;
    const judul = "Dokumen Baru Diupload";

    if (pengajuanRows[0]?.dosen_id) {
      await db.query(
        "INSERT INTO notifikasi (id_notifikasi, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
        [uuidv4(), pengajuanRows[0].dosen_id, judul, pesan, "info"]
      );
    }

    // Tabel kaprodi sudah dihapus -- sekarang query dari users WHERE role='kaprodi'.
    const [kaprodiList] = await db.query("SELECT id_users FROM users WHERE role = 'kaprodi'");
    for (const kap of kaprodiList) {
      await db.query(
        "INSERT INTO notifikasi (id_notifikasi, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
        [uuidv4(), kap.id_users, judul, pesan, "info"]
      );
    }
  } catch (err) {
    console.error("Gagal kirim notifikasi reviewer:", err.message);
  }
}

const JENIS_LABEL_MAP = { laporan_akhir: "Laporan Akhir", ppt: "PPT" };
const JENIS_SUBFOLDER_MAP = { laporan_akhir: "laporan", ppt: "ppt" };

// ========== PENGAJUAN CAPSTONE ==========

const getPengajuan = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    if (!mahasiswa) return res.status(404).json({ message: "Data mahasiswa tidak ditemukan." });

    const [rows] = await db.query(
      `SELECT
        p.id_pengajuan AS id, p.mahasiswa_id, p.periode_id, p.status,
        p.catatan_kaprodi,
        p.created_at, p.updated_at,
        p.cloudinary_logbook_link,
        dp.judul, dp.penyelenggara, dp.waktu_studi_independen,
        dp.nama_pelatihan, dp.link_pelatihan, dp.durasi_pelatihan_jam,
        dp.deskripsi, dp.lokasi, dp.tanggal_mulai, dp.tanggal_selesai,
        dp.dosen_pa_id, dpa.nama AS nama_dosen_pa,
        per.nama_periode, per.form_pengajuan_buka, per.min_jam_pengajuan,
        p.dosen_id, d.nama as nama_dosen
      FROM pengajuan p
      JOIN periode per ON p.periode_id = per.id_periode
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
      LEFT JOIN users d ON d.id_users = p.dosen_id
      LEFT JOIN users dpa ON dpa.id_users = dp.dosen_pa_id
      WHERE p.mahasiswa_id = ?
      ORDER BY p.created_at DESC`,
      [mahasiswa.id]
    );

    if (!rows.length) return res.status(404).json({ message: "Belum ada pengajuan." });

    res.json({
      ...rows[0],
      nim: mahasiswa.nim,
      nama_lengkap: mahasiswa.nama,
      email: mahasiswa.email,
      // riwayat lintas periode sekarang cukup dari pengajuan.periode_id -- gak perlu
      // pengajuan_sebelumnya_id lagi (kolom itu sudah dihapus).
      riwayat: rows.slice(1),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDosenPA = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id_users AS id, nama
       FROM users
       WHERE role = 'dosen'
         AND current_periode_id = (SELECT id_periode FROM periode WHERE is_active = 1 LIMIT 1)
       ORDER BY nama ASC`
    );
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const tambahPengajuan = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    if (!mahasiswa) {
      connection.release();
      return res.status(404).json({ message: "Data mahasiswa tidak ditemukan." });
    }

    const [periodeAktif] = await db.query(
      "SELECT * FROM periode WHERE form_pengajuan_buka = 1 AND is_active = 1 ORDER BY created_at DESC LIMIT 1"
    );
    if (!periodeAktif.length) {
      connection.release();
      return res.status(400).json({ message: "Form pengajuan sedang ditutup." });
    }
    const periode = periodeAktif[0];
    const minJam = periode.min_jam_pengajuan ?? 48;

    // periode.jenis & roster_mahasiswa_mbkm sudah dihapus -- gak ada lagi
    // pembedaan mbkm/studi-independen/keduanya, jadi cek roster dibuang.

    const {
  judul, penyelenggara, deskripsi, lokasi,
  nama_pelatihan, link_pelatihan, durasi_pelatihan_jam,
  tanggal_mulai, tanggal_selesai, dosen_pa_id,
} = req.body;

if (!judul || !penyelenggara || !nama_pelatihan) {
  connection.release();
  return res.status(400).json({ message: "Judul, penyelenggara, dan pelatihan wajib diisi." });
}

// dosen_pa_id wajib -- setiap pengajuan harus punya dosen pembimbing akademik.
if (!dosen_pa_id) {
  connection.release();
  return res.status(400).json({ message: "Dosen Pembimbing Akademik wajib dipilih." });
}
const [dosenPaRows] = await db.query(
  `SELECT id_users FROM users WHERE id_users = ? AND role = 'dosen' AND current_periode_id = ?`,
  [dosen_pa_id, periode.id_periode]
);
if (!dosenPaRows.length) {
  connection.release();
  return res.status(400).json({ message: "Dosen PA yang dipilih tidak valid." });
}

    // Skema baru: 1 pengajuan = 1 pelatihan (field tunggal, bukan array 1-3 lagi).
    const durasiJam = Number(durasi_pelatihan_jam) || 0;
    if (durasiJam < minJam) {
      connection.release();
      return res.status(400).json({ message: `Durasi pelatihan harus minimal ${minJam} jam (saat ini ${durasiJam} jam).` });
    }

    const [existing] = await db.query(
      "SELECT id_pengajuan FROM pengajuan WHERE mahasiswa_id = ? AND periode_id = ?",
      [mahasiswa.id, periode.id_periode]
    );
    if (existing.length) {
      connection.release();
      return res.status(400).json({ message: "Kamu sudah mengajukan capstone di periode ini." });
    }

    const pengajuanId = uuidv4();
    const detailId = uuidv4();

    await connection.beginTransaction();

    // Tanpa pengajuan_sebelumnya_id (kolom sudah dihapus) dan tanpa dosen_id
    // (baru diisi kaprodi saat approve).
    await connection.query(
      `INSERT INTO pengajuan (id_pengajuan, mahasiswa_id, periode_id, status)
       VALUES (?, ?, ?, 'diajukan')`,
      [pengajuanId, mahasiswa.id, periode.id_periode]
    );

    await connection.query(
      `INSERT INTO detail_pengajuan
        (id_detail_pengajuan, pengajuan_id, judul, penyelenggara, deskripsi, lokasi,
         nama_pelatihan, link_pelatihan, durasi_pelatihan_jam, dosen_pa_id,
         tanggal_mulai, tanggal_selesai)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        detailId, pengajuanId, judul, penyelenggara, deskripsi || null, lokasi || null,
        nama_pelatihan, link_pelatihan || null, durasiJam, dosen_pa_id || null,
        tanggal_mulai || null, tanggal_selesai || null,
      ]
    );

    await connection.commit();
    res.status(201).json({ message: "Pengajuan capstone berhasil dikirim." });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  } finally {
    connection.release();
  }
};

const updatePengajuan = async (req, res) => {
  const connection = await db.getConnection();
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    const { id } = req.params;
    const [pengajuan] = await db.query(
      "SELECT * FROM pengajuan WHERE id_pengajuan = ? AND mahasiswa_id = ?",
      [id, mahasiswa.id]
    );
    if (!pengajuan.length) {
      connection.release();
      return res.status(404).json({ message: "Pengajuan tidak ditemukan." });
    }
    if (!["draft", "diajukan", "revisi", "ditolak"].includes(pengajuan[0].status)) {
      connection.release();
      return res.status(400).json({ message: "Pengajuan yang sudah disetujui tidak bisa diedit." });
    }

    const {
      judul, penyelenggara, deskripsi, lokasi,
      nama_pelatihan, link_pelatihan, durasi_pelatihan_jam,
      tanggal_mulai, tanggal_selesai, dosen_pa_id,
    } = req.body;

    if (!judul || !penyelenggara || !nama_pelatihan) {
      connection.release();
      return res.status(400).json({ message: "Judul, penyelenggara, dan pelatihan wajib diisi." });
    }

   if (!dosen_pa_id) {
  connection.release();
  return res.status(400).json({ message: "Dosen Pembimbing Akademik wajib dipilih." });
}
const [dosenPaRows] = await db.query(
  `SELECT id_users FROM users WHERE id_users = ? AND role = 'dosen' AND current_periode_id = ?`,
  [dosen_pa_id, pengajuan[0].periode_id]
);
if (!dosenPaRows.length) {
  connection.release();
  return res.status(400).json({ message: "Dosen PA yang dipilih tidak valid." });
}

    const [periodeRow] = await db.query(
      "SELECT min_jam_pengajuan FROM periode WHERE id_periode = ?",
      [pengajuan[0].periode_id]
    );
    const minJam = periodeRow[0]?.min_jam_pengajuan ?? 48;

    const durasiJam = Number(durasi_pelatihan_jam) || 0;
    if (durasiJam < minJam) {
      connection.release();
      return res.status(400).json({ message: `Durasi pelatihan harus minimal ${minJam} jam (saat ini ${durasiJam} jam).` });
    }

    await connection.beginTransaction();

    await connection.query(`UPDATE pengajuan SET status = 'diajukan' WHERE id_pengajuan = ?`, [id]);

    await connection.query(
      `UPDATE detail_pengajuan
       SET judul=?, penyelenggara=?, deskripsi=?, lokasi=?,
           nama_pelatihan=?, link_pelatihan=?, durasi_pelatihan_jam=?, dosen_pa_id=?,
           tanggal_mulai=?, tanggal_selesai=?
       WHERE pengajuan_id = ?`,
      [
        judul, penyelenggara, deskripsi || null, lokasi || null,
        nama_pelatihan, link_pelatihan || null, durasiJam, dosen_pa_id,
        tanggal_mulai || null, tanggal_selesai || null, id,
      ]
    );

    await connection.commit();
    res.json({ message: "Pengajuan berhasil diupdate." });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  } finally {
    connection.release();
  }
};

const hapusPengajuan = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    const { id } = req.params;
    const [pengajuan] = await db.query(
      "SELECT * FROM pengajuan WHERE id_pengajuan = ? AND mahasiswa_id = ?",
      [id, mahasiswa.id]
    );
    if (!pengajuan.length) return res.status(404).json({ message: "Pengajuan tidak ditemukan." });
    if (!["draft", "diajukan"].includes(pengajuan[0].status)) {
      return res.status(400).json({ message: "Pengajuan yang sudah diproses tidak bisa dihapus." });
    }
    await db.query("DELETE FROM pengajuan WHERE id_pengajuan = ?", [id]);
    res.json({ message: "Pengajuan berhasil dihapus." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// Skema baru: 1 pengajuan = 1 pelatihan -- balikin objek tunggal, bukan array lagi.
const getPelatihanAktif = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    if (!mahasiswa) return res.status(404).json({ message: "Data mahasiswa tidak ditemukan." });

    const pengajuan = await getPengajuanDisetujui(mahasiswa.id);
    if (!pengajuan) return res.json({ data: null });

    res.json({
      data: {
        nama_pelatihan: pengajuan.nama_pelatihan,
        link_pelatihan: pengajuan.link_pelatihan,
        durasi_pelatihan_jam: pengajuan.durasi_pelatihan_jam,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== LOGBOOK ==========

const getLogbook = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    // pelatihan_id sudah dihapus dari logbook -- filter sekarang (opsional) pakai pengajuan_id.
    const { pengajuan_id } = req.query;
    const params = [mahasiswa.id];
    let filterClause = "";
    if (pengajuan_id) {
      filterClause = "AND l.pengajuan_id = ?";
      params.push(pengajuan_id);
    }

    const [rows] = await db.query(
      `SELECT l.id_logbook AS id, l.tanggal, l.jam_mulai, l.jam_selesai, l.kegiatan, l.deskripsi,
              l.status, l.feedback_dosen, l.durasi_menit, l.bukti_link, l.cloudinary_public_id,
              p.periode_id, per.nama_periode
       FROM logbook l
       JOIN pengajuan p ON p.id_pengajuan = l.pengajuan_id
       JOIN periode per ON per.id_periode = p.periode_id
       WHERE p.mahasiswa_id = ? ${filterClause}
       ORDER BY l.tanggal DESC, l.jam_mulai DESC`,
      params
    );
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const tambahLogbook = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    // hasil & kendala sudah dihapus dari request/response.
    const { tanggal, jam_mulai, jam_selesai, kegiatan, deskripsi } = req.body;

    if (!tanggal || !jam_mulai || !jam_selesai || !kegiatan || !deskripsi) {
      return res.status(400).json({ message: "Tanggal, jam mulai/selesai, kegiatan, dan deskripsi wajib diisi." });
    }
    if (!req.file && !req.body.bukti_link) {
      return res.status(400).json({ message: "Bukti kegiatan wajib diisi (upload file atau link)." });
    }

    const pengajuan = await getPengajuanDisetujui(mahasiswa.id);
    if (!pengajuan) {
      return res.status(403).json({ message: "Logbook hanya bisa diisi setelah pengajuan disetujui kaprodi dan dosen pembimbing sudah ditentukan." });
    }

    const [periodeCheck] = await db.query(
      `SELECT per.form_logbook_buka, per.tanggal_mulai_logbook FROM periode per JOIN pengajuan p ON p.periode_id = per.id_periode WHERE p.id_pengajuan = ?`,
      [pengajuan.pengajuan_id]
    );
    if (!periodeCheck.length || periodeCheck[0].form_logbook_buka !== 1) {
      return res.status(400).json({ message: "Form logbook sedang ditutup." });
    }
    if (periodeCheck[0].tanggal_mulai_logbook) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const mulaiStr = new Date(periodeCheck[0].tanggal_mulai_logbook).toISOString().slice(0, 10);
      if (mulaiStr > todayStr) {
        return res.status(400).json({ message: `Logbook baru bisa diisi mulai ${mulaiStr}.` });
      }
    }

    let cloudinaryPublicId = null;
    let buktiLink = null;
    if (req.file) {
      const uploaded = await cloudinaryService.uploadFile(req.file.buffer, req.file.originalname, mahasiswa.nim, mahasiswa.nama, "dokumentasi");
      cloudinaryPublicId = uploaded.publicId;
      buktiLink = uploaded.url;
    } else if (req.body.bukti_link) {
      buktiLink = req.body.bukti_link;
    }

    const newId = uuidv4();
    await db.query(
      `INSERT INTO logbook (id_logbook, pengajuan_id, tanggal, jam_mulai, jam_selesai, kegiatan, deskripsi, cloudinary_public_id, bukti_link, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'disubmit')`,
      [newId, pengajuan.pengajuan_id, tanggal, jam_mulai, jam_selesai, kegiatan, deskripsi, cloudinaryPublicId, buktiLink]
    );

    const docxResult = await regenerateLogbookDocx(pengajuan, mahasiswa);

    res.status(201).json({ message: "Logbook berhasil ditambahkan.", logbook_cloudinary_link: docxResult.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const updateLogbook = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    const { id } = req.params;

    const [logbookRows] = await db.query(
      `SELECT l.*, p.mahasiswa_id FROM logbook l JOIN pengajuan p ON p.id_pengajuan = l.pengajuan_id WHERE l.id_logbook = ? AND p.mahasiswa_id = ?`,
      [id, mahasiswa.id]
    );
    if (!logbookRows.length) return res.status(404).json({ message: "Logbook tidak ditemukan." });
    const logbook = logbookRows[0];

    if (!["draft", "disubmit", "revisi"].includes(logbook.status)) {
      return res.status(400).json({ message: "Logbook yang sudah diverifikasi tidak bisa diedit." });
    }

    const { tanggal, jam_mulai, jam_selesai, kegiatan, deskripsi } = req.body;
    const tanggalFormatted = tanggal ? tanggal.split("T")[0] : null;

    if (!tanggalFormatted || !jam_mulai || !jam_selesai || !kegiatan || !deskripsi) {
      return res.status(400).json({ message: "Tanggal, jam mulai/selesai, kegiatan, dan deskripsi wajib diisi." });
    }

    const pengajuan = await getPengajuanDisetujui(mahasiswa.id);
    const [periodeCheck] = await db.query(
      `SELECT per.form_logbook_buka, per.tanggal_mulai_logbook FROM periode per JOIN pengajuan p ON p.periode_id = per.id_periode WHERE p.id_pengajuan = ?`,
      [logbook.pengajuan_id]
    );
    if (!periodeCheck.length || periodeCheck[0].form_logbook_buka !== 1) {
      return res.status(400).json({ message: "Form logbook sedang ditutup." });
    }
    if (periodeCheck[0].tanggal_mulai_logbook) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const mulaiStr = new Date(periodeCheck[0].tanggal_mulai_logbook).toISOString().slice(0, 10);
      if (mulaiStr > todayStr) {
        return res.status(400).json({ message: `Logbook baru bisa diedit mulai ${mulaiStr}.` });
      }
    }

    let cloudinaryPublicId = logbook.cloudinary_public_id;
    let buktiLink = logbook.bukti_link;
    const publicIdLama = logbook.cloudinary_public_id;

    if (req.body.hapus_bukti === "1") {
      cloudinaryPublicId = null;
      buktiLink = null;
    }
    if (req.file) {
      const uploaded = await cloudinaryService.uploadFile(req.file.buffer, req.file.originalname, mahasiswa.nim, mahasiswa.nama, "dokumentasi");
      cloudinaryPublicId = uploaded.publicId;
      buktiLink = uploaded.url;
    } else if (req.body.bukti_link) {
      cloudinaryPublicId = null;
      buktiLink = req.body.bukti_link;
    }
    if (!buktiLink) {
      return res.status(400).json({ message: "Bukti kegiatan wajib diisi (upload file atau link)." });
    }

    await db.query(
      `UPDATE logbook SET tanggal=?, jam_mulai=?, jam_selesai=?, kegiatan=?, deskripsi=?, cloudinary_public_id=?, bukti_link=?, status='disubmit' WHERE id_logbook=?`,
      [tanggalFormatted, jam_mulai, jam_selesai, kegiatan, deskripsi, cloudinaryPublicId, buktiLink, id]
    );
    if (publicIdLama && publicIdLama !== cloudinaryPublicId) {
      await cloudinaryService.deleteFile(publicIdLama);
    }

    const docxResult = await regenerateLogbookDocx(pengajuan, mahasiswa);

    res.json({ message: "Logbook berhasil diupdate.", logbook_cloudinary_link: docxResult.url });
  } catch (error) {
    console.error("updateLogbook error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const hapusLogbook = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    const { id } = req.params;

    const [logbookRows] = await db.query(
      `SELECT l.* FROM logbook l JOIN pengajuan p ON p.id_pengajuan = l.pengajuan_id WHERE l.id_logbook = ? AND p.mahasiswa_id = ?`,
      [id, mahasiswa.id]
    );
    if (!logbookRows.length) return res.status(404).json({ message: "Logbook tidak ditemukan." });
    if (!["draft", "disubmit"].includes(logbookRows[0].status)) {
      return res.status(400).json({ message: "Logbook yang sudah diverifikasi tidak bisa dihapus." });
    }

    await db.query("DELETE FROM logbook WHERE id_logbook = ?", [id]);

    if (logbookRows[0].cloudinary_public_id) {
      await cloudinaryService.deleteFile(logbookRows[0].cloudinary_public_id);
    }

    const pengajuan = await getPengajuanDisetujui(mahasiswa.id);
    if (pengajuan) {
      await regenerateLogbookDocx(pengajuan, mahasiswa);
    }

    res.json({ message: "Logbook berhasil dihapus." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== DOKUMEN ==========

const getDokumen = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    const [rows] = await db.query(
      `SELECT d.*, per.nama_periode
       FROM dokumen d
       JOIN pengajuan p ON p.id_pengajuan = d.pengajuan_id
       JOIN periode per ON per.id_periode = p.periode_id
       WHERE p.mahasiswa_id = ?
       ORDER BY d.created_at DESC`,
      [mahasiswa.id]
    );
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const uploadDokumen = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "File tidak ditemukan." });

    const mahasiswa = await getMahasiswaProfile(req.user.id);
    const { jenis } = req.body;

    if (!["laporan_akhir", "ppt"].includes(jenis)) {
      return res.status(400).json({ message: "Jenis dokumen tidak valid." });
    }

    const pengajuan = await getPengajuanDisetujui(mahasiswa.id);
    if (!pengajuan) {
      return res.status(403).json({ message: "Upload dokumen hanya bisa dilakukan setelah pengajuan disetujui kaprodi dan dosen pembimbing sudah ditentukan." });
    }

    const [periodeCheck] = await db.query(
      `SELECT per.form_ppt_buka, per.form_laporan_buka, per.tanggal_mulai_dokumen
       FROM periode per JOIN pengajuan p ON p.periode_id = per.id_periode WHERE p.id_pengajuan = ?`,
      [pengajuan.pengajuan_id]
    );
    if (periodeCheck.length) {
      const per = periodeCheck[0];
      const kolomToggle = { ppt: "form_ppt_buka", laporan_akhir: "form_laporan_buka" }[jenis];
      if (kolomToggle && per[kolomToggle] !== 1) {
        return res.status(400).json({ message: `Form upload ${JENIS_LABEL_MAP[jenis]} sedang ditutup.` });
      }
      if (per.tanggal_mulai_dokumen) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const mulaiStr = new Date(per.tanggal_mulai_dokumen).toISOString().slice(0, 10);
        if (mulaiStr > todayStr) {
          return res.status(400).json({ message: `Upload dokumen baru bisa dilakukan mulai ${mulaiStr}.` });
        }
      }
    }

    const subfolder = JENIS_SUBFOLDER_MAP[jenis];

    const [existing] = await db.query(
      "SELECT id_dokumen AS id, cloudinary_public_id, status FROM dokumen WHERE pengajuan_id = ? AND jenis = ?",
      [pengajuan.pengajuan_id, jenis]
    );

    const statusTerkunci = ["diverifikasi", "disetujui_dospem", "disetujui_kaprodi"];
    if (existing.length && statusTerkunci.includes(existing[0].status)) {
      return res.status(400).json({ message: `Dokumen ${JENIS_LABEL_MAP[jenis]} sudah diverifikasi dan tidak bisa diganti.` });
    }

    const uploaded = await cloudinaryService.uploadFile(req.file.buffer, req.file.originalname, mahasiswa.nim, mahasiswa.nama, subfolder);

    if (existing.length) {
      await db.query(
        `UPDATE dokumen SET nama_file=?, cloudinary_public_id=?, cloudinary_url=?, ukuran_file=?, status='diupload',
         feedback=NULL, verified_by=NULL, verified_at=NULL,
         feedback_kaprodi=NULL, feedback_dospem=NULL,
         verified_kaprodi_by=NULL, verified_kaprodi_at=NULL,
         verified_dospem_by=NULL, verified_dospem_at=NULL
         WHERE id_dokumen=?`,
        [req.file.originalname, uploaded.publicId, uploaded.url, req.file.size, existing[0].id]
      );
      await cloudinaryService.deleteFile(existing[0].cloudinary_public_id);
    } else {
      await db.query(
        `INSERT INTO dokumen (id_dokumen, pengajuan_id, jenis, nama_file, cloudinary_public_id, cloudinary_url, ukuran_file)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), pengajuan.pengajuan_id, jenis, req.file.originalname, uploaded.publicId, uploaded.url, req.file.size]
      );
    }

    await _notifikasiDokumenKeReviewer(pengajuan.pengajuan_id, mahasiswa, JENIS_LABEL_MAP[jenis] || jenis);
    res.status(201).json({ message: "Dokumen berhasil diupload.", cloudinary_url: uploaded.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const hapusDokumen = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    const { id } = req.params;
    const [dokumen] = await db.query(
      `SELECT d.* FROM dokumen d JOIN pengajuan p ON p.id_pengajuan = d.pengajuan_id WHERE d.id_dokumen = ? AND p.mahasiswa_id = ?`,
      [id, mahasiswa.id]
    );
    if (!dokumen.length) return res.status(404).json({ message: "Dokumen tidak ditemukan." });
    await db.query("DELETE FROM dokumen WHERE id_dokumen = ?", [id]);
    await cloudinaryService.deleteFile(dokumen[0].cloudinary_public_id);
    res.json({ message: "Dokumen berhasil dihapus." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const resubmitDokumen = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "File tidak ditemukan." });

    const mahasiswa = await getMahasiswaProfile(req.user.id);
    const { id } = req.params;
    const [dokumen] = await db.query(
      `SELECT d.* FROM dokumen d JOIN pengajuan p ON p.id_pengajuan = d.pengajuan_id WHERE d.id_dokumen = ? AND p.mahasiswa_id = ?`,
      [id, mahasiswa.id]
    );
    if (!dokumen.length) return res.status(404).json({ message: "Dokumen tidak ditemukan." });
    if (!["revisi_kaprodi", "revisi_dospem"].includes(dokumen[0].status)) {
      return res.status(400).json({ message: "Dokumen ini tidak dalam status revisi." });
    }

    const pengajuan = await getPengajuanDisetujui(mahasiswa.id);
    const [periodeCheckResubmit] = await db.query(
      `SELECT per.form_ppt_buka, per.form_laporan_buka, per.tanggal_mulai_dokumen
       FROM periode per JOIN pengajuan p ON p.periode_id = per.id_periode WHERE p.id_pengajuan = ?`,
      [pengajuan.pengajuan_id]
    );
    if (periodeCheckResubmit.length) {
      const per = periodeCheckResubmit[0];
      const kolomToggle = { ppt: "form_ppt_buka", laporan_akhir: "form_laporan_buka" }[dokumen[0].jenis];
      if (kolomToggle && per[kolomToggle] !== 1) {
        return res.status(400).json({ message: `Form upload ${JENIS_LABEL_MAP[dokumen[0].jenis] || dokumen[0].jenis} sedang ditutup.` });
      }
      if (per.tanggal_mulai_dokumen) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const mulaiStr = new Date(per.tanggal_mulai_dokumen).toISOString().slice(0, 10);
        if (mulaiStr > todayStr) {
          return res.status(400).json({ message: `Upload dokumen baru bisa dilakukan mulai ${mulaiStr}.` });
        }
      }
    }

    const subfolder = JENIS_SUBFOLDER_MAP[dokumen[0].jenis];

    const uploaded = await cloudinaryService.uploadFile(req.file.buffer, req.file.originalname, mahasiswa.nim, mahasiswa.nama, subfolder);

    await db.query(
      `UPDATE dokumen SET nama_file=?, cloudinary_public_id=?, cloudinary_url=?, ukuran_file=?, status='diupload',
       feedback=NULL, verified_by=NULL, verified_at=NULL,
       feedback_kaprodi=NULL, feedback_dospem=NULL,
       verified_kaprodi_by=NULL, verified_kaprodi_at=NULL,
       verified_dospem_by=NULL, verified_dospem_at=NULL
       WHERE id_dokumen=?`,
      [req.file.originalname, uploaded.publicId, uploaded.url, req.file.size, id]
    );
    await cloudinaryService.deleteFile(dokumen[0].cloudinary_public_id);

    await _notifikasiDokumenKeReviewer(pengajuan.pengajuan_id, mahasiswa, JENIS_LABEL_MAP[dokumen[0].jenis] || dokumen[0].jenis, "mengupload ulang (setelah revisi) ");

    res.json({ message: "Dokumen berhasil disubmit ulang.", cloudinary_url: uploaded.url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== FEEDBACK & PENILAIAN ==========

const getFeedback = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    const [rows] = await db.query(
      `SELECT f.*, d.nama as nama_dosen, per.nama_periode
       FROM feedback f
       JOIN pengajuan p ON p.id_pengajuan = f.pengajuan_id
       JOIN periode per ON per.id_periode = p.periode_id
       JOIN users d ON f.dosen_id = d.id_users
       WHERE p.mahasiswa_id = ?
       ORDER BY f.created_at DESC`,
      [mahasiswa.id]
    );
    // is_read sudah dihapus dari feedback -- gak ada lagi UPDATE "tandai terbaca" di sini.
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getPenilaian = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    const [rows] = await db.query(
      `SELECT pn.*, d.nama as nama_dosen, per.nama_periode
       FROM penilaian pn
       JOIN pengajuan p ON p.id_pengajuan = pn.pengajuan_id
       JOIN periode per ON per.id_periode = p.periode_id
       JOIN users d ON pn.dosen_id = d.id_users
       WHERE p.mahasiswa_id = ?
       ORDER BY pn.created_at DESC`,
      [mahasiswa.id]
    );
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getNotifikasi = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM notifikasi WHERE user_id = ? ORDER BY created_at DESC LIMIT 20", [req.user.id]);
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getPeriodeAktif = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM periode WHERE is_active = 1 ORDER BY created_at DESC");
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

module.exports = {
  getPengajuan, tambahPengajuan, updatePengajuan, hapusPengajuan,
  getDosenPA,
  getPelatihanAktif,
  getLogbook, tambahLogbook, updateLogbook, hapusLogbook,
  getDokumen, uploadDokumen, hapusDokumen, resubmitDokumen,
  getFeedback, getPenilaian, getNotifikasi, getPeriodeAktif,
};