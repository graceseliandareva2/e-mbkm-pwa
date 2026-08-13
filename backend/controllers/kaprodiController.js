const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const { sendPushToUser } = require("../utils/pushSender");

const enforceRentangCap = async (periodeId = null) => {
  const params = [];
  let where = "tanggal_selesai IS NOT NULL AND tanggal_selesai < CURDATE()";
  if (periodeId) {
    where += " AND id_periode = ?";
    params.push(periodeId);
  }
  await db.query(
    `UPDATE periode SET
      form_pengajuan_buka = IF(manual_open_pengajuan = 1, form_pengajuan_buka, 0),
      auto_closed_pengajuan_at = IF(manual_open_pengajuan = 1, auto_closed_pengajuan_at, COALESCE(auto_closed_pengajuan_at, NOW())),
      form_logbook_buka = IF(manual_open_logbook = 1, form_logbook_buka, 0),
      auto_closed_logbook_at = IF(manual_open_logbook = 1, auto_closed_logbook_at, COALESCE(auto_closed_logbook_at, NOW())),
      form_ppt_buka = IF(manual_open_ppt = 1, form_ppt_buka, 0),
      auto_closed_ppt_at = IF(manual_open_ppt = 1, auto_closed_ppt_at, COALESCE(auto_closed_ppt_at, NOW())),
      form_laporan_buka = IF(manual_open_laporan = 1, form_laporan_buka, 0),
      auto_closed_laporan_at = IF(manual_open_laporan = 1, auto_closed_laporan_at, COALESCE(auto_closed_laporan_at, NOW()))
     WHERE ${where}`,
    params
  );
};

