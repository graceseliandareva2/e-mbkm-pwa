const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ========== PENGAJUAN CAPSTONE ==========

const getPengajuan = async (req, res) => {
  try {
    const [mhsList] = await db.query(
      "SELECT id FROM mahasiswa WHERE user_id = ?",
      [req.user.id],
    );
    if (!mhsList.length)
      return res.status(404).json({ message: "Data mahasiswa tidak ditemukan." });

    const mhsIds = mhsList.map((m) => m.id);

    const [rows] = await db.query(
      `SELECT pc.*, p.nama_periode, p.form_pengajuan_buka,
        b.dosen_id, d.nama as nama_dosen
      FROM pengajuan_capstone pc
      JOIN periode p ON pc.periode_id = p.id
      LEFT JOIN bimbingan b ON pc.mahasiswa_id = b.mahasiswa_id AND pc.periode_id = b.periode_id
      LEFT JOIN dosen d ON b.dosen_id = d.id
      WHERE pc.mahasiswa_id IN (${mhsIds.map(() => "?").join(",")})
      ORDER BY pc.created_at DESC`,
      mhsIds,
    );

    if (!rows.length)
      return res.status(404).json({ message: "Belum ada pengajuan." });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const tambahPengajuan = async (req, res) => {
  try {
    const [mhs] = await db.query(
      "SELECT id, periode_id FROM mahasiswa WHERE user_id = ?",
      [req.user.id],
    );
    if (!mhs.length)
      return res.status(404).json({ message: "Data mahasiswa tidak ditemukan." });

    if (!mhs[0].periode_id) {
      return res.status(400).json({
        message: "Periode untuk mahasiswa ini belum diatur. Hubungi staff akademik.",
      });
    }

    const periodeIdMahasiswa = mhs[0].periode_id;

    const [periodeCheck] = await db.query(
      "SELECT * FROM periode WHERE id = ? AND form_pengajuan_buka = 1 AND is_active = 1",
      [periodeIdMahasiswa],
    );
    if (!periodeCheck.length)
      return res.status(400).json({ message: "Form pengajuan sedang ditutup." });

    const { email, nim, nama_lengkap, dosen_pembimbing_akademik, pelatihan } = req.body;

    if (!email || !nim || !nama_lengkap || !pelatihan) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Format email tidak valid." });
    }

    const pelatihanArr = typeof pelatihan === "string" ? JSON.parse(pelatihan) : pelatihan;
    if (!Array.isArray(pelatihanArr) || pelatihanArr.length === 0) {
      return res.status(400).json({ message: "Minimal 1 pelatihan wajib diisi." });
    }

    const [existing] = await db.query(
      "SELECT id FROM pengajuan_capstone WHERE mahasiswa_id = ? AND periode_id = ?",
      [mhs[0].id, periodeIdMahasiswa],
    );
    if (existing.length)
      return res.status(400).json({ message: "Kamu sudah mengajukan capstone di periode ini." });

    const newId = uuidv4();
    await db.query(
      `INSERT INTO pengajuan_capstone
      (id, mahasiswa_id, periode_id, email, nim, nama_lengkap, dosen_pembimbing_akademik, pelatihan, judul, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'diajukan')`,
      [newId, mhs[0].id, periodeIdMahasiswa, email, nim, nama_lengkap, dosen_pembimbing_akademik, JSON.stringify(pelatihanArr), nama_lengkap],
    );
    res.status(201).json({ message: "Pengajuan capstone berhasil dikirim." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const updatePengajuan = async (req, res) => {
  try {
    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const { id } = req.params;
    const [pengajuan] = await db.query(
      "SELECT * FROM pengajuan_capstone WHERE id = ? AND mahasiswa_id = ?",
      [id, mhs[0].id],
    );
    if (!pengajuan.length)
      return res.status(404).json({ message: "Pengajuan tidak ditemukan." });
    if (!["draft", "diajukan", "revisi", "ditolak"].includes(pengajuan[0].status)) {
      return res.status(400).json({ message: "Pengajuan yang sudah disetujui tidak bisa diedit." });
    }

    const { email, nim, nama_lengkap, dosen_pembimbing_akademik, pelatihan } = req.body;

    if (!email || !nim || !nama_lengkap || !pelatihan) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Format email tidak valid." });
    }

    await db.query(
      `UPDATE pengajuan_capstone SET email=?, nim=?, nama_lengkap=?,
      dosen_pembimbing_akademik=?, pelatihan=?, judul=?, status='diajukan' WHERE id=?`,
      [email, nim, nama_lengkap, dosen_pembimbing_akademik, JSON.stringify(pelatihan), nama_lengkap, id],
    );
    res.json({ message: "Pengajuan berhasil diupdate." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const hapusPengajuan = async (req, res) => {
  try {
    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const { id } = req.params;
    const [pengajuan] = await db.query(
      "SELECT * FROM pengajuan_capstone WHERE id = ? AND mahasiswa_id = ?",
      [id, mhs[0].id],
    );
    if (!pengajuan.length)
      return res.status(404).json({ message: "Pengajuan tidak ditemukan." });
    if (!["draft", "diajukan"].includes(pengajuan[0].status)) {
      return res.status(400).json({ message: "Pengajuan yang sudah diproses tidak bisa dihapus." });
    }
    await db.query("DELETE FROM pengajuan_capstone WHERE id = ?", [id]);
    res.json({ message: "Pengajuan berhasil dihapus." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== LOGBOOK ==========

const getLogbook = async (req, res) => {
  try {
    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const { periode_id } = req.query;
    let query = `
      SELECT l.*, p.nama_periode
      FROM logbook l
      JOIN periode p ON l.periode_id = p.id
      WHERE l.mahasiswa_id = ?
    `;
    const params = [mhs[0].id];
    if (periode_id) {
      query += " AND l.periode_id = ?";
      params.push(periode_id);
    }
    query += " ORDER BY l.tanggal DESC";
    const [rows] = await db.query(query, params);
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const tambahLogbook = async (req, res) => {
  try {
    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const { periode_id, pengajuan_id, tanggal, kegiatan, deskripsi, jam, hasil, kendala, rencana_selanjutnya, bukti_link } = req.body;

    if (!tanggal || !kegiatan || !deskripsi) {
      return res.status(400).json({ message: "Tanggal, kegiatan dan deskripsi wajib diisi." });
    }

    if (!jam || isNaN(jam) || Number(jam) <= 0) {
      return res.status(400).json({ message: "Durasi kegiatan harus lebih dari 0." });
    }

    if (Number(jam) > 1440) {
      return res.status(400).json({ message: "Durasi kegiatan maksimal 24 jam per hari." });
    }

    let periodeIdFinal = periode_id;
    if (!periodeIdFinal) {
      const [periodeAktif] = await db.query(
        "SELECT * FROM periode WHERE form_logbook_buka = 1 AND is_active = 1 ORDER BY created_at DESC LIMIT 1",
      );
      if (!periodeAktif.length) {
        return res.status(400).json({ message: "Form logbook sedang ditutup." });
      }
      periodeIdFinal = periodeAktif[0].id;
    } else {
      const [periode] = await db.query(
        "SELECT * FROM periode WHERE id = ? AND form_logbook_buka = 1 AND is_active = 1",
        [periodeIdFinal],
      );
      if (!periode.length) {
        return res.status(400).json({ message: "Form logbook sedang ditutup." });
      }
    }

    // Gunakan URL Cloudinary langsung dari req.file.path
    const buktiPath = req.file ? req.file.path : null;

    const newId = uuidv4();
    await db.query(
      `INSERT INTO logbook
      (id, mahasiswa_id, periode_id, pengajuan_id, tanggal, kegiatan, deskripsi, jam,
       hasil, kendala, rencana_selanjutnya, bukti_path, bukti_link, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disubmit')`,
      [newId, mhs[0].id, periodeIdFinal, pengajuan_id || null, tanggal, kegiatan, deskripsi, jam, hasil || null, kendala || null, rencana_selanjutnya || null, buktiPath, bukti_link || null],
    );
    res.status(201).json({ message: "Logbook berhasil ditambahkan." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const updateLogbook = async (req, res) => {
  try {
    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const { id } = req.params;
    const [logbook] = await db.query(
      "SELECT * FROM logbook WHERE id = ? AND mahasiswa_id = ?",
      [id, mhs[0].id],
    );
    if (!logbook.length)
      return res.status(404).json({ message: "Logbook tidak ditemukan." });
    if (!["draft", "disubmit", "revisi"].includes(logbook[0].status)) {
      return res.status(400).json({ message: "Logbook yang sudah diverifikasi tidak bisa diedit." });
    }
const { tanggal, kegiatan, deskripsi, jam, hasil, kendala, rencana_selanjutnya } = req.body;

console.log('updateLogbook body:', { tanggal, kegiatan, deskripsi, jam, hasil, kendala, rencana_selanjutnya });

// FIX: konversi format tanggal ISO ke YYYY-MM-DD
const tanggalFormatted = tanggal ? tanggal.split('T')[0] : null;

if (!tanggalFormatted || !kegiatan || !deskripsi) {
  return res.status(400).json({ message: "Tanggal, kegiatan, dan deskripsi wajib diisi." });
}

if (!jam || isNaN(jam) || Number(jam) <= 0) {
  return res.status(400).json({ message: "Durasi kegiatan harus lebih dari 0." });
}

if (Number(jam) > 1440) {
  return res.status(400).json({ message: "Durasi kegiatan maksimal 24 jam per hari." });
}

let buktiPath = logbook[0].bukti_path;

if (req.body.hapus_bukti === "1") {
  buktiPath = null;
}

if (req.file) {
  buktiPath = req.file.path;
}

await db.query(
  `UPDATE logbook SET tanggal=?, kegiatan=?, deskripsi=?, jam=?, hasil=?, kendala=?,
  rencana_selanjutnya=?, bukti_path=?, status='disubmit' WHERE id=?`,
  [tanggalFormatted, kegiatan, deskripsi, jam, hasil || null, kendala || null, rencana_selanjutnya || null, buktiPath, id],
);
    res.json({ message: "Logbook berhasil diupdate." });
  } catch (error) {
    console.error('updateLogbook error:', error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};
const hapusLogbook = async (req, res) => {
  try {
    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const { id } = req.params;
    const [logbook] = await db.query(
      "SELECT * FROM logbook WHERE id = ? AND mahasiswa_id = ?",
      [id, mhs[0].id],
    );
    if (!logbook.length)
      return res.status(404).json({ message: "Logbook tidak ditemukan." });
    if (!["draft", "disubmit"].includes(logbook[0].status)) {
      return res.status(400).json({ message: "Logbook yang sudah diverifikasi tidak bisa dihapus." });
    }
    await db.query("DELETE FROM logbook WHERE id = ?", [id]);
    res.json({ message: "Logbook berhasil dihapus." });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== DOKUMEN ==========

const getDokumen = async (req, res) => {
  try {
    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const { periode_id } = req.query;
    const [rows] = await db.query(
      `SELECT d.*, p.nama_periode
      FROM dokumen d
      JOIN periode p ON d.periode_id = p.id
      WHERE d.mahasiswa_id = ? ${periode_id ? "AND d.periode_id = ?" : ""}
      ORDER BY d.created_at DESC`,
      periode_id ? [mhs[0].id, periode_id] : [mhs[0].id],
    );
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const _notifikasiDokumenKeReviewer = async (mahasiswaId, periodeId, jenisLabel, pesanTambahan = "") => {
  try {
    const [mhsInfo] = await db.query(
      `SELECT m.nama, m.nim, d.user_id as dosen_user_id
      FROM mahasiswa m
      LEFT JOIN bimbingan b ON m.id = b.mahasiswa_id AND b.periode_id = ?
      LEFT JOIN dosen d ON b.dosen_id = d.id
      WHERE m.id = ?`,
      [periodeId, mahasiswaId],
    );

    const nama = mhsInfo[0]?.nama || "Mahasiswa";
    const nim = mhsInfo[0]?.nim || "";
    const pesan = `${nama} (${nim}) telah ${pesanTambahan}mengupload dokumen ${jenisLabel}.`;
    const judul = "Dokumen Baru Diupload";

    if (mhsInfo[0]?.dosen_user_id) {
      await db.query(
        "INSERT INTO notifikasi (user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?)",
        [mhsInfo[0].dosen_user_id, judul, pesan, "info"],
      );
    }

    const [kaprodiList] = await db.query("SELECT id FROM users WHERE role = 'kaprodi'");
    for (const kap of kaprodiList) {
      await db.query(
        "INSERT INTO notifikasi (user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?)",
        [kap.id, judul, pesan, "info"],
      );
    }
  } catch (err) {
    console.error("Gagal kirim notifikasi reviewer:", err.message);
  }
};

const JENIS_LABEL_MAP = {
  laporan_akhir: "Laporan Akhir",
  ppt: "PPT",
  dokumen_pendukung: "Dokumen Pendukung",
};

const uploadDokumen = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "File tidak ditemukan." });

    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const { periode_id, pengajuan_id, jenis } = req.body;

    if (!periode_id || !jenis) {
      return res.status(400).json({ message: "Periode dan jenis dokumen wajib diisi." });
    }

    if (!["laporan_akhir", "ppt", "dokumen_pendukung"].includes(jenis)) {
      return res.status(400).json({ message: "Jenis dokumen tidak valid." });
    }

    const [periode] = await db.query("SELECT * FROM periode WHERE id = ?", [periode_id]);
    if (periode.length && periode[0].form_dokumen_buka === 0) {
      return res.status(400).json({ message: "Form upload dokumen sedang ditutup." });
    }

    // URL Cloudinary langsung dari req.file.path
    const filePath = req.file.path;
    const fileSize = req.file.size;
    const namaFile = req.file.originalname;

    const [existing] = await db.query(
      "SELECT id, path_file, status FROM dokumen WHERE mahasiswa_id = ? AND periode_id = ? AND jenis = ?",
      [mhs[0].id, periode_id, jenis],
    );

    if (existing.length) {
      const statusTerkunci = ["diverifikasi", "disetujui_dospem", "disetujui_kaprodi"];
      if (statusTerkunci.includes(existing[0].status)) {
        return res.status(400).json({
          message: `Dokumen ${jenis === "ppt" ? "PPT" : "Laporan Akhir"} sudah diverifikasi dan tidak bisa diganti.`,
        });
      }

      await db.query(
        `UPDATE dokumen SET nama_file=?, path_file=?, ukuran_file=?, status='diupload',
        feedback_kaprodi=NULL, feedback_dospem=NULL,
        verified_kaprodi_by=NULL, verified_kaprodi_at=NULL,
        verified_dospem_by=NULL, verified_dospem_at=NULL
        WHERE id=?`,
        [namaFile, filePath, fileSize, existing[0].id],
      );
    } else {
      const newId = uuidv4();
      await db.query(
        `INSERT INTO dokumen (id, mahasiswa_id, periode_id, pengajuan_id, jenis, nama_file, path_file, ukuran_file)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId, mhs[0].id, periode_id, pengajuan_id || null, jenis, namaFile, filePath, fileSize],
      );
    }

    await _notifikasiDokumenKeReviewer(mhs[0].id, periode_id, JENIS_LABEL_MAP[jenis] || jenis);
    res.status(201).json({ message: "Dokumen berhasil diupload." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const hapusDokumen = async (req, res) => {
  try {
    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const { id } = req.params;
    const [dokumen] = await db.query(
      "SELECT * FROM dokumen WHERE id = ? AND mahasiswa_id = ?",
      [id, mhs[0].id],
    );
    if (!dokumen.length)
      return res.status(404).json({ message: "Dokumen tidak ditemukan." });
    await db.query("DELETE FROM dokumen WHERE id = ?", [id]);
    res.json({ message: "Dokumen berhasil dihapus." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const resubmitDokumen = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "File tidak ditemukan." });

    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const { id } = req.params;
    const [dokumen] = await db.query(
      "SELECT * FROM dokumen WHERE id = ? AND mahasiswa_id = ?",
      [id, mhs[0].id],
    );
    if (!dokumen.length)
      return res.status(404).json({ message: "Dokumen tidak ditemukan." });

    if (!["revisi_kaprodi", "revisi_dospem"].includes(dokumen[0].status)) {
      return res.status(400).json({ message: "Dokumen ini tidak dalam status revisi." });
    }

    // URL Cloudinary langsung dari req.file.path
    const filePath = req.file.path;

    await db.query(
      `UPDATE dokumen SET
        nama_file=?, path_file=?, ukuran_file=?,
        status='diupload',
        feedback_kaprodi=NULL, feedback_dospem=NULL,
        verified_kaprodi_by=NULL, verified_kaprodi_at=NULL,
        verified_dospem_by=NULL, verified_dospem_at=NULL
      WHERE id=?`,
      [req.file.originalname, filePath, req.file.size, id],
    );

    await _notifikasiDokumenKeReviewer(
      mhs[0].id, dokumen[0].periode_id,
      JENIS_LABEL_MAP[dokumen[0].jenis] || dokumen[0].jenis,
      "mengupload ulang (setelah revisi) ",
    );

    res.json({ message: "Dokumen berhasil disubmit ulang." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== FEEDBACK & PENILAIAN ==========

const getFeedback = async (req, res) => {
  try {
    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const [rows] = await db.query(
      `SELECT f.*, d.nama as nama_dosen, p.nama_periode
      FROM feedback f
      JOIN dosen d ON f.dosen_id = d.id
      JOIN periode p ON f.periode_id = p.id
      WHERE f.mahasiswa_id = ?
      ORDER BY f.created_at DESC`,
      [mhs[0].id],
    );
    await db.query("UPDATE feedback SET is_read = 1 WHERE mahasiswa_id = ?", [mhs[0].id]);
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getPenilaian = async (req, res) => {
  try {
    const [mhs] = await db.query("SELECT id FROM mahasiswa WHERE user_id = ?", [req.user.id]);
    const [rows] = await db.query(
      `SELECT pn.*, d.nama as nama_dosen, p.nama_periode
      FROM penilaian pn
      JOIN dosen d ON pn.dosen_id = d.id
      JOIN periode p ON pn.periode_id = p.id
      WHERE pn.mahasiswa_id = ?
      ORDER BY pn.created_at DESC`,
      [mhs[0].id],
    );
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getNotifikasi = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM notifikasi WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
      [req.user.id],
    );
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getPeriodeAktif = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM periode WHERE is_active = 1 ORDER BY created_at DESC",
    );
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

module.exports = {
  getPengajuan, tambahPengajuan, updatePengajuan, hapusPengajuan,
  getLogbook, tambahLogbook, updateLogbook, hapusLogbook,
  getDokumen, uploadDokumen, hapusDokumen, resubmitDokumen,
  getFeedback, getPenilaian, getNotifikasi, getPeriodeAktif,
};