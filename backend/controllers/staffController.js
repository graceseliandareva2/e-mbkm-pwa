const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const bcrypt = require("bcryptjs");
const xlsx = require("xlsx");
const fs = require("fs");

// BARU: import mahasiswa sekarang berarti "find-or-create mahasiswa
// master + masukkan ke roster_mahasiswa_mbkm periode terpilih" --
// BUKAN LAGI skip kalau NIM sudah pernah terdaftar. Ini yang bikin
// Kaprodi bisa re-import mahasiswa yang belum lulus MBKM di periode
// sebelumnya ke periode baru (mis. Oxana), tanpa menyentuh histori
// pengajuan/logbook/dokumen/penilaian periode lamanya sama sekali --
// itu semua tetap nempel ke pengajuan_id periode lama, tidak berubah.
// Mengikuti pola yang sama persis dengan _importRosterDosen.
const importMahasiswa = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "File tidak ditemukan.",
      });
    }

    // periode_id dikirim sebagai field form biasa berdampingan dengan file
    // (multer taruh field non-file di req.body) -- frontend (DataMahasiswa.jsx)
    // sudah mengirim ini dari dulu, sebelumnya cuma tidak dipakai backend.
    const periodeId = req.body.periode_id || await _getPeriodeAktifId();
    if (!periodeId) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Tidak ada periode aktif dan periode_id tidak diberikan." });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        message: "File kosong atau format tidak sesuai.",
      });
    }

    let berhasil = 0;
    let gagal = 0;
    let errors = [];

    for (const row of data) {
      try {
        const nim = String(
          row["NIM Mahasiswa"] ||
          row["NIM"] ||
          row["nim"] ||
          ""
        ).trim();

        const nama = String(
          row["Nama Mahasiswa"] ||
          row["Nama"] ||
          row["nama"] ||
          ""
        ).trim();

        const email = String(
          row["Email Mahasiswa"] ||
          row["E-mail Mahasiswa"] ||
          row["E-Mail Mahasiswa"] ||
          row["Email"] ||
          row["email"] ||
          ""
        ).trim();

        const prodi = String(
          row["Program Studi"] ||
          row["Prodi"] ||
          row["prodi"] ||
          ""
        ).trim();

        if (!nim || !nama) {
          gagal++;
          errors.push("Baris dilewati: NIM atau Nama kosong.");
          continue;
        }

        // Find-or-create di master data mahasiswa. Kalau NIM sudah ada,
        // pakai data yang sudah ada (TIDAK menimpa nama/email/prodi-nya) --
        // ini yang bikin mahasiswa yang gagal MBKM periode lalu (kasus
        // Oxana) bisa di-import ulang ke periode baru tanpa dianggap error.
        const [existingMahasiswa] = await db.query(
          "SELECT id, user_id FROM mahasiswa WHERE nim = ?",
          [nim]
        );

        let mahasiswaId;

        if (existingMahasiswa.length > 0) {
          mahasiswaId = existingMahasiswa[0].id;
        } else {
          const username = email || nim;

          // Find-or-create user: kalau username ini udah ada di tabel users
          // (misal sisa import lama yang gagal di tengah jalan, jadi user
          // sudah dibuat tapi row mahasiswa-nya belum), pakai user yang
          // sudah ada itu -- JANGAN langsung di-skip.
          const [existingUser] = await db.query(
            "SELECT id, role FROM users WHERE username = ?",
            [username]
          );

          let userId;

          if (existingUser.length > 0) {
            const found = existingUser[0];

            if (found.role !== "mahasiswa") {
              gagal++;
              errors.push(`Username ${username} sudah dipakai akun role ${found.role}.`);
              continue;
            }

            // Pastikan user ini belum "dipakai" mahasiswa lain (jaga-jaga).
            const [mhsLain] = await db.query(
              "SELECT nim FROM mahasiswa WHERE user_id = ?",
              [found.id]
            );
            if (mhsLain.length > 0) {
              gagal++;
              errors.push(`Username ${username} sudah terpakai mahasiswa lain (NIM ${mhsLain[0].nim}).`);
              continue;
            }

            userId = found.id;
          } else {
            userId = uuidv4();
            const hashedPassword = await bcrypt.hash(nim, 8);

            await db.query(
              `INSERT INTO users
              (id, username, password, role)
              VALUES (?, ?, ?, ?)`,
              [
                userId,
                username,
                hashedPassword,
                "mahasiswa",
              ]
            );
          }

          mahasiswaId = uuidv4();
          await db.query(
            `INSERT INTO mahasiswa
            (
              id,
              user_id,
              nim,
              nama,
              email,
              program_studi
            )
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
              mahasiswaId,
              userId,
              nim,
              nama,
              email || null,
              prodi || null,
            ]
          );
        }

        // Masukkan ke roster MBKM periode terpilih. Kalau mahasiswa ini
        // sudah di-roster periode yang sama sebelumnya, baru dianggap
        // duplikat beneran -> skip (tapi tetap boleh di-roster periode LAIN).
        const [existingRoster] = await db.query(
          "SELECT id FROM roster_mahasiswa_mbkm WHERE mahasiswa_id = ? AND periode_id = ?",
          [mahasiswaId, periodeId]
        );
        if (existingRoster.length) {
          gagal++;
          errors.push(`NIM ${nim} sudah ada di roster MBKM periode ini, dilewati.`);
          continue;
        }

        await db.query(
          "INSERT INTO roster_mahasiswa_mbkm (id, mahasiswa_id, periode_id, is_active, imported_by) VALUES (?, ?, ?, 1, ?)",
          [uuidv4(), mahasiswaId, periodeId, req.user.id]
        );

        berhasil++;
      } catch (err) {
        gagal++;
        errors.push(err.message);
      }
    }

    fs.unlinkSync(req.file.path);

    return res.json({
      message: `Import selesai. Berhasil: ${berhasil}, Gagal: ${gagal}`,
      berhasil,
      gagal,
      errors,
    });
  } catch (error) {
    console.error("Import mahasiswa error:", error);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res.status(500).json({
      message: "Terjadi kesalahan server.",
    });
  }
};

// ========== TAMBAH SATU MAHASISWA KE ROSTER MBKM ==========
// BARU: find-or-create mahasiswa master (sama seperti importMahasiswa),
// lalu masukkan ke roster_mahasiswa_mbkm periode_id yang dipilih. NIM
// yang sudah terdaftar BUKAN LAGI error -- itu justru skenario re-import
// Oxana ke periode berikutnya. Yang jadi error kalau mahasiswa itu sudah
// ada di roster periode yang SAMA.
const tambahMahasiswa = async (req, res) => {
  try {
    const { nim, nama, email, program_studi, periode_id } = req.body;

    if (!nim || !nama || !email || !program_studi || !periode_id) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const [existingMahasiswa] = await db.query(
      "SELECT id, user_id FROM mahasiswa WHERE nim = ?",
      [nim]
    );

    let mahasiswaId;

    if (existingMahasiswa.length > 0) {
      mahasiswaId = existingMahasiswa[0].id;
    } else {
      const [existingUser] = await db.query(
        "SELECT id, role FROM users WHERE username = ?",
        [email]
      );

      let userId;

      if (existingUser.length > 0) {
        const found = existingUser[0];

        if (found.role !== "mahasiswa") {
          return res.status(400).json({
            message: `Email/username ini sudah terdaftar sebagai akun ${found.role}. Gunakan email lain untuk mahasiswa ini.`,
          });
        }

        const [mhsLain] = await db.query(
          "SELECT nim, nama FROM mahasiswa WHERE user_id = ?",
          [found.id]
        );
        if (mhsLain.length > 0 && mhsLain[0].nim !== nim) {
          return res.status(400).json({
            message: `Email ini sudah terdaftar untuk mahasiswa lain (${mhsLain[0].nama} - NIM ${mhsLain[0].nim}). Gunakan email lain.`,
          });
        }

        userId = found.id;
      } else {
        const hashedPassword = await bcrypt.hash(nim, 8);
        userId = uuidv4();
        await db.query(
          "INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)",
          [userId, email, hashedPassword, "mahasiswa"]
        );
      }

      mahasiswaId = uuidv4();
      await db.query(
        "INSERT INTO mahasiswa (id, user_id, nim, nama, email, program_studi, imported_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [mahasiswaId, userId, nim, nama, email || null, program_studi, req.user.id]
      );
    }

    const [existingRoster] = await db.query(
      "SELECT id FROM roster_mahasiswa_mbkm WHERE mahasiswa_id = ? AND periode_id = ?",
      [mahasiswaId, periode_id]
    );
    if (existingRoster.length) {
      return res.status(400).json({ message: "Mahasiswa ini sudah ada di roster MBKM periode tersebut." });
    }

    await db.query(
      "INSERT INTO roster_mahasiswa_mbkm (id, mahasiswa_id, periode_id, is_active, imported_by) VALUES (?, ?, ?, 1, ?)",
      [uuidv4(), mahasiswaId, periode_id, req.user.id]
    );

    res.status(201).json({
      message: existingMahasiswa.length > 0
        ? "Mahasiswa (data sudah ada) berhasil ditambahkan ke roster MBKM periode ini."
        : "Mahasiswa baru berhasil dibuat dan ditambahkan ke roster MBKM.",
    });
  } catch (error) {
    console.error("Tambah mahasiswa error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== IMPORT DOSEN (master data, TANPA is_dosen_pa) ==========
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
          'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
          [userId, email || id_dosen, hashedPassword, 'dosen_pembimbing']
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

// ========== TAMBAH DOSEN (master data, TANPA is_dosen_pa) ==========
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
      'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
      [userId, email, hashedPassword, 'dosen_pembimbing']
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

// ========== UPDATE DOSEN (master data, TANPA is_dosen_pa) ==========
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
      "UPDATE users SET username=?, is_active=? WHERE id=?",
      [id_dosen, is_active ? 1 : 0, dosen[0].user_id]
    );

    res.json({ message: "Data dosen berhasil diperbarui." });
  } catch (error) {
    console.error("Update dosen error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== UPDATE MAHASISWA ==========
const updateMahasiswa = async (req, res) => {
  try {
    const { id } = req.params;
    const { nim, nama, email, program_studi } = req.body;

    if (!nim || !nama || !email || !program_studi) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const [mhs] = await db.query("SELECT * FROM mahasiswa WHERE id = ?", [id]);
    if (!mhs.length) {
      return res.status(404).json({ message: "Mahasiswa tidak ditemukan." });
    }

    // NIM unik secara global (mahasiswa = master data permanen, bukan
    // per periode) -- cek bentrok dengan mahasiswa lain mana pun.
    const [nimBentrok] = await db.query(
    "SELECT id FROM mahasiswa WHERE nim = ? AND id != ?",
    [nim, id]
);
    if (nimBentrok.length > 0) {
      return res.status(400).json({ message: "NIM sudah digunakan mahasiswa lain." });
    }

    await db.query(
      "UPDATE mahasiswa SET nim=?, nama=?, email=?, program_studi=? WHERE id=?",
      [nim, nama, email, program_studi, id]
    );

    await db.query(
      "UPDATE users SET username=? WHERE id=?",
      [email || nim, mhs[0].user_id]
    );

    res.json({ message: "Data mahasiswa berhasil diperbarui." });
  } catch (error) {
    console.error("Update mahasiswa error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== HAPUS MAHASISWA ==========
const hapusMahasiswa = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { id } = req.params;

    const [mhs] = await conn.query("SELECT * FROM mahasiswa WHERE id = ?", [id]);
    if (!mhs.length) {
      conn.release();
      return res.status(404).json({ message: "Mahasiswa tidak ditemukan." });
    }

    await conn.beginTransaction();

    await conn.query("DELETE FROM notifikasi WHERE user_id = ?", [mhs[0].user_id]);
  
    await conn.query("DELETE FROM pengajuan WHERE mahasiswa_id = ?", [id]);
    await conn.query("DELETE FROM mahasiswa WHERE id = ?", [id]);


    const [sisaMahasiswa] = await conn.query(
      "SELECT id FROM mahasiswa WHERE user_id = ?",
      [mhs[0].user_id]
    );
    if (sisaMahasiswa.length === 0) {
      await conn.query("DELETE FROM users WHERE id = ?", [mhs[0].user_id]);
    }

    await conn.commit();
    res.json({ message: "Mahasiswa berhasil dihapus." });
  } catch (error) {
    await conn.rollback();
    console.error("hapusMahasiswa error:", error);
    res.status(500).json({ message: "Gagal menghapus mahasiswa.", detail: error.message });
  } finally {
    conn.release();
  }
};

const resetPasswordMahasiswa = async (req, res) => {
  try {
    const { id } = req.params;

    const [mhs] = await db.query("SELECT * FROM mahasiswa WHERE id = ?", [id]);
    if (!mhs.length) {
      return res.status(404).json({ message: "Mahasiswa tidak ditemukan." });
    }

    const hashedPassword = await bcrypt.hash(mhs[0].nim, 8);

    await db.query("UPDATE users SET password = ? WHERE id = ?", [
      hashedPassword, mhs[0].user_id,
    ]);

    await db.query(
      "INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
      [
        uuidv4(), mhs[0].user_id,
        "Password Direset",
        "Password akun kamu telah direset oleh Kaprodi. Password baru kamu adalah NIM kamu.",
        "peringatan",
      ]
    );

    res.json({
      message: "Password mahasiswa berhasil direset.",
      info: `Password baru: ${mhs[0].nim}`,
    });
  } catch (error) {
    console.error("resetPasswordMahasiswa error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== MONITORING ==========
const getDaftarMahasiswa = async (req, res) => {
  try {
    const { periode_id } = req.query;

    // PERUBAHAN: dulu filter periode_id pakai "(p.periode_id = ? OR p.id IS
    // NULL)" -- efeknya SEMUA mahasiswa selalu tampil di semua periode
    // (mahasiswa yang belum submit pengajuan lolos filter lewat p.id IS
    // NULL). Sekarang filter periode_id JOIN ke roster_mahasiswa_mbkm --
    // hanya mahasiswa yang memang sudah di-import Kaprodi ke periode itu
    // yang muncul, sesuai maksud "import = berhak ikut MBKM periode ini".
    let query = `
      SELECT
        m.*,
        u.is_active,
        p.id AS pengajuan_id,
        p.status AS status_pengajuan,
        p.periode_id,
        dp.judul AS judul_capstone,
        b.dosen_id,
        d.nama AS nama_dosen
      FROM mahasiswa m
      LEFT JOIN users u
        ON u.id = m.user_id
    `;

    const params = [];

    if (periode_id) {
      query += ` INNER JOIN roster_mahasiswa_mbkm r ON r.mahasiswa_id = m.id AND r.periode_id = ?`;
      params.push(periode_id);
      query += ` LEFT JOIN pengajuan p ON p.mahasiswa_id = m.id AND p.periode_id = ?`;
      params.push(periode_id);
    } else {
      query += ` LEFT JOIN pengajuan p ON p.mahasiswa_id = m.id`;
    }

    query += `
      LEFT JOIN detail_pengajuan dp
        ON dp.pengajuan_id = p.id
      LEFT JOIN bimbingan b
        ON b.pengajuan_id = p.id
      LEFT JOIN dosen d
        ON d.id = b.dosen_id
      ORDER BY m.nama ASC
    `;

    const [rows] = await db.query(query, params);

    res.json({ data: rows });
  } catch (error) {
    console.error("getDaftarMahasiswa error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDaftarDosen = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.*, u.is_active
       FROM dosen d LEFT JOIN users u ON d.user_id = u.id
       ORDER BY d.nama ASC`
    );
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ========== HELPER ROSTER (dipakai bareng MBKM & PA) ==========
const _getPeriodeAktifId = async () => {
  const [rows] = await db.query('SELECT id FROM periode WHERE is_active = 1 LIMIT 1');
  return rows[0]?.id || null;
};

// ========== IMPORT ROSTER (find-or-create per baris, lalu masukkan ke roster periode terpilih) ==========
const _importRosterDosen = async (req, res, tabel, labelRoster) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'File tidak ditemukan.' });

    // periode_id dikirim sebagai field form biasa berdampingan dengan file
    // (multer taruh field non-file di req.body).
    const periodeId = req.body.periode_id || await _getPeriodeAktifId();
    if (!periodeId) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'Tidak ada periode aktif.' });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: 'File kosong atau format tidak sesuai.' });
    }

    let berhasil = 0, gagal = 0, errors = [];

    for (const row of data) {
      try {
        const id_dosen      = String(row['ID Dosen'] || row['id_dosen'] || row['Id Dosen'] || '').trim();
        const nama          = String(row['Nama'] || row['nama'] || row['NAMA'] || '').trim();
        const email         = String(row['Email'] || row['email'] || '').trim();
        const program_studi = String(row['Program Studi'] || row['program_studi'] || '').trim();

        if (!id_dosen) {
          gagal++;
          errors.push('Baris dilewati: ID Dosen kosong.');
          continue;
        }

        // Find-or-create: kalau ID Dosen sudah ada di master, pakai data
        // yang sudah ada (tidak menimpa). Kalau belum ada, buat baru --
        // butuh kolom Nama minimal (email/prodi boleh kosong).
        const [dosenRows] = await db.query('SELECT id FROM dosen WHERE id_dosen = ?', [id_dosen]);
        let dosenId;

        if (dosenRows.length) {
          dosenId = dosenRows[0].id;
        } else {
          if (!nama) {
            gagal++;
            errors.push(`ID Dosen ${id_dosen}: dosen belum terdaftar dan kolom Nama kosong, dilewati.`);
            continue;
          }
          const hashedPassword = await bcrypt.hash(id_dosen, 10);
          const userId = uuidv4();
          await db.query(
            'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
            [userId, email || id_dosen, hashedPassword, 'dosen_pembimbing']
          );
          dosenId = uuidv4();
          await db.query(
            'INSERT INTO dosen (id, user_id, id_dosen, nama, email, program_studi) VALUES (?, ?, ?, ?, ?, ?)',
            [dosenId, userId, id_dosen, nama, email || null, program_studi || null]
          );
        }

        const [existingRoster] = await db.query(
          `SELECT id FROM ${tabel} WHERE dosen_id = ? AND periode_id = ?`,
          [dosenId, periodeId]
        );
        if (existingRoster.length) {
          gagal++;
          errors.push(`Dosen ${id_dosen} sudah ada di roster ${labelRoster} periode ini, dilewati.`);
          continue;
        }

        await db.query(
          `INSERT INTO ${tabel} (id, dosen_id, periode_id, is_active) VALUES (?, ?, ?, 1)`,
          [uuidv4(), dosenId, periodeId]
        );

        berhasil++;
      } catch (rowError) {
        gagal++;
        errors.push(`Error: ${rowError.message}`);
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({
      message: `Import roster ${labelRoster} selesai. Berhasil: ${berhasil}, Gagal: ${gagal}`,
      berhasil, gagal, errors,
    });
  } catch (error) {
    console.error(`Import roster ${labelRoster} error:`, error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

const importRosterDosenMBKM = (req, res) => _importRosterDosen(req, res, 'roster_dosen_mbkm', 'MBKM');
const importRosterDosenPA   = (req, res) => _importRosterDosen(req, res, 'roster_dosen_pa', 'PA');

// ========== TAMBAH SATU DOSEN KE ROSTER (find-or-create dosen master, lalu masukkan ke roster periode terpilih) ==========
const _tambahRosterDosen = async (req, res, tabel, labelRoster) => {
  try {
    const { id_dosen, nama, email, program_studi, periode_id } = req.body;

    if (!id_dosen || !nama || !email || !program_studi) {
      return res.status(400).json({ message: 'Semua field wajib diisi.' });
    }

    const targetPeriodeId = periode_id || await _getPeriodeAktifId();
    if (!targetPeriodeId) {
      return res.status(400).json({ message: 'Tidak ada periode aktif dan periode_id tidak diberikan.' });
    }

    // Find-or-create di master data dosen. Kalau id_dosen sudah ada, dosen
    // yang sudah ada itu yang dipakai (tidak menimpa nama/email/prodi-nya) --
    // ini yang bikin staff bisa menambahkan dosen yang sama ke roster MBKM
    // maupun PA tanpa dianggap error "sudah terdaftar".
    const [existingDosen] = await db.query('SELECT id FROM dosen WHERE id_dosen = ?', [id_dosen]);
    let dosenId;
    let dosenBaru = false;

    if (existingDosen.length) {
      dosenId = existingDosen[0].id;
    } else {
      const hashedPassword = await bcrypt.hash(id_dosen, 10);
      const userId = uuidv4();
      await db.query(
        'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
        [userId, email || id_dosen, hashedPassword, 'dosen_pembimbing']
      );
      dosenId = uuidv4();
      await db.query(
        'INSERT INTO dosen (id, user_id, id_dosen, nama, email, program_studi) VALUES (?, ?, ?, ?, ?, ?)',
        [dosenId, userId, id_dosen, nama, email, program_studi]
      );
      dosenBaru = true;
    }

    const [existingRoster] = await db.query(
      `SELECT id FROM ${tabel} WHERE dosen_id = ? AND periode_id = ?`,
      [dosenId, targetPeriodeId]
    );
    if (existingRoster.length) {
      return res.status(400).json({ message: `Dosen ini sudah ada di roster ${labelRoster} periode tersebut.` });
    }

    await db.query(
      `INSERT INTO ${tabel} (id, dosen_id, periode_id, is_active) VALUES (?, ?, ?, 1)`,
      [uuidv4(), dosenId, targetPeriodeId]
    );

    res.status(201).json({
      message: dosenBaru
        ? `Dosen baru berhasil dibuat dan ditambahkan ke roster ${labelRoster}.`
        : `Dosen (data sudah ada) berhasil ditambahkan ke roster ${labelRoster}.`,
      dosen_baru: dosenBaru,
    });
  } catch (error) {
    console.error(`Tambah roster ${labelRoster} error:`, error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

const tambahRosterDosenMBKM = (req, res) => _tambahRosterDosen(req, res, 'roster_dosen_mbkm', 'MBKM');
const tambahRosterDosenPA   = (req, res) => _tambahRosterDosen(req, res, 'roster_dosen_pa', 'PA');

const _hapusRosterDosen = async (req, res, tabel, labelRoster) => {
  try {
    const { id } = req.params;
    const [existing] = await db.query(`SELECT id FROM ${tabel} WHERE id = ?`, [id]);
    if (!existing.length) return res.status(404).json({ message: `Entri roster ${labelRoster} tidak ditemukan.` });

    await db.query(`DELETE FROM ${tabel} WHERE id = ?`, [id]);
    res.json({ message: `Dosen berhasil dihapus dari roster ${labelRoster}.` });
  } catch (error) {
    console.error(`Hapus roster ${labelRoster} error:`, error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

const hapusRosterDosenMBKM = (req, res) => _hapusRosterDosen(req, res, 'roster_dosen_mbkm', 'MBKM');
const hapusRosterDosenPA   = (req, res) => _hapusRosterDosen(req, res, 'roster_dosen_pa', 'PA');


// ========== LIST ROSTER (join ke data dosen master + status aktif user) ==========
const _getRosterDosen = async (req, res, tabel) => {
  try {
    const periodeId = req.query.periode_id || await _getPeriodeAktifId();
    if (!periodeId) return res.json({ data: [] });

    const [rows] = await db.query(
      `SELECT r.id as roster_id, r.periode_id, r.is_active as roster_is_active,
              d.id as dosen_id, d.id_dosen, d.nama, d.email, d.program_studi,
              u.is_active
       FROM ${tabel} r
       JOIN dosen d ON d.id = r.dosen_id
       LEFT JOIN users u ON u.id = d.user_id
       WHERE r.periode_id = ?
       ORDER BY d.nama ASC`,
      [periodeId]
    );
    res.json({ data: rows });
  } catch (error) {
    console.error('getRosterDosen error:', error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
  }
};

const getRosterDosenMBKM = (req, res) => _getRosterDosen(req, res, 'roster_dosen_mbkm');
const getRosterDosenPA   = (req, res) => _getRosterDosen(req, res, 'roster_dosen_pa');

const getDashboardStats = async (req, res) => {
  try {
    const { periode_id } = req.query;

    const wherePengajuan = periode_id ? "WHERE periode_id = ?" : "";
    const paramsPengajuan = periode_id ? [periode_id] : [];

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM pengajuan ${wherePengajuan}`,
      paramsPengajuan
    );

   const [[{ total_mahasiswa }]] = await db.query(
  `SELECT COUNT(DISTINCT r.mahasiswa_id) as total_mahasiswa
   FROM roster_mahasiswa_mbkm r
   ${periode_id ? "WHERE r.periode_id = ?" : ""}`,
  periode_id ? [periode_id] : []
);
    // PERUBAHAN: Total Dosen -> Total Pembimbing MBKM. Dulu ini ngitung
    // semua baris di tabel `dosen` (master data), sekarang di-scope ke
    // roster_dosen_mbkm per periode yang dipilih di dropdown header,
    // biar konsisten sama halaman "Data Dosen > Pembimbing MBKM".
    // Kalau periode_id tidak dikirim dari frontend, fallback ke periode
    // aktif (pakai helper _getPeriodeAktifId yang udah ada di file ini,
    // dipakai juga sama _getRosterDosen).
    const targetPeriodeIdDosen = periode_id || await _getPeriodeAktifId();
    const [[{ total_dosen }]] = await db.query(
      `SELECT COUNT(DISTINCT dosen_id) as total_dosen
       FROM roster_dosen_mbkm
       ${targetPeriodeIdDosen ? "WHERE periode_id = ?" : ""}`,
      targetPeriodeIdDosen ? [targetPeriodeIdDosen] : []
    );

    res.json({
      data: {
        total_pengajuan: total,
        total_mahasiswa,
        total_dosen,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getAktivitasTerbaru = async (req, res) => {
  try {
    const { periode_id } = req.query;

    const [pengajuan] = await db.query(
      `SELECT 'pengajuan' as tipe, p.id, m.nama as nama_mahasiswa, m.nim,
        p.created_at, p.status, dp.judul as deskripsi
      FROM pengajuan p
      JOIN mahasiswa m ON p.mahasiswa_id = m.id
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id
      ${periode_id ? "WHERE p.periode_id = ?" : ""}
      ORDER BY p.created_at DESC LIMIT 5`,
      periode_id ? [periode_id] : []
    );

    const [dokumen] = await db.query(
      `SELECT 'dokumen' as tipe, d.id, m.nama as nama_mahasiswa, m.nim,
        d.created_at, d.status, d.nama_file as deskripsi
      FROM dokumen d
      JOIN pengajuan p ON d.pengajuan_id = p.id
      JOIN mahasiswa m ON p.mahasiswa_id = m.id
      ${periode_id ? "WHERE p.periode_id = ?" : ""}
      ORDER BY d.created_at DESC LIMIT 5`,
      periode_id ? [periode_id] : []
    );

    const aktivitas = [...pengajuan, ...dokumen]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);

    res.json({ data: aktivitas });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDaftarPengajuan = async (req, res) => {
  try {
    const { periode_id, status } = req.query;
    const params = [];
    let where = "WHERE 1=1";
    if (periode_id) {
      where += " AND p.periode_id = ?";
      params.push(periode_id);
    }
    if (status) {
      where += " AND p.status = ?";
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT
        p.id, p.mahasiswa_id, p.periode_id, p.status,
        p.created_at, p.updated_at,
        m.nim, m.nama, m.program_studi,
        dp.judul, dp.penyelenggara,
        per.nama_periode,
        b.dosen_id, d.nama as nama_dosen
      FROM pengajuan p
      JOIN mahasiswa m ON p.mahasiswa_id = m.id
      JOIN periode per ON p.periode_id = per.id
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id
      LEFT JOIN bimbingan b ON b.pengajuan_id = p.id
      LEFT JOIN dosen d ON b.dosen_id = d.id
      ${where}
      ORDER BY p.created_at DESC`,
      params
    );

    res.json({ data: rows });
  } catch (error) {
    console.error("getDaftarPengajuan error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDetailPengajuan = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(`
      SELECT
        p.id, p.mahasiswa_id, p.periode_id,
        dp.pelatihan, dp.judul, dp.deskripsi,
        dp.tanggal_mulai, dp.tanggal_selesai,
        p.status, p.catatan_dosen, p.catatan_kaprodi,
        p.created_at,
        m.nim, m.nama, m.program_studi, m.email,
        per.nama_periode,
        d.nama as nama_dosen
      FROM pengajuan p
      JOIN mahasiswa m ON p.mahasiswa_id = m.id
      JOIN periode per ON p.periode_id = per.id
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id
      LEFT JOIN bimbingan b ON b.pengajuan_id = p.id
      LEFT JOIN dosen d ON b.dosen_id = d.id
      WHERE p.id = ?
    `, [id]);

    if (!rows.length) return res.status(404).json({ message: "Pengajuan tidak ditemukan." });
    const pengajuan = rows[0];

    let pelatihan = [];
    try {
      const raw = pengajuan.pelatihan;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          pelatihan = parsed.map(item => ({
            nama_pelatihan: typeof item === 'string'
              ? item
              : (item.nama || item.nama_pelatihan || item.judul || String(item)),
            status: item.status || pengajuan.status,
          }));
        } else if (typeof parsed === 'string') {
          pelatihan = [{ nama_pelatihan: parsed, status: pengajuan.status }];
        }
      }
    } catch {
      if (pengajuan.pelatihan) {
        pelatihan = [{ nama_pelatihan: pengajuan.pelatihan, status: pengajuan.status }];
      }
    }

    res.json({
      data: {
        ...pengajuan,
        pelatihan,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const _getExportRows = async (periode_id, mahasiswa_id) => {
  let where = "WHERE 1=1";
  const params = [];
  if (periode_id)   { where += " AND p.periode_id = ?"; params.push(periode_id); }
  if (mahasiswa_id) { where += " AND m.id = ?";          params.push(mahasiswa_id); }

  const [rows] = await db.query(`
    SELECT
      m.id as mahasiswa_id,
      m.nim, m.nama, m.program_studi,
      p.id as pengajuan_id,
      dp.pelatihan, dp.judul,
      per.nama_periode, p.status,
      d.nama as nama_dosen
    FROM pengajuan p
    JOIN mahasiswa m ON p.mahasiswa_id = m.id
    JOIN periode per ON p.periode_id = per.id
    LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id
    LEFT JOIN bimbingan b ON b.pengajuan_id = p.id
    LEFT JOIN dosen d ON b.dosen_id = d.id
    ${where}
    ORDER BY m.nama ASC
  `, params);

  for (const r of rows) {
    let pelatihan = [];
    try {
      const raw = r.pelatihan;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          pelatihan = parsed.map(item => ({
            nama_pelatihan: typeof item === 'string'
              ? item
              : (item.nama || item.nama_pelatihan || item.judul || String(item)),
            status: item.status || r.status,
          }));
        } else if (typeof parsed === 'string') {
          pelatihan = [{ nama_pelatihan: parsed, status: r.status }];
        }
      }
    } catch {
      if (r.pelatihan) {
        pelatihan = [{ nama_pelatihan: r.pelatihan, status: r.status }];
      }
    }

    r.daftar_pelatihan = pelatihan.length > 0
      ? pelatihan
      : [{ nama_pelatihan: '-', status: r.status }];
  }

  return rows;
};

const _statusLabel = (s) => ({
  disetujui_kaprodi: 'Disetujui',
  ditolak:           'Ditolak',
  diajukan:          'Diajukan',
  revisi:            'Revisi',
}[s] || s || '-');

const exportPengajuanExcel = async (req, res) => {
  try {
    const { periode_id, mahasiswa_id } = req.query;
    const rows = await _getExportRows(periode_id, mahasiswa_id);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data Pengajuan MBKM");

    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 14;
    sheet.getColumn(3).width = 25;
    sheet.getColumn(4).width = 25;
    sheet.getColumn(5).width = 25;
    sheet.getColumn(6).width = 35;
    sheet.getColumn(7).width = 15;
    sheet.getColumn(8).width = 18;

    const headerRow = sheet.addRow([
      "No", "NIM", "Nama", "Program Studi", "Dosen Pembimbing",
      "Judul Pelatihan", "Status", "Periode"
    ]);

    headerRow.height = 25;

    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF1D4ED8' } },
        bottom: { style: 'medium', color: { argb: 'FF1D4ED8' } },
        left: { style: 'thin', color: { argb: 'FF1D4ED8' } },
        right: { style: 'thin', color: { argb: 'FF1D4ED8' } },
      };
    });

    const cellBorder = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    };

    const charsPerRow = { nama: 25, prodi: 25, dosen: 25, judul: 40 };

    const estimateLines = (text, chars) =>
      Math.max(1, Math.ceil(String(text || '-').length / chars));

    let excelRowIndex = 1;

    rows.forEach((r, i) => {
      const pelatihanList = r.daftar_pelatihan;
      const bgArgb = i % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFF';
      const startRow = excelRowIndex + 1;
      const ROW_H_BASE = 18;

      pelatihanList.forEach((pt, ptIdx) => {
        const namaLines = estimateLines(r.nama, charsPerRow.nama);
        const prodiLines = estimateLines(r.program_studi, charsPerRow.prodi);
        const dosenLines = estimateLines(r.nama_dosen, charsPerRow.dosen);
        const judulLines = estimateLines(pt.nama_pelatihan, charsPerRow.judul);

        const rowH = Math.max(
          ROW_H_BASE,
          namaLines * ROW_H_BASE,
          prodiLines * ROW_H_BASE,
          dosenLines * ROW_H_BASE,
          judulLines * ROW_H_BASE
        );

        const exRow = sheet.addRow([
          ptIdx === 0 ? i + 1 : null,
          ptIdx === 0 ? r.nim : null,
          ptIdx === 0 ? r.nama : null,
          ptIdx === 0 ? (r.program_studi || '-') : null,
          ptIdx === 0 ? (r.nama_dosen || '-') : null,
          pt.nama_pelatihan || '-',
          _statusLabel(pt.status),
          ptIdx === 0 ? r.nama_periode : null,
        ]);

        exRow.height = rowH;

        exRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
          cell.border = cellBorder;
          cell.font = { size: 9, color: { argb: 'FF111827' } };
          cell.alignment = {
            vertical: 'middle',
            horizontal: colNum === 1 ? 'center' : 'left',
            wrapText: true
          };

          if (colNum === 7) {
            const statusColor =
              pt.status === 'disetujui_kaprodi' ? 'FF16a34a' :
              pt.status === 'ditolak' ? 'FFdc2626' :
              pt.status === 'revisi' ? 'FFd97706' :
              'FF6b7280';

            cell.font = { size: 9, bold: true, color: { argb: statusColor } };
          }
        });

        excelRowIndex++;
      });

      const endRow = excelRowIndex;

      if (pelatihanList.length > 1) {
        [1, 2, 3, 4, 5, 8].forEach(col => {
          sheet.mergeCells(startRow, col, endRow, col);
          const cell = sheet.getCell(startRow, col);
          cell.alignment = {
            vertical: 'middle',
            horizontal: col === 1 ? 'center' : 'left',
            wrapText: true
          };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };
          cell.border = cellBorder;
          cell.font = { size: 9, color: { argb: 'FF111827' } };
        });
      }

      const lastRow = sheet.getRow(endRow);
      lastRow.eachCell({ includeEmpty: true }, cell => {
        cell.border = {
          ...cellBorder,
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });
    });

    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    sheet.eachRow(row => {
      row.eachCell(cell => {
        cell.alignment = { ...cell.alignment, vertical: 'middle', wrapText: true };
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=pengajuan_mbkm.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const exportPengajuanPDF = async (req, res) => {
  try {
    const { periode_id, mahasiswa_id } = req.query;
    const rows = await _getExportRows(periode_id, mahasiswa_id);

    const isSingle = !!mahasiswa_id && rows.length === 1;

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${
        isSingle ? `detail_${rows[0]?.nim || 'mahasiswa'}.pdf` : 'rekap_pengajuan_mbkm.pdf'
      }`
    );

    doc.pipe(res);

    doc.fontSize(14).font('Helvetica-Bold').text('REKAP DATA PENGAJUAN MBKM', { align: 'center' });
    doc.fontSize(10).font('Helvetica')
      .text('Program Studi Sistem dan Teknologi Informasi', { align: 'center' })
      .text('Institut Teknologi & Bisnis Sabda Setia', { align: 'center' });

    if (rows.length) {
      doc.text(`Periode: ${rows[0].nama_periode}`, { align: 'center' });
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1).stroke('#94a3b8');
    doc.moveDown(1);

    if (isSingle) {
      const r = rows[0];

      const field = (label, value) => {
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(9).text(label, 50, y, { width: 155 });
        doc.font('Helvetica').fontSize(9).text(': ' + String(value || '-'), 205, y, { width: 330 });
        doc.moveDown(0.5);
      };

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1e3a8a').text('Informasi Mahasiswa');
      doc.fillColor('black');
      doc.moveDown(0.5);

      field('NIM', r.nim);
      field('Nama', r.nama);
      field('Program Studi', r.program_studi);
      field('Dosen Pembimbing', r.nama_dosen || '-');
      field('Periode', r.nama_periode);

      const pelatihanList = r.daftar_pelatihan;
      const PELATIHAN_NO_X = 205;
      const showNumbering = pelatihanList.length > 1;

      {
        const y = doc.y;
        doc.font('Helvetica-Bold').fontSize(9).text('Judul Pelatihan', 50, y, { width: 155 });
        doc.font('Helvetica').fontSize(9).text(':', PELATIHAN_NO_X, y, { width: 12 });
        doc.text(
          showNumbering
            ? `1. ${pelatihanList[0]?.nama_pelatihan || '-'}`
            : (pelatihanList[0]?.nama_pelatihan || '-'),
          PELATIHAN_NO_X + 12, y, { width: 330 - 12 }
        );
        doc.moveDown(0.4);
      }

      pelatihanList.slice(1).forEach((pt, index) => {
        doc.font('Helvetica').fontSize(9).text(
          `${index + 2}. ${pt.nama_pelatihan}`,
          PELATIHAN_NO_X + 12, doc.y, { width: 330 - 12 }
        );
        doc.moveDown(0.4);
      });
    } else {
      const COL = { no: 50, nim: 70, nama: 130, dosen: 230, judul: 335, status: 490 };
      const WID = { no: 20, nim: 60, nama: 95, dosen: 100, judul: 145, status: 55 };
      const FONT_SIZE = 8;
      const LINE_H = 13;
      const ROW_PAD = 6;

      const textHeight = (text, width) => {
        const chars = Math.floor(width / (FONT_SIZE * 0.52));
        const lines = Math.ceil(String(text || '-').length / chars);
        return Math.max(1, lines) * LINE_H;
      };

      const drawHeader = () => {
        const y = doc.y;
        doc.rect(50, y, 495, 22).fill('#2563EB');
        doc.fillColor('white').font('Helvetica-Bold').fontSize(FONT_SIZE);

        doc.text('No', COL.no, y + 6, { width: WID.no });
        doc.text('NIM', COL.nim, y + 6, { width: WID.nim });
        doc.text('Nama', COL.nama, y + 6, { width: WID.nama });
        doc.text('Dosen Pembimbing', COL.dosen, y + 6, { width: WID.dosen });
        doc.text('Judul Pelatihan', COL.judul, y + 6, { width: WID.judul });
        doc.text('Status', COL.status, y + 6, { width: WID.status });

        doc.fillColor('black');
        doc.y = y + 22;
      };

      drawHeader();

      rows.forEach((r, i) => {
        const list = r.daftar_pelatihan;
        const heights = list.map(pt =>
          Math.max(LINE_H, textHeight(pt.nama_pelatihan, WID.judul))
        );
        const totalH = heights.reduce((a, b) => a + b, 0) + ROW_PAD * 2;

        if (doc.y + totalH > 760) {
          doc.addPage();
          drawHeader();
        }

        const y = doc.y;
        const bg = i % 2 === 0 ? '#ffffff' : '#f0f6ff';

        doc.rect(50, y, 495, totalH).fill(bg);
        doc.fillColor('#111827').font('Helvetica').fontSize(FONT_SIZE);

        const centerY = y + (totalH - LINE_H) / 2;

        doc.text(`${i + 1}`, COL.no, centerY, { width: WID.no });
        doc.text(r.nim, COL.nim, centerY, { width: WID.nim });
        doc.text(r.nama, COL.nama, centerY, { width: WID.nama });
        doc.text(r.nama_dosen || '-', COL.dosen, centerY, { width: WID.dosen });

        let ptY = y + ROW_PAD;

        list.forEach((pt, index) => {
          doc.text(pt.nama_pelatihan || '-', COL.judul, ptY, { width: WID.judul });

          doc.font('Helvetica-Bold').fillColor('#16a34a').text(
            _statusLabel(pt.status), COL.status, ptY, { width: WID.status }
          );

          doc.fillColor('#111827').font('Helvetica');
          ptY += heights[index];

          if (index < list.length - 1) {
            doc.moveTo(COL.judul, ptY).lineTo(545, ptY).lineWidth(0.4).stroke('#cbd5e1');
          }
        });

        const bottom = y + totalH;
        doc.moveTo(50, bottom).lineTo(545, bottom).lineWidth(1).stroke('#64748b');
        doc.y = bottom + 1;
      });

      doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1.5).stroke('#334155');
    }

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getProfil = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.username, u.role, u.created_at,
              s.nama, s.email
       FROM users u
       LEFT JOIN staff_akademik s ON s.user_id = u.id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: "User tidak ditemukan." });
    res.json({ data: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const updateProfil = async (req, res) => {
  try {
    const { nama, email } = req.body;
    await db.query(
      "UPDATE staff_akademik SET nama = ?, email = ? WHERE user_id = ?",
      [nama, email, req.user.id]
    );
    res.json({ message: "Profil berhasil diperbarui." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getPeriode = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, nama_periode FROM periode ORDER BY id DESC');
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Terjadi kesalahan server.' });
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


const getDaftarMahasiswaMBKM = async (req, res) => {
  try {
    const { periode_id } = req.query;
    const [rows] = await db.query(
      `SELECT
        m.nim, m.nama,
        p.id as pengajuan_id, p.status as status_pengajuan,
        dp.judul as program_mbkm, dp.penyelenggara as instansi,
        dpa.nama as dosen_pa,
        pn.nilai_akhir, pn.grade
      FROM mahasiswa m
      INNER JOIN pengajuan p ON p.mahasiswa_id = m.id ${periode_id ? "AND p.periode_id = ?" : ""}
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id
      LEFT JOIN dosen dpa ON dpa.id = m.dosen_pembimbing_akademik_id
      LEFT JOIN penilaian pn ON pn.pengajuan_id = p.id AND pn.finalized_at IS NOT NULL
      ORDER BY m.nama ASC`,
      periode_id ? [periode_id] : []
    );
    res.json({ data: rows });
  } catch (error) {
    console.error("getDaftarMahasiswaMBKM error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getLogbookMahasiswa = async (req, res) => {
  try {
    const { pengajuan_id } = req.query;
    if (!pengajuan_id) return res.status(400).json({ message: "pengajuan_id wajib diisi." });

   const [rows] = await db.query(
  `SELECT l.id, l.tanggal, l.jam_mulai, l.jam_selesai, l.kegiatan, l.durasi_menit, l.status, l.bukti_link, l.cloudinary_public_id, pl.nama AS nama_pelatihan
   FROM logbook l
   LEFT JOIN pelatihan pl ON pl.id = l.pelatihan_id
   WHERE l.pengajuan_id = ? ORDER BY l.tanggal DESC`,
  [pengajuan_id]
);
    res.json({ data: rows });
  } catch (error) {
    console.error("getLogbookMahasiswa (staff) error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDokumenMahasiswa = async (req, res) => {
  try {
    const { pengajuan_id } = req.query;
    if (!pengajuan_id) return res.status(400).json({ message: "pengajuan_id wajib diisi." });

    const [rows] = await db.query(
      `SELECT id, jenis, nama_file, cloudinary_url, status FROM dokumen WHERE pengajuan_id = ?`,
      [pengajuan_id]
    );
    res.json({ data: rows });
  } catch (error) {
    console.error("getDokumenMahasiswa (staff) error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getNilaiMahasiswa = async (req, res) => {
  try {
    const { pengajuan_id } = req.query;
    if (!pengajuan_id) return res.status(400).json({ message: "pengajuan_id wajib diisi." });

    const [rows] = await db.query(
      `SELECT
        pn.id, pn.pengajuan_id, pn.finalized_at,
        pn.nilai_kesesuaian, pn.nilai_proyek, pn.nilai_evaluasi,
        pn.nilai_laporan, pn.nilai_presentasi, pn.nilai_akhir, pn.grade, pn.catatan,
        d.nama as nama_dosen
      FROM penilaian pn
      LEFT JOIN dosen d ON d.id = pn.dosen_id
      WHERE pn.pengajuan_id = ? AND pn.finalized_at IS NOT NULL`,
      [pengajuan_id]
    );

    res.json({ data: rows[0] || null });
  } catch (error) {
    console.error("getNilaiMahasiswa error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

module.exports = {
  importMahasiswa,
  tambahMahasiswa,

  importDosen,
  tambahDosen,
  updateDosen,

  importRosterDosenMBKM,
  importRosterDosenPA,
  tambahRosterDosenMBKM,
  tambahRosterDosenPA,
  hapusRosterDosenMBKM,
  hapusRosterDosenPA,
  getRosterDosenMBKM,
  getRosterDosenPA,

  updateMahasiswa,
  hapusMahasiswa,
  resetPasswordMahasiswa,
  getDaftarMahasiswa,
  getDaftarDosen,

  getDashboardStats,
  getAktivitasTerbaru,
  getDaftarPengajuan,
  getDetailPengajuan,
  exportPengajuanExcel,
  exportPengajuanPDF,
  getProfil,
  updateProfil,
  getPeriode,
  getRekapNilai,

  getDaftarMahasiswaMBKM,
  getLogbookMahasiswa,
  getDokumenMahasiswa,

  getNilaiMahasiswa,
};