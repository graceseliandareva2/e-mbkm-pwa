const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const cloudinaryService = require("../utils/cloudinaryService");
const { generateLogbookDocx } = require("../utils/logbookDocxGenerator");


const STATUS_BOLEH_LOGBOOK_DOKUMEN = ["disetujui_kaprodi"];

async function getMahasiswaProfile(userId) {
  const [rows] = await db.query(
    `SELECT m.id, m.nim, m.nama, m.email, m.program_studi,
            m.dosen_pembimbing_akademik_id, dpa.nama AS nama_dosen_pembimbing_akademik
     FROM mahasiswa m
     LEFT JOIN dosen dpa ON dpa.id = m.dosen_pembimbing_akademik_id
     WHERE m.user_id = ?`,
    [userId]
  );
  return rows[0] || null;
}

/** Ambil pengajuan yang statusnya disetujui_kaprodi (satu-satunya yang boleh isi logbook/dokumen) */
async function getPengajuanDisetujui(mahasiswaId) {
  const [rows] = await db.query(
    `SELECT p.id AS pengajuan_id, p.status,
            p.cloudinary_logbook_public_id, p.cloudinary_logbook_link,
            dp.penyelenggara, dp.waktu_studi_independen, dp.judul
     FROM pengajuan p
     LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id
     WHERE p.mahasiswa_id = ? AND p.status = 'disetujui_kaprodi'
     ORDER BY p.created_at DESC
     LIMIT 1`,
    [mahasiswaId]
  );
  return rows[0] || null;
}

/** Ambil daftar pelatihan (maks 3) milik satu pengajuan, urut sesuai input mahasiswa. */
async function getPelatihanList(pengajuanId) {
  const [rows] = await db.query(
    `SELECT id, nama, link, durasi_jam, urutan FROM pelatihan WHERE pengajuan_id = ? ORDER BY urutan ASC`,
    [pengajuanId]
  );
  return rows;
}

async function getDosenPembimbingCapstone(pengajuanId) {
  const [rows] = await db.query(
    `SELECT d.nama, d.id_dosen AS nidn
     FROM bimbingan b
     JOIN dosen d ON d.id = b.dosen_id
     WHERE b.pengajuan_id = ?
     ORDER BY b.created_at DESC
     LIMIT 1`,
    [pengajuanId]
  );
  return rows[0] || null;
}

/**
 * Generate ulang SATU file Word logbook dari semua entry, replace di Cloudinary.
 * PERUBAHAN: gak perlu lagi "ensure folder" duluan kayak Drive -- Cloudinary
 * otomatis bikin folder dari path string pas upload, jadi cukup modal nim/nama.
 */
