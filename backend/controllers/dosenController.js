const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const PDFDocument = require("pdfkit");
const { sendEmail } = require("../utils/mailer");
const { sendPushToUser } = require("../utils/pushSender");
const { getLogbookExportData, generateLogbookPdfBuffer } = require("../utils/logbookPDFGenerator");
const {
  buildExportFilename,
  buildContentDispositionHeader,
} = require("../utils/exportFilename");

async function getDosenProfile(userId) {
  const [rows] = await db.query(
    "SELECT id_users AS id, nama FROM users WHERE id_users = ? AND role IN ('dosen', 'kaprodi')",
    [userId]
  );
  return rows[0] || null;
}

async function isDosenPembimbingPengajuan(dosenId, pengajuanId) {
  const [rows] = await db.query(
    "SELECT id_pengajuan FROM pengajuan WHERE dosen_id = ? AND id_pengajuan = ?",
    [dosenId, pengajuanId]
  );
  return rows.length > 0;
}

function getGrade(nilai) {
  const n = parseFloat(nilai) || 0;
  if (n >= 85) return "A";
  if (n >= 75) return "B";
  if (n >= 65) return "C";
  if (n >= 55) return "D";
  return "E";
}

// Ambil rubrik aktif dari DB, dipakai buat hitung nilai_akhir & validasi payload
async function getRubrikAktifList() {
  const [rows] = await db.query(
    "SELECT id_rubrik, field_key, aspek, kode_cpl, deskripsi, bobot, urutan FROM rubrik_penilaian WHERE is_active = 1 ORDER BY urutan ASC, created_at ASC"
  );
  return rows;
}

const getMahasiswaBimbingan = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { periode_id } = req.query;
    const [rows] = await db.query(
      `
      SELECT 
        m.id_users as id, m.id_users as user_id, m.nim, m.nama, m.email, m.program_studi,
        pc.periode_id, per.nama_periode, per.min_jam_pengajuan,
    pc.id_pengajuan as pengajuan_id, dp.judul, pc.status as status_pengajuan,
        dp.nama_pelatihan, dp.link_pelatihan, dp.durasi_pelatihan_jam, pc.catatan_kaprodi,
        pa.nama as dosen_pembimbing_akademik,
        COUNT(DISTINCT l.id_logbook) as jumlah_logbook,
        COALESCE((
          SELECT SUM(lb.durasi_menit) / 60 FROM logbook lb
          WHERE lb.pengajuan_id = pc.id_pengajuan AND lb.status = 'diverifikasi'
        ), 0) as total_jam_terverifikasi
      FROM pengajuan pc
      JOIN users m ON pc.mahasiswa_id = m.id_users
      JOIN periode per ON pc.periode_id = per.id_periode
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = pc.id_pengajuan
      LEFT JOIN users pa ON pa.id_users = dp.dosen_pa_id
      LEFT JOIN logbook l ON l.pengajuan_id = pc.id_pengajuan
      WHERE pc.dosen_id = ? ${periode_id ? "AND pc.periode_id = ?" : ""}
      GROUP BY m.id_users, m.nim, m.nama, m.email, m.program_studi,
        pc.periode_id, per.nama_periode, per.min_jam_pengajuan, pc.id_pengajuan, dp.judul, pc.status,
        dp.nama_pelatihan, dp.link_pelatihan, dp.durasi_pelatihan_jam, pc.catatan_kaprodi,
        pa.nama
      ORDER BY m.nama ASC
    `,
      periode_id ? [dsn.id, periode_id] : [dsn.id]
    );

    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// Sekarang menyertakan detail_nilai (array {rubrik_id, nilai}) per mahasiswa,
