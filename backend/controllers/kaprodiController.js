const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const { sendPushToUser } = require("../utils/pushSender");


const getPeriode = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM periode ORDER BY created_at DESC"
    );
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const tambahPeriode = async (req, res) => {
  try {
    const {
      nama_periode, jenis,
      tanggal_mulai, tanggal_selesai,
      min_jam_pengajuan,
      tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
      tanggal_mulai_logbook, tanggal_selesai_logbook,
      tanggal_mulai_dokumen, tanggal_selesai_ppt, tanggal_selesai_laporan,
      is_active,
    } = req.body;

    if (!nama_periode || !jenis) {
      return res.status(400).json({ message: "Nama periode dan jenis wajib diisi." });
    }

    // PENTING: is_active WAJIB diisi eksplisit di sini. Kalau kolom ini
    // dihilangkan dari INSERT, MySQL akan pakai DEFAULT kolom -- dan kalau
    // defaultnya 1, setiap periode baru otomatis jadi aktif tanpa
    // menonaktifkan periode lain (bug lama). Sekarang default eksplisit ke 0,
    // dan hanya diaktifkan lewat langkah terpisah di bawah jika diminta.
    const jadiAktif = Number(is_active) === 1;

    // PERUBAHAN: form_dokumen_buka (gabungan PPT + Laporan) dipecah jadi
    // form_ppt_buka & form_laporan_buka -- keduanya independen, punya
    // tanggal selesai sendiri (tanggal_selesai_ppt / tanggal_selesai_laporan)
    // dan bisa auto-close di waktu yang berbeda (lihat periodeCron.js).
    const [result] = await db.query(
      `INSERT INTO periode (nama_periode, jenis, tanggal_mulai, tanggal_selesai, min_jam_pengajuan,
      tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
      tanggal_mulai_logbook, tanggal_selesai_logbook,
      tanggal_mulai_dokumen, tanggal_selesai_ppt, tanggal_selesai_laporan,
      form_pengajuan_buka, form_logbook_buka, form_ppt_buka, form_laporan_buka, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?)`,
      [
        nama_periode, jenis,
        tanggal_mulai || null, tanggal_selesai || null,
        Number(min_jam_pengajuan) || 48,
        tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
        tanggal_mulai_logbook, tanggal_selesai_logbook,
        tanggal_mulai_dokumen || null, tanggal_selesai_ppt, tanggal_selesai_laporan,
        jadiAktif ? 1 : 0,
      ]
    );

    // Kalau periode baru ini memang diminta jadi aktif, nonaktifkan semua
    // periode lain (berdasarkan id hasil INSERT, bukan nama) supaya invariant
    // "hanya satu periode aktif" tetap terjaga -- aman walau ada nama_periode
    // yang sama persis.
    if (jadiAktif) {
      await db.query(
        "UPDATE periode SET is_active = 0 WHERE id != ?",
        [result.insertId]
      );
    }

    res.status(201).json({ message: "Periode berhasil ditambahkan." });
  } catch (error) {
    console.error("tambahPeriode error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const updatePeriode = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nama_periode, jenis,
      tanggal_mulai, tanggal_selesai,
      min_jam_pengajuan,
      tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
      tanggal_mulai_logbook, tanggal_selesai_logbook,
      tanggal_mulai_dokumen, tanggal_selesai_ppt, tanggal_selesai_laporan,
      form_pengajuan_buka, form_logbook_buka, form_ppt_buka, form_laporan_buka,
      is_active,
    } = req.body;

    const [[lama]] = await db.query("SELECT * FROM periode WHERE id = ?", [id]);
    if (!lama) return res.status(404).json({ message: "Periode tidak ditemukan." });

    const toDateStr = (val) => {
      if (!val) return null;
      const d = new Date(val);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };

    if (Number(is_active) === 1) {
      await db.query("UPDATE periode SET is_active = 0 WHERE id != ?", [id]);
    }

    const today = new Date().toISOString().slice(0, 10);

    const mulaiPengajuanBerubah   = toDateStr(lama.tanggal_mulai_pengajuan)   !== toDateStr(tanggal_mulai_pengajuan);
    // BARU: logbook & dokumen sekarang juga auto-open berdasarkan tanggal
    // mulai masing-masing (lihat periodeCron.js) -- jadi sama seperti
    // mulaiPengajuanBerubah, kalau tanggal mulainya diubah, form terkait
    // ditutup dulu dan auto_opened_..._at di-reset supaya cron bisa
    // membukanya lagi otomatis begitu tanggal barunya tiba.
    const mulaiLogbookBerubah    = toDateStr(lama.tanggal_mulai_logbook)      !== toDateStr(tanggal_mulai_logbook);
    const mulaiDokumenBerubah    = toDateStr(lama.tanggal_mulai_dokumen)      !== toDateStr(tanggal_mulai_dokumen);
    const selesaiPengajuanBerubah = toDateStr(lama.tanggal_selesai_pengajuan) !== toDateStr(tanggal_selesai_pengajuan);
    const selesaiLogbookBerubah   = toDateStr(lama.tanggal_selesai_logbook)   !== toDateStr(tanggal_selesai_logbook);
    const selesaiPptBerubah       = toDateStr(lama.tanggal_selesai_ppt)       !== toDateStr(tanggal_selesai_ppt);
    const selesaiLaporanBerubah   = toDateStr(lama.tanggal_selesai_laporan)   !== toDateStr(tanggal_selesai_laporan);

    const pengajuanSudahLewat = toDateStr(tanggal_selesai_pengajuan) && toDateStr(tanggal_selesai_pengajuan) < today;
    const logbookSudahLewat   = toDateStr(tanggal_selesai_logbook)   && toDateStr(tanggal_selesai_logbook)   < today;
    const pptSudahLewat       = toDateStr(tanggal_selesai_ppt)       && toDateStr(tanggal_selesai_ppt)       < today;
    const laporanSudahLewat   = toDateStr(tanggal_selesai_laporan)   && toDateStr(tanggal_selesai_laporan)   < today;

    let extraClauses = [];

    if (mulaiPengajuanBerubah) {
      extraClauses.push('auto_opened_at = NULL', 'form_pengajuan_buka = 0');
    }

    // BARU
    if (mulaiLogbookBerubah) {
      extraClauses.push('auto_opened_logbook_at = NULL', 'form_logbook_buka = 0');
    }

    // BARU
    if (mulaiDokumenBerubah) {
      extraClauses.push(
        'auto_opened_ppt_at = NULL', 'form_ppt_buka = 0',
        'auto_opened_laporan_at = NULL', 'form_laporan_buka = 0'
      );
    }

    if (selesaiPengajuanBerubah) {
      extraClauses.push('auto_closed_pengajuan_at = NULL', 'manual_open_pengajuan = 0');
      if (pengajuanSudahLewat) {
        extraClauses.push('form_pengajuan_buka = 0', 'auto_closed_pengajuan_at = NOW()');
      } else {
        extraClauses.push('form_pengajuan_buka = 1');
      }
    }

    if (selesaiLogbookBerubah) {
      extraClauses.push('auto_closed_logbook_at = NULL', 'manual_open_logbook = 0');
      if (logbookSudahLewat) {
        extraClauses.push('form_logbook_buka = 0', 'auto_closed_logbook_at = NOW()');
      } else {
        extraClauses.push('form_logbook_buka = 1');
      }
    }

    // PERUBAHAN: dipecah dari blok gabungan (selesaiPptBerubah || selesaiLaporanBerubah)
    // menjadi 2 blok terpisah -- PPT dan Laporan Akhir sekarang punya form,
    // status auto_closed, dan manual_open masing-masing sendiri.
    if (selesaiPptBerubah) {
      extraClauses.push('auto_closed_ppt_at = NULL', 'manual_open_ppt = 0');
      if (pptSudahLewat) {
        extraClauses.push('form_ppt_buka = 0', 'auto_closed_ppt_at = NOW()');
      } else {
        extraClauses.push('form_ppt_buka = 1');
      }
    }

    if (selesaiLaporanBerubah) {
      extraClauses.push('auto_closed_laporan_at = NULL', 'manual_open_laporan = 0');
      if (laporanSudahLewat) {
        extraClauses.push('form_laporan_buka = 0', 'auto_closed_laporan_at = NOW()');
      } else {
        extraClauses.push('form_laporan_buka = 1');
      }
    }

    const extraSQL = extraClauses.length ? ', ' + extraClauses.join(', ') : '';

    await db.query(
      `UPDATE periode SET
        nama_periode=?, jenis=?,
        tanggal_mulai=?, tanggal_selesai=?, min_jam_pengajuan=?,
        tanggal_mulai_pengajuan=?, tanggal_selesai_pengajuan=?,
        tanggal_mulai_logbook=?, tanggal_selesai_logbook=?,
        tanggal_mulai_dokumen=?, tanggal_selesai_ppt=?, tanggal_selesai_laporan=?,
        form_pengajuan_buka=?, form_logbook_buka=?, form_ppt_buka=?, form_laporan_buka=?,
        is_active=?
        ${extraSQL}
      WHERE id=?`,
      [
        nama_periode, jenis,
        tanggal_mulai || null, tanggal_selesai || null, Number(min_jam_pengajuan) || 48,
        tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
        tanggal_mulai_logbook, tanggal_selesai_logbook,
        tanggal_mulai_dokumen || null, tanggal_selesai_ppt, tanggal_selesai_laporan,
        form_pengajuan_buka, form_logbook_buka,
        form_ppt_buka ?? lama.form_ppt_buka, form_laporan_buka ?? lama.form_laporan_buka,
        is_active, id,
      ]
    );

    res.json({ message: "Periode berhasil diupdate." });
  } catch (error) {
    console.error('updatePeriode error:', error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const toggleForm = async (req, res) => {
  try {
    const { id } = req.params;

    const [[periode]] = await db.query(
      `SELECT form_pengajuan_buka, form_logbook_buka, form_ppt_buka, form_laporan_buka,
              tanggal_mulai_pengajuan, tanggal_mulai_logbook, tanggal_mulai_dokumen
       FROM periode WHERE id = ?`,
      [id]
    );
    if (!periode) return res.status(404).json({ message: "Periode tidak ditemukan." });

    // PERUBAHAN: field yang tidak dikirim di body sekarang mempertahankan nilai
    // yang sudah ada di DB (bukan fallback ke 1 lagi) -- sebelumnya toggle
    // pengajuan/logbook saja bisa tidak sengaja membuka kembali form PPT &
    // Laporan karena form_ppt_buka/form_laporan_buka yang tidak dikirim selalu
    // jatuh ke default 1.
    const form_pengajuan_buka = req.body.form_pengajuan_buka ?? periode.form_pengajuan_buka;
    const form_logbook_buka   = req.body.form_logbook_buka   ?? periode.form_logbook_buka;
    const pptVal              = req.body.form_ppt_buka       ?? periode.form_ppt_buka;
    const laporanVal          = req.body.form_laporan_buka   ?? periode.form_laporan_buka;

    const toDateStr = (val) => {
      if (!val) return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    };
    const today = new Date().toISOString().slice(0, 10);
    const mulaiPengajuan = toDateStr(periode.tanggal_mulai_pengajuan);
    const mulaiLogbook   = toDateStr(periode.tanggal_mulai_logbook);
    const mulaiDokumen   = toDateStr(periode.tanggal_mulai_dokumen);

    // BARU: toggle manual ini cuma untuk MEMBUKA KEMBALI form yang sudah
    // auto-close (mis. deadline lewat), bukan untuk membuka lebih awal dari
    // tanggal mulai yang sudah ditetapkan -- itu tugas auto-open di
    // periodeCron.js. Kalau kaprodi coba paksa buka sebelum tanggal mulai,
    // tolak dengan pesan jelas.
    if (form_pengajuan_buka == 1 && mulaiPengajuan && mulaiPengajuan > today) {
      return res.status(400).json({ message: `Form pengajuan belum bisa dibuka -- tanggal mulai pengajuan masih ${mulaiPengajuan}.` });
    }
    if (form_logbook_buka == 1 && mulaiLogbook && mulaiLogbook > today) {
      return res.status(400).json({ message: `Form logbook belum bisa dibuka -- tanggal mulai logbook masih ${mulaiLogbook}.` });
    }
    if (pptVal == 1 && mulaiDokumen && mulaiDokumen > today) {
      return res.status(400).json({ message: `Form PPT belum bisa dibuka -- tanggal mulai dokumen masih ${mulaiDokumen}.` });
    }
    if (laporanVal == 1 && mulaiDokumen && mulaiDokumen > today) {
      return res.status(400).json({ message: `Form Laporan Akhir belum bisa dibuka -- tanggal mulai dokumen masih ${mulaiDokumen}.` });
    }

    const resetFields = [];

    if (form_pengajuan_buka == 1) {
      resetFields.push('auto_closed_pengajuan_at = NULL', 'manual_open_pengajuan = 1');
    } else {
      resetFields.push('manual_open_pengajuan = 0', 'auto_closed_pengajuan_at = COALESCE(auto_closed_pengajuan_at, NOW())');
    }

    if (form_logbook_buka == 1) {
      resetFields.push('auto_closed_logbook_at = NULL', 'manual_open_logbook = 1');
    } else {
      resetFields.push('manual_open_logbook = 0', 'auto_closed_logbook_at = COALESCE(auto_closed_logbook_at, NOW())');
    }

    if (pptVal == 1) {
      resetFields.push('auto_closed_ppt_at = NULL', 'manual_open_ppt = 1');
    } else {
      resetFields.push('manual_open_ppt = 0', 'auto_closed_ppt_at = COALESCE(auto_closed_ppt_at, NOW())');
    }

    if (laporanVal == 1) {
      resetFields.push('auto_closed_laporan_at = NULL', 'manual_open_laporan = 1');
    } else {
      resetFields.push('manual_open_laporan = 0', 'auto_closed_laporan_at = COALESCE(auto_closed_laporan_at, NOW())');
    }

    const resetClause = ', ' + resetFields.join(', ');

    await db.query(
      `UPDATE periode
       SET form_pengajuan_buka=?, form_logbook_buka=?, form_ppt_buka=?, form_laporan_buka=? ${resetClause}
       WHERE id=?`,
      [form_pengajuan_buka, form_logbook_buka, pptVal, laporanVal, id]
    );

    res.json({ message: 'Status form berhasil diubah.' });
  } catch (error) {
    console.error('toggleForm error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

// ========== DAFTAR DOSEN ROSTER MBKM (BARU) ==========
// Sumber dropdown untuk assignDosen di bawah -- BUKAN dosen.is_dosen_pa
// (kolom itu sudah dihapus) dan BUKAN semua dosen master (staffController
// punya getDaftarDosen sendiri untuk itu). Roster hanya daftar dosen yang
// tersedia MBKM di periode_id tertentu; identitas dosen tetap dosen.id.
// periode_id wajib dikirim (kaprodi bisa assign untuk periode yang sedang
// diverifikasi, tidak selalu periode aktif).
const getDosenRosterMBKM = async (req, res) => {
  try {
    const { periode_id } = req.query;
    if (!periode_id) return res.status(400).json({ message: "periode_id wajib diisi." });

    const [rows] = await db.query(
      `SELECT d.id, d.nama
       FROM roster_dosen_mbkm r
       JOIN dosen d ON d.id = r.dosen_id
       WHERE r.periode_id = ?
       ORDER BY d.nama ASC`,
      [periode_id]
    );
    res.json({ data: rows });
  } catch (error) {
    console.error('getDosenRosterMBKM error:', error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== DAFTAR DOSEN ROSTER PA (BARU) ==========
// Sama pola dengan getDosenRosterMBKM di atas, tapi ke roster_dosen_pa.
// periode_id wajib dikirim -- sumber dropdown/listing PA yang benar-benar
// di-scope periode, bukan getDaftarDosen (semua master dosen).
const getDosenRosterPA = async (req, res) => {
  try {
    const { periode_id } = req.query;
    if (!periode_id) return res.status(400).json({ message: "periode_id wajib diisi." });

    const [rows] = await db.query(
      `SELECT d.id, d.nama
       FROM roster_dosen_pa r
       JOIN dosen d ON d.id = r.dosen_id
       WHERE r.periode_id = ?
       ORDER BY d.nama ASC`,
      [periode_id]
    );
    res.json({ data: rows });
  } catch (error) {
    console.error('getDosenRosterPA error:', error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== ASSIGN DOSEN ==========
// PERUBAHAN: `bimbingan` sekarang keyed ke `pengajuan_id`, bukan
// mahasiswa_id+periode_id -> harus cari pengajuan_id dulu.
// TIDAK ADA integrasi storage file di sini sama sekali -- dosen akses
// logbook/dokumentasi/PPT/laporan lewat aplikasi e-MBKM (query DB biasa),
// bukan lewat share folder di storage backend. Ini sekaligus alasan kenapa
// gak ada penggantian "grant/revoke access" versi Cloudinary: Cloudinary
// gak punya konsep share-per-folder kayak Drive, dan memang gak dibutuhkan.
//
// BARU: dosen yang boleh di-assign HARUS terdaftar di roster_dosen_mbkm
// untuk periode_id ini. Roster bukan relasi pembimbing -- cuma daftar dosen
// yang tersedia -- jadi validasi ini dilakukan sebelum menyentuh `bimbingan`
// sama sekali, dan `bimbingan.dosen_id` tetap mengarah ke `dosen.id` seperti
// sebelumnya.

const assignDosen = async (req, res) => {
  try {
    const { mahasiswa_id, dosen_id, periode_id } = req.body;

    if (!mahasiswa_id || !dosen_id || !periode_id) {
      return res.status(400).json({ message: "mahasiswa_id, dosen_id, dan periode_id wajib diisi." });
    }

    const [pengajuanRows] = await db.query(
      `SELECT id FROM pengajuan WHERE mahasiswa_id = ? AND periode_id = ?`,
      [mahasiswa_id, periode_id]
    );
    if (!pengajuanRows.length) {
      return res.status(404).json({ message: "Pengajuan mahasiswa ini di periode tersebut tidak ditemukan." });
    }
    const pengajuanId = pengajuanRows[0].id;

    const [dosenRows] = await db.query("SELECT id, email FROM dosen WHERE id = ?", [dosen_id]);
    if (!dosenRows.length) {
      return res.status(404).json({ message: "Dosen tidak ditemukan." });
    }

    const [rosterRows] = await db.query(
      `SELECT id FROM roster_dosen_mbkm WHERE dosen_id = ? AND periode_id = ?`,
      [dosen_id, periode_id]
    );
    if (!rosterRows.length) {
      return res.status(400).json({ message: "Dosen ini tidak terdaftar di roster MBKM periode tersebut." });
    }

    const [existing] = await db.query(
      `SELECT b.id, b.dosen_id AS dosen_lama_id
       FROM bimbingan b
       WHERE b.pengajuan_id = ?`,
      [pengajuanId]
    );

    if (existing.length > 0) {
      await db.query("UPDATE bimbingan SET dosen_id = ? WHERE pengajuan_id = ?", [dosen_id, pengajuanId]);
    } else {
      await db.query(
        "INSERT INTO bimbingan (id, dosen_id, pengajuan_id) VALUES (?, ?, ?)",
        [uuidv4(), dosen_id, pengajuanId]
      );
    }

    res.json({ message: "Dosen pembimbing berhasil di-assign." });
  } catch (error) {
    console.error('assignDosen error:', error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};


const getVerifikasiPengajuan = async (req, res) => {
  try {
    let periode_id = req.query.periode_id || null;

    if (!periode_id) {
      const [[periodeRow]] = await db.query(
        `SELECT id, nama_periode FROM periode WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1`
      );
      if (!periodeRow) return res.json({ data: [] });
      periode_id = periodeRow.id;
    }

    const [rows] = await db.query(
      `SELECT
        p.id, p.mahasiswa_id, p.periode_id, p.status,
        p.catatan_dosen, p.catatan_kaprodi,
        p.created_at, p.updated_at, p.archived_at, p.archived_by,
        dp.pelatihan, dp.judul, dp.penyelenggara, dp.waktu_studi_independen, dp.deskripsi,
        dp.lokasi, dp.tanggal_mulai, dp.tanggal_selesai,
        m.nim, m.nama as nama_mahasiswa, m.email,
        dpa.nama as dosen_pembimbing_akademik
       FROM pengajuan p
       JOIN mahasiswa m ON p.mahasiswa_id = m.id
       LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id
       LEFT JOIN dosen dpa ON dpa.id = m.dosen_pembimbing_akademik_id
       WHERE p.periode_id = ?
       ORDER BY p.created_at DESC`,
      [periode_id]
    );

    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// PERUBAHAN: gak ada lagi langkah "bikin struktur folder" di sini -- Cloudinary
// otomatis bikin folder dari path string pas file pertama diupload (lihat
// cloudinaryService.js), jadi gak perlu idempotent-create + simpan folder id
// kayak versi Drive dulu.

const verifikasiPengajuan = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, catatan_kaprodi } = req.body;

    if (!["disetujui_kaprodi", "ditolak", "revisi"].includes(status)) {
      return res.status(400).json({ message: "Status tidak valid." });
    }

    await db.query(
      "UPDATE pengajuan SET status = ?, catatan_kaprodi = ? WHERE id = ?",
      [status, catatan_kaprodi, id]
    );

    const [pengajuan] = await db.query(
      `SELECT p.mahasiswa_id, m.user_id, m.nim, m.nama
       FROM pengajuan p JOIN mahasiswa m ON p.mahasiswa_id = m.id WHERE p.id = ?`,
      [id]
    );

    if (pengajuan.length > 0) {
      const pj = pengajuan[0];

      const pesan =
        status === "disetujui_kaprodi"
          ? "Pengajuan capstone kamu telah disetujui oleh Kaprodi."
          : status === "revisi"
          ? `Pengajuan capstone kamu perlu direvisi. Catatan: ${catatan_kaprodi}`
          : `Pengajuan capstone kamu ditolak. Catatan: ${catatan_kaprodi}`;

      await db.query(
        "INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
        [
          uuidv4(), pj.user_id,
          "Status Pengajuan Capstone", pesan,
          status === "disetujui_kaprodi" ? "sukses" : "peringatan",
        ]
      );

      if (status === "disetujui_kaprodi") {
        await sendPushToUser(pj.user_id, {
          title: "Pengajuan Disetujui",
          body: pesan,
          url: "/mahasiswa/pengajuan",
        });
      }
    }

    res.json({ message: "Status pengajuan berhasil diupdate." });
  } catch (error) {
    console.error("verifikasiPengajuan error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// PERUBAHAN: cukup hapus notifikasi + pengajuan; cascade otomatis membereskan
// detail_pengajuan, logbook, dokumen, bimbingan, feedback, penilaian.

const hapusPengajuan = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;

    const [pengajuan] = await conn.query(
      "SELECT * FROM pengajuan WHERE id = ?", [id]
    );
    if (!pengajuan.length) {
      conn.release();
      return res.status(404).json({ message: "Pengajuan tidak ditemukan." });
    }

    await conn.beginTransaction();
    await conn.query(
      "DELETE FROM notifikasi WHERE user_id IN (SELECT user_id FROM mahasiswa WHERE id = ?)",
      [pengajuan[0].mahasiswa_id]
    );
    // detail_pengajuan, logbook, dokumen, bimbingan, feedback, penilaian
    // otomatis terhapus lewat ON DELETE CASCADE (semua nempel ke pengajuan_id)
    await conn.query("DELETE FROM pengajuan WHERE id = ?", [id]);

    await conn.commit();
    res.json({ message: "Pengajuan berhasil dihapus." });
  } catch (error) {
    await conn.rollback();
    console.error("hapusPengajuan error:", error);
    res.status(500).json({ message: "Gagal menghapus pengajuan.", detail: error.message });
  } finally {
    conn.release();
  }
};

// PERUBAHAN: dokumen tidak lagi punya mahasiswa_id -> ambil lewat join pengajuan.

const verifikasiDokumen = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, feedback } = req.body;
    const validStatus = ["revisi_kaprodi", "disetujui_kaprodi"];
    if (!validStatus.includes(status))
      return res.status(400).json({ message: "Status tidak valid." });

    const [dok] = await db.query(
      `SELECT d.*, p.mahasiswa_id
       FROM dokumen d JOIN pengajuan p ON p.id = d.pengajuan_id
       WHERE d.id = ?`,
      [id]
    );
    if (!dok.length)
      return res.status(404).json({ message: "Dokumen tidak ditemukan." });

    if (dok[0].jenis !== 'laporan_akhir') {
      return res.status(403).json({ message: "Kaprodi hanya dapat memverifikasi Laporan Akhir." });
    }

    // PERUBAHAN: urutan verifikasi laporan akhir sekarang Dospem DULU,
    // baru Kaprodi. Kaprodi hanya boleh bertindak setelah Dospem
    // menyatakan disetujui_dospem.
    if (dok[0].status !== 'disetujui_dospem') {
      return res.status(400).json({ message: "Laporan Akhir harus disetujui Dosen Pembimbing terlebih dahulu sebelum dapat diverifikasi Kaprodi." });
    }

    // Kaprodi adalah tahap verifikasi terakhir: approve = final (diverifikasi).
    const statusAkhir = status === "disetujui_kaprodi" ? "diverifikasi" : status;

    await db.query(
      `UPDATE dokumen SET status=?, feedback_kaprodi=?, verified_kaprodi_by=?, verified_kaprodi_at=NOW() WHERE id=?`,
      [statusAkhir, feedback || null, req.user.id, id]
    );

    const [mhsData] = await db.query(
      `SELECT m.user_id FROM mahasiswa m WHERE m.id = ?`,
      [dok[0].mahasiswa_id]
    );
    if (mhsData.length) {
      const pesan = statusAkhir === "diverifikasi"
        ? "Laporan Akhir kamu telah diverifikasi oleh Dosen Pembimbing dan Kaprodi."
        : `Laporan Akhir kamu perlu direvisi oleh Kaprodi. Catatan: ${feedback || "-"}`;
      await db.query(
        "INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
        [uuidv4(), mhsData[0].user_id, "Status Dokumen", pesan,
          statusAkhir === "diverifikasi" ? "sukses" : "peringatan"]
      );
    }

    res.json({ message: "Status dokumen berhasil diupdate." });
  } catch (error) {
    console.error("verifikasiDokumen kaprodi error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// PERUBAHAN: dokumen & logbook di-join lewat pengajuan (bukan mahasiswa_id
// langsung), dan SUM(lb.jam) -> SUM(lb.durasi_menit)/60 karena kolom `jam`
// sudah tidak dipakai lagi (nunggu di-drop di migration step 2).
//
// PERUBAHAN (kolom Nilai di tabel Monitoring): ditambahkan scalar subquery
// nilai_akhir dari `penilaian`, DIBATASI `finalized_at IS NOT NULL` (nilai
// draft dosen tidak boleh bocor ke Kaprodi/Staff sebelum difinalisasi).
// Sengaja pakai subquery (bukan LEFT JOIN penilaian) supaya konsisten dengan
// pola total_jam_terverifikasi di bawah -- LEFT JOIN penilaian akan ikut
// dikalikan oleh cross join dokumen+logbook yang sudah ada di query ini
// (makanya kolom dokumen juga pakai MAX(CASE...) untuk menghindari duplikasi
// baris), jadi subquery scalar lebih aman & tidak mengubah jumlah baris.

const getMonitoringDokumen = async (req, res) => {
  try {
    const { periode_id } = req.query;
    const [rows] = await db.query(
      `SELECT m.nim, m.nama,
        p.id as pengajuan_id,
        p.status as status_pengajuan,
        COUNT(DISTINCT l.id) as jumlah_logbook,
        COALESCE((
          SELECT SUM(lb.durasi_menit) / 60 FROM logbook lb
          WHERE lb.pengajuan_id = p.id AND lb.status = 'diverifikasi'
        ), 0) as total_jam_terverifikasi,
        (
          SELECT pn.nilai_akhir FROM penilaian pn
          WHERE pn.pengajuan_id = p.id AND pn.finalized_at IS NOT NULL
          LIMIT 1
        ) as nilai_akhir,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.status END) as status_laporan,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.status END) as status_ppt,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.id END) as laporan_id,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.cloudinary_url END) as laporan_path,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.nama_file END) as laporan_nama,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.id END) as ppt_id,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.cloudinary_url END) as ppt_path,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.nama_file END) as ppt_nama
      FROM mahasiswa m
      INNER JOIN pengajuan p ON m.id = p.mahasiswa_id AND p.periode_id = ?
      LEFT JOIN dokumen dok ON dok.pengajuan_id = p.id
      LEFT JOIN logbook l ON l.pengajuan_id = p.id
      GROUP BY m.id, m.nim, m.nama, p.id, p.status
      ORDER BY m.nama ASC`,
      [periode_id]
    );

    const formatted = rows.map((r) => ({
      nim: r.nim,
      nama: r.nama,
      pengajuan_id: r.pengajuan_id,
      status_pengajuan: r.status_pengajuan,
      jumlah_logbook: r.jumlah_logbook,
      total_jam_terverifikasi: r.total_jam_terverifikasi,
      nilai_akhir: r.nilai_akhir,
      status_laporan: r.status_laporan,
      status_ppt: r.status_ppt,
      dokumen_laporan: r.laporan_id ? {
        id: r.laporan_id, cloudinary_url: r.laporan_path,
        nama_file: r.laporan_nama, status: r.status_laporan,
      } : null,
      dokumen_ppt: r.ppt_id ? {
        id: r.ppt_id, cloudinary_url: r.ppt_path,
        nama_file: r.ppt_nama, status: r.status_ppt,
      } : null,
    }));

    res.json({ data: formatted });
  } catch (error) {
    console.error("getMonitoringDokumen error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== DASHBOARD STATS ==========
// PERUBAHAN: `pengajuan_capstone` (sudah di-drop) -> `pengajuan`.
//
// PERUBAHAN (Total Dosen): dulu COUNT(*) dari tabel `dosen` (semua master
// data dosen, tanpa scope periode). Sekarang di-scope ke roster_dosen_mbkm
// pada periode_id yang sedang dipakai (COUNT DISTINCT dosen_id), supaya
// konsisten dengan pola yang sama di staffController.getDashboardStats
// (di sana disebut "Total Pembimbing MBKM"). periode_id di titik ini sudah
// pasti ke-resolve (dari query string atau fallback periode aktif/terbaru
// di blok if/else di atas), jadi tidak perlu helper _getPeriodeAktifId
// terpisah seperti di staffController.
//
// PERUBAHAN (Total Mahasiswa): dulu COUNT(DISTINCT m.id) dari
// INNER JOIN pengajuan -- ini cuma menghitung mahasiswa yang SUDAH SUBMIT
// pengajuan di periode itu, bukan semua mahasiswa yang berhak ikut MBKM
// periode itu (roster). Sekarang disamakan dengan pola getDaftarMahasiswa
// (staffController) & getDashboardStats (staffController): di-scope ke
// roster_mahasiswa_mbkm, supaya angka di dashboard konsisten dengan yang
// tampil di halaman Data Mahasiswa.
const getDashboardStats = async (req, res) => {
  try {
    let periode_id = req.query.periode_id || null;
    let nama_periode;

    if (!periode_id) {
      const [[periodeRow]] = await db.query(
        `SELECT id, nama_periode
         FROM periode
         ORDER BY is_active DESC, created_at DESC
         LIMIT 1`
      );

      if (!periodeRow) {
        return res.json({
          data: {
            total_mahasiswa: 0,
            total_dosen: 0,
            total_pengajuan: 0,
            dokumen_lengkap: 0,
            periode_aktif: null,
          },
        });
      }

      periode_id = periodeRow.id;
      nama_periode = periodeRow.nama_periode;
    } else {
      const [[periodeRow]] = await db.query(
        "SELECT nama_periode FROM periode WHERE id = ?",
        [periode_id]
      );
      nama_periode = periodeRow?.nama_periode || "";
    }

    const [[{ total_mahasiswa }]] = await db.query(
      `SELECT COUNT(DISTINCT r.mahasiswa_id) AS total_mahasiswa
       FROM roster_mahasiswa_mbkm r
       WHERE r.periode_id = ?`,
      [periode_id]
    );

    const [[{ total_dosen }]] = await db.query(
      `SELECT COUNT(DISTINCT dosen_id) AS total_dosen
       FROM roster_dosen_mbkm
       WHERE periode_id = ?`,
      [periode_id]
    );

    const [[{ total_pengajuan }]] = await db.query(
      "SELECT COUNT(*) AS total_pengajuan FROM pengajuan WHERE periode_id = ?",
      [periode_id]
    );

    // Ambil min_jam_pengajuan periode ini dulu
    const [[periodeInfo]] = await db.query(
      "SELECT min_jam_pengajuan FROM periode WHERE id = ?",
      [periode_id]
    );
    const minJam = periodeInfo?.min_jam_pengajuan || 48;

    const [[{ dokumen_lengkap }]] = await db.query(
      `SELECT COUNT(*) AS dokumen_lengkap
       FROM (
         SELECT dok.pengajuan_id
         FROM dokumen dok
         JOIN pengajuan p ON p.id = dok.pengajuan_id
         WHERE p.periode_id = ?
         GROUP BY dok.pengajuan_id
         HAVING SUM(CASE WHEN dok.jenis = 'laporan_akhir' AND dok.status = 'diverifikasi' THEN 1 ELSE 0 END) > 0
            AND SUM(dok.jenis = 'ppt') > 0
            AND COALESCE((
              SELECT SUM(lb.durasi_menit) / 60 FROM logbook lb
              WHERE lb.pengajuan_id = dok.pengajuan_id AND lb.status = 'diverifikasi'
            ), 0) >= ?
       ) AS lengkap`,
      [periode_id, minJam]
    );

    res.json({
      data: {
        total_mahasiswa,
        total_dosen,
        total_pengajuan,
        dokumen_lengkap,
        periode_id,
        nama_periode,
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== PENGAJUAN UNTUK ASSIGN DOSEN ==========
// PERUBAHAN: bimbingan join lewat pengajuan_id (bukan mahasiswa_id+periode_id).

const getPengajuanDisetujui = async (req, res) => {
  try {
    const { periode_id } = req.query;
    const params = [];
    let whereClause = `WHERE p.status = 'disetujui_kaprodi'`;

    if (periode_id) {
      whereClause += ` AND p.periode_id = ?`;
      params.push(periode_id);
    }

    const [rows] = await db.query(
      `SELECT p.id, p.mahasiswa_id, p.status, p.periode_id, dp.pelatihan,
        m.nim, m.nama, m.program_studi,
        b.dosen_id, d.nama AS nama_dosen
      FROM pengajuan p
      JOIN mahasiswa m ON p.mahasiswa_id = m.id
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id
      LEFT JOIN bimbingan b ON b.pengajuan_id = p.id
      LEFT JOIN dosen d ON b.dosen_id = d.id
      ${whereClause}
      ORDER BY m.nama ASC`,
      params
    );

    rows.forEach((r) => {
      try {
        const raw = r.pelatihan;
        if (!raw) { r.pelatihan = []; return; }
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && (parsed.length === 0 || typeof parsed[0] === "string")) {
          r.pelatihan = parsed; return;
        }
        if (Array.isArray(parsed) && typeof parsed[0] === "object") {
          r.pelatihan = parsed.map((p) => p.judul_pelatihan || p.judul || p.nama || p.title || JSON.stringify(p));
          return;
        }
        if (typeof parsed === "string") { r.pelatihan = [parsed]; return; }
        r.pelatihan = [];
      } catch {
        r.pelatihan = r.pelatihan ? [String(r.pelatihan)] : [];
      }
    });

    res.json({ data: rows });
  } catch (error) {
    console.error("getPengajuanDisetujui error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== REKAP NILAI ==========
// Cuma nilai yang sudah difinalisasi dosen (finalized_at IS NOT NULL) yang
// boleh tampil ke Kaprodi -- sebelum final, nilai masih draft dan cuma dosen
// pembimbing yang boleh lihat/ubah.

const getRekapNilai = async (req, res) => {
  try {
    const { periode_id } = req.query;
    const params = [];
    let where = "WHERE pn.finalized_at IS NOT NULL";
    if (periode_id) {
      where += " AND p.periode_id = ?";
      params.push(periode_id);
    }

    const [rows] = await db.query(
      `SELECT
        pn.id, pn.pengajuan_id, pn.finalized_at,
        pn.nilai_kesesuaian, pn.nilai_proyek, pn.nilai_evaluasi,
        pn.nilai_laporan, pn.nilai_presentasi, pn.nilai_akhir, pn.grade, pn.catatan,
        m.nim, m.nama, m.program_studi,
        per.nama_periode,
        d.nama as nama_dosen
      FROM penilaian pn
      JOIN pengajuan p ON p.id = pn.pengajuan_id
      JOIN mahasiswa m ON p.mahasiswa_id = m.id
      JOIN periode per ON p.periode_id = per.id
      LEFT JOIN dosen d ON d.id = pn.dosen_id
      ${where}
      ORDER BY m.nama ASC`,
      params
    );

    res.json({ data: rows });
  } catch (error) {
    console.error("getRekapNilai error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== DETAIL MONITORING (BARU) ==========
// Data lengkap 1 mahasiswa untuk tombol "Lihat" di halaman Monitoring:
// info mahasiswa, progress (pengajuan/logbook/dokumen), seluruh entri
// logbook milik pengajuan ini saja, dan nilai_akhir (kalau sudah final).
// Tidak menyentuh/duplikasi getMonitoringDokumen (list tetap seperti semula).

const getDetailMonitoring = async (req, res) => {
  try {
    const { pengajuan_id } = req.params;

    const [info] = await db.query(
      `SELECT
        m.nim, m.nama, m.email,
        p.id as pengajuan_id, p.status as status_pengajuan, p.periode_id,
        dp.judul as program_mbkm, dp.penyelenggara as instansi,
        d.nama as dosen_pembimbing
      FROM pengajuan p
      JOIN mahasiswa m ON m.id = p.mahasiswa_id
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id
      LEFT JOIN bimbingan b ON b.pengajuan_id = p.id
      LEFT JOIN dosen d ON d.id = b.dosen_id
      WHERE p.id = ?`,
      [pengajuan_id]
    );
    if (!info.length) return res.status(404).json({ message: "Pengajuan tidak ditemukan." });

    const [logbook] = await db.query(
      `SELECT l.id, l.tanggal, l.jam_mulai, l.jam_selesai, l.kegiatan, l.durasi_menit, l.status, l.bukti_link, l.cloudinary_public_id, pl.nama AS nama_pelatihan
       FROM logbook l
       LEFT JOIN pelatihan pl ON pl.id = l.pelatihan_id
       WHERE l.pengajuan_id = ? ORDER BY l.tanggal DESC`,
      [pengajuan_id]
    );

    const [dokumen] = await db.query(
      `SELECT id, jenis, nama_file, cloudinary_url, status FROM dokumen WHERE pengajuan_id = ?`,
      [pengajuan_id]
    );
    const dokumenLaporan = dokumen.find(d => d.jenis === "laporan_akhir") || null;
    const dokumenPpt = dokumen.find(d => d.jenis === "ppt") || null;

    const [nilai] = await db.query(
      `SELECT nilai_akhir FROM penilaian WHERE pengajuan_id = ? AND finalized_at IS NOT NULL`,
      [pengajuan_id]
    );

    res.json({
      data: {
        ...info[0],
        jumlah_logbook: logbook.length,
        logbook,
        dokumen_laporan: dokumenLaporan,
        dokumen_ppt: dokumenPpt,
        nilai_akhir: nilai.length ? nilai[0].nilai_akhir : null,
      },
    });
  } catch (error) {
    console.error("getDetailMonitoring error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

module.exports = {
  getPeriode, tambahPeriode, updatePeriode, toggleForm,
  getDosenRosterMBKM,
   getDosenRosterPA,
  assignDosen,
  getVerifikasiPengajuan, verifikasiPengajuan, hapusPengajuan,
  verifikasiDokumen, getMonitoringDokumen, getDetailMonitoring, getDashboardStats, getPengajuanDisetujui,
  getRekapNilai,
};