async function regenerateLogbookDocx(pengajuan, mahasiswa) {
  const [entries] = await db.query(
    `SELECT tanggal, jam_mulai, jam_selesai, kegiatan, deskripsi, hasil, kendala, status
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
      `UPDATE pengajuan SET cloudinary_logbook_public_id = ?, cloudinary_logbook_link = ? WHERE id = ?`,
      [result.publicId, result.url, pengajuan.pengajuan_id]
    );
  }

  return result;
}

async function _notifikasiDokumenKeReviewer(pengajuanId, mahasiswa, jenisLabel, pesanTambahan = "") {
  try {
    const [bimbinganRows] = await db.query(
      `SELECT d.user_id AS dosen_user_id
       FROM bimbingan b JOIN dosen d ON d.id = b.dosen_id
       WHERE b.pengajuan_id = ?
       ORDER BY b.created_at DESC LIMIT 1`,
      [pengajuanId]
    );

    const pesan = `${mahasiswa.nama} (${mahasiswa.nim}) telah ${pesanTambahan}mengupload dokumen ${jenisLabel}.`;
    const judul = "Dokumen Baru Diupload";

    if (bimbinganRows[0]?.dosen_user_id) {
      await db.query("INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)", [uuidv4(), bimbinganRows[0].dosen_user_id, judul, pesan, "info"]);
    }

    const [kaprodiList] = await db.query("SELECT user_id FROM kaprodi");
    for (const kap of kaprodiList) {
      await db.query("INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)", [uuidv4(), kap.user_id, judul, pesan, "info"]);
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
        p.id, p.mahasiswa_id, p.periode_id, p.status, p.pengajuan_sebelumnya_id,
        p.catatan_dosen, p.catatan_kaprodi,
        p.created_at, p.updated_at,
        p.cloudinary_logbook_link,
        dp.pelatihan, dp.judul, dp.penyelenggara, dp.waktu_studi_independen,
        dp.deskripsi, dp.lokasi, dp.tanggal_mulai, dp.tanggal_selesai,
        per.nama_periode, per.form_pengajuan_buka, per.min_jam_pengajuan,
        b.dosen_id, d.nama as nama_dosen
      FROM pengajuan p
      JOIN periode per ON p.periode_id = per.id
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id
      LEFT JOIN bimbingan b ON b.pengajuan_id = p.id
      LEFT JOIN dosen d ON b.dosen_id = d.id
      WHERE p.mahasiswa_id = ?
      ORDER BY p.created_at DESC`,
      [mahasiswa.id]
    );

    if (!rows.length) return res.status(404).json({ message: "Belum ada pengajuan." });

    // pelatihan_list = sumber ber-ID (tabel `pelatihan`), dipakai frontend
    // untuk dropdown/tab pemilihan pelatihan di halaman Logbook.
    // Field `pelatihan` mentah (JSON legacy) tetap dikirim apa adanya
    // untuk kompatibilitas dengan bagian frontend lain yang sudah ada.
    const pelatihanList = await getPelatihanList(rows[0].id);

    res.json({
      ...rows[0],
      pelatihan_list: pelatihanList,
      nim: mahasiswa.nim,
      nama_lengkap: mahasiswa.nama,
      email: mahasiswa.email,
      dosen_pembimbing_akademik: mahasiswa.nama_dosen_pembimbing_akademik,
      dosen_pembimbing_akademik_id: mahasiswa.dosen_pembimbing_akademik_id,
      riwayat: rows.slice(1),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// PERUBAHAN: Dosen PA untuk dropdown form pengajuan sekarang diambil dari
// roster_dosen_pa periode aktif -- BUKAN dari dosen.is_dosen_pa (kolom itu
// sudah dihapus). Roster hanya menentukan siapa yang tersedia jadi PA di
// periode ini; identitas dosen tetap dosen.id.
const getDosenPA = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.id, d.nama
       FROM roster_dosen_pa r
       JOIN dosen d ON d.id = r.dosen_id
       JOIN periode per ON per.id = r.periode_id
       WHERE per.is_active = 1
       ORDER BY d.nama ASC`
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

    // BARU: untuk periode yang mencakup jalur MBKM (jenis 'mbkm' atau
    // 'keduanya'), mahasiswa hanya boleh submit pengajuan kalau memang
    // sudah di-import Kaprodi ke periode ini (roster_mahasiswa_mbkm).
    // Import HANYA berarti "berhak ikut MBKM periode ini" -- bukan berarti
    // otomatis punya pengajuan; pengajuan tetap harus dibuat manual di sini.
    // Periode 'capstone' murni tidak pakai roster ini sama sekali (tidak
    // diubah, supaya alur Capstone yang sudah berjalan tidak ikut terblokir).
    if (["mbkm", "keduanya"].includes(periode.jenis)) {
      const [rosterCheck] = await db.query(
        `SELECT id FROM roster_mahasiswa_mbkm WHERE mahasiswa_id = ? AND periode_id = ? AND is_active = 1`,
        [mahasiswa.id, periode.id]
      );
      if (!rosterCheck.length) {
        connection.release();
        return res.status(403).json({ message: "Kamu belum di-import Kaprodi untuk mengikuti MBKM pada periode ini." });
      }
    }

    const { judul, penyelenggara, pelatihan, tanggal_mulai, tanggal_selesai, dosen_pembimbing_akademik_id } = req.body;

    if (!judul || !penyelenggara || !pelatihan) {
      connection.release();
      return res.status(400).json({ message: "Judul, penyelenggara, dan pelatihan wajib diisi." });
    }

    const pelatihanArr = typeof pelatihan === "string" ? JSON.parse(pelatihan) : pelatihan;
    if (!Array.isArray(pelatihanArr) || pelatihanArr.length === 0) {
      connection.release();
      return res.status(400).json({ message: "Minimal 1 pelatihan wajib diisi." });
    }
    if (pelatihanArr.length > 3) {
      connection.release();
      return res.status(400).json({ message: "Maksimal 3 pelatihan per pengajuan." });
    }

    const totalJam = pelatihanArr.reduce((sum, p) => sum + (Number(p.durasi_jam) || 0), 0);
    if (totalJam < minJam) {
      connection.release();
      return res.status(400).json({ message: `Total waktu pembelajaran harus minimal ${minJam} jam (saat ini ${totalJam} jam).` });
    }

    // Kasih ID stabil ke tiap item pelatihan -- ID ini yang dipakai logbook
    // (kolom logbook.pelatihan_id) untuk menandai logbook itu milik
    // pelatihan yang mana di dalam pengajuan ini.
    const pelatihanWithId = pelatihanArr.map((p, idx) => ({
      id: p.id || uuidv4(),
      nama: p.nama,
      link: p.link || null,
      durasi_jam: Number(p.durasi_jam) || 0,
      urutan: idx,
    }));

    const [existing] = await db.query("SELECT id FROM pengajuan WHERE mahasiswa_id = ? AND periode_id = ?", [mahasiswa.id, periode.id]);
    if (existing.length) {
      connection.release();
      return res.status(400).json({ message: "Kamu sudah mengajukan capstone di periode ini." });
    }

    // Cari pengajuan sebelumnya (periode lain) buat dirantai jadi riwayat
    // (pengajuan_sebelumnya_id). Status pengajuan lama TIDAK diubah/di-arsipkan --
    // dia tetap kesimpan apa adanya di periode lamanya, dan otomatis nggak
    // nongol lagi di daftar periode yang baru karena beda periode_id.
    const [prevRows] = await db.query(
      `SELECT id, status FROM pengajuan WHERE mahasiswa_id = ? AND periode_id != ? ORDER BY created_at DESC LIMIT 1`,
      [mahasiswa.id, periode.id]
    );
    const pengajuanSebelumnya = prevRows[0] || null;

    const pengajuanId = uuidv4();
    const detailId = uuidv4();

    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO pengajuan (id, mahasiswa_id, periode_id, status, pengajuan_sebelumnya_id)
       VALUES (?, ?, ?, 'diajukan', ?)`,
      [pengajuanId, mahasiswa.id, periode.id, pengajuanSebelumnya ? pengajuanSebelumnya.id : null]
    );

    await connection.query(
      `INSERT INTO detail_pengajuan (id, pengajuan_id, pelatihan, judul, penyelenggara, tanggal_mulai, tanggal_selesai)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [detailId, pengajuanId, JSON.stringify(pelatihanWithId), judul, penyelenggara, tanggal_mulai || null, tanggal_selesai || null]
    );

    for (const pl of pelatihanWithId) {
      await connection.query(
        `INSERT INTO pelatihan (id, pengajuan_id, nama, link, durasi_jam, urutan) VALUES (?, ?, ?, ?, ?, ?)`,
        [pl.id, pengajuanId, pl.nama, pl.link, pl.durasi_jam, pl.urutan]
      );
    }

    // PERUBAHAN: Dosen PA nempel ke mahasiswa (bukan ke pengajuan), disimpan
    // langsung ke tabel `mahasiswa`. BARU: divalidasi dulu ke roster_dosen_pa
    // periode aktif -- mahasiswa hanya boleh pilih dosen yang memang
    // terdaftar sebagai PA di periode berjalan. Kalau gagal, seluruh
    // transaksi (pengajuan/detail_pengajuan/pelatihan yang baru diinsert di
    // atas) ikut di-rollback supaya tidak ada data setengah jalan.
    if (dosen_pembimbing_akademik_id) {
      const [validRoster] = await connection.query(
        `SELECT r.id
         FROM roster_dosen_pa r
         JOIN periode per ON per.id = r.periode_id
         WHERE r.dosen_id = ? AND per.is_active = 1`,
        [dosen_pembimbing_akademik_id]
      );
      if (!validRoster.length) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ message: "Dosen pembimbing akademik yang dipilih tidak terdaftar di roster PA periode aktif." });
      }

      await connection.query(
        `UPDATE mahasiswa SET dosen_pembimbing_akademik_id = ? WHERE id = ?`,
        [dosen_pembimbing_akademik_id, mahasiswa.id]
      );
    }

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
    const [pengajuan] = await db.query("SELECT * FROM pengajuan WHERE id = ? AND mahasiswa_id = ?", [id, mahasiswa.id]);
    if (!pengajuan.length) {
      connection.release();
      return res.status(404).json({ message: "Pengajuan tidak ditemukan." });
    }
    if (!["draft", "diajukan", "revisi", "ditolak"].includes(pengajuan[0].status)) {
      connection.release();
      return res.status(400).json({ message: "Pengajuan yang sudah disetujui tidak bisa diedit." });
    }

    const { judul, penyelenggara, pelatihan, tanggal_mulai, tanggal_selesai, dosen_pembimbing_akademik_id } = req.body;

    if (!judul || !penyelenggara || !pelatihan) {
      connection.release();
      return res.status(400).json({ message: "Judul, penyelenggara, dan pelatihan wajib diisi." });
    }

    const [periodeRow] = await db.query("SELECT min_jam_pengajuan FROM periode WHERE id = ?", [pengajuan[0].periode_id]);
    const minJam = periodeRow[0]?.min_jam_pengajuan ?? 48;

    const pelatihanArr = typeof pelatihan === "string" ? JSON.parse(pelatihan) : pelatihan;
    if (!Array.isArray(pelatihanArr) || pelatihanArr.length === 0) {
      connection.release();
      return res.status(400).json({ message: "Minimal 1 pelatihan wajib diisi." });
    }
    if (pelatihanArr.length > 3) {
      connection.release();
      return res.status(400).json({ message: "Maksimal 3 pelatihan per pengajuan." });
    }
    const totalJam = pelatihanArr.reduce((sum, p) => sum + (Number(p.durasi_jam) || 0), 0);
    if (totalJam < minJam) {
      connection.release();
      return res.status(400).json({ message: `Total waktu pembelajaran harus minimal ${minJam} jam (saat ini ${totalJam} jam).` });
    }

    // Pertahankan ID pelatihan yang sudah ada (kalau mahasiswa cuma edit nama/link
    // pelatihan yang sama) supaya logbook yang sudah tertaut ke pelatihan itu
    // tidak kehilangan relasinya. Item baru (tanpa id) dapat id baru.
    const pelatihanWithId = pelatihanArr.map((p, idx) => ({
      id: p.id || uuidv4(),
      nama: p.nama,
      link: p.link || null,
      durasi_jam: Number(p.durasi_jam) || 0,
      urutan: idx,
    }));

    await connection.beginTransaction();

    await connection.query(`UPDATE pengajuan SET status = 'diajukan' WHERE id = ?`, [id]);

    await connection.query(
      `UPDATE detail_pengajuan SET pelatihan=?, judul=?, penyelenggara=?, tanggal_mulai=?, tanggal_selesai=? WHERE pengajuan_id = ?`,
      [JSON.stringify(pelatihanWithId), judul, penyelenggara, tanggal_mulai || null, tanggal_selesai || null, id]
    );

    // Sinkronkan tabel pelatihan: hapus yang tidak ada lagi di input,
    // upsert sisanya. Logbook yang mengacu ke pelatihan yang dihapus akan
    // otomatis jadi pelatihan_id=NULL (ON DELETE SET NULL di FK) -- tidak
    // ikut terhapus, cuma kehilangan penanda pelatihan spesifiknya.
    const [existingPelatihan] = await connection.query(`SELECT id FROM pelatihan WHERE pengajuan_id = ?`, [id]);
    const incomingIds = pelatihanWithId.map((p) => p.id);
    const toDelete = existingPelatihan.map((r) => r.id).filter((eid) => !incomingIds.includes(eid));
    if (toDelete.length) {
      await connection.query(`DELETE FROM pelatihan WHERE id IN (?)`, [toDelete]);
    }
    for (const pl of pelatihanWithId) {
      await connection.query(
        `INSERT INTO pelatihan (id, pengajuan_id, nama, link, durasi_jam, urutan)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE nama=VALUES(nama), link=VALUES(link), durasi_jam=VALUES(durasi_jam), urutan=VALUES(urutan)`,
        [pl.id, id, pl.nama, pl.link, pl.durasi_jam, pl.urutan]
      );
    }

    // PERUBAHAN: Dosen PA nempel ke mahasiswa (bukan ke pengajuan), disimpan
    // langsung ke tabel `mahasiswa`. BARU: divalidasi dulu ke roster_dosen_pa
    // periode aktif -- sama seperti di tambahPengajuan, kalau gagal seluruh
    // transaksi (update pengajuan/detail_pengajuan/pelatihan di atas) ikut
    // di-rollback.
    if (dosen_pembimbing_akademik_id) {
      const [validRoster] = await connection.query(
        `SELECT r.id
         FROM roster_dosen_pa r
         JOIN periode per ON per.id = r.periode_id
         WHERE r.dosen_id = ? AND per.is_active = 1`,
        [dosen_pembimbing_akademik_id]
      );
      if (!validRoster.length) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ message: "Dosen pembimbing akademik yang dipilih tidak terdaftar di roster PA periode aktif." });
      }

      await connection.query(
        `UPDATE mahasiswa SET dosen_pembimbing_akademik_id = ? WHERE id = ?`,
        [dosen_pembimbing_akademik_id, mahasiswa.id]
      );
    }

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
    const [pengajuan] = await db.query("SELECT * FROM pengajuan WHERE id = ? AND mahasiswa_id = ?", [id, mahasiswa.id]);
    if (!pengajuan.length) return res.status(404).json({ message: "Pengajuan tidak ditemukan." });
    if (!["draft", "diajukan"].includes(pengajuan[0].status)) {
      return res.status(400).json({ message: "Pengajuan yang sudah diproses tidak bisa dihapus." });
    }
    // detail_pengajuan, logbook, dokumen, bimbingan, feedback, penilaian
    // otomatis terhapus lewat ON DELETE CASCADE (semua nempel ke pengajuan_id)
    await db.query("DELETE FROM pengajuan WHERE id = ?", [id]);
    res.json({ message: "Pengajuan berhasil dihapus." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== PELATIHAN (dalam pengajuan yang disetujui) ==========

/** Daftar pelatihan (maks 3) milik pengajuan mahasiswa yang aktif (disetujui_kaprodi).
 *  Dipakai frontend untuk menampilkan dropdown/tab pilihan pelatihan di halaman Logbook. */
const getPelatihanAktif = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    if (!mahasiswa) return res.status(404).json({ message: "Data mahasiswa tidak ditemukan." });

    const pengajuan = await getPengajuanDisetujui(mahasiswa.id);
    if (!pengajuan) return res.json({ data: [] });

    const list = await getPelatihanList(pengajuan.pengajuan_id);
    res.json({ data: list });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== LOGBOOK ==========

const getLogbook = async (req, res) => {
  try {
    const mahasiswa = await getMahasiswaProfile(req.user.id);
    // Filter opsional ?pelatihan_id=... -- dipakai saat mahasiswa punya
    // lebih dari 1 pelatihan dan memilih salah satu tab/dropdown di frontend.
    const { pelatihan_id } = req.query;
    const params = [mahasiswa.id];
    let filterClause = "";
    if (pelatihan_id) {
      filterClause = "AND l.pelatihan_id = ?";
      params.push(pelatihan_id);
    }

    const [rows] = await db.query(
      `SELECT l.*, p.periode_id, per.nama_periode, pl.nama AS nama_pelatihan
       FROM logbook l
       JOIN pengajuan p ON p.id = l.pengajuan_id
       JOIN periode per ON per.id = p.periode_id
       LEFT JOIN pelatihan pl ON pl.id = l.pelatihan_id
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
    const { tanggal, jam_mulai, jam_selesai, kegiatan, deskripsi, hasil, kendala, pelatihan_id } = req.body;

    if (!tanggal || !jam_mulai || !jam_selesai || !kegiatan || !deskripsi) {
      return res.status(400).json({ message: "Tanggal, jam mulai/selesai, kegiatan, dan deskripsi wajib diisi." });
    }

    const pengajuan = await getPengajuanDisetujui(mahasiswa.id);
    if (!pengajuan) {
      return res.status(403).json({ message: "Logbook hanya bisa diisi setelah pengajuan disetujui kaprodi." });
    }

    const [periodeCheck] = await db.query(
      `SELECT per.form_logbook_buka, per.tanggal_mulai_logbook FROM periode per JOIN pengajuan p ON p.periode_id = per.id WHERE p.id = ?`,
      [pengajuan.pengajuan_id]
    );
    if (!periodeCheck.length || periodeCheck[0].form_logbook_buka !== 1) {
      return res.status(400).json({ message: "Form logbook sedang ditutup." });
    }
    // BARU: jaga-jaga di luar flag toggle -- kalau form_logbook_buka ke-set 1
    // padahal tanggal_mulai_logbook periode ini belum tiba (mis. toggle manual
    // dipakai sebelum tanggalnya), mahasiswa tetap tidak boleh submit logbook.
    if (periodeCheck[0].tanggal_mulai_logbook) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const mulaiStr = new Date(periodeCheck[0].tanggal_mulai_logbook).toISOString().slice(0, 10);
      if (mulaiStr > todayStr) {
        return res.status(400).json({ message: `Logbook baru bisa diisi mulai ${mulaiStr}.` });
      }
    }

    // Kalau pengajuan ini punya lebih dari 1 pelatihan, mahasiswa WAJIB
    // pilih pelatihan mana yang logbook ini terkait. Kalau cuma 1 pelatihan,
    // otomatis dipasangkan (tidak perlu mahasiswa pilih manual).
    const pelatihanList = await getPelatihanList(pengajuan.pengajuan_id);
    let pelatihanIdFinal = null;
    if (pelatihanList.length > 1) {
      if (!pelatihan_id) {
        return res.status(400).json({ message: "Pilih pelatihan untuk logbook ini." });
      }
      const valid = pelatihanList.some((p) => p.id === pelatihan_id);
      if (!valid) {
        return res.status(400).json({ message: "Pelatihan tidak valid untuk pengajuan ini." });
      }
      pelatihanIdFinal = pelatihan_id;
    } else if (pelatihanList.length === 1) {
      pelatihanIdFinal = pelatihanList[0].id;
    }
    // pelatihanList.length === 0 -> data lama/legacy tanpa tabel pelatihan,
    // pelatihanIdFinal tetap NULL (logbook tersimpan seperti sebelumnya).

    let cloudinaryPublicId = null;
    let buktiLink = null;
    if (req.file) {
      const uploaded = await cloudinaryService.uploadFile(req.file.buffer, req.file.originalname, mahasiswa.nim, mahasiswa.nama, "dokumentasi");
      cloudinaryPublicId = uploaded.publicId;
      buktiLink = uploaded.url;
    } else if (req.body.bukti_link) {
      // Mahasiswa pilih tab "Link" (bukan upload file) -- simpan link yang diketik sendiri.
      buktiLink = req.body.bukti_link;
    }

    const newId = uuidv4();
    await db.query(
      `INSERT INTO logbook (id, pengajuan_id, pelatihan_id, tanggal, jam_mulai, jam_selesai, kegiatan, deskripsi, hasil, kendala, cloudinary_public_id, bukti_link, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'disubmit')`,
      [newId, pengajuan.pengajuan_id, pelatihanIdFinal, tanggal, jam_mulai, jam_selesai, kegiatan, deskripsi, hasil || null, kendala || null, cloudinaryPublicId, buktiLink]
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
      `SELECT l.*, p.mahasiswa_id FROM logbook l JOIN pengajuan p ON p.id = l.pengajuan_id WHERE l.id = ? AND p.mahasiswa_id = ?`,
      [id, mahasiswa.id]
    );
    if (!logbookRows.length) return res.status(404).json({ message: "Logbook tidak ditemukan." });
    const logbook = logbookRows[0];

    if (!["draft", "disubmit", "revisi"].includes(logbook.status)) {
      return res.status(400).json({ message: "Logbook yang sudah diverifikasi tidak bisa diedit." });
    }

    const { tanggal, jam_mulai, jam_selesai, kegiatan, deskripsi, hasil, kendala } = req.body;
    const tanggalFormatted = tanggal ? tanggal.split("T")[0] : null;

    if (!tanggalFormatted || !jam_mulai || !jam_selesai || !kegiatan || !deskripsi) {
      return res.status(400).json({ message: "Tanggal, jam mulai/selesai, kegiatan, dan deskripsi wajib diisi." });
    }

    const pengajuan = await getPengajuanDisetujui(mahasiswa.id);

    // BARU: updateLogbook sebelumnya tidak pernah cek form_logbook_buka /
    // tanggal_mulai_logbook sama sekali -- disamakan dengan tambahLogbook
    // supaya edit logbook juga tidak bisa dilakukan saat form ditutup atau
    // sebelum tanggal mulai logbook periode ini.
    const [periodeCheck] = await db.query(
      `SELECT per.form_logbook_buka, per.tanggal_mulai_logbook FROM periode per JOIN pengajuan p ON p.periode_id = per.id WHERE p.id = ?`,
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
      // Mahasiswa ganti/isi bukti pakai tab "Link" -- bukan file baru.
      // Kalau sebelumnya ada file Cloudinary (cloudinaryPublicId lama), lepas
      // relasinya di sini juga supaya file lama ke-cleanup di bagian bawah.
      cloudinaryPublicId = null;
      buktiLink = req.body.bukti_link;
    }

    await db.query(
      `UPDATE logbook SET tanggal=?, jam_mulai=?, jam_selesai=?, kegiatan=?, deskripsi=?, hasil=?, kendala=?, cloudinary_public_id=?, bukti_link=?, status='disubmit' WHERE id=?`,
      [tanggalFormatted, jam_mulai, jam_selesai, kegiatan, deskripsi, hasil || null, kendala || null, cloudinaryPublicId, buktiLink, id]
    );

    // hapus file lama di Cloudinary kalau bukti diganti/dihapus (beda dari driveService lama yang gak pernah cleanup)
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
      `SELECT l.* FROM logbook l JOIN pengajuan p ON p.id = l.pengajuan_id WHERE l.id = ? AND p.mahasiswa_id = ?`,
      [id, mahasiswa.id]
    );
    if (!logbookRows.length) return res.status(404).json({ message: "Logbook tidak ditemukan." });
    if (!["draft", "disubmit"].includes(logbookRows[0].status)) {
      return res.status(400).json({ message: "Logbook yang sudah diverifikasi tidak bisa dihapus." });
    }

    await db.query("DELETE FROM logbook WHERE id = ?", [id]);

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
       JOIN pengajuan p ON p.id = d.pengajuan_id
       JOIN periode per ON per.id = p.periode_id
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
      return res.status(403).json({ message: "Upload dokumen hanya bisa dilakukan setelah pengajuan disetujui kaprodi." });
    }

    // PERUBAHAN: form_dokumen_buka (gabungan) sudah tidak ada di skema --
    // sudah dipecah jadi form_ppt_buka & form_laporan_buka (lihat
    // periodeCron.js/kaprodiController.js). Kolom lama itu selalu undefined
    // di sini, jadi cek `=== 0` sebelumnya TIDAK PERNAH ke-trigger dan upload
    // dokumen tidak pernah benar-benar diblokir. Sekarang dicek per jenis,
    // plus tanggal_mulai_dokumen (kolom baru) sebagai jaga-jaga di luar toggle.
    const [periodeCheck] = await db.query(
      `SELECT per.form_ppt_buka, per.form_laporan_buka, per.tanggal_mulai_dokumen
       FROM periode per JOIN pengajuan p ON p.periode_id = per.id WHERE p.id = ?`,
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

    const [existing] = await db.query("SELECT id, cloudinary_public_id, status FROM dokumen WHERE pengajuan_id = ? AND jenis = ?", [pengajuan.pengajuan_id, jenis]);

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
         WHERE id=?`,
        [req.file.originalname, uploaded.publicId, uploaded.url, req.file.size, existing[0].id]
      );
      // hapus file lama di Cloudinary biar gak numpuk (beda dari driveService lama)
      await cloudinaryService.deleteFile(existing[0].cloudinary_public_id);
    } else {
      await db.query(
        `INSERT INTO dokumen (id, pengajuan_id, jenis, nama_file, cloudinary_public_id, cloudinary_url, ukuran_file)
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
      `SELECT d.* FROM dokumen d JOIN pengajuan p ON p.id = d.pengajuan_id WHERE d.id = ? AND p.mahasiswa_id = ?`,
      [id, mahasiswa.id]
    );
    if (!dokumen.length) return res.status(404).json({ message: "Dokumen tidak ditemukan." });
    await db.query("DELETE FROM dokumen WHERE id = ?", [id]);
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
      `SELECT d.* FROM dokumen d JOIN pengajuan p ON p.id = d.pengajuan_id WHERE d.id = ? AND p.mahasiswa_id = ?`,
      [id, mahasiswa.id]
    );
    if (!dokumen.length) return res.status(404).json({ message: "Dokumen tidak ditemukan." });
    if (!["revisi_kaprodi", "revisi_dospem"].includes(dokumen[0].status)) {
      return res.status(400).json({ message: "Dokumen ini tidak dalam status revisi." });
    }

    const pengajuan = await getPengajuanDisetujui(mahasiswa.id);

    // BARU: resubmitDokumen sebelumnya tidak cek status buka/tutup periode
    // sama sekali -- disamakan dengan uploadDokumen supaya submit ulang
    // dokumen revisi juga tidak bisa dilakukan saat form ditutup atau sebelum
    // tanggal mulai dokumen periode ini.
    const [periodeCheckResubmit] = await db.query(
      `SELECT per.form_ppt_buka, per.form_laporan_buka, per.tanggal_mulai_dokumen
       FROM periode per JOIN pengajuan p ON p.periode_id = per.id WHERE p.id = ?`,
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
       WHERE id=?`,
      [req.file.originalname, uploaded.publicId, uploaded.url, req.file.size, id]
    );
    // hapus file revisi lama di Cloudinary
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
       JOIN pengajuan p ON p.id = f.pengajuan_id
       JOIN periode per ON per.id = p.periode_id
       JOIN dosen d ON f.dosen_id = d.id
       WHERE p.mahasiswa_id = ?
       ORDER BY f.created_at DESC`,
      [mahasiswa.id]
    );
    await db.query(
      `UPDATE feedback f JOIN pengajuan p ON p.id = f.pengajuan_id SET f.is_read = 1 WHERE p.mahasiswa_id = ?`,
      [mahasiswa.id]
    );
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
       JOIN pengajuan p ON p.id = pn.pengajuan_id
       JOIN periode per ON per.id = p.periode_id
       JOIN dosen d ON pn.dosen_id = d.id
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