// dibangun dari detail_penilaian via JSON_ARRAYAGG supaya frontend bisa
// prefill form rubrik yang sudah pernah diisi, dinamis sesuai rubrik aktif saat ini.
const getMahasiswaSiapDinilai = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { periode_id } = req.query;
    const [rows] = await db.query(
      `
      SELECT 
        m.id_users as id, m.nim, m.nama, m.program_studi,
        pc.id_pengajuan as pengajuan_id, pc.periode_id, per.nama_periode,
        per.min_jam_pengajuan,
        dp.judul, dp.nama_pelatihan,
        SUM(CASE WHEN d.jenis = 'ppt' AND d.status = 'diverifikasi' THEN 1 ELSE 0 END) as punya_ppt,
        SUM(CASE WHEN d.jenis = 'laporan_akhir' AND d.status = 'diverifikasi' THEN 1 ELSE 0 END) as punya_laporan,
        COALESCE((
          SELECT SUM(l.durasi_menit) / 60 FROM logbook l
          WHERE l.pengajuan_id = pc.id_pengajuan AND l.status = 'diverifikasi'
        ), 0) as total_jam_logbook,
        pn.id_penilaian as penilaian_id,
        pn.nilai_akhir, pn.grade, pn.finalized_at,
        COALESCE((
          SELECT JSON_ARRAYAGG(JSON_OBJECT('rubrik_id', dtl.rubrik_id, 'nilai', dtl.nilai))
          FROM detail_penilaian dtl
          WHERE dtl.penilaian_id = pn.id_penilaian
        ), JSON_ARRAY()) as detail_nilai
      FROM pengajuan pc
      JOIN users m ON pc.mahasiswa_id = m.id_users
      JOIN periode per ON pc.periode_id = per.id_periode
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = pc.id_pengajuan
      LEFT JOIN dokumen d ON d.pengajuan_id = pc.id_pengajuan
      LEFT JOIN penilaian pn ON pn.pengajuan_id = pc.id_pengajuan
      WHERE pc.dosen_id = ? ${periode_id ? "AND pc.periode_id = ?" : ""}
      GROUP BY m.id_users, m.nim, m.nama, m.program_studi,
        pc.id_pengajuan, pc.periode_id, per.nama_periode, per.min_jam_pengajuan,
        dp.judul, dp.nama_pelatihan,
        pn.id_penilaian, pn.nilai_akhir, pn.grade, pn.finalized_at
      HAVING punya_ppt >= 1 
        AND punya_laporan >= 1 
        AND total_jam_logbook >= per.min_jam_pengajuan
      ORDER BY m.nama ASC
    `,
      periode_id ? [dsn.id, periode_id] : [dsn.id]
    );

    // detail_nilai kadang balik sebagai string JSON tergantung driver -> parse aman
    const data = rows.map((r) => ({
      ...r,
      detail_nilai: typeof r.detail_nilai === "string" ? JSON.parse(r.detail_nilai) : r.detail_nilai || [],
    }));

    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// Payload sekarang: { pengajuan_id, nilai: [{ rubrik_id, nilai }, ...] }
