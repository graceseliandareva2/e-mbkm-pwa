const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const bcrypt = require("bcryptjs");
const xlsx = require("xlsx");
const fs = require("fs");
const {
  buildExportFilename,
  buildExportFilenameFromRows,
  buildContentDispositionHeader,
} = require("../utils/exportFilename");
const { getLogbookExportData, generateLogbookPdfBuffer } = require("../utils/logbookPDFGenerator");
const _getPeriodeAktifId = async () => {
  const [rows] = await db.query(
    "SELECT id_periode AS id FROM periode WHERE is_active = 1 LIMIT 1",
  );
  return rows[0]?.id || null;
};

// Cari value kolom secara case-insensitive & trim-whitespace-safe, biar nggak
// kena masalah header Excel yang ada spasi tersembunyi (mis. "NIDN " dengan
// trailing space) atau beda kapitalisasi.
const getCol = (row, ...names) => {
  const normalizedNames = names.map((n) => n.trim().toLowerCase());
  for (const key of Object.keys(row)) {
    if (normalizedNames.includes(key.trim().toLowerCase())) {
      return String(row[key] ?? "").trim();
    }
  }
  return "";
};

const importMahasiswa = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "File tidak ditemukan." });
    }

    const periodeId = req.body.periode_id || (await _getPeriodeAktifId());
    if (!periodeId) {
      fs.unlinkSync(req.file.path);
      return res
        .status(400)
        .json({
          message: "Tidak ada periode aktif dan periode_id tidak diberikan.",
        });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      fs.unlinkSync(req.file.path);
      return res
        .status(400)
        .json({ message: "File kosong atau format tidak sesuai." });
    }

    const headerKeys = Object.keys(data[0] || {});
    const hasNimColumn = headerKeys.some((k) =>
      ["NIM Mahasiswa", "NIM", "nim"].includes(k),
    );
    const hasNamaColumn = headerKeys.some((k) =>
      ["Nama Mahasiswa", "Nama", "nama"].includes(k),
    );
    const hasEmailColumn = headerKeys.some((k) =>
      [
        "Email Mahasiswa",
        "E-mail Mahasiswa",
        "E-Mail Mahasiswa",
        "Email",
        "email",
      ].includes(k),
    );
    const hasProdiColumn = headerKeys.some((k) =>
      ["Program Studi", "Prodi", "prodi"].includes(k),
    );

    if (!hasNimColumn || !hasNamaColumn || !hasEmailColumn || !hasProdiColumn) {
      fs.unlinkSync(req.file.path);
      return res
        .status(400)
        .json({ message: "File kosong atau format tidak sesuai." });
    }

    let berhasil = 0;
    let gagal = 0;
    let errors = [];

    for (const row of data) {
      try {
        const nim = String(
          row["NIM Mahasiswa"] || row["NIM"] || row["nim"] || "",
        ).trim();
        const nama = String(
          row["Nama Mahasiswa"] || row["Nama"] || row["nama"] || "",
        ).trim();
        const email = String(
          row["Email Mahasiswa"] ||
            row["E-mail Mahasiswa"] ||
            row["E-Mail Mahasiswa"] ||
            row["Email"] ||
            row["email"] ||
            "",
        ).trim();
        const prodi = String(
          row["Program Studi"] || row["Prodi"] || row["prodi"] || "",
        ).trim();

        if (!nim || !nama) {
          gagal++;
          errors.push("Baris dilewati: NIM atau Nama kosong.");
          continue;
        }

        // NIM ini sudah ada, dan sudah di periode yang sama
        const [existingNim] = await db.query(
          "SELECT id_users AS id, current_periode_id FROM users WHERE nim = ?",
          [nim],
        );

        if (
          existingNim.length > 0 &&
          String(existingNim[0].current_periode_id) === String(periodeId)
        ) {
          gagal++;
          errors.push(`NIM ${nim} sudah terdaftar di periode ini, dilewati.`);
          continue;
        }

        const username = email || nim;

        const [usernameBentrok] = await db.query(
          "SELECT id_users FROM users WHERE username = ? AND (nim IS NULL OR nim != ?)",
          [username, nim],
        );
        if (usernameBentrok.length > 0) {
          gagal++;
          errors.push(
            `Username ${username} sudah dipakai akun lain, NIM ${nim} dilewati.`,
          );
          continue;
        }

        const userId = uuidv4();
        const hashedPassword = await bcrypt.hash(nim, 8);

        await db.query(
          `INSERT INTO users (id_users, username, password, role, nama, email, nim, program_studi, current_periode_id, imported_by)
           VALUES (?, ?, ?, 'mahasiswa', ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             username = VALUES(username),
             nama = VALUES(nama),
             email = VALUES(email),
             program_studi = VALUES(program_studi),
             current_periode_id = VALUES(current_periode_id),
             imported_by = VALUES(imported_by)`,
          [
            userId,
            username,
            hashedPassword,
            nama,
            email || null,
            nim,
            prodi || null,
            periodeId,
            req.user.id,
          ],
        );

        berhasil++;
      } catch (err) {
        gagal++;
        errors.push(err.message);
      }
    }

    fs.unlinkSync(req.file.path);

    if (berhasil === 0) {
      return res.status(400).json({
        message: "Data ini sudah terdaftar di periode ini",
        berhasil,
        gagal,
        errors,
      });
    }

    return res.json({
      message: `Import selesai. Berhasil: ${berhasil}, Gagal: ${gagal}`,
      berhasil,
      gagal,
      errors,
    });
  } catch (error) {
    console.error("Import mahasiswa error:", error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const tambahMahasiswa = async (req, res) => {
  try {
    const { nim, nama, email, program_studi, periode_id } = req.body;

    if (!nim || !nama || !email || !program_studi) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const targetPeriodeId = periode_id || (await _getPeriodeAktifId());
    if (!targetPeriodeId) {
      return res
        .status(400)
        .json({
          message: "Tidak ada periode aktif dan periode_id tidak diberikan.",
        });
    }

    const [existingNim] = await db.query(
      "SELECT id_users AS id, current_periode_id FROM users WHERE nim = ?",
      [nim],
    );

    if (existingNim.length > 0) {
      if (
        String(existingNim[0].current_periode_id) === String(targetPeriodeId)
      ) {
        return res
          .status(400)
          .json({ message: "NIM ini sudah terdaftar di periode ini." });
      }

      const [usernameBentrok] = await db.query(
        "SELECT id_users FROM users WHERE username = ? AND id_users != ?",
        [email, existingNim[0].id],
      );
      if (usernameBentrok.length > 0) {
        return res
          .status(400)
          .json({ message: "Email ini sudah terdaftar untuk akun lain." });
      }

      await db.query(
        "UPDATE users SET username=?, nama=?, email=?, program_studi=?, current_periode_id=? WHERE id_users=?",
        [email, nama, email, program_studi, targetPeriodeId, existingNim[0].id],
      );

      return res.json({
        message: "Mahasiswa lama berhasil didaftarkan ulang ke periode ini.",
      });
    }

    const [existingUsername] = await db.query(
      "SELECT id_users FROM users WHERE username = ?",
      [email],
    );
    if (existingUsername.length > 0) {
      return res
        .status(400)
        .json({ message: "Email ini sudah terdaftar untuk akun lain." });
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(nim, 8);

    await db.query(
      `INSERT INTO users (id_users, username, password, role, nama, email, nim, program_studi, current_periode_id, imported_by)
       VALUES (?, ?, ?, 'mahasiswa', ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        email,
        hashedPassword,
        nama,
        email,
        nim,
        program_studi,
        targetPeriodeId,
        req.user.id,
      ],
    );

    res.status(201).json({ message: "Data mahasiswa berhasil ditambahkan." });
  } catch (error) {
    console.error("Tambah mahasiswa error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// IMPORT / TAMBAH DOSEN
// id_dosen = ID login dosen (basis hash password). nidn = NIDN resmi, terpisah,
// cuma ditampilkan di dokumen (logbook dll), tidak dipakai untuk login.
const importDosen = async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ message: "File tidak ditemukan." });

    const periodeId = req.body.periode_id || (await _getPeriodeAktifId());
    if (!periodeId) {
      fs.unlinkSync(req.file.path);
      return res
        .status(400)
        .json({
          message: "Tidak ada periode aktif dan periode_id tidak diberikan.",
        });
    }

    const workbook = xlsx.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      fs.unlinkSync(req.file.path);
      return res
        .status(400)
        .json({ message: "File kosong atau format tidak sesuai." });
    }

    let berhasil = 0,
      gagal = 0,
      errors = [];

    for (const row of data) {
      try {
        // ID Dosen -- khusus buat login/username & basis password, BUKAN NIDN resmi.
        // Pakai getCol() supaya tahan terhadap header Excel yang ada spasi
        // tersembunyi atau beda kapitalisasi (mis. "ID Dosen ", "id dosen").
        const idDosen = getCol(row, "ID Dosen", "Id Dosen", "id_dosen");
        // NIDN resmi -- ditampilkan di dokumen (logbook dll), terpisah dari ID Dosen
        const nidn = getCol(row, "NIDN", "nidn");

        const nama = getCol(row, "Nama", "nama", "NAMA");
        const email = getCol(row, "Email", "email");
        const program_studi =
          getCol(row, "Program Studi", "program_studi") || null;

        if (!idDosen || !nama) {
          gagal++;
          errors.push(`ID Dosen atau Nama kosong`);
          continue;
        }

        // Cek konflik username dengan akun LAIN (id_dosen beda) -- ini tetap harus dicegah
        const username = email || idDosen;
        const [usernameBentrok] = await db.query(
          "SELECT id_users FROM users WHERE username = ? AND (id_dosen IS NULL OR id_dosen != ?)",
          [username, idDosen],
        );
        if (usernameBentrok.length > 0) {
          gagal++;
          errors.push(
            `Username ${username} sudah dipakai akun lain, ID ${idDosen} dilewati.`,
          );
          continue;
        }

        const userId = uuidv4();
        const hashedPassword = await bcrypt.hash(idDosen, 10);

        // id_dosen adalah UNIQUE KEY, jadi baris yang sudah ada (walau di periode
        // yang sama) tetap di-UPDATE datanya (termasuk nidn), bukan di-skip.
        await db.query(
          `INSERT INTO users (id_users, username, password, role, nama, email, id_dosen, nidn, program_studi, current_periode_id, imported_by)
           VALUES (?, ?, ?, 'dosen', ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             username = VALUES(username),
             nama = VALUES(nama),
             email = VALUES(email),
             nidn = VALUES(nidn),
             program_studi = VALUES(program_studi),
             current_periode_id = VALUES(current_periode_id),
             imported_by = VALUES(imported_by)`,
          [
            userId,
            username,
            hashedPassword,
            nama,
            email || null,
            idDosen,
            nidn || null,
            program_studi,
            periodeId,
            req.user.id,
          ],
        );

        berhasil++;
      } catch (rowError) {
        gagal++;
        errors.push(`Error: ${rowError.message}`);
      }
    }

    fs.unlinkSync(req.file.path);

    if (berhasil === 0) {
      return res.status(400).json({
        message: "Data ini sudah terdaftar di periode ini",
        berhasil,
        gagal,
        errors,
      });
    }

    res.json({
      message: `Import selesai. Berhasil: ${berhasil}, Gagal: ${gagal}`,
      berhasil,
      gagal,
      errors,
    });
  } catch (error) {
    console.error("Import dosen error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const tambahDosen = async (req, res) => {
  try {
    const { id_dosen, nidn, nama, email, program_studi, periode_id } = req.body;

    if (!id_dosen || !nama || !email || !program_studi) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const targetPeriodeId = periode_id || (await _getPeriodeAktifId());
    if (!targetPeriodeId) {
      return res
        .status(400)
        .json({
          message: "Tidak ada periode aktif dan periode_id tidak diberikan.",
        });
    }

    const [existingIdDosen] = await db.query(
      "SELECT id_users AS id, current_periode_id FROM users WHERE id_dosen = ?",
      [id_dosen],
    );

    if (existingIdDosen.length > 0) {
      if (
        String(existingIdDosen[0].current_periode_id) === String(targetPeriodeId)
      ) {
        return res
          .status(400)
          .json({ message: "ID ini sudah terdaftar di periode ini." });
      }

      const [usernameBentrok] = await db.query(
        "SELECT id_users FROM users WHERE username = ? AND id_users != ?",
        [email, existingIdDosen[0].id],
      );
      if (usernameBentrok.length > 0) {
        return res
          .status(400)
          .json({ message: "Email ini sudah terdaftar untuk akun lain." });
      }

      await db.query(
        "UPDATE users SET username=?, nama=?, email=?, nidn=?, program_studi=?, current_periode_id=? WHERE id_users=?",
        [
          email,
          nama,
          email,
          nidn || null,
          program_studi,
          targetPeriodeId,
          existingIdDosen[0].id,
        ],
      );

      return res.json({
        message: "Dosen lama berhasil didaftarkan ulang ke periode ini.",
      });
    }

    const [existingEmail] = await db.query(
      "SELECT id_users FROM users WHERE username = ?",
      [email],
    );
    if (existingEmail.length > 0) {
      return res.status(400).json({ message: "Email ini sudah terdaftar." });
    }

    // Password dosen = hash dari ID Dosen (dipakai login), bukan dari NIDN
    const hashedPassword = await bcrypt.hash(id_dosen, 10);
    const userId = uuidv4();

    await db.query(
      `INSERT INTO users (id_users, username, password, role, nama, email, id_dosen, nidn, program_studi, current_periode_id, imported_by)
       VALUES (?, ?, ?, 'dosen', ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        email,
        hashedPassword,
        nama,
        email,
        id_dosen,
        nidn || null,
        program_studi,
        targetPeriodeId,
        req.user.id,
      ],
    );

    res.status(201).json({ message: "Data dosen berhasil ditambahkan." });
  } catch (error) {
    console.error("Tambah dosen error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const updateDosen = async (req, res) => {
  try {
    const { id } = req.params;
    const { id_dosen, nidn, nama, email, program_studi, is_active } = req.body;

    if (!id_dosen || !nama || !email || !program_studi) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const [dosen] = await db.query(
      "SELECT * FROM users WHERE id_users = ? AND role = 'dosen'",
      [id],
    );
    if (!dosen.length) {
      return res.status(404).json({ message: "Dosen tidak ditemukan." });
    }

    const [idDosenBentrok] = await db.query(
      "SELECT id_users FROM users WHERE id_dosen = ? AND id_users != ?",
      [id_dosen, id],
    );
    if (idDosenBentrok.length > 0) {
      return res
        .status(400)
        .json({ message: "ID ini sudah terdaftar untuk akun lain." });
    }
    const [emailBentrok] = await db.query(
      "SELECT id_users FROM users WHERE username = ? AND id_users != ?",
      [email, id],
    );
    if (emailBentrok.length > 0) {
      return res
        .status(400)
        .json({ message: "Email ini sudah terdaftar untuk akun lain." });
    }

    await db.query(
      "UPDATE users SET id_dosen=?, nidn=?, nama=?, email=?, username=?, program_studi=?, is_active=? WHERE id_users=?",
      [id_dosen, nidn || null, nama, email, email, program_studi, is_active ? 1 : 0, id],
    );

    res.json({ message: "Data dosen berhasil diperbarui." });
  } catch (error) {
    console.error("Update dosen error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const updateMahasiswa = async (req, res) => {
  try {
    const { id } = req.params;
    const { nim, nama, email, program_studi } = req.body;

    if (!nim || !nama || !email || !program_studi) {
      return res.status(400).json({ message: "Semua field wajib diisi." });
    }

    const [mhs] = await db.query(
      "SELECT * FROM users WHERE id_users = ? AND role = 'mahasiswa'",
      [id],
    );
    if (!mhs.length) {
      return res.status(404).json({ message: "Mahasiswa tidak ditemukan." });
    }

    const [nimBentrok] = await db.query(
      "SELECT id_users FROM users WHERE nim = ? AND id_users != ?",
      [nim, id],
    );
    if (nimBentrok.length > 0) {
      return res
        .status(400)
        .json({ message: "NIM sudah digunakan mahasiswa lain." });
    }
    const usernameBaru = email || nim;
    const [emailBentrok] = await db.query(
      "SELECT id_users FROM users WHERE username = ? AND id_users != ?",
      [usernameBaru, id],
    );
    if (emailBentrok.length > 0) {
      return res
        .status(400)
        .json({ message: "Email ini sudah terdaftar untuk akun lain." });
    }

    await db.query(
      "UPDATE users SET nim=?, nama=?, email=?, username=?, program_studi=? WHERE id_users=?",
      [nim, nama, email, usernameBaru, program_studi, id],
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
    const [mhs] = await conn.query(
      "SELECT * FROM users WHERE id_users = ? AND role = 'mahasiswa'",
      [id],
    );
    if (!mhs.length) {
      return res.status(404).json({ message: "Mahasiswa tidak ditemukan." }); 
    }

    await conn.beginTransaction();
    await conn.query("DELETE FROM notifikasi WHERE user_id = ?", [id]);
    await conn.query("DELETE FROM pengajuan WHERE mahasiswa_id = ?", [id]);
    await conn.query("DELETE FROM users WHERE id_users = ?", [id]);
    await conn.commit();

    res.json({ message: "Mahasiswa berhasil dihapus." });
  } catch (error) {
    await conn.rollback();
    console.error("hapusMahasiswa error:", error);
    res
      .status(500)
      .json({ message: "Gagal menghapus mahasiswa.", detail: error.message });
  } finally {
    conn.release(); 
  }
};

const resetPasswordMahasiswa = async (req, res) => {
  try {
    const { id } = req.params;

    const [mhs] = await db.query(
      "SELECT * FROM users WHERE id_users = ? AND role = 'mahasiswa'",
      [id],
    );
    if (!mhs.length) {
      return res.status(404).json({ message: "Mahasiswa tidak ditemukan." });
    }

    const hashedPassword = await bcrypt.hash(mhs[0].nim, 8);

    await db.query("UPDATE users SET password = ? WHERE id_users = ?", [
      hashedPassword,
      id,
    ]);

    await db.query(
      "INSERT INTO notifikasi (id_notifikasi, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
      [
        uuidv4(),
        id,
        "Password Direset",
        "Password akun kamu telah direset oleh Kaprodi. Password baru kamu adalah NIM kamu.",
        "peringatan",
      ],
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

//  MONITORING 
const getDaftarMahasiswa = async (req, res) => {
  try {
    const { periode_id } = req.query;
    const targetPeriodeId = periode_id || (await _getPeriodeAktifId());
    const params = [];

    let query = `
      SELECT
        u.id_users AS id, u.nim, u.nama, u.email, u.program_studi, u.is_active, u.current_periode_id,
        p.id_pengajuan AS pengajuan_id,
        p.status AS status_pengajuan,
        p.periode_id,
        dp.judul AS judul_capstone,
        p.dosen_id,
        d.nama AS nama_dosen
      FROM users u
    `;

    if (targetPeriodeId) {
      query += ` LEFT JOIN pengajuan p ON p.mahasiswa_id = u.id_users AND p.periode_id = ?`;
      params.push(targetPeriodeId);
    } else {
      query += ` LEFT JOIN pengajuan p ON p.mahasiswa_id = u.id_users`;
    }

    query += `
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
      LEFT JOIN users d ON d.id_users = p.dosen_id
      WHERE u.role = 'mahasiswa'
      ${targetPeriodeId ? "AND u.current_periode_id = ?" : ""}
      ORDER BY u.nama ASC
    `;
    if (targetPeriodeId) params.push(targetPeriodeId);

    const [rows] = await db.query(query, params);

    res.json({ data: rows });
  } catch (error) {
    console.error("getDaftarMahasiswa error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDaftarDosen = async (req, res) => {
  try {
    const { periode_id } = req.query;
    const targetPeriodeId = periode_id || (await _getPeriodeAktifId());

    const params = [];
    let query = `
      SELECT id_users AS id, id_dosen, nidn, nama, email, program_studi, current_periode_id, is_active
      FROM users WHERE role = 'dosen'
    `;

    if (targetPeriodeId) {
      query += ` AND current_periode_id = ?`;
      params.push(targetPeriodeId);
    }

    query += ` ORDER BY nama ASC`;

    const [rows] = await db.query(query, params);
    res.json({ data: rows });
  } catch (error) {
    console.error("getDaftarDosen error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const { periode_id } = req.query;
    const targetPeriodeId = periode_id || (await _getPeriodeAktifId());
    if (!targetPeriodeId) {
      return res.json({
        data: {
          total_pengajuan: 0,
          total_mahasiswa: 0,
          total_dosen: 0,
        },
      });
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) as total FROM pengajuan WHERE periode_id = ?`,
      [targetPeriodeId],
    );

    const [[{ total_mahasiswa }]] = await db.query(
      `SELECT COUNT(*) as total_mahasiswa FROM users
       WHERE role = 'mahasiswa' AND current_periode_id = ?`,
      [targetPeriodeId],
    );

    const [[{ total_dosen }]] = await db.query(
      `SELECT COUNT(*) as total_dosen FROM users
       WHERE role = 'dosen' AND current_periode_id = ?`,
      [targetPeriodeId],
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
    const targetPeriodeId = periode_id || (await _getPeriodeAktifId());

    const [pengajuan] = await db.query(
      `SELECT 'pengajuan' as tipe, p.id_pengajuan AS id, u.nama as nama_mahasiswa, u.nim,
        p.created_at, p.status, dp.judul as deskripsi
      FROM pengajuan p
      JOIN users u ON p.mahasiswa_id = u.id_users
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
      ${targetPeriodeId ? "WHERE p.periode_id = ?" : ""}
      ORDER BY p.created_at DESC LIMIT 5`,
      targetPeriodeId ? [targetPeriodeId] : [],
    );

    const [dokumen] = await db.query(
      `SELECT 'dokumen' as tipe, d.id_dokumen AS id, u.nama as nama_mahasiswa, u.nim,
        d.created_at, d.status, d.nama_file as deskripsi
      FROM dokumen d
      JOIN pengajuan p ON d.pengajuan_id = p.id_pengajuan
      JOIN users u ON p.mahasiswa_id = u.id_users
      ${targetPeriodeId ? "WHERE p.periode_id = ?" : ""}
      ORDER BY d.created_at DESC LIMIT 5`,
      targetPeriodeId ? [targetPeriodeId] : [],
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
    const targetPeriodeId = periode_id || (await _getPeriodeAktifId());
    const params = [];
    let where = "WHERE 1=1";
    if (targetPeriodeId) {
      where += " AND p.periode_id = ?";
      params.push(targetPeriodeId);
    }
    if (status) {
      where += " AND p.status = ?";
      params.push(status);
    }

    const [rows] = await db.query(
      `SELECT
        p.id_pengajuan AS id, p.mahasiswa_id, p.periode_id, p.status,
        p.created_at, p.updated_at,
        u.nim, u.nama, u.program_studi,
        dp.judul, dp.penyelenggara,
        per.nama_periode,
        p.dosen_id, d.nama as nama_dosen
      FROM pengajuan p
      JOIN users u ON p.mahasiswa_id = u.id_users
      JOIN periode per ON p.periode_id = per.id_periode
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
      LEFT JOIN users d ON p.dosen_id = d.id_users
      ${where}
      ORDER BY p.created_at DESC`,
      params,
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

    const [rows] = await db.query(
      `
      SELECT
        p.id_pengajuan AS id, p.mahasiswa_id, p.periode_id,
        dp.judul, dp.penyelenggara,
        dp.nama_pelatihan, dp.link_pelatihan, dp.durasi_pelatihan_jam,
        dp.tanggal_mulai, dp.tanggal_selesai,
        p.status, p.catatan_kaprodi,
        p.created_at,
        u.nim, u.nama, u.program_studi, u.email,
        per.nama_periode,
        d.nama as nama_dosen
      FROM pengajuan p
      JOIN users u ON p.mahasiswa_id = u.id_users
      JOIN periode per ON p.periode_id = per.id_periode
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
      LEFT JOIN users d ON p.dosen_id = d.id_users
      WHERE p.id_pengajuan = ?
    `,
      [id],
    );

    if (!rows.length)
      return res.status(404).json({ message: "Pengajuan tidak ditemukan." });

    res.json({ data: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const _getExportRows = async (periode_id, mahasiswa_id) => {
  let where = "WHERE 1=1";
  const params = [];
  if (periode_id) {
    where += " AND p.periode_id = ?";
    params.push(periode_id);
  }
  if (mahasiswa_id) {
    where += " AND u.id_users = ?";
    params.push(mahasiswa_id);
  }

  const [rows] = await db.query(
    `
    SELECT
      u.id_users as mahasiswa_id,
      u.nim, u.nama, u.program_studi,
      p.id_pengajuan as pengajuan_id,
      dp.nama_pelatihan, dp.judul,
      per.nama_periode, p.status,
      d.nama as nama_dosen
    FROM pengajuan p
    JOIN users u ON p.mahasiswa_id = u.id_users
    JOIN periode per ON p.periode_id = per.id_periode
    LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
    LEFT JOIN users d ON p.dosen_id = d.id_users
    ${where}
    ORDER BY u.nama ASC
  `,
    params,
  );

  return rows;
};

const _statusLabel = (s) =>
  ({
    disetujui_kaprodi: "Disetujui",
    disetujui_dosen: "Disetujui Dosen",
    ditolak: "Ditolak",
    diajukan: "Diajukan",
    revisi: "Revisi",
    draft: "Draft",
  })[s] ||
  s ||
  "-";

const exportPengajuanExcel = async (req, res) => {
  try {
    const { periode_id, mahasiswa_id } = req.query;
    const rows = await _getExportRows(periode_id, mahasiswa_id);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data Pengajuan MBKM");

    sheet.columns = [
      { width: 5 },
      { width: 14 },
      { width: 25 },
      { width: 25 },
      { width: 25 },
      { width: 35 },
      { width: 15 },
      { width: 18 },
    ];

    const headerRow = sheet.addRow([
      "No",
      "NIM",
      "Nama",
      "Program Studi",
      "Dosen Pembimbing",
      "Judul Pelatihan",
      "Status",
      "Periode",
    ]);
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 9 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF2563EB" },
      };
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
      cell.border = {
        top: { style: "medium", color: { argb: "FF1D4ED8" } },
        bottom: { style: "medium", color: { argb: "FF1D4ED8" } },
        left: { style: "thin", color: { argb: "FF1D4ED8" } },
        right: { style: "thin", color: { argb: "FF1D4ED8" } },
      };
    });

    const cellBorder = {
      top: { style: "thin", color: { argb: "FFE2E8F0" } },
      bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };

    rows.forEach((r, i) => {
      const bgArgb = i % 2 === 0 ? "FFFFFFFF" : "FFF8FAFF";
      const row = sheet.addRow([
        i + 1,
        r.nim,
        r.nama,
        r.program_studi || "-",
        r.nama_dosen || "-",
        r.nama_pelatihan || "-",
        _statusLabel(r.status),
        r.nama_periode,
      ]);
      row.height = 20;
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: bgArgb },
        };
        cell.border = cellBorder;
        cell.font = { size: 9, color: { argb: "FF111827" } };
        cell.alignment = {
          vertical: "middle",
          horizontal: colNum === 1 ? "center" : "left",
          wrapText: true,
        };

        if (colNum === 7) {
          const statusColor =
            r.status === "disetujui_kaprodi"
              ? "FF16a34a"
              : r.status === "ditolak"
                ? "FFdc2626"
                : r.status === "revisi"
                  ? "FFd97706"
                  : "FF6b7280";
          cell.font = { size: 9, bold: true, color: { argb: statusColor } };
        }
      });
    });

   sheet.views = [{ state: "frozen", ySplit: 1 }];

    const filename = buildExportFilenameFromRows(rows, mahasiswa_id, "xlsx");

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", buildContentDispositionHeader(filename));

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

    const isSingle = !!mahasiswa_id && rows.length > 0;

    const doc = new PDFDocument({ margin: 50, size: "A4" });

    const filename = buildExportFilenameFromRows(rows, mahasiswa_id, "pdf");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", buildContentDispositionHeader(filename));

    doc.pipe(res);

    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("REKAP DATA PENGAJUAN MBKM", { align: "center" });
    doc
      .fontSize(10)
      .font("Helvetica")
      .text("Program Studi Sistem dan Teknologi Informasi", { align: "center" })
      .text("Institut Teknologi & Bisnis Sabda Setia", { align: "center" });

    if (rows.length) {
      doc.text(`Periode: ${rows[0].nama_periode}`, { align: "center" });
    }

    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1).stroke("#94a3b8");
    doc.moveDown(1);

    if (isSingle) {
      const r = rows[0];

      const field = (label, value) => {
        const y = doc.y;
        doc
          .font("Helvetica-Bold")
          .fontSize(9)
          .text(label, 50, y, { width: 155 });
        doc
          .font("Helvetica")
          .fontSize(9)
          .text(": " + String(value || "-"), 205, y, { width: 330 });
        doc.moveDown(0.5);
      };

      doc
        .font("Helvetica-Bold")
        .fontSize(10)
        .fillColor("#1e3a8a")
        .text("Informasi Mahasiswa");
      doc.fillColor("black");
      doc.moveDown(0.5);

      field("NIM", r.nim);
      field("Nama", r.nama);
      field("Program Studi", r.program_studi);
      field("Dosen Pembimbing", r.nama_dosen || "-");
      field("Periode", r.nama_periode);
      field("Judul Pelatihan", r.nama_pelatihan);
    } else {
      const COL = {
        no: 50,
        nim: 70,
        nama: 130,
        dosen: 230,
        judul: 335,
        status: 490,
      };
      const WID = {
        no: 20,
        nim: 60,
        nama: 95,
        dosen: 100,
        judul: 145,
        status: 55,
      };
      const FONT_SIZE = 8;
      const LINE_H = 13;
      const ROW_PAD = 6;

      const textHeight = (text, width) => {
        const chars = Math.floor(width / (FONT_SIZE * 0.52));
        const lines = Math.ceil(String(text || "-").length / chars);
        return Math.max(1, lines) * LINE_H;
      };

      const drawHeader = () => {
        const y = doc.y;
        doc.rect(50, y, 495, 22).fill("#2563EB");
        doc.fillColor("white").font("Helvetica-Bold").fontSize(FONT_SIZE);

        doc.text("No", COL.no, y + 6, { width: WID.no });
        doc.text("NIM", COL.nim, y + 6, { width: WID.nim });
        doc.text("Nama", COL.nama, y + 6, { width: WID.nama });
        doc.text("Dosen Pembimbing", COL.dosen, y + 6, { width: WID.dosen });
        doc.text("Judul Pelatihan", COL.judul, y + 6, { width: WID.judul });
        doc.text("Status", COL.status, y + 6, { width: WID.status });

        doc.fillColor("black");
        doc.y = y + 22;
      };

      drawHeader();

      rows.forEach((r, i) => {
        const judulH = Math.max(
          LINE_H,
          textHeight(r.nama_pelatihan, WID.judul),
        );
        const totalH = judulH + ROW_PAD * 2;

        if (doc.y + totalH > 760) {
          doc.addPage();
          drawHeader();
        }

        const y = doc.y;
        const bg = i % 2 === 0 ? "#ffffff" : "#f0f6ff";

        doc.rect(50, y, 495, totalH).fill(bg);
        doc.fillColor("#111827").font("Helvetica").fontSize(FONT_SIZE);

        const centerY = y + (totalH - LINE_H) / 2;

        doc.text(`${i + 1}`, COL.no, centerY, { width: WID.no });
        doc.text(r.nim, COL.nim, centerY, { width: WID.nim });
        doc.text(r.nama, COL.nama, centerY, { width: WID.nama });
        doc.text(r.nama_dosen || "-", COL.dosen, centerY, { width: WID.dosen });
        doc.text(r.nama_pelatihan || "-", COL.judul, y + ROW_PAD, {
          width: WID.judul,
        });

        doc
          .font("Helvetica-Bold")
          .fillColor("#16a34a")
          .text(_statusLabel(r.status), COL.status, y + ROW_PAD, {
            width: WID.status,
          });
        doc.fillColor("#111827").font("Helvetica");

        const bottom = y + totalH;
        doc
          .moveTo(50, bottom)
          .lineTo(545, bottom)
          .lineWidth(1)
          .stroke("#64748b");
        doc.y = bottom + 1;
      });

      doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1.5).stroke("#334155");
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
      `SELECT id_users AS id, username, role, nama, email, created_at FROM users WHERE id_users = ?`,
      [req.user.id],
    );
    if (!rows.length)
      return res.status(404).json({ message: "User tidak ditemukan." });
    res.json({ data: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const updateProfil = async (req, res) => {
  try {
    const { nama, email } = req.body;
    await db.query("UPDATE users SET nama = ?, email = ? WHERE id_users = ?", [
      nama,
      email,
      req.user.id,
    ]);
    res.json({ message: "Profil berhasil diperbarui." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getPeriode = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id_periode AS id, nama_periode, is_active FROM periode ORDER BY id_periode DESC",
    );
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getRekapNilai = async (req, res) => {
  try {
    const { periode_id } = req.query;
    const targetPeriodeId = periode_id || (await _getPeriodeAktifId());
    const params = [];
    let where = "WHERE pn.finalized_at IS NOT NULL";
    if (targetPeriodeId) {
      where += " AND p.periode_id = ?";
      params.push(targetPeriodeId);
    }

    const [rows] = await db.query(
      `SELECT
        pn.id_penilaian AS id, pn.pengajuan_id, pn.finalized_at,
        pn.nilai_kesesuaian, pn.nilai_proyek, pn.nilai_evaluasi,
        pn.nilai_laporan, pn.nilai_presentasi, pn.nilai_akhir, pn.grade,
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
      params,
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
    const targetPeriodeId = periode_id || (await _getPeriodeAktifId());

    const [rows] = await db.query(
      `SELECT
        u.nim, u.nama,
        p.id_pengajuan as pengajuan_id, p.status as status_pengajuan,
        dp.judul as program_mbkm, dp.penyelenggara as instansi,
        dp.nama_pelatihan,
        d.nama as dosen_pembimbing,
        pa.nama as dosen_pa,
        pn.nilai_akhir, pn.grade,
        per.min_jam_pengajuan,
        MAX(CASE WHEN dok.jenis = 'laporan_akhir' THEN dok.status END) as status_laporan,
        MAX(CASE WHEN dok.jenis = 'ppt' THEN dok.status END) as status_ppt,
        COALESCE((
          SELECT SUM(lb.durasi_menit) / 60 FROM logbook lb
          WHERE lb.pengajuan_id = p.id_pengajuan AND lb.status = 'diverifikasi'
        ), 0) as total_jam_terverifikasi
      FROM users u
      INNER JOIN pengajuan p ON p.mahasiswa_id = u.id_users ${targetPeriodeId ? "AND p.periode_id = ?" : ""}
      JOIN periode per ON per.id_periode = p.periode_id
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
      LEFT JOIN users d ON d.id_users = p.dosen_id
      LEFT JOIN users pa ON pa.id_users = dp.dosen_pa_id
      LEFT JOIN dokumen dok ON dok.pengajuan_id = p.id_pengajuan
      LEFT JOIN penilaian pn ON pn.pengajuan_id = p.id_pengajuan AND pn.finalized_at IS NOT NULL
      WHERE u.role = 'mahasiswa'
      GROUP BY u.nim, u.nama, p.id_pengajuan, p.status, dp.judul, dp.penyelenggara,
        dp.nama_pelatihan, d.nama, pa.nama, pn.nilai_akhir, pn.grade, per.min_jam_pengajuan
      ORDER BY u.nama ASC`,
      targetPeriodeId ? [targetPeriodeId] : [],
    );

    const formatted = rows.map((r) => ({
      ...r,
      dokumen_lengkap:
        r.status_laporan === "diverifikasi" &&
        r.status_ppt === "diverifikasi" &&
        Number(r.total_jam_terverifikasi) >= Number(r.min_jam_pengajuan),
    }));

    res.json({ data: formatted });
  } catch (error) {
    console.error("getDaftarMahasiswaMBKM error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getLogbookMahasiswa = async (req, res) => {
  try {
    const { pengajuan_id } = req.query;
    if (!pengajuan_id)
      return res.status(400).json({ message: "pengajuan_id wajib diisi." });

   const [rows] = await db.query(
  `SELECT id_logbook AS id, tanggal, jam_mulai, jam_selesai, topik, tugas, hasil, kendala, durasi_menit, status, bukti_link, cloudinary_public_id
   FROM logbook WHERE pengajuan_id = ? ORDER BY tanggal DESC`,
  [pengajuan_id],
);
    res.json({ data: rows });
  } catch (error) {
    console.error("getLogbookMahasiswa (staff) error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const exportLogbookPdf = async (req, res) => {
  try {
    const { pengajuan_id } = req.query;
    if (!pengajuan_id) return res.status(400).json({ message: "pengajuan_id wajib diisi." });

    const data = await getLogbookExportData(pengajuan_id);
    if (!data) return res.status(404).json({ message: "Data logbook tidak ditemukan." });

    const pdfBuffer = await generateLogbookPdfBuffer(data);

    const filename = buildExportFilename({ nama: data.nama, nim: data.nim, isSingle: true, ext: "pdf" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", buildContentDispositionHeader(filename));
    res.send(pdfBuffer);
  } catch (error) {
    console.error("exportLogbookPdf (staff) error:", error);
    res.status(500).json({ message: "Gagal membuat PDF logbook." });
  }
};
const getDokumenMahasiswa = async (req, res) => {
  try {
    const { pengajuan_id } = req.query;
    if (!pengajuan_id)
      return res.status(400).json({ message: "pengajuan_id wajib diisi." });

    const [rows] = await db.query(
      `SELECT id_dokumen AS id, jenis, nama_file, cloudinary_url, status FROM dokumen WHERE pengajuan_id = ?`,
      [pengajuan_id],
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
    if (!pengajuan_id)
      return res.status(400).json({ message: "pengajuan_id wajib diisi." });

    const [rows] = await db.query(
      `SELECT
        pn.id_penilaian AS id, pn.pengajuan_id, pn.finalized_at,
        pn.nilai_kesesuaian, pn.nilai_proyek, pn.nilai_evaluasi,
        pn.nilai_laporan, pn.nilai_presentasi, pn.nilai_akhir, pn.grade,
        d.nama as nama_dosen
      FROM penilaian pn
      LEFT JOIN users d ON d.id_users = pn.dosen_id
      WHERE pn.pengajuan_id = ? AND pn.finalized_at IS NOT NULL`,
      [pengajuan_id],
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
  exportLogbookPdf,
};