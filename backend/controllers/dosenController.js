const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const PDFDocument = require("pdfkit");
const { sendEmail } = require("../utils/mailer");
const { sendPushToUser } = require("../utils/pushSender");

async function getDosenProfile(userId) {
  const [rows] = await db.query("SELECT id, nama FROM dosen WHERE user_id = ?", [userId]);
  return rows[0] || null;
}

/** Cek dosen yang login memang pembimbing untuk pengajuan_id ini */
async function isDosenPembimbingPengajuan(dosenId, pengajuanId) {
  const [rows] = await db.query("SELECT id FROM bimbingan WHERE dosen_id = ? AND pengajuan_id = ?", [dosenId, pengajuanId]);
  return rows.length > 0;
}

const getMahasiswaBimbingan = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { periode_id } = req.query;
    const [rows] = await db.query(
      `
      SELECT 
        m.id, m.user_id, m.nim, m.nama, m.email, m.program_studi,
        pc.periode_id, per.nama_periode,
        pc.id as pengajuan_id, dp.judul, pc.status as status_pengajuan,
        dp.pelatihan, m.email as email_pengajuan,
        dpa.nama as dosen_pembimbing_akademik, pc.catatan_kaprodi,
        COUNT(DISTINCT l.id) as jumlah_logbook
      FROM bimbingan b
      JOIN pengajuan pc ON pc.id = b.pengajuan_id
      JOIN mahasiswa m ON pc.mahasiswa_id = m.id
      JOIN periode per ON pc.periode_id = per.id
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = pc.id
      LEFT JOIN dosen dpa ON dpa.id = m.dosen_pembimbing_akademik_id
      LEFT JOIN logbook l ON l.pengajuan_id = pc.id
      WHERE b.dosen_id = ? ${periode_id ? "AND pc.periode_id = ?" : ""}
      GROUP BY m.id, m.user_id, m.nim, m.nama, m.email, m.program_studi,
        pc.periode_id, per.nama_periode, pc.id, dp.judul, pc.status,
        dp.pelatihan, dpa.nama, pc.catatan_kaprodi
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

const getMahasiswaSiapDinilai = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { periode_id } = req.query;
    const [rows] = await db.query(
      `
      SELECT 
        m.id, m.nim, m.nama, m.program_studi,
        pc.id as pengajuan_id, pc.periode_id, per.nama_periode,
        dp.judul, dp.pelatihan,
        SUM(CASE WHEN d.jenis = 'ppt' AND d.status = 'diverifikasi' THEN 1 ELSE 0 END) as punya_ppt,
        SUM(CASE WHEN d.jenis = 'laporan_akhir' AND d.status = 'diverifikasi' THEN 1 ELSE 0 END) as punya_laporan,
        COALESCE((
          SELECT SUM(l.durasi_menit) / 60 FROM logbook l
          WHERE l.pengajuan_id = pc.id AND l.status = 'diverifikasi'
        ), 0) as total_jam_logbook,
        pn.id as penilaian_id,
        pn.nilai_kesesuaian, pn.nilai_proyek, pn.nilai_evaluasi,
        pn.nilai_laporan, pn.nilai_presentasi,
        pn.nilai_akhir, pn.grade, pn.catatan, pn.finalized_at
      FROM bimbingan b
      JOIN pengajuan pc ON pc.id = b.pengajuan_id
      JOIN mahasiswa m ON pc.mahasiswa_id = m.id
      JOIN periode per ON pc.periode_id = per.id
      LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = pc.id
      LEFT JOIN dokumen d ON d.pengajuan_id = pc.id
      LEFT JOIN penilaian pn ON pn.pengajuan_id = pc.id
      WHERE b.dosen_id = ? ${periode_id ? "AND pc.periode_id = ?" : ""}
      GROUP BY m.id, m.nim, m.nama, m.program_studi,
        pc.id, pc.periode_id, per.nama_periode, dp.judul, dp.pelatihan,
        pn.id, pn.nilai_kesesuaian, pn.nilai_proyek, pn.nilai_evaluasi,
        pn.nilai_laporan, pn.nilai_presentasi, pn.nilai_akhir, pn.grade, pn.catatan, pn.finalized_at
      HAVING punya_ppt >= 1 AND punya_laporan >= 1
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

const berikanPenilaian = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { pengajuan_id, nilai_kesesuaian, nilai_proyek, nilai_evaluasi, nilai_laporan, nilai_presentasi, catatan } = req.body;

    if (!pengajuan_id) {
      return res.status(400).json({ message: "pengajuan_id wajib diisi." });
    }

    const authorized = await isDosenPembimbingPengajuan(dsn.id, pengajuan_id);
    if (!authorized) {
      return res.status(403).json({ message: "Kamu bukan dosen pembimbing untuk pengajuan ini." });
    }

    const nilai_akhir = (
      parseFloat(nilai_kesesuaian) * 0.15 +
      parseFloat(nilai_proyek) * 0.3 +
      parseFloat(nilai_evaluasi) * 0.15 +
      parseFloat(nilai_laporan) * 0.2 +
      parseFloat(nilai_presentasi) * 0.2
    ).toFixed(2);

    let grade = "E";
    if (nilai_akhir >= 85) grade = "A";
    else if (nilai_akhir >= 75) grade = "B";
    else if (nilai_akhir >= 65) grade = "C";
    else if (nilai_akhir >= 55) grade = "D";

    const [existing] = await db.query("SELECT id, finalized_at FROM penilaian WHERE pengajuan_id = ?", [pengajuan_id]);

    if (existing.length && existing[0].finalized_at) {
      return res.status(403).json({ message: "Nilai sudah difinalisasi dan tidak bisa diubah lagi." });
    }

    if (existing.length) {
      await db.query(
        `UPDATE penilaian SET nilai_kesesuaian=?, nilai_proyek=?, nilai_evaluasi=?, nilai_laporan=?, nilai_presentasi=?, nilai_akhir=?, grade=?, catatan=? WHERE id=?`,
        [nilai_kesesuaian, nilai_proyek, nilai_evaluasi, nilai_laporan, nilai_presentasi, nilai_akhir, grade, catatan, existing[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO penilaian (id, pengajuan_id, dosen_id, nilai_kesesuaian, nilai_proyek, nilai_evaluasi, nilai_laporan, nilai_presentasi, nilai_akhir, grade, catatan)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), pengajuan_id, dsn.id, nilai_kesesuaian, nilai_proyek, nilai_evaluasi, nilai_laporan, nilai_presentasi, nilai_akhir, grade, catatan]
      );
    }

    const [mhs] = await db.query(
      `SELECT m.user_id, m.nama, m.email FROM pengajuan p JOIN mahasiswa m ON m.id = p.mahasiswa_id WHERE p.id = ?`,
      [pengajuan_id]
    );
    if (mhs.length) {
      const pesan = `Dosen pembimbing telah memberikan nilai akhir kamu. Nilai: ${nilai_akhir} (${grade})`;
      await db.query("INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)", [uuidv4(), mhs[0].user_id, "Nilai Akhir", pesan, "sukses"]);
      await sendPushToUser(mhs[0].user_id, { title: "Nilai Akhir", body: `Nilai akhir kamu: ${nilai_akhir} (${grade})`, url: "/mahasiswa/penilaian" });
    }

    res.json({ message: "Penilaian berhasil disimpan.", nilai_akhir, grade });
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

    const [existing] = await db.query("SELECT id, finalized_at FROM penilaian WHERE pengajuan_id = ?", [pengajuan_id]);
    if (!existing.length) return res.status(400).json({ message: "Nilai belum diisi, tidak bisa difinalisasi." });
    if (existing[0].finalized_at) return res.status(400).json({ message: "Nilai sudah difinalisasi sebelumnya." });

    await db.query("UPDATE penilaian SET finalized_at = NOW() WHERE id = ?", [existing[0].id]);

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
      JOIN pengajuan p ON p.id = pn.pengajuan_id
      JOIN mahasiswa m ON p.mahasiswa_id = m.id
      JOIN periode pr ON p.periode_id = pr.id
      JOIN dosen d ON pn.dosen_id = d.id
      WHERE pn.pengajuan_id = ?
    `,
      [pengajuan_id]
    );

    if (!rows.length) return res.status(404).json({ message: "Data penilaian tidak ditemukan." });

    const data = rows[0];
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=penilaian_${data.nim}.pdf`);
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

    const RUBRIK = [
      { no: 1, aspek: "Kesesuaian Program dan Topik Pembelajaran", field: "nilai_kesesuaian", bobot: 15 },
      { no: 2, aspek: "Proyek/Karya Tugas Akhir", field: "nilai_proyek", bobot: 30 },
      { no: 3, aspek: "Evaluasi Pembelajaran Mandiri", field: "nilai_evaluasi", bobot: 15 },
      { no: 4, aspek: "Laporan Akhir dan Portofolio", field: "nilai_laporan", bobot: 20 },
      { no: 5, aspek: "Presentasi Refleksi Pembelajaran", field: "nilai_presentasi", bobot: 20 },
    ];

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
    RUBRIK.forEach((r) => {
      const nilaiVal = parseFloat(data[r.field]) || 0;
      const kontribusi = ((nilaiVal * r.bobot) / 100).toFixed(2);
      const rowY = doc.y;
      doc.text(String(r.no), colX[0], rowY, { width: 25, lineBreak: false });
      doc.text(r.aspek, colX[1], rowY, { width: 215, lineBreak: false });
      doc.text(`${r.bobot}%`, colX[2], rowY, { width: 55, lineBreak: false });
      doc.text(nilaiVal.toFixed(2), colX[3], rowY, { width: 55, lineBreak: false });
      doc.text(kontribusi, colX[4], rowY, { width: 65, lineBreak: false });
      doc.moveDown(1);
    });

    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    doc.font("Helvetica-Bold").fontSize(12);
    doc.text(`Nilai Akhir : ${data.nilai_akhir}`, { align: "right" });
    doc.text(`Grade       : ${data.grade}`, { align: "right" });

    if (data.catatan) {
      doc.moveDown();
      doc.font("Helvetica-Bold").text("Catatan Dosen:");
      doc.font("Helvetica").text(data.catatan);
    }

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
      JOIN pengajuan p ON p.id = pn.pengajuan_id
      JOIN mahasiswa m ON p.mahasiswa_id = m.id
      JOIN periode pr ON p.periode_id = pr.id
      WHERE pn.dosen_id = ? ${periode_id ? "AND p.periode_id = ?" : ""}
      ORDER BY m.nama ASC
    `,
      periode_id ? [dsn.id, periode_id] : [dsn.id]
    );

    if (!rows.length) return res.status(404).json({ message: "Belum ada data penilaian." });

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=rekap_penilaian_semua.pdf");
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
        SELECT l.*, m.nama as nama_mahasiswa, m.nim, pl.nama AS nama_pelatihan
        FROM logbook l
        JOIN pengajuan pc ON pc.id = l.pengajuan_id
        JOIN mahasiswa m ON pc.mahasiswa_id = m.id
        JOIN bimbingan b ON b.pengajuan_id = pc.id
        LEFT JOIN pelatihan pl ON pl.id = l.pelatihan_id
        WHERE b.dosen_id = ? AND pc.periode_id = ?
        ORDER BY m.nama ASC, l.tanggal DESC
      `,
        [dsn.id, periode_id]
      );

      return res.json({ data: rows });
    }

    const [rows] = await db.query(
      `
      SELECT l.*, m.nama as nama_mahasiswa, m.nim, pl.nama AS nama_pelatihan
      FROM logbook l
      JOIN pengajuan pc ON pc.id = l.pengajuan_id
      JOIN mahasiswa m ON pc.mahasiswa_id = m.id
      LEFT JOIN pelatihan pl ON pl.id = l.pelatihan_id
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

const verifikasiLogbook = async (req, res) => {
  try {
    const dsn = await getDosenProfile(req.user.id);
    if (!dsn) return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { id } = req.params;
    const { status, feedback_dosen } = req.body;
    if (!["diverifikasi", "revisi"].includes(status)) {
      return res.status(400).json({ message: "Status tidak valid." });
    }

    const [logbookCheck] = await db.query("SELECT pengajuan_id FROM logbook WHERE id = ?", [id]);
    if (!logbookCheck.length) return res.status(404).json({ message: "Logbook tidak ditemukan." });

    const authorized = await isDosenPembimbingPengajuan(dsn.id, logbookCheck[0].pengajuan_id);
    if (!authorized) return res.status(403).json({ message: "Kamu bukan dosen pembimbing untuk pengajuan ini." });

    await db.query("UPDATE logbook SET status = ?, feedback_dosen = ?, verified_at = NOW() WHERE id = ?", [status, feedback_dosen, id]);

    const [logbook] = await db.query(
      `SELECT l.kegiatan, m.user_id, m.nama, m.email
       FROM logbook l
       JOIN pengajuan p ON p.id = l.pengajuan_id
       JOIN mahasiswa m ON p.mahasiswa_id = m.id
       WHERE l.id = ?`,
      [id]
    );

    if (logbook.length) {
      const mhs = logbook[0];
      const pesan = status === "diverifikasi" ? "Logbook kamu telah diverifikasi oleh dosen pembimbing." : `Logbook kamu perlu direvisi. Feedback: ${feedback_dosen}`;

      await db.query("INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)", [uuidv4(), mhs.user_id, "Status Logbook", pesan, status === "diverifikasi" ? "sukses" : "peringatan"]);

      await sendPushToUser(mhs.user_id, { title: "Status Logbook", body: pesan, url: "/mahasiswa/logbook" });

      if (mhs.email) {
        await sendEmail({
          to: mhs.email,
          subject: status === "diverifikasi" ? "✅ Logbook Kamu Telah Diverifikasi" : "⚠️ Logbook Kamu Perlu Direvisi",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #1e4db7; padding: 24px; border-radius: 12px 12px 0 0;">
                <h2 style="color: white; margin: 0;">e-MBKM ITBSS</h2>
              </div>
              <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
                <p>Halo <strong>${mhs.nama}</strong>,</p>
                ${
                  status === "diverifikasi"
                    ? `<p>Logbook kegiatan <strong>"${mhs.kegiatan}"</strong> kamu telah <span style="color: #16a34a; font-weight: bold;">diverifikasi</span> oleh dosen pembimbing.</p>`
                    : `<p>Logbook kegiatan <strong>"${mhs.kegiatan}"</strong> kamu memerlukan <span style="color: #dc2626; font-weight: bold;">revisi</span>.</p>
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
        SELECT d.*, m.nama as nama_mahasiswa, m.nim
        FROM dokumen d
        JOIN pengajuan pc ON pc.id = d.pengajuan_id
        JOIN mahasiswa m ON pc.mahasiswa_id = m.id
        JOIN bimbingan b ON b.pengajuan_id = pc.id
        WHERE b.dosen_id = ? AND pc.periode_id = ?
        ORDER BY m.nama ASC, d.created_at DESC
      `,
        [dsn.id, periode_id]
      );

      return res.json({ data: rows });
    }

    const [rows] = await db.query(
      `
      SELECT d.*, m.nama as nama_mahasiswa, m.nim
      FROM dokumen d
      JOIN pengajuan pc ON pc.id = d.pengajuan_id
      JOIN mahasiswa m ON pc.mahasiswa_id = m.id
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

    const [dok] = await db.query("SELECT * FROM dokumen WHERE id = ?", [id]);
    if (!dok.length) return res.status(404).json({ message: "Dokumen tidak ditemukan." });

    const authorized = await isDosenPembimbingPengajuan(dsn.id, dok[0].pengajuan_id);
    if (!authorized) return res.status(403).json({ message: "Kamu bukan dosen pembimbing untuk pengajuan ini." });

    // PERUBAHAN: urutan verifikasi laporan akhir sekarang Dospem DULU,
    // baru Kaprodi. Dospem tidak lagi menunggu Kaprodi; sebaliknya,
    // guard di bawah mencegah Dospem verifikasi ulang dokumen yang
    // sudah melewati tahap dospem (sudah disetujui_dospem/diverifikasi).
    if (dok[0].jenis === "laporan_akhir" && ["disetujui_dospem", "diverifikasi"].includes(dok[0].status)) {
      return res.status(400).json({ message: "Laporan Akhir sudah diverifikasi Dosen Pembimbing, menunggu Kaprodi." });
    }

    if (dok[0].jenis === "ppt" && dok[0].status === "diverifikasi") {
      return res.status(400).json({ message: "PPT sudah diverifikasi." });
    }

    let statusAkhir = status;
    if (status === "disetujui_dospem" && dok[0].jenis !== "laporan_akhir") {
      // Single-reviewer (ppt/dokumen_pendukung): approve dospem = final.
      statusAkhir = "diverifikasi";
    }
    // Untuk laporan_akhir, "disetujui_dospem" TIDAK langsung final —
    // masih menunggu verifikasi Kaprodi sebagai tahap kedua.

    // PERUBAHAN: percabangan kolom verifikasi berdasarkan jenis dokumen.
    // laporan_akhir = dual-reviewer (kaprodi + dospem), pakai kolom
    // feedback_dospem/verified_dospem_by/verified_dospem_at.
    // ppt (dan dokumen_pendukung) = dospem saja, pakai kolom generik
    // feedback/verified_by/verified_at agar tidak tertukar dengan jalur
    // dual-reviewer laporan akhir.
    if (dok[0].jenis === "laporan_akhir") {
      await db.query(
        `UPDATE dokumen SET status = ?, feedback_dospem = ?, verified_dospem_by = ?, verified_dospem_at = NOW() WHERE id = ?`,
        [statusAkhir, feedback || null, req.user.id, id]
      );
    } else {
      await db.query(
        `UPDATE dokumen SET status = ?, feedback = ?, verified_by = ?, verified_at = NOW() WHERE id = ?`,
        [statusAkhir, feedback || null, req.user.id, id]
      );
    }

    const [mhs] = await db.query(`SELECT m.user_id FROM pengajuan p JOIN mahasiswa m ON m.id = p.mahasiswa_id WHERE p.id = ?`, [dok[0].pengajuan_id]);

    if (mhs.length) {
      let pesan;
      if (statusAkhir === "diverifikasi") {
        pesan = dok[0].jenis === "ppt" ? "PPT kamu telah diverifikasi oleh Dosen Pembimbing." : "Laporan Akhir kamu telah diverifikasi oleh Kaprodi dan Dosen Pembimbing.";
      } else if (statusAkhir === "disetujui_dospem") {
        pesan = "Laporan Akhir kamu telah disetujui Dosen Pembimbing, menunggu verifikasi Kaprodi.";
      } else {
        pesan = `Dokumen ${dok[0].jenis === "ppt" ? "PPT" : "Laporan Akhir"} kamu perlu direvisi. Catatan: ${feedback || "-"}`;
      }

      await db.query("INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)", [uuidv4(), mhs[0].user_id, "Status Dokumen", pesan, (statusAkhir === "diverifikasi" || statusAkhir === "disetujui_dospem") ? "sukses" : "peringatan"]);
      await sendPushToUser(mhs[0].user_id, { title: "Status Dokumen", body: pesan, url: "/mahasiswa/dokumen" });
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
      `INSERT INTO feedback (id, pengajuan_id, dosen_id, referensi_id, referensi_tipe, isi_feedback)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), pengajuan_id, dsn.id, referensi_id || null, referensi_tipe || "logbook", isi_feedback]
    );

    const [mhs] = await db.query(`SELECT m.user_id FROM pengajuan p JOIN mahasiswa m ON m.id = p.mahasiswa_id WHERE p.id = ?`, [pengajuan_id]);
    if (mhs.length) {
      await db.query("INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)", [uuidv4(), mhs[0].user_id, "Feedback Baru", `Dosen pembimbing memberikan feedback: ${isi_feedback}`, "info"]);
      await sendPushToUser(mhs[0].user_id, { title: "Feedback Baru", body: isi_feedback, url: "/mahasiswa/bimbingan" });
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
      SELECT 'logbook' as tipe, l.id, m.nama as nama_mahasiswa, m.nim,
        l.created_at, l.status, l.kegiatan as deskripsi
      FROM logbook l
      JOIN pengajuan pc ON pc.id = l.pengajuan_id
      JOIN mahasiswa m ON pc.mahasiswa_id = m.id
      JOIN bimbingan b ON b.pengajuan_id = pc.id AND b.dosen_id = ?
      WHERE 1=1 ${periodeFilter}
      ORDER BY l.created_at DESC LIMIT 5
    `,
      params
    );

    const [dokumen] = await db.query(
      `
      SELECT 'dokumen' as tipe, d.id, m.nama as nama_mahasiswa, m.nim,
        d.created_at, d.status, d.nama_file as deskripsi
      FROM dokumen d
      JOIN pengajuan pc ON pc.id = d.pengajuan_id
      JOIN mahasiswa m ON pc.mahasiswa_id = m.id
      JOIN bimbingan b ON b.pengajuan_id = pc.id AND b.dosen_id = ?
      WHERE 1=1 ${periodeFilter}
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
};