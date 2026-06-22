const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const bcrypt = require("bcryptjs");
const xlsx = require("xlsx");
const fs = require("fs");

// ========== PERIODE ==========

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
      tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
      tanggal_mulai_logbook, tanggal_selesai_logbook,
      tanggal_selesai_ppt, tanggal_selesai_laporan,
    } = req.body;

    if (!nama_periode || !jenis) {
      return res.status(400).json({ message: "Nama periode dan jenis wajib diisi." });
    }

    await db.query(
      `INSERT INTO periode (nama_periode, jenis, tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
      tanggal_mulai_logbook, tanggal_selesai_logbook, tanggal_selesai_ppt, tanggal_selesai_laporan,
      form_pengajuan_buka, form_logbook_buka, form_dokumen_buka)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)`,
      [
        nama_periode, jenis,
        tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
        tanggal_mulai_logbook, tanggal_selesai_logbook,
        tanggal_selesai_ppt, tanggal_selesai_laporan,
      ]
    );

    res.status(201).json({ message: "Periode berhasil ditambahkan." });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const updatePeriode = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nama_periode, jenis,
      tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
      tanggal_mulai_logbook, tanggal_selesai_logbook,
      tanggal_selesai_ppt, tanggal_selesai_laporan,
      form_pengajuan_buka, form_logbook_buka, form_dokumen_buka,
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
    const selesaiPengajuanBerubah = toDateStr(lama.tanggal_selesai_pengajuan) !== toDateStr(tanggal_selesai_pengajuan);
    const selesaiLogbookBerubah   = toDateStr(lama.tanggal_selesai_logbook)   !== toDateStr(tanggal_selesai_logbook);
    const selesaiPptBerubah       = toDateStr(lama.tanggal_selesai_ppt)       !== toDateStr(tanggal_selesai_ppt);
    const selesaiLaporanBerubah   = toDateStr(lama.tanggal_selesai_laporan)   !== toDateStr(tanggal_selesai_laporan);

    const pengajuanSudahLewat = toDateStr(tanggal_selesai_pengajuan) && toDateStr(tanggal_selesai_pengajuan) < today;
    const logbookSudahLewat   = toDateStr(tanggal_selesai_logbook)   && toDateStr(tanggal_selesai_logbook)   < today;
    const dokumenSudahLewat   = toDateStr(tanggal_selesai_laporan)   && toDateStr(tanggal_selesai_laporan)   < today;

    let extraClauses = [];

    if (mulaiPengajuanBerubah) {
      extraClauses.push('auto_opened_at = NULL', 'form_pengajuan_buka = 0');
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

    if (selesaiPptBerubah || selesaiLaporanBerubah) {
      extraClauses.push('auto_closed_dokumen_at = NULL', 'manual_open_dokumen = 0');
      if (dokumenSudahLewat) {
        extraClauses.push('form_dokumen_buka = 0', 'auto_closed_dokumen_at = NOW()');
      } else {
        extraClauses.push('form_dokumen_buka = 1');
      }
    }

    const extraSQL = extraClauses.length ? ', ' + extraClauses.join(', ') : '';

    await db.query(
      `UPDATE periode SET
        nama_periode=?, jenis=?,
        tanggal_mulai_pengajuan=?, tanggal_selesai_pengajuan=?,
        tanggal_mulai_logbook=?, tanggal_selesai_logbook=?,
        tanggal_selesai_ppt=?, tanggal_selesai_laporan=?,
        form_pengajuan_buka=?, form_logbook_buka=?, form_dokumen_buka=?,
        is_active=?
        ${extraSQL}
      WHERE id=?`,
      [
        nama_periode, jenis,
        tanggal_mulai_pengajuan, tanggal_selesai_pengajuan,
        tanggal_mulai_logbook, tanggal_selesai_logbook,
        tanggal_selesai_ppt, tanggal_selesai_laporan,
        form_pengajuan_buka, form_logbook_buka, form_dokumen_buka ?? 1,
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
    const { form_pengajuan_buka, form_logbook_buka, form_dokumen_buka } = req.body;

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

    const dokumenVal = form_dokumen_buka ?? 1;
    if (dokumenVal == 1) {
      resetFields.push('auto_closed_dokumen_at = NULL', 'manual_open_dokumen = 1');
    } else {
      resetFields.push('manual_open_dokumen = 0', 'auto_closed_dokumen_at = COALESCE(auto_closed_dokumen_at, NOW())');
    }

    const resetClause = ', ' + resetFields.join(', ');

    await db.query(
      `UPDATE periode
       SET form_pengajuan_buka=?, form_logbook_buka=?, form_dokumen_buka=? ${resetClause}
       WHERE id=?`,
      [form_pengajuan_buka, form_logbook_buka, dokumenVal, id]
    );

    res.json({ message: 'Status form berhasil diubah.' });
  } catch (error) {
    console.error('toggleForm error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

// ========== IMPORT MAHASISWA ==========

const importMahasiswa = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "File tidak ditemukan." });

    const { periode_id } = req.body;
    if (!periode_id) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "periode_id wajib diisi saat import." });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0)
      return res.status(400).json({ message: "File kosong atau format tidak sesuai." });

    let berhasil = 0, gagal = 0, errors = [];

    for (const row of data) {
      try {
        const nim = String(row["NIM Mahasiswa"] || row["NIM"] || row["nim"] || "").trim();
        const nama = String(row["Nama Mahasiswa"] || row["Nama"] || row["nama"] || "").trim();
        const email = String(
          row["Email Mahasiswa"] || row["E-mail Mahasiswa"] || row["E-Mail Mahasiswa"] ||
          row["email mahasiswa"] || row["Email"] || row["E-mail"] || row["E-Mail"] || row["email"] || ""
        ).trim();
        const prodi = String(row["Program Studi"] || row["prodi"] || row["Prodi"] || "").trim();

        if (!nim || !nama) {
          errors.push(`Baris dilewati: NIM atau Nama kosong`);
          gagal++;
          continue;
        }

        const [existing] = await db.query("SELECT id FROM mahasiswa WHERE nim = ?", [nim]);
        if (existing.length > 0) {
          const [existingPeriode] = await db.query(
            "SELECT id FROM mahasiswa WHERE nim = ? AND periode_id = ?",
            [nim, periode_id]
          );
          if (existingPeriode.length > 0) {
            errors.push(`NIM ${nim} sudah terdaftar di periode ini, dilewati.`);
            gagal++;
          } else {
            const [mhs] = await db.query("SELECT * FROM mahasiswa WHERE nim = ?", [nim]);
            await db.query(
              "INSERT INTO mahasiswa (id, user_id, nim, nama, email, program_studi, periode_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
              [uuidv4(), mhs[0].user_id, nim, nama, email || null, prodi, periode_id]
            );
            berhasil++;
          }
          continue;
        }

        const hashedPassword = await bcrypt.hash(nim, 8);
        const usernameToUse = email || nim;
        const userId = uuidv4();

        await db.query(
          "INSERT INTO users (id, nama, username, password, email, role) VALUES (?, ?, ?, ?, ?, ?)",
          [userId, nama, usernameToUse, hashedPassword, email || null, "mahasiswa"]
        );

        await db.query(
          "INSERT INTO mahasiswa (id, user_id, nim, nama, email, program_studi, periode_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [uuidv4(), userId, nim, nama, email || null, prodi, periode_id]
        );

        berhasil++;
      } catch (rowError) {
        gagal++;
        errors.push(`Error pada baris: ${rowError.message}`);
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({
      message: `Import selesai. Berhasil: ${berhasil}, Gagal: ${gagal}`,
      berhasil, gagal, errors,
    });
  } catch (error) {
    console.error("Import mahasiswa error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== TAMBAH MAHASISWA ==========

const tambahMahasiswa = async (req, res) => {
  try {
    const { nim, nama, email, program_studi, periode_id } = req.body;

    if (!nim || !nama || !email || !program_studi || !periode_id) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const [existing] = await db.query(
      "SELECT id FROM mahasiswa WHERE nim = ? AND periode_id = ?",
      [nim, periode_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: "NIM sudah terdaftar di periode ini." });
    }

    // Cek apakah user dengan email/username ini sudah ada
    const [existingUser] = await db.query(
      "SELECT id, nama, role FROM users WHERE username = ? OR email = ?",
      [email, email]
    );

    let userId;

    if (existingUser.length > 0) {
      const found = existingUser[0];

      // Jangan diam-diam reuse akun yang role-nya bukan mahasiswa
      // (mis. staff/dosen_pembimbing/kaprodi). Kalau email sudah dipakai
      // role lain, tolak dengan pesan jelas supaya tidak ada akun yang
      // "nyangkut" dipakai dua identitas berbeda.
      if (found.role !== "mahasiswa") {
        return res.status(400).json({
          message: `Email/username ini sudah terdaftar sebagai akun ${found.role} (${found.nama}). Gunakan email lain untuk mahasiswa ini.`,
        });
      }

      // Email sudah dipakai mahasiswa lain. Pastikan bukan untuk
      // menambahkan mahasiswa berbeda atas akun yang sama.
      const [mhsLain] = await db.query(
        "SELECT nim, nama FROM mahasiswa WHERE user_id = ?",
        [found.id]
      );
      if (mhsLain.length > 0 && mhsLain[0].nim !== nim) {
        return res.status(400).json({
          message: `Email ini sudah terdaftar untuk mahasiswa lain (${mhsLain[0].nama} - NIM ${mhsLain[0].nim}). Gunakan email lain.`,
        });
      }

      // Pakai user_id yang sudah ada (akun mahasiswa yang sama)
      userId = found.id;
    } else {
      // Buat user baru
      const hashedPassword = await bcrypt.hash(nim, 8);
      userId = uuidv4();
      await db.query(
        "INSERT INTO users (id, nama, username, password, email, role) VALUES (?, ?, ?, ?, ?, ?)",
        [userId, nama, email, hashedPassword, email, "mahasiswa"]
      );
    }

    await db.query(
      "INSERT INTO mahasiswa (id, user_id, nim, nama, email, program_studi, periode_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [uuidv4(), userId, nim, nama, email || null, program_studi, periode_id]
    );

    res.status(201).json({ message: "Mahasiswa berhasil ditambahkan." });
  } catch (error) {
    console.error("Tambah mahasiswa error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== IMPORT DOSEN ==========

const importDosen = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: 'File tidak ditemukan.' });

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0)
      return res.status(400).json({ message: 'File kosong atau format tidak sesuai.' });

    let berhasil = 0, gagal = 0, errors = [];

    for (const row of data) {
      try {
        const id_dosen      = String(row['ID Dosen'] || row['id_dosen'] || row['Id Dosen'] || '').trim();
        const nama          = String(row['Nama']     || row['nama']     || row['NAMA']     || '').trim();
        const email         = String(row['Email']    || row['email']    || '').trim();
        const program_studi = String(row['Program Studi'] || row['program_studi'] || '').trim() || null;

        if (!id_dosen || !nama) {
          gagal++;
          errors.push(`Baris dilewati: ID Dosen atau Nama kosong`);
          continue;
        }

        const [existing] = await db.query('SELECT id FROM dosen WHERE id_dosen = ?', [id_dosen]);
        if (existing.length > 0) {
          gagal++;
          errors.push(`ID Dosen ${id_dosen} sudah terdaftar, dilewati.`);
          continue;
        }

        const hashedPassword = await bcrypt.hash(id_dosen, 10);
        const userId = uuidv4();

        await db.query(
          'INSERT INTO users (id, nama, username, password, email, role) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, nama, email, hashedPassword, email || null, 'dosen_pembimbing']
        );

        await db.query(
          'INSERT INTO dosen (id, user_id, id_dosen, nama, email, program_studi) VALUES (?, ?, ?, ?, ?, ?)',
          [uuidv4(), userId, id_dosen, nama, email || null, program_studi]
        );

        berhasil++;
      } catch (rowError) {
        gagal++;
        errors.push(`Error: ${rowError.message}`);
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({
      message: `Import selesai. Berhasil: ${berhasil}, Gagal: ${gagal}`,
      berhasil, gagal, errors,
    });
  } catch (error) {
    console.error('Import dosen error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

// ========== TAMBAH DOSEN ==========

const tambahDosen = async (req, res) => {
  try {
    const { id_dosen, nama, email, program_studi } = req.body;

    if (!id_dosen || !nama || !email || !program_studi) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const [existing] = await db.query("SELECT id FROM dosen WHERE id_dosen = ?", [id_dosen]);
    if (existing.length > 0) {
      return res.status(400).json({ message: "ID Dosen sudah terdaftar." });
    }

    const hashedPassword = await bcrypt.hash(id_dosen, 10);
    const userId = uuidv4();

    await db.query(
      'INSERT INTO users (id, nama, username, password, email, role) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, nama, email, hashedPassword, email, 'dosen_pembimbing']
    );

    await db.query(
      'INSERT INTO dosen (id, user_id, id_dosen, nama, email, program_studi) VALUES (?, ?, ?, ?, ?, ?)',
      [uuidv4(), userId, id_dosen, nama, email, program_studi]
    );

    res.status(201).json({ message: "Dosen berhasil ditambahkan." });
  } catch (error) {
    console.error("Tambah dosen error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== UPDATE DOSEN ==========

const updateDosen = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_dosen, nama, email, program_studi, is_active } = req.body;

    if (!id_dosen || !nama || !email || !program_studi) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const [dosen] = await db.query("SELECT * FROM dosen WHERE id = ?", [id]);
    if (!dosen.length) {
      return res.status(404).json({ message: "Dosen tidak ditemukan." });
    }

    await db.query(
      "UPDATE dosen SET id_dosen=?, nama=?, email=?, program_studi=? WHERE id=?",
      [id_dosen, nama, email, program_studi, id]
    );

    await db.query(
      "UPDATE users SET nama=?, email=?, username=?, is_active=? WHERE id=?",
      [nama, email, id_dosen, is_active ? 1 : 0, dosen[0].user_id]
    );

    res.json({ message: "Data dosen berhasil diperbarui." });
  } catch (error) {
    console.error("Update dosen error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== ASSIGN DOSEN ==========

const assignDosen = async (req, res) => {
  try {
    const { mahasiswa_id, dosen_id, periode_id } = req.body;

    if (!mahasiswa_id || !dosen_id || !periode_id) {
      return res.status(400).json({ message: "mahasiswa_id, dosen_id, dan periode_id wajib diisi." });
    }

    const [existing] = await db.query(
      "SELECT id FROM bimbingan WHERE mahasiswa_id = ? AND periode_id = ?",
      [mahasiswa_id, periode_id]
    );

    if (existing.length > 0) {
      await db.query(
        "UPDATE bimbingan SET dosen_id = ? WHERE mahasiswa_id = ? AND periode_id = ?",
        [dosen_id, mahasiswa_id, periode_id]
      );
    } else {
      const bimbinganId = uuidv4();
      await db.query(
        "INSERT INTO bimbingan (id, mahasiswa_id, dosen_id, periode_id) VALUES (?, ?, ?, ?)",
        [bimbinganId, mahasiswa_id, dosen_id, periode_id]
      );
    }

    res.json({ message: "Dosen pembimbing berhasil di-assign." });
  } catch (error) {
    console.error('assignDosen error:', error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== MONITORING ==========

const getDaftarMahasiswa = async (req, res) => {
  try {
    const { periode_id } = req.query;
    // PENTING: jangan select u.email di sini. Kalau di-select, MySQL/mysql2
    // akan menimpa kolom m.email (dari m.*) dengan u.email saat keduanya
    // sama-sama bernama "email" di hasil JSON, sehingga frontend menampilkan
    // email akun users (yang bisa saja akun lain seperti staff/dosen yang
    // ter-reuse) alih-alih email asli mahasiswa.
    const query = `
      SELECT m.*, u.is_active,
        b.dosen_id, d.nama as nama_dosen,
        p.judul as judul_capstone, p.status as status_pengajuan
      FROM mahasiswa m
      LEFT JOIN users u ON m.user_id = u.id
      LEFT JOIN bimbingan b ON m.id = b.mahasiswa_id ${periode_id ? "AND b.periode_id = ?" : ""}
      LEFT JOIN dosen d ON b.dosen_id = d.id
      LEFT JOIN pengajuan_capstone p ON m.id = p.mahasiswa_id ${periode_id ? "AND p.periode_id = ?" : ""}
      ${periode_id ? "WHERE m.periode_id = ?" : ""}
      ORDER BY m.nama ASC
    `;
    const params = periode_id ? [periode_id, periode_id, periode_id] : [];
    const [rows] = await db.query(query, params);
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDaftarDosen = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT d.*, u.is_active, u.email as user_email
      FROM dosen d LEFT JOIN users u ON d.user_id = u.id
      ORDER BY d.nama ASC
    `);
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== VERIFIKASI PENGAJUAN ==========

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
      `SELECT pc.*, m.nim, m.nama as nama_mahasiswa
       FROM pengajuan_capstone pc
       JOIN mahasiswa m ON pc.mahasiswa_id = m.id
       WHERE pc.periode_id = ?
       ORDER BY pc.created_at DESC`,
      [periode_id]
    );

    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const verifikasiPengajuan = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, catatan_kaprodi } = req.body;

    if (!["disetujui_kaprodi", "ditolak", "revisi"].includes(status)) {
      return res.status(400).json({ message: "Status tidak valid." });
    }

    await db.query(
      "UPDATE pengajuan_capstone SET status = ?, catatan_kaprodi = ? WHERE id = ?",
      [status, catatan_kaprodi, id]
    );

    const [pengajuan] = await db.query(
      `SELECT pc.mahasiswa_id, m.user_id FROM pengajuan_capstone pc
       JOIN mahasiswa m ON pc.mahasiswa_id = m.id WHERE pc.id = ?`,
      [id]
    );

    if (pengajuan.length > 0) {
      const pesan =
        status === "disetujui_kaprodi"
          ? "Pengajuan capstone kamu telah disetujui oleh Kaprodi."
          : status === "revisi"
          ? `Pengajuan capstone kamu perlu direvisi. Catatan: ${catatan_kaprodi}`
          : `Pengajuan capstone kamu ditolak. Catatan: ${catatan_kaprodi}`;

      await db.query(
        "INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
        [
          uuidv4(), pengajuan[0].user_id,
          "Status Pengajuan Capstone", pesan,
          status === "disetujui_kaprodi" ? "sukses" : "peringatan",
        ]
      );
    }

    res.json({ message: "Status pengajuan berhasil diupdate." });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const hapusPengajuan = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;

    const [pengajuan] = await conn.query(
      "SELECT * FROM pengajuan_capstone WHERE id = ?", [id]
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
    await conn.query(
      "DELETE FROM dokumen WHERE mahasiswa_id = ? AND periode_id = ?",
      [pengajuan[0].mahasiswa_id, pengajuan[0].periode_id]
    );
    await conn.query(
      "DELETE FROM logbook WHERE mahasiswa_id = ? AND periode_id = ?",
      [pengajuan[0].mahasiswa_id, pengajuan[0].periode_id]
    );
    await conn.query(
      "DELETE FROM bimbingan WHERE mahasiswa_id = ? AND periode_id = ?",
      [pengajuan[0].mahasiswa_id, pengajuan[0].periode_id]
    );
    await conn.query("DELETE FROM pengajuan_capstone WHERE id = ?", [id]);

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

    const [dok] = await db.query("SELECT * FROM dokumen WHERE id = ?", [id]);
    if (!dok.length)
      return res.status(404).json({ message: "Dokumen tidak ditemukan." });

    if (dok[0].jenis !== 'laporan_akhir') {
      return res.status(403).json({ message: "Kaprodi hanya dapat memverifikasi Laporan Akhir." });
    }

    await db.query(
      `UPDATE dokumen SET status=?, feedback_kaprodi=?, verified_kaprodi_by=?, verified_kaprodi_at=NOW() WHERE id=?`,
      [status, feedback || null, req.user.id, id]
    );

    const [mhsData] = await db.query(
      `SELECT m.user_id FROM mahasiswa m WHERE m.id = ?`,
      [dok[0].mahasiswa_id]
    );
    if (mhsData.length) {
      const pesan = status === "disetujui_kaprodi"
        ? "Laporan Akhir kamu telah disetujui Kaprodi, menunggu verifikasi Dosen Pembimbing."
        : `Laporan Akhir kamu perlu direvisi oleh Kaprodi. Catatan: ${feedback || "-"}`;
      await db.query(
        "INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
        [uuidv4(), mhsData[0].user_id, "Status Dokumen", pesan,
          status === "disetujui_kaprodi" ? "sukses" : "peringatan"]
      );
    }

    res.json({ message: "Status dokumen berhasil diupdate." });
  } catch (error) {
    console.error("verifikasiDokumen kaprodi error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getMonitoringDokumen = async (req, res) => {
  try {
    const { periode_id } = req.query;
    const [rows] = await db.query(
      `SELECT m.nim, m.nama,
        pc.status as status_pengajuan,
        COUNT(DISTINCT l.id) as jumlah_logbook,
        COALESCE((
          SELECT SUM(lb.jam) FROM logbook lb
          WHERE lb.mahasiswa_id = m.id AND lb.periode_id = ? AND lb.status = 'diverifikasi'
        ), 0) as total_jam_terverifikasi,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.status END) as status_laporan,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.status END) as status_ppt,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.id END) as laporan_id,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.path_file END) as laporan_path,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.nama_file END) as laporan_nama,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.id END) as ppt_id,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.path_file END) as ppt_path,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.nama_file END) as ppt_nama
      FROM mahasiswa m
      LEFT JOIN dokumen dok ON m.id = dok.mahasiswa_id AND dok.periode_id = ?
      LEFT JOIN logbook l ON m.id = l.mahasiswa_id AND l.periode_id = ?
      LEFT JOIN pengajuan_capstone pc ON m.id = pc.mahasiswa_id AND pc.periode_id = ?
      WHERE m.periode_id = ?
      GROUP BY m.id, m.nim, m.nama, pc.status
      ORDER BY m.nama ASC`,
      [periode_id, periode_id, periode_id, periode_id, periode_id]
    );

    const formatted = rows.map((r) => ({
      nim: r.nim,
      nama: r.nama,
      status_pengajuan: r.status_pengajuan,
      jumlah_logbook: r.jumlah_logbook,
      total_jam_terverifikasi: r.total_jam_terverifikasi,
      status_laporan: r.status_laporan,
      status_ppt: r.status_ppt,
      dokumen_laporan: r.laporan_id ? {
        id: r.laporan_id, path_file: r.laporan_path,
        nama_file: r.laporan_nama, status: r.status_laporan,
      } : null,
      dokumen_ppt: r.ppt_id ? {
        id: r.ppt_id, path_file: r.ppt_path,
        nama_file: r.ppt_nama, status: r.status_ppt,
      } : null,
    }));

    res.json({ data: formatted });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== DASHBOARD STATS ==========

const getDashboardStats = async (req, res) => {
  try {
    let periode_id = req.query.periode_id || null;

    if (!periode_id) {
      const [[periodeRow]] = await db.query(
        `SELECT id, nama_periode FROM periode ORDER BY is_active DESC, created_at DESC LIMIT 1`
      );
      if (!periodeRow) {
        return res.json({
          data: {
            total_mahasiswa: 0, total_dosen: 0,
            total_pengajuan: 0, dokumen_lengkap: 0, periode_aktif: null,
          },
        });
      }
      periode_id = periodeRow.id;
      var nama_periode = periodeRow.nama_periode;
    } else {
      const [[periodeRow]] = await db.query(
        "SELECT nama_periode FROM periode WHERE id = ?", [periode_id]
      );
      var nama_periode = periodeRow?.nama_periode || "";
    }

    const [[{ total_mahasiswa }]] = await db.query(
      "SELECT COUNT(*) as total_mahasiswa FROM mahasiswa WHERE periode_id = ?", [periode_id]
    );
  const [[{ total_dosen }]] = await db.query(
  "SELECT COUNT(*) as total_dosen FROM dosen"
);
    const [[{ total_pengajuan }]] = await db.query(
      "SELECT COUNT(*) as total_pengajuan FROM pengajuan_capstone WHERE periode_id = ?", [periode_id]
    );
    const [[{ dokumen_lengkap }]] = await db.query(
      `SELECT COUNT(*) as dokumen_lengkap FROM (
        SELECT mahasiswa_id FROM dokumen WHERE periode_id = ?
        GROUP BY mahasiswa_id
        HAVING SUM(jenis = 'laporan_akhir') > 0 AND SUM(jenis = 'ppt') > 0
      ) as lengkap`,
      [periode_id]
    );

    res.json({
      data: {
        total_mahasiswa, total_dosen, total_pengajuan,
        dokumen_lengkap, periode_id, nama_periode,
      },
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== PENGAJUAN UNTUK ASSIGN DOSEN ==========

const getPengajuanDisetujui = async (req, res) => {
  try {
    const { periode_id } = req.query;
    const params = [];
    let whereClause = `WHERE pc.status = 'disetujui_kaprodi'`;

    if (periode_id) {
      whereClause += ` AND pc.periode_id = ?`;
      params.push(periode_id);
    }

    const [rows] = await db.query(
      `SELECT pc.id, pc.mahasiswa_id, pc.status, pc.periode_id, pc.pelatihan,
        m.nim, m.nama, m.program_studi,
        b.dosen_id, d.nama AS nama_dosen
      FROM pengajuan_capstone pc
      JOIN mahasiswa m ON pc.mahasiswa_id = m.id
      LEFT JOIN bimbingan b ON b.mahasiswa_id = m.id AND b.periode_id = pc.periode_id
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

module.exports = {
  getPeriode, tambahPeriode, updatePeriode, toggleForm,
  importMahasiswa, importDosen, tambahMahasiswa, tambahDosen, updateDosen,
  assignDosen, getDaftarMahasiswa, getDaftarDosen,
  getVerifikasiPengajuan, verifikasiPengajuan, hapusPengajuan,
  verifikasiDokumen, getMonitoringDokumen, getDashboardStats, getPengajuanDisetujui,
};