const getPeriode = async (req, res) => {
  try {
    await enforceRentangCap();
    const [rows] = await db.query("SELECT *, id_periode AS id FROM periode ORDER BY created_at DESC");
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const tambahPeriode = async (req, res) => {
  try {
    const {
      nama_periode,
      tanggal_mulai, tanggal_selesai,
      min_jam_pengajuan,
      tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
      tanggal_mulai_logbook, tanggal_selesai_logbook,
      tanggal_mulai_dokumen,
      tanggal_selesai_ppt, tanggal_selesai_laporan,
      is_active,
    } = req.body;

    if (!nama_periode) {
      return res.status(400).json({ message: "Nama periode wajib diisi." });
    }
    if (!tanggal_mulai || !tanggal_selesai) {
      return res.status(400).json({ message: "Tanggal mulai dan tanggal selesai periode wajib diisi." });
    }
    const jadiAktif = Number(is_active) === 1;

    const [result] = await db.query(
      `INSERT INTO periode (nama_periode, tanggal_mulai, tanggal_selesai, min_jam_pengajuan,
      tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
      tanggal_mulai_logbook, tanggal_selesai_logbook,
      tanggal_mulai_dokumen, tanggal_selesai_ppt, tanggal_selesai_laporan,
      form_pengajuan_buka, form_logbook_buka, form_ppt_buka, form_laporan_buka, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?)`,
      [
        nama_periode,
        tanggal_mulai || null, tanggal_selesai || null,
        Number(min_jam_pengajuan) || 0,
        tanggal_mulai_pengajuan || null, tanggal_selesai_pengajuan || null,
        tanggal_mulai_logbook || null, tanggal_selesai_logbook || null,
        tanggal_mulai_dokumen || null, tanggal_selesai_ppt || null, tanggal_selesai_laporan || null,
        jadiAktif ? 1 : 0,
      ]
    );
    if (jadiAktif) {
      await db.query("UPDATE periode SET is_active = 0 WHERE id_periode != ?", [result.insertId]);
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
      nama_periode,
      tanggal_mulai, tanggal_selesai,
      min_jam_pengajuan,
      tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
      tanggal_mulai_logbook, tanggal_selesai_logbook,
      tanggal_mulai_dokumen,
      tanggal_selesai_ppt, tanggal_selesai_laporan,
      form_pengajuan_buka, form_logbook_buka, form_ppt_buka, form_laporan_buka,
      is_active,
    } = req.body;

    const [[lama]] = await db.query("SELECT * FROM periode WHERE id_periode = ?", [id]);
    if (!lama) return res.status(404).json({ message: "Periode tidak ditemukan." });

    const toDateStr = (val) => {
      if (!val) return null;
      const d = new Date(val);
      if (isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    };

    if (Number(is_active) === 1) {
      await db.query("UPDATE periode SET is_active = 0 WHERE id_periode != ?", [id]);
    }

    const today = new Date().toISOString().slice(0, 10);

    const mulaiPengajuanBerubah    = toDateStr(lama.tanggal_mulai_pengajuan)  !== toDateStr(tanggal_mulai_pengajuan);
    const mulaiLogbookBerubah      = toDateStr(lama.tanggal_mulai_logbook)    !== toDateStr(tanggal_mulai_logbook);
    // satu kolom gabungan -- perubahannya reset status buka PPT & Laporan sekaligus.
    const mulaiDokumenBerubah      = toDateStr(lama.tanggal_mulai_dokumen)    !== toDateStr(tanggal_mulai_dokumen);
    const selesaiPengajuanBerubah  = toDateStr(lama.tanggal_selesai_pengajuan) !== toDateStr(tanggal_selesai_pengajuan);
    const selesaiLogbookBerubah    = toDateStr(lama.tanggal_selesai_logbook)   !== toDateStr(tanggal_selesai_logbook);
    const selesaiPptBerubah        = toDateStr(lama.tanggal_selesai_ppt)       !== toDateStr(tanggal_selesai_ppt);
    const selesaiLaporanBerubah    = toDateStr(lama.tanggal_selesai_laporan)   !== toDateStr(tanggal_selesai_laporan);

    const pengajuanSudahLewat = toDateStr(tanggal_selesai_pengajuan) && toDateStr(tanggal_selesai_pengajuan) < today;
    const logbookSudahLewat   = toDateStr(tanggal_selesai_logbook)   && toDateStr(tanggal_selesai_logbook)   < today;
    const pptSudahLewat       = toDateStr(tanggal_selesai_ppt)       && toDateStr(tanggal_selesai_ppt)       < today;
    const laporanSudahLewat   = toDateStr(tanggal_selesai_laporan)   && toDateStr(tanggal_selesai_laporan)   < today;

    let extraClauses = [];

    if (mulaiPengajuanBerubah) {
      extraClauses.push('auto_opened_at = NULL', 'form_pengajuan_buka = 0');
    }
    if (mulaiLogbookBerubah) {
      extraClauses.push('auto_opened_logbook_at = NULL', 'form_logbook_buka = 0');
    }
    if (mulaiDokumenBerubah) {
      extraClauses.push('auto_opened_ppt_at = NULL', 'form_ppt_buka = 0');
      extraClauses.push('auto_opened_laporan_at = NULL', 'form_laporan_buka = 0');
    }

    if (selesaiPengajuanBerubah) {
      extraClauses.push('auto_closed_pengajuan_at = NULL', 'manual_open_pengajuan = 0');
      extraClauses.push(pengajuanSudahLewat
        ? "form_pengajuan_buka = 0, auto_closed_pengajuan_at = NOW()"
        : "form_pengajuan_buka = 1");
    }
    if (selesaiLogbookBerubah) {
      extraClauses.push('auto_closed_logbook_at = NULL', 'manual_open_logbook = 0');
      extraClauses.push(logbookSudahLewat
        ? "form_logbook_buka = 0, auto_closed_logbook_at = NOW()"
        : "form_logbook_buka = 1");
    }
    if (selesaiPptBerubah) {
      extraClauses.push('auto_closed_ppt_at = NULL', 'manual_open_ppt = 0');
      extraClauses.push(pptSudahLewat
        ? "form_ppt_buka = 0, auto_closed_ppt_at = NOW()"
        : "form_ppt_buka = 1");
    }
    if (selesaiLaporanBerubah) {
      extraClauses.push('auto_closed_laporan_at = NULL', 'manual_open_laporan = 0');
      extraClauses.push(laporanSudahLewat
        ? "form_laporan_buka = 0, auto_closed_laporan_at = NOW()"
        : "form_laporan_buka = 1");
    }

    const extraSQL = extraClauses.length ? ', ' + extraClauses.join(', ') : '';

    await db.query(
      `UPDATE periode SET
        nama_periode=?,
        tanggal_mulai=?, tanggal_selesai=?, min_jam_pengajuan=?,
        tanggal_mulai_pengajuan=?, tanggal_selesai_pengajuan=?,
        tanggal_mulai_logbook=?, tanggal_selesai_logbook=?,
        tanggal_mulai_dokumen=?, tanggal_selesai_ppt=?, tanggal_selesai_laporan=?,
        form_pengajuan_buka=?, form_logbook_buka=?, form_ppt_buka=?, form_laporan_buka=?,
        is_active=?
        ${extraSQL}
      WHERE id_periode=?`,
      [
        nama_periode,
        tanggal_mulai || null, tanggal_selesai || null, Number(min_jam_pengajuan) || 0,
        tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
        tanggal_mulai_logbook, tanggal_selesai_logbook,
        tanggal_mulai_dokumen || null, tanggal_selesai_ppt, tanggal_selesai_laporan,
        form_pengajuan_buka, form_logbook_buka,
        form_ppt_buka ?? lama.form_ppt_buka, form_laporan_buka ?? lama.form_laporan_buka,
        is_active, id,
      ]
    );

    await enforceRentangCap(id);

    res.json({ message: "Periode berhasil diupdate." });
  } catch (error) {
    console.error('updatePeriode error:', error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const toggleForm = async (req, res) => {
  try {
    const { id } = req.params;
    await enforceRentangCap(id);

    const [[periode]] = await db.query(
      `SELECT form_pengajuan_buka, form_logbook_buka, form_ppt_buka, form_laporan_buka,
              tanggal_mulai_pengajuan, tanggal_mulai_logbook, tanggal_mulai_dokumen
       FROM periode WHERE id_periode = ?`,
      [id]
    );
    if (!periode) return res.status(404).json({ message: "Periode tidak ditemukan." });
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
    const mulaiDokumen   = toDateStr(periode.tanggal_mulai_dokumen); // shared: PPT & Laporan

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
       WHERE id_periode=?`,
      [form_pengajuan_buka, form_logbook_buka, pptVal, laporanVal, id]
    );

    res.json({ message: 'Status form berhasil diubah.' });
  } catch (error) {
    console.error('toggleForm error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

// roster_dosen_mbkm & roster_dosen_pa sudah dihapus -- keduanya sekarang sumbernya sama:
// users yang di-import untuk periode tsb (current_periode_id). Kedua endpoint di bawah
// sekarang identik -- dipertahankan sebagai 2 fungsi biar route lama gak perlu diubah,
// tapi worth dipertimbangkan buat digabung jadi satu endpoint aja ke depannya.
const getDosenRosterMBKM = async (req, res) => {
  try {
    const { periode_id } = req.query;
    if (!periode_id) return res.status(400).json({ message: "periode_id wajib diisi." });

    const [rows] = await db.query(
      `SELECT id_users AS id, nama FROM users
       WHERE role = 'dosen' AND current_periode_id = ?
       ORDER BY nama ASC`,
      [periode_id]
    );
    res.json({ data: rows });
  } catch (error) {
    console.error('getDosenRosterMBKM error:', error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDosenRosterPA = async (req, res) => {
  try {
    const { periode_id } = req.query;
    if (!periode_id) return res.status(400).json({ message: "periode_id wajib diisi." });

    const [rows] = await db.query(
      `SELECT id_users AS id, nama FROM users
       WHERE role = 'dosen' AND current_periode_id = ?
       ORDER BY nama ASC`,
      [periode_id]
    );
    res.json({ data: rows });
  } catch (error) {
    console.error('getDosenRosterPA error:', error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// Assign dosen SEKARANG TERPISAH dari approve. Approve (set status='disetujui_kaprodi')
// dilakukan lewat verifikasiPengajuan() -- fungsi ini cuma boleh dipakai SETELAH pengajuan
// sudah berstatus 'disetujui_kaprodi', dan cuma mengisi/mengganti dosen_id.
// Gerbang resmi logbook & dokumen (status='disetujui_kaprodi' AND dosen_id IS NOT NULL)
// baru terpenuhi penuh setelah langkah ini.
const assignDosen = async (req, res) => {
  try {
    const { mahasiswa_id, dosen_id, periode_id } = req.body;

    if (!mahasiswa_id || !dosen_id || !periode_id) {
      return res.status(400).json({ message: "mahasiswa_id, dosen_id, dan periode_id wajib diisi." });
    }

    const [pengajuanRows] = await db.query(
      `SELECT id_pengajuan, status FROM pengajuan WHERE mahasiswa_id = ? AND periode_id = ?`,
      [mahasiswa_id, periode_id]
    );
    if (!pengajuanRows.length) {
      return res.status(404).json({ message: "Pengajuan mahasiswa ini di periode tersebut tidak ditemukan." });
    }
    const pengajuanId = pengajuanRows[0].id_pengajuan;

    if (pengajuanRows[0].status !== 'disetujui_kaprodi') {
      return res.status(400).json({ message: "Pengajuan harus diverifikasi (disetujui) Kaprodi terlebih dahulu sebelum dosen pembimbing bisa di-assign." });
    }

    const [dosenRows] = await db.query(
      "SELECT id_users FROM users WHERE id_users = ? AND role = 'dosen' AND current_periode_id = ?",
      [dosen_id, periode_id]
    );
    if (!dosenRows.length) {
      return res.status(400).json({ message: "Dosen tidak ditemukan atau tidak terdaftar untuk periode ini." });
    }

    await db.query(
      "UPDATE pengajuan SET dosen_id = ? WHERE id_pengajuan = ?",
      [dosen_id, pengajuanId]
    );

    const pesan = "Dosen pembimbing untuk pengajuan capstone kamu sudah ditentukan. Kamu sekarang bisa mulai mengisi logbook.";
    await db.query(
      "INSERT INTO notifikasi (id_notifikasi, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
      [uuidv4(), mahasiswa_id, "Dosen Pembimbing Ditentukan", pesan, "sukses"]
    );
    await sendPushToUser(mahasiswa_id, {
      title: "Dosen Pembimbing Ditentukan",
      body: pesan,
      url: "/mahasiswa/pengajuan",
    });

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
        `SELECT id_periode AS id FROM periode WHERE is_active = 1 ORDER BY created_at ASC LIMIT 1`
      );
      if (!periodeRow) return res.json({ data: [] });
      periode_id = periodeRow.id;
    }

    // dosen_pembimbing_akademik lama sudah gak punya kolom penyimpanan (dropdown "Dosen PA"
    // sekarang cuma buat tampilan pilihan, gak disimpan) -- yang ditampilkan sekarang cuma
    // p.dosen_id, yang NULL sampai kaprodi assign lewat assignDosen().
    const [rows] = await db.query(
      `SELECT
        p.id_pengajuan AS id, p.mahasiswa_id, p.periode_id, p.status,
        p.catatan_kaprodi,
        p.created_at, p.updated_at, p.archived_at, p.archived_by,
        dp.nama_pelatihan, dp.link_pelatihan, dp.durasi_pelatihan_jam, dp.judul, dp.penyelenggara, dp.waktu_studi_independen, 
          dp.tanggal_mulai, dp.tanggal_selesai,
        u.nim, u.nama as nama_mahasiswa, u.email,
        p.dosen_id, d.nama as nama_dosen,
        dp.dosen_pa_id, dpa.nama as nama_dosen_pa
       FROM pengajuan p
       JOIN users u ON p.mahasiswa_id = u.id_users
       LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
       LEFT JOIN users d ON d.id_users = p.dosen_id
       LEFT JOIN users dpa ON dpa.id_users = dp.dosen_pa_id
       WHERE p.periode_id = ?
       ORDER BY p.created_at DESC`,
      [periode_id]
    );

    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// Menyetujui (disetujui_kaprodi), menolak (ditolak), atau minta revisi (revisi).
// Approve DI SINI TIDAK mengisi dosen_id -- dosen_id baru diisi belakangan lewat
// assignDosen(), setelah mahasiswa muncul di halaman Assign Dosen (yang memfilter
// status='disetujui_kaprodi'). Gerbang logbook/dokumen baru penuh terbuka setelah
// assignDosen dijalankan.
const verifikasiPengajuan = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, catatan_kaprodi } = req.body;

    if (!["disetujui_kaprodi", "ditolak", "revisi"].includes(status)) {
      return res.status(400).json({ message: "Status tidak valid." });
    }

    await db.query(
      "UPDATE pengajuan SET status = ?, catatan_kaprodi = ? WHERE id_pengajuan = ?",
      [status, catatan_kaprodi || null, id]
    );

    const [pengajuan] = await db.query(
      `SELECT mahasiswa_id FROM pengajuan WHERE id_pengajuan = ?`,
      [id]
    );

    if (pengajuan.length > 0) {
      const userId = pengajuan[0].mahasiswa_id; // mahasiswa_id == users.id_users

      let pesan;
      let tipe;
      if (status === "disetujui_kaprodi") {
        pesan = "Pengajuan capstone kamu telah disetujui oleh Kaprodi. Dosen pembimbing akan segera ditentukan.";
        tipe = "sukses";
      } else if (status === "revisi") {
        pesan = `Pengajuan capstone kamu perlu direvisi. Catatan: ${catatan_kaprodi}`;
        tipe = "peringatan";
      } else {
        pesan = `Pengajuan capstone kamu ditolak. Catatan: ${catatan_kaprodi}`;
        tipe = "peringatan";
      }

      await db.query(
        "INSERT INTO notifikasi (id_notifikasi, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
        [uuidv4(), userId, "Status Pengajuan Capstone", pesan, tipe]
      );
      if (status === "disetujui_kaprodi") {
        await sendPushToUser(userId, {
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

const hapusPengajuan = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;

    const [pengajuan] = await conn.query("SELECT * FROM pengajuan WHERE id_pengajuan = ?", [id]);
    if (!pengajuan.length) {
      conn.release();
      return res.status(404).json({ message: "Pengajuan tidak ditemukan." });
    }

    await conn.beginTransaction();

    // mahasiswa_id sudah langsung = users.id_users, gak perlu subquery lagi ke tabel mahasiswa.
    await conn.query("DELETE FROM notifikasi WHERE user_id = ?", [pengajuan[0].mahasiswa_id]);

    // detail_pengajuan/dokumen/logbook/feedback/penilaian ikut kehapus otomatis (ON DELETE CASCADE).
    await conn.query("DELETE FROM pengajuan WHERE id_pengajuan = ?", [id]);

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

const verifikasiDokumen = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, feedback } = req.body;
    const validStatus = ["revisi_kaprodi", "disetujui_kaprodi"];
    if (!validStatus.includes(status))
      return res.status(400).json({ message: "Status tidak valid." });

    const [dok] = await db.query(
      `SELECT d.*, p.mahasiswa_id
       FROM dokumen d JOIN pengajuan p ON p.id_pengajuan = d.pengajuan_id
       WHERE d.id_dokumen = ?`,
      [id]
    );
    if (!dok.length)
      return res.status(404).json({ message: "Dokumen tidak ditemukan." });

    if (dok[0].jenis !== 'laporan_akhir') {
      return res.status(403).json({ message: "Kaprodi hanya dapat memverifikasi Laporan Akhir." });
    }

    if (dok[0].status !== 'disetujui_dospem') {
      return res.status(400).json({ message: "Laporan Akhir harus disetujui Dosen Pembimbing terlebih dahulu sebelum dapat diverifikasi Kaprodi." });
    }

    const statusAkhir = status === "disetujui_kaprodi" ? "diverifikasi" : status;

    await db.query(
      `UPDATE dokumen SET status=?, feedback_kaprodi=?, verified_kaprodi_by=?, verified_kaprodi_at=NOW() WHERE id_dokumen=?`,
      [statusAkhir, feedback || null, req.user.id, id]
    );

    // dok[0].mahasiswa_id sudah = users.id_users, gak perlu query tambahan.
    const pesan = statusAkhir === "diverifikasi"
      ? "Laporan Akhir kamu telah diverifikasi oleh Dosen Pembimbing dan Kaprodi."
      : `Laporan Akhir kamu perlu direvisi oleh Kaprodi. Catatan: ${feedback || "-"}`;
    await db.query(
      "INSERT INTO notifikasi (id_notifikasi, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
      [uuidv4(), dok[0].mahasiswa_id, "Status Dokumen", pesan,
        statusAkhir === "diverifikasi" ? "sukses" : "peringatan"]
    );

    res.json({ message: "Status dokumen berhasil diupdate." });
  } catch (error) {
    console.error("verifikasiDokumen kaprodi error:", error);
    res.status(500).json({ message: 
      "Terjadi kesalahan server." });
  }
};

const getMonitoringDokumen = async (req, res) => {
  try {
    const { periode_id } = req.query;
    const [rows] = await db.query(
      `SELECT m.nim, m.nama,
        p.id_pengajuan as pengajuan_id,
        p.status as status_pengajuan,
        COUNT(DISTINCT l.id_logbook) as jumlah_logbook,
        COALESCE((
          SELECT SUM(lb.durasi_menit) / 60 FROM logbook lb
          WHERE lb.pengajuan_id = p.id_pengajuan AND lb.status = 'diverifikasi'
        ), 0) as total_jam_terverifikasi,
        (
          SELECT pn.nilai_akhir FROM penilaian pn
          WHERE pn.pengajuan_id = p.id_pengajuan AND pn.finalized_at IS NOT NULL
          LIMIT 1
        ) as nilai_akhir,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.status END) as status_laporan,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.status END) as status_ppt,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.id_dokumen END) as laporan_id,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.cloudinary_url END) as laporan_path,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.nama_file END) as laporan_nama,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.id_dokumen END) as ppt_id,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.cloudinary_url END) as ppt_path,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.nama_file END) as ppt_nama
      FROM users m
      INNER JOIN pengajuan p ON m.id_users = p.mahasiswa_id AND p.periode_id = ?
      LEFT JOIN dokumen dok ON dok.pengajuan_id = p.id_pengajuan
      LEFT JOIN logbook l ON l.pengajuan_id = p.id_pengajuan
      WHERE m.role = 'mahasiswa'
      GROUP BY m.id_users, m.nim, m.nama, p.id_pengajuan, p.status
      ORDER BY m.nama ASC`,
      [periode_id]
    );

    const [[periodeInfo]] = await db.query(
      "SELECT min_jam_pengajuan FROM periode WHERE id_periode = ?",
      [periode_id]
    );
    const minJam = periodeInfo?.min_jam_pengajuan ?? 0;

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
      dokumen_lengkap:
        r.status_laporan === "diverifikasi" &&
        r.status_ppt === "diverifikasi" &&
        Number(r.total_jam_terverifikasi) >= Number(minJam),
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

const getDashboardStats = async (req, res) => {
  try {
    let periode_id = req.query.periode_id || null;
    let nama_periode;

    if (!periode_id) {
      const [[periodeRow]] = await db.query(
        `SELECT id_periode AS id, nama_periode FROM periode ORDER BY is_active DESC, created_at DESC LIMIT 1`
      );

      if (!periodeRow) {
        return res.json({
          data: { total_mahasiswa: 0, total_dosen: 0, total_pengajuan: 0, dokumen_lengkap: 0, periode_aktif: null },
        });
      }

      periode_id = periodeRow.id;
      nama_periode = periodeRow.nama_periode;
    } else {
      const [[periodeRow]] = await db.query("SELECT nama_periode FROM periode WHERE id_periode = ?", [periode_id]);
      nama_periode = periodeRow?.nama_periode || "";
    }

    
    const [[{ total_mahasiswa }]] = await db.query(
      `SELECT COUNT(*) AS total_mahasiswa FROM users WHERE role = 'mahasiswa' AND current_periode_id = ?`,
      [periode_id]
    );
    const [[{ total_dosen }]] = await db.query(
      `SELECT COUNT(*) AS total_dosen FROM users WHERE role = 'dosen' AND current_periode_id = ?`,
      [periode_id]
    );

    const [[{ total_pengajuan }]] = await db.query(
      "SELECT COUNT(*) AS total_pengajuan FROM pengajuan WHERE periode_id = ?",
      [periode_id]
    );

    const [[periodeInfo]] = await db.query("SELECT min_jam_pengajuan FROM periode WHERE id_periode = ?", [periode_id]);
    const minJam = periodeInfo?.min_jam_pengajuan ?? 0;

    const [[{ dokumen_lengkap }]] = await db.query(
  `SELECT COUNT(*) AS dokumen_lengkap
   FROM (
     SELECT dok.pengajuan_id
     FROM dokumen dok
     JOIN pengajuan p ON p.id_pengajuan = dok.pengajuan_id
     WHERE p.periode_id = ?
     GROUP BY dok.pengajuan_id
     HAVING SUM(CASE WHEN dok.jenis = 'laporan_akhir' AND dok.status = 'diverifikasi' THEN 1 ELSE 0 END) > 0
        AND SUM(CASE WHEN dok.jenis = 'ppt' AND dok.status = 'diverifikasi' THEN 1 ELSE 0 END) > 0
        AND COALESCE((
          SELECT SUM(lb.durasi_menit) / 60 FROM logbook lb
          WHERE lb.pengajuan_id = dok.pengajuan_id AND lb.status = 'diverifikasi'
        ), 0) >= ?
   ) AS lengkap`,
  [periode_id, minJam]
);

    res.json({
      data: { total_mahasiswa, total_dosen, total_pengajuan, dokumen_lengkap, periode_id, nama_periode },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

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
      `SELECT p.id_pengajuan AS id, p.mahasiswa_id, p.status, p.periode_id,
        dp.nama_pelatihan,
        u.nim, u.nama, u.program_studi,
        p.dosen_id, d.nama AS nama_dosen
      FROM pengajuan p
      JOIN users u ON p.mahasiswa_id = u.id_users
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
      LEFT JOIN users d ON d.id_users = p.dosen_id
      ${whereClause}
      ORDER BY u.nama ASC`,
      params
    );

    res.json({ data: rows });
  } catch (error) {
    console.error("getPengajuanDisetujui error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

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
        pn.id_penilaian AS id, pn.pengajuan_id, pn.finalized_at,
        pn.nilai_kesesuaian, pn.nilai_proyek, pn.nilai_evaluasi,
        pn.nilai_laporan, pn.nilai_presentasi, pn.nilai_akhir, pn.grade, pn.catatan,
        u.nim, u.nama, u.program_studi,
        per.nama_periode,
        d.nama as nama_dosen
      FROM penilaian pn
      JOIN pengajuan p ON p.id_pengajuan = pn.pengajuan_id
      JOIN users u ON p.mahasiswa_id = u.id_users
      JOIN periode per ON p.periode_id = per.id_periode
      LEFT JOIN users d ON d.id_users = pn.dosen_id
      ${where}
      ORDER BY u.nama ASC`,
      params
    );

    res.json({ data: rows });
  } catch (error) {
    console.error("getRekapNilai error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDetailMonitoring = async (req, res) => {
  try {
    const { pengajuan_id } = req.params;

    const [info] = await db.query(
      `SELECT
        u.nim, u.nama, u.email,
        p.id_pengajuan as pengajuan_id, p.status as status_pengajuan, p.periode_id,
        dp.judul as program_mbkm, dp.penyelenggara as instansi, dp.nama_pelatihan,
        d.nama as dosen_pembimbing
      FROM pengajuan p
      JOIN users u ON u.id_users = p.mahasiswa_id
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
      LEFT JOIN users d ON d.id_users = p.dosen_id
      WHERE p.id_pengajuan = ?`,
      [pengajuan_id]
    );
    if (!info.length) return res.status(404).json({ message: "Pengajuan tidak ditemukan." });

    // pelatihan_id di logbook & tabel pelatihan sudah dihapus -- 1 pengajuan = 1 pelatihan,
    // nama_pelatihan sudah ada di info[0] di atas.
    const [logbook] = await db.query(
      `SELECT id_logbook AS id, tanggal, jam_mulai, jam_selesai, kegiatan, durasi_menit, status, bukti_link, cloudinary_public_id
       FROM logbook WHERE pengajuan_id = ? ORDER BY tanggal DESC`,
      [pengajuan_id]
    );

    const [dokumen] = await db.query(
      `SELECT id_dokumen AS id, jenis, nama_file, cloudinary_url, status FROM dokumen WHERE pengajuan_id = ?`,
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
  getDosenRosterMBKM, getDosenRosterPA,
  assignDosen,
  getVerifikasiPengajuan, verifikasiPengajuan, hapusPengajuan,
  verifikasiDokumen, getMonitoringDokumen, getDetailMonitoring, getDashboardStats, getPengajuanDisetujui,
  getRekapNilai,
  enforceRentangCap,
};