// bukan lagi field fix nilai_kesesuaian/nilai_proyek/dst.
const berikanPenilaian = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { pengajuan_id, nilai } = req.body;

    if (!pengajuan_id) {
      return res.status(400).json({ message: "pengajuan_id wajib diisi." });
    }
    if (!Array.isArray(nilai) || nilai.length === 0) {
      return res.status(400).json({ message: "Data nilai rubrik wajib diisi." });
    }

    const authorized = await isDosenPembimbingPengajuan(dsn.id, pengajuan_id);
    if (!authorized) {
      return res.status(403).json({ message: "Kamu bukan dosen pembimbing untuk pengajuan ini." });
    }

    const rubrikAktif = await getRubrikAktifList();
    if (rubrikAktif.length === 0) {
      return res.status(400).json({ message: "Belum ada rubrik penilaian aktif. Hubungi kaprodi." });
    }

    const nilaiByRubrik = new Map(nilai.map((n) => [n.rubrik_id, n.nilai]));

    // semua rubrik aktif wajib ada nilainya
    for (const r of rubrikAktif) {
      const v = parseFloat(nilaiByRubrik.get(r.id_rubrik));
      if (nilaiByRubrik.get(r.id_rubrik) === undefined || isNaN(v)) {
        return res.status(400).json({ message: `Nilai untuk aspek "${r.aspek}" wajib diisi!` });
      }
      if (v < 0 || v > 100) {
        return res.status(400).json({ message: `Nilai ${r.aspek} harus antara 0-100!` });
      }
    }

    const nilai_akhir = rubrikAktif
      .reduce((sum, r) => sum + (parseFloat(nilaiByRubrik.get(r.id_rubrik)) * parseFloat(r.bobot)) / 100, 0)
      .toFixed(2);
    const grade = getGrade(nilai_akhir);

    const [existing] = await db.query("SELECT id_penilaian, finalized_at FROM penilaian WHERE pengajuan_id = ?", [pengajuan_id]);

    if (existing.length && existing[0].finalized_at) {
      return res.status(403).json({ message: "Nilai sudah difinalisasi dan tidak bisa diubah lagi." });
    }

    let penilaianId;
    if (existing.length) {
      penilaianId = existing[0].id_penilaian;
      await db.query(`UPDATE penilaian SET nilai_akhir=?, grade=? WHERE id_penilaian=?`, [nilai_akhir, grade, penilaianId]);
    } else {
      penilaianId = uuidv4();
      await db.query(
        `INSERT INTO penilaian (id_penilaian, pengajuan_id, dosen_id, nilai_akhir, grade)
         VALUES (?, ?, ?, ?, ?)`,
        [penilaianId, pengajuan_id, dsn.id, nilai_akhir, grade]
      );
    }

    // Ganti seluruh detail_penilaian dgn nilai baru (rubrik yang dihapus/ditambah
    // di antara pengisian tidak menyisakan baris usang)
    await db.query("DELETE FROM detail_penilaian WHERE penilaian_id = ?", [penilaianId]);
    const detailValues = rubrikAktif.map((r) => [
      uuidv4(),
      penilaianId,
      r.id_rubrik,
      parseFloat(nilaiByRubrik.get(r.id_rubrik)),
    ]);
    await db.query(
      "INSERT INTO detail_penilaian (id_detail_penilaian, penilaian_id, rubrik_id, nilai) VALUES ?",
      [detailValues]
    );

    res.json({ message: "nilai berhasil disimpan.", nilai_akhir, grade });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const finalisasiNilai = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { pengajuan_id } = req.body;
    if (!pengajuan_id) return res.status(400).json({ message: "pengajuan_id wajib diisi." });

    const authorized = await isDosenPembimbingPengajuan(dsn.id, pengajuan_id);
    if (!authorized) return res.status(403).json({ message: "Kamu bukan dosen pembimbing untuk pengajuan ini." });

    const [existing] = await db.query("SELECT id_penilaian, finalized_at FROM penilaian WHERE pengajuan_id = ?", [pengajuan_id]);
    if (!existing.length) return res.status(400).json({ message: "Nilai belum diisi, tidak bisa difinalisasi." });
    if (existing[0].finalized_at) return res.status(400).json({ message: "Nilai sudah difinalisasi sebelumnya." });

    await db.query("UPDATE penilaian SET finalized_at = NOW() WHERE id_penilaian = ?", [existing[0].id_penilaian]);

    res.json({ message: "Nilai berhasil difinalisasi." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const eksporPenilaianPDF = async (req, res) => {
  try {
    const { pengajuan_id } = req.query;

    const [rows] = await db.query(
      `
      SELECT pn.*, m.nama, m.nim, m.program_studi,
             pr.nama_periode, d.nama as nama_dosen
      FROM penilaian pn
      JOIN pengajuan p ON p.id_pengajuan = pn.pengajuan_id
      JOIN users m ON p.mahasiswa_id = m.id_users
      JOIN periode pr ON p.periode_id = pr.id_periode
      JOIN users d ON pn.dosen_id = d.id_users
      WHERE pn.pengajuan_id = ?
    `,
      [pengajuan_id]
    );

    if (!rows.length) return res.status(404).json({ message: "Data penilaian tidak ditemukan." });

    const data = rows[0];

    // Rincian per rubrik diambil dinamis dari detail_penilaian + rubrik_penilaian
    // (snapshot bobot & aspek SAAT nilai itu diisi/rubrik masih aktif, bukan definisi rubrik saat ini)
    const [rubrikRows] = await db.query(
      `
      SELECT r.aspek, r.bobot, dtl.nilai
      FROM detail_penilaian dtl
      JOIN rubrik_penilaian r ON r.id_rubrik = dtl.rubrik_id
      WHERE dtl.penilaian_id = ?
      ORDER BY r.urutan ASC
    `,
      [data.id_penilaian]
    );

    const doc = new PDFDocument({ margin: 50 });

    const filename = buildExportFilename({
      nama: data.nama,
      nim: data.nim,
      isSingle: true,
      ext: "pdf",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", buildContentDispositionHeader(filename));
    doc.pipe(res);

    doc.fontSize(16).font("Helvetica-Bold").text("REKAP PENILAIAN AKHIR", { align: "center" });
    doc.fontSize(12).font("Helvetica").text("Program Studi Sistem dan Teknologi Informasi", { align: "center" });
    doc.text("Institut Teknologi & Bisnis Sabda Setia", { align: "center" });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    const infoMhs = [
      ["Nama", data.nama],
      ["NIM", data.nim],
      ["Program Studi", data.program_studi || "STI"],
      ["Periode", data.nama_periode],
      ["Dosen Pembimbing", data.nama_dosen],
    ];
    infoMhs.forEach(([label, val]) => {
      const rowY = doc.y;
      doc.font("Helvetica-Bold").text(label, 50, rowY, { width: 130, lineBreak: false });
      doc.font("Helvetica").text(`: ${val}`, 180, rowY, { width: 365 });
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    doc.font("Helvetica-Bold").fontSize(12).text("Rincian Penilaian per Rubrik", { underline: true });
    doc.moveDown(0.5);

    const colX = [50, 75, 295, 360, 420, 480];
    const headerY = doc.y;
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("No", colX[0], headerY, { width: 25, lineBreak: false });
    doc.text("Aspek Penilaian", colX[1], headerY, { width: 215, lineBreak: false });
    doc.text("Bobot", colX[2], headerY, { width: 55, lineBreak: false });
    doc.text("Nilai", colX[3], headerY, { width: 55, lineBreak: false });
    doc.text("Kontribusi", colX[4], headerY, { width: 65, lineBreak: false });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font("Helvetica").fontSize(10);
    rubrikRows.forEach((r, i) => {
      const nilaiVal = parseFloat(r.nilai) || 0;
      const bobotVal = parseFloat(r.bobot) || 0;
      const kontribusi = ((nilaiVal * bobotVal) / 100).toFixed(2);
      const rowY = doc.y;
      doc.text(String(i + 1), colX[0], rowY, { width: 25, lineBreak: false });
      doc.text(r.aspek, colX[1], rowY, { width: 215, lineBreak: false });
      doc.text(`${bobotVal}%`, colX[2], rowY, { width: 55, lineBreak: false });
      doc.text(nilaiVal.toFixed(2), colX[3], rowY, { width: 55, lineBreak: false });
      doc.text(kontribusi, colX[4], rowY, { width: 65, lineBreak: false });
      doc.moveDown(1);
    });

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(12);
    doc.text(`Nilai Akhir : ${data.nilai_akhir}`, { align: "right" });
    doc.text(`Grade       : ${data.grade}`, { align: "right" });

    doc.moveDown(2);
    doc.font("Helvetica").fontSize(10).text(`Dicetak pada: ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`, { align: "right" });

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const eksporSemuaPenilaianPDF = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { periode_id } = req.query;
    const [rows] = await db.query(
      `
      SELECT pn.*, m.nama, m.nim, m.program_studi, pr.nama_periode
      FROM penilaian pn
      JOIN pengajuan p ON p.id_pengajuan = pn.pengajuan_id
      JOIN users m ON p.mahasiswa_id = m.id_users
      JOIN periode pr ON p.periode_id = pr.id_periode
      WHERE pn.dosen_id = ? ${periode_id ? "AND p.periode_id = ?" : ""}
      ORDER BY m.nama ASC
    `,
      periode_id ? [dsn.id, periode_id] : [dsn.id]
    );

    if (!rows.length) return res.status(404).json({ message: "Belum ada data penilaian." });

    const doc = new PDFDocument({ margin: 50 });

    const filename = buildExportFilename({
      namaPeriode: rows[0].nama_periode,
      isSingle: false,
      ext: "pdf",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", buildContentDispositionHeader(filename));
    doc.pipe(res);

    doc.fontSize(16).font("Helvetica-Bold").text("REKAP NILAI AKHIR MAHASISWA", { align: "center" });
    doc.fontSize(12).font("Helvetica").text("Program Studi Sistem dan Teknologi Informasi", { align: "center" });
    doc.text("Institut Teknologi & Bisnis Sabda Setia", { align: "center" });
    doc.moveDown(0.5);
    doc.font("Helvetica").text(`Dosen Pembimbing : ${dsn.nama}`, { align: "center" });
    doc.text(`Periode : ${rows[0].nama_periode}`, { align: "center" });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    const colX = [50, 70, 220, 350, 420, 470];
    const headerY = doc.y;
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("No", colX[0], headerY, { width: 25 });
    doc.text("Nama", colX[1], headerY, { width: 145 });
    doc.text("NIM", colX[2], headerY, { width: 120 });
    doc.text("Nilai Akhir", colX[3], headerY, { width: 70 });
    doc.text("Grade", colX[4], headerY, { width: 50 });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);

    doc.font("Helvetica").fontSize(10);
    rows.forEach((r, i) => {
      const rowY = doc.y;
      doc.text(String(i + 1), colX[0], rowY, { width: 25 });
      doc.text(r.nama, colX[1], rowY, { width: 145 });
      doc.text(r.nim, colX[2], rowY, { width: 120 });
      doc.text(String(r.nilai_akhir), colX[3], rowY, { width: 70 });
      doc.text(r.grade || "-", colX[4], rowY, { width: 50 });
      doc.moveDown(0.8);
    });

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(2);
    doc.font("Helvetica").fontSize(10).text(`Dicetak pada: ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`, { align: "right" });

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getLogbookMahasiswa = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { mahasiswa_id, periode_id } = req.query;

    if (!mahasiswa_id || mahasiswa_id === "semua") {
      if (!periode_id) return res.status(400).json({ message: "periode_id wajib diisi." });

      const [rows] = await db.query(
        `
        SELECT l.id_logbook AS id, l.*, m.nama as nama_mahasiswa, m.nim
        FROM logbook l
        JOIN pengajuan pc ON pc.id_pengajuan = l.pengajuan_id
        JOIN users m ON pc.mahasiswa_id = m.id_users
        WHERE pc.dosen_id = ? AND pc.periode_id = ?
        ORDER BY m.nama ASC, l.tanggal DESC
      `,
        [dsn.id, periode_id]
      );

      return res.json({ data: rows });
    }

    const [rows] = await db.query(
      `
      SELECT l.id_logbook AS id, l.*, m.nama as nama_mahasiswa, m.nim
      FROM logbook l
      JOIN pengajuan pc ON pc.id_pengajuan = l.pengajuan_id
      JOIN users m ON pc.mahasiswa_id = m.id_users
      WHERE pc.mahasiswa_id = ? ${periode_id ? "AND pc.periode_id = ?" : ""}
      ORDER BY l.tanggal DESC
    `,
      periode_id ? [mahasiswa_id, periode_id] : [mahasiswa_id]
    );

    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const exportLogbookPdf = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { pengajuan_id } = req.query;
    if (!pengajuan_id) return res.status(400).json({ message: "pengajuan_id wajib diisi." });

    const authorized = await isDosenPembimbingPengajuan(dsn.id, pengajuan_id);
    if (!authorized) return res.status(403).json({ message: "Kamu bukan dosen pembimbing untuk pengajuan ini." });

    const data = await getLogbookExportData(pengajuan_id);
    if (!data) return res.status(404).json({ message: "Data logbook tidak ditemukan." });

    const pdfBuffer = await generateLogbookPdfBuffer(data);

    const filename = buildExportFilename({ nama: data.nama, nim: data.nim, isSingle: true, ext: "pdf" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", buildContentDispositionHeader(filename));
    res.send(pdfBuffer);
  } catch (error) {
    console.error("exportLogbookPdf (dosen) error:", error);
    res.status(500).json({ message: "Gagal membuat PDF logbook." });
  }
};
const verifikasiLogbook = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { id } = req.params;
    const { status, feedback_dosen } = req.body;
    if (!["diverifikasi", "revisi"].includes(status)) {
      return res.status(400).json({ message: "Status tidak valid." });
    }

    const [logbookCheck] = await db.query("SELECT pengajuan_id FROM logbook WHERE id_logbook = ?", [id]);
    if (!logbookCheck.length) return res.status(404).json({ message: "Logbook tidak ditemukan." });

    const authorized = await isDosenPembimbingPengajuan(dsn.id, logbookCheck[0].pengajuan_id);
    if (!authorized) return res.status(403).json({ message: "Kamu bukan dosen pembimbing untuk pengajuan ini." });

    await db.query("UPDATE logbook SET status = ?, feedback_dosen = ?, verified_at = NOW() WHERE id_logbook = ?", [status, feedback_dosen, id]);

   const [logbook] = await db.query(
  `SELECT l.topik, p.mahasiswa_id AS user_id, u.nama, u.email
   FROM logbook l
   JOIN pengajuan p ON p.id_pengajuan = l.pengajuan_id
   JOIN users u ON p.mahasiswa_id = u.id_users
   WHERE l.id_logbook = ?`,
  [id]
);

    if (logbook.length) {
      const mhs = logbook[0];
      const pesan = status === "diverifikasi" ? "Logbook kamu telah diverifikasi oleh dosen pembimbing." : `Logbook kamu perlu direvisi. Feedback: ${feedback_dosen}`;

      await db.query("INSERT INTO notifikasi (id_notifikasi, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)", [uuidv4(), mhs.user_id, "Status Logbook", pesan, status === "diverifikasi" ? "sukses" : "peringatan"]);

      await sendPushToUser(mhs.user_id, { title: "Status Logbook", body: pesan, url: "/mahasiswa/logbook" });

      if (mhs.email) {
        const iconSuccessSvg = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:6px;"><circle cx="12" cy="12" r="11" fill="#16a34a"/><path d="M7 12.5L10.2 15.7L17 8.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
        const iconWarningSvg = '<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:6px;"><circle cx="12" cy="12" r="11" fill="#dc2626"/><rect x="11" y="6" width="2" height="8" rx="1" fill="white"/><rect x="11" y="16" width="2" height="2" rx="1" fill="white"/></svg>';

        await sendEmail({
          to: mhs.email,
          subject: status === "diverifikasi" ? "Logbook Kamu Telah Diverifikasi" : "Logbook Kamu Perlu Direvisi",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #1e4db7; padding: 24px; border-radius: 12px 12px 0 0;">
                <h2 style="color: white; margin: 0;">e-MBKM ITBSS</h2>
              </div>
              <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
                <p>Halo <strong>${mhs.nama}</strong>,</p>
                ${
                  status === "diverifikasi"
                 ? `<p>${iconSuccessSvg}Logbook kegiatan <strong>"${mhs.topik}"</strong> kamu telah <span style="color: #16a34a; font-weight: bold;">diverifikasi</span> oleh dosen pembimbing.</p>`
: `<p>${iconWarningSvg}Logbook kegiatan <strong>"${mhs.topik}"</strong> kamu memerlukan <span style="color: #dc2626; font-weight: bold;">revisi</span>.</p>
                     <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
                       <p style="margin: 0; color: #7f1d1d;"><strong>Feedback Dosen:</strong></p>
                       <p style="margin: 8px 0 0; color: #991b1b;">${feedback_dosen}</p>
                     </div>`
                }
                <p>Silakan login ke sistem e-MBKM ITBSS untuk melihat detail.</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">Email ini dikirim otomatis oleh sistem e-MBKM ITBSS.</p>
              </div>
            </div>
          `,
        });
      }
    }

    res.json({ message: "Logbook berhasil diverifikasi." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDokumenMahasiswa = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { mahasiswa_id, periode_id } = req.query;

    if (!mahasiswa_id || mahasiswa_id === "semua") {
      if (!periode_id) return res.status(400).json({ message: "periode_id wajib diisi." });

      const [rows] = await db.query(
        `
        SELECT d.id_dokumen AS id, d.*, m.nama as nama_mahasiswa, m.nim
        FROM dokumen d
        JOIN pengajuan pc ON pc.id_pengajuan = d.pengajuan_id
        JOIN users m ON pc.mahasiswa_id = m.id_users
        WHERE pc.dosen_id = ? AND pc.periode_id = ?
        ORDER BY m.nama ASC, d.created_at DESC
      `,
        [dsn.id, periode_id]
      );

      return res.json({ data: rows });
    }

    const [rows] = await db.query(
      `
      SELECT d.id_dokumen AS id, d.*, m.nama as nama_mahasiswa, m.nim
      FROM dokumen d
      JOIN pengajuan pc ON pc.id_pengajuan = d.pengajuan_id
      JOIN users m ON pc.mahasiswa_id = m.id_users
      WHERE pc.mahasiswa_id = ? ${periode_id ? "AND pc.periode_id = ?" : ""}
      ORDER BY d.created_at DESC
    `,
      periode_id ? [mahasiswa_id, periode_id] : [mahasiswa_id]
    );

    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};
const verifikasiDokumen = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { id } = req.params;
    const { status, feedback } = req.body;

    const validStatus = ["revisi_dospem", "disetujui_dospem"];
    if (!validStatus.includes(status)) return res.status(400).json({ message: "Status tidak valid." });

    const [dok] = await db.query("SELECT * FROM dokumen WHERE id_dokumen = ?", [id]);
    if (!dok.length) return res.status(404).json({ message: "Dokumen tidak ditemukan." });

    const authorized = await isDosenPembimbingPengajuan(dsn.id, dok[0].pengajuan_id);
    if (!authorized) return res.status(403).json({ message: "Kamu bukan dosen pembimbing untuk pengajuan ini." });
    if (dok[0].jenis === "laporan_akhir" && ["disetujui_dospem", "diverifikasi"].includes(dok[0].status)) {
      return res.status(400).json({ message: "Laporan Akhir sudah diverifikasi Dosen Pembimbing, menunggu Kaprodi." });
    }

    if (dok[0].jenis === "ppt" && dok[0].status === "diverifikasi") {
      return res.status(400).json({ message: "PPT sudah diverifikasi." });
    }

    let statusAkhir = status;
    if (status === "disetujui_dospem" && dok[0].jenis !== "laporan_akhir") {
      statusAkhir = "diverifikasi";
    }

    if (dok[0].jenis === "laporan_akhir") {
      await db.query(
        `UPDATE dokumen SET status = ?, feedback_dospem = ?, verified_dospem_by = ?, verified_dospem_at = NOW() WHERE id_dokumen = ?`,
        [statusAkhir, feedback || null, req.user.id, id]
      );
    } else {
      await db.query(
        `UPDATE dokumen SET status = ?, feedback = ?, verified_by = ?, verified_at = NOW() WHERE id_dokumen = ?`,
        [statusAkhir, feedback || null, req.user.id, id]
      );
    }

    const [pengajuanRow] = await db.query("SELECT mahasiswa_id FROM pengajuan WHERE id_pengajuan = ?", [dok[0].pengajuan_id]);

    if (pengajuanRow.length) {
      const userId = pengajuanRow[0].mahasiswa_id;
      let pesan;
      if (statusAkhir === "diverifikasi") {
        pesan = dok[0].jenis === "ppt" ? "PPT kamu telah diverifikasi oleh Dosen Pembimbing." : "Laporan Akhir kamu telah diverifikasi oleh Kaprodi dan Dosen Pembimbing.";
      } else if (statusAkhir === "disetujui_dospem") {
        pesan = "Laporan Akhir kamu telah disetujui Dosen Pembimbing, menunggu verifikasi Kaprodi.";
      } else {
        pesan = `Dokumen ${dok[0].jenis === "ppt" ? "PPT" : "Laporan Akhir"} kamu perlu direvisi. Catatan: ${feedback || "-"}`;
      }

      await db.query("INSERT INTO notifikasi (id_notifikasi, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)", [uuidv4(), userId, "Status Dokumen", pesan, (statusAkhir === "diverifikasi" || statusAkhir === "disetujui_dospem") ? "sukses" : "peringatan"]);
      await sendPushToUser(userId, { title: "Status Dokumen", body: pesan, url: "/mahasiswa/dokumen" });
    }

    res.json({ message: "Dokumen berhasil diverifikasi." });
  } catch (error) {
    console.error("verifikasiDokumen dosen error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const berikanFeedback = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { pengajuan_id, referensi_id, referensi_tipe, isi_feedback } = req.body;
    if (!pengajuan_id || !isi_feedback) {
      return res.status(400).json({ message: "Data feedback tidak lengkap." });
    }

    const authorized = await isDosenPembimbingPengajuan(dsn.id, pengajuan_id);
    if (!authorized) return res.status(403).json({ message: "Kamu bukan dosen pembimbing untuk pengajuan ini." });

    await db.query(
      `INSERT INTO feedback (id_feedback, pengajuan_id, dosen_id, referensi_id, referensi_tipe, isi_feedback)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), pengajuan_id, dsn.id, referensi_id || null, referensi_tipe || "logbook", isi_feedback]
    );

    const [pengajuanRow] = await db.query("SELECT mahasiswa_id FROM pengajuan WHERE id_pengajuan = ?", [pengajuan_id]);
    if (pengajuanRow.length) {
      const userId = pengajuanRow[0].mahasiswa_id;
      await db.query("INSERT INTO notifikasi (id_notifikasi, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)", [uuidv4(), userId, "Feedback Baru", `Dosen pembimbing memberikan feedback: ${isi_feedback}`, "info"]);
      await sendPushToUser(userId, { title: "Feedback Baru", body: isi_feedback, url: "/mahasiswa/bimbingan" });
    }
    res.status(201).json({ message: "Feedback berhasil dikirim." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getAktivitasTerbaru = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { periode_id } = req.query;
    const periodeFilter = periode_id ? "AND pc.periode_id = ?" : "";
    const params = periode_id ? [dsn.id, periode_id] : [dsn.id];

    const [logbooks] = await db.query(
      `
      SELECT 'logbook' as tipe, l.id_logbook AS id, m.nama as nama_mahasiswa, m.nim,
        l.created_at, l.status, l.topik as deskripsi
      FROM logbook l
      JOIN pengajuan pc ON pc.id_pengajuan = l.pengajuan_id
      JOIN users m ON pc.mahasiswa_id = m.id_users
      WHERE pc.dosen_id = ? ${periodeFilter}
      ORDER BY l.created_at DESC LIMIT 5
    `,
      params
    );

    const [dokumen] = await db.query(
      `
      SELECT 'dokumen' as tipe, d.id_dokumen AS id, m.nama as nama_mahasiswa, m.nim,
        d.created_at, d.status, d.nama_file as deskripsi
      FROM dokumen d
      JOIN pengajuan pc ON pc.id_pengajuan = d.pengajuan_id
      JOIN users m ON pc.mahasiswa_id = m.id_users
      WHERE pc.dosen_id = ? ${periodeFilter}
      ORDER BY d.created_at DESC LIMIT 5
    `,
      params
    );

    const aktivitas = [...logbooks, ...dokumen].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);

    res.json({ data: aktivitas });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

module.exports = {
  getMahasiswaBimbingan,
  getAktivitasTerbaru,
  getLogbookMahasiswa,
  verifikasiLogbook,
  getDokumenMahasiswa,
  verifikasiDokumen,
  berikanPenilaian,
  finalisasiNilai,
  berikanFeedback,
  eksporPenilaianPDF,
  eksporSemuaPenilaianPDF,
  getMahasiswaSiapDinilai,
  exportLogbookPdf,
};