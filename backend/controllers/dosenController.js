const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");
const PDFDocument = require("pdfkit");
const { sendEmail } = require("../utils/mailer");
const { sendPushToUser } = require("../utils/pushSender");

const getMahasiswaBimbingan = async (req, res) => {
  try {
    const [dsn] = await db.query("SELECT id FROM dosen WHERE user_id = ?", [
      req.user.id,
    ]);
    if (!dsn.length)
      return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { periode_id } = req.query;
    const [rows] = await db.query(
      `
      SELECT 
        m.id, m.user_id, m.nim, m.nama, m.email, m.program_studi, m.angkatan,
        b.periode_id, p.nama_periode,
        pc.id as pengajuan_id, pc.judul, pc.status as status_pengajuan,
        pc.pelatihan, pc.email as email_pengajuan, pc.dosen_pembimbing_akademik, pc.catatan_kaprodi,
        COUNT(DISTINCT l.id) as jumlah_logbook
      FROM bimbingan b
      JOIN mahasiswa m ON b.mahasiswa_id = m.id
      JOIN periode p ON b.periode_id = p.id
      LEFT JOIN pengajuan_capstone pc ON m.id = pc.mahasiswa_id AND pc.periode_id = b.periode_id
      LEFT JOIN logbook l ON m.id = l.mahasiswa_id AND l.periode_id = b.periode_id
      WHERE b.dosen_id = ? ${periode_id ? "AND b.periode_id = ?" : ""}
      GROUP BY m.id, m.user_id, m.nim, m.nama, m.email, m.program_studi, m.angkatan,
        b.periode_id, p.nama_periode, pc.id, pc.judul, pc.status,
        pc.pelatihan, pc.email, pc.dosen_pembimbing_akademik, pc.catatan_kaprodi
      ORDER BY m.nama ASC
    `,
      periode_id ? [dsn[0].id, periode_id] : [dsn[0].id],
    );

    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getMahasiswaSiapDinilai = async (req, res) => {
  try {
    const [dsn] = await db.query("SELECT id FROM dosen WHERE user_id = ?", [
      req.user.id,
    ]);
    if (!dsn.length)
      return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { periode_id } = req.query;
    const [rows] = await db.query(
      `
      SELECT 
        m.id, m.nim, m.nama, m.program_studi, m.angkatan,
        b.periode_id, p.nama_periode,
        pc.judul, pc.pelatihan,
        SUM(CASE WHEN d.jenis = 'ppt' AND d.status = 'diverifikasi' THEN 1 ELSE 0 END) as punya_ppt,
        SUM(CASE WHEN d.jenis = 'laporan_akhir' AND d.status = 'diverifikasi' THEN 1 ELSE 0 END) as punya_laporan,
        COALESCE((
          SELECT SUM(l.jam) / 60 FROM logbook l
          WHERE l.mahasiswa_id = m.id AND l.periode_id = b.periode_id AND l.status = 'diverifikasi'
        ), 0) as total_jam_logbook,
        pn.id as penilaian_id,
        pn.nilai_kesesuaian, pn.nilai_proyek, pn.nilai_evaluasi,
        pn.nilai_laporan, pn.nilai_presentasi,
        pn.nilai_akhir, pn.grade, pn.catatan
      FROM bimbingan b
      JOIN mahasiswa m ON b.mahasiswa_id = m.id
      JOIN periode p ON b.periode_id = p.id
      LEFT JOIN pengajuan_capstone pc ON m.id = pc.mahasiswa_id AND pc.periode_id = b.periode_id
      LEFT JOIN dokumen d ON m.id = d.mahasiswa_id AND d.periode_id = b.periode_id
      LEFT JOIN penilaian pn ON m.id = pn.mahasiswa_id AND pn.periode_id = b.periode_id
      WHERE b.dosen_id = ? ${periode_id ? "AND b.periode_id = ?" : ""}
      GROUP BY m.id, m.nim, m.nama, m.program_studi, m.angkatan,
        b.periode_id, p.nama_periode, pc.judul, pc.pelatihan,
        pn.id, pn.nilai_kesesuaian, pn.nilai_proyek, pn.nilai_evaluasi,
        pn.nilai_laporan, pn.nilai_presentasi, pn.nilai_akhir, pn.grade, pn.catatan
      HAVING punya_ppt >= 1 AND punya_laporan >= 1
      ORDER BY m.nama ASC
    `,
      periode_id ? [dsn[0].id, periode_id] : [dsn[0].id],
    );

    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const berikanPenilaian = async (req, res) => {
  try {
    const [dsn] = await db.query("SELECT id FROM dosen WHERE user_id = ?", [
      req.user.id,
    ]);
    if (!dsn.length)
      return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const {
      mahasiswa_id,
      periode_id,
      nilai_kesesuaian,
      nilai_proyek,
      nilai_evaluasi,
      nilai_laporan,
      nilai_presentasi,
      catatan,
    } = req.body;

    if (!mahasiswa_id || !periode_id) {
      return res
        .status(400)
        .json({ message: "mahasiswa_id dan periode_id wajib diisi." });
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

    const [existing] = await db.query(
      "SELECT id FROM penilaian WHERE mahasiswa_id = ? AND periode_id = ?",
      [mahasiswa_id, periode_id],
    );

    if (existing.length) {
      await db.query(
        `UPDATE penilaian SET 
          nilai_kesesuaian=?, nilai_proyek=?, nilai_evaluasi=?,
          nilai_laporan=?, nilai_presentasi=?,
          nilai_akhir=?, grade=?, catatan=?
        WHERE id=?`,
        [
          nilai_kesesuaian,
          nilai_proyek,
          nilai_evaluasi,
          nilai_laporan,
          nilai_presentasi,
          nilai_akhir,
          grade,
          catatan,
          existing[0].id,
        ],
      );
    } else {
      await db.query(
        `INSERT INTO penilaian 
          (id, mahasiswa_id, dosen_id, periode_id, nilai_kesesuaian, nilai_proyek, nilai_evaluasi, nilai_laporan, nilai_presentasi, nilai_akhir, grade, catatan)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          mahasiswa_id,
          dsn[0].id,
          periode_id,
          nilai_kesesuaian,
          nilai_proyek,
          nilai_evaluasi,
          nilai_laporan,
          nilai_presentasi,
          nilai_akhir,
          grade,
          catatan,
        ],
      );
    }

    const [mhs] = await db.query(
      "SELECT user_id, nama, email FROM mahasiswa WHERE id = ?",
      [mahasiswa_id],
    );
    if (mhs.length) {
      const pesan = `Dosen pembimbing telah memberikan nilai akhir kamu. Nilai: ${nilai_akhir} (${grade})`;

      await db.query(
        "INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
        [uuidv4(), mhs[0].user_id, "Nilai Akhir", pesan, "sukses"],
      );

      await sendPushToUser(mhs[0].user_id, {
        title: "Nilai Akhir",
        body: `Nilai akhir kamu: ${nilai_akhir} (${grade})`,
        url: "/mahasiswa/penilaian",
      });
    }

    res.json({ message: "Penilaian berhasil disimpan.", nilai_akhir, grade });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const eksporPenilaianPDF = async (req, res) => {
  try {
    const { mahasiswa_id, periode_id } = req.query;

    const [rows] = await db.query(
      `
      SELECT p.*, m.nama, m.nim, m.program_studi, m.angkatan,
             pr.nama_periode, d.nama as nama_dosen
      FROM penilaian p
      JOIN mahasiswa m ON p.mahasiswa_id = m.id
      JOIN periode pr ON p.periode_id = pr.id
      JOIN dosen d ON p.dosen_id = d.id
      WHERE p.mahasiswa_id = ? AND p.periode_id = ?
    `,
      [mahasiswa_id, periode_id],
    );

    if (!rows.length)
      return res
        .status(404)
        .json({ message: "Data penilaian tidak ditemukan." });

    const data = rows[0];
    const doc = new PDFDocument({ margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=penilaian_${data.nim}.pdf`,
    );
    doc.pipe(res);

    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text("REKAP PENILAIAN AKHIR", { align: "center" });
    doc
      .fontSize(12)
      .font("Helvetica")
      .text("Program Studi Sistem dan Teknologi Informasi", {
        align: "center",
      });
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
      doc
        .font("Helvetica-Bold")
        .text(label, 50, rowY, { width: 130, lineBreak: false });
      doc.font("Helvetica").text(`: ${val}`, 180, rowY, { width: 365 });
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Rincian Penilaian per Rubrik", { underline: true });
    doc.moveDown(0.5);

    const RUBRIK = [
      {
        no: 1,
        aspek: "Kesesuaian Program dan Topik Pembelajaran",
        field: "nilai_kesesuaian",
        bobot: 15,
      },
      {
        no: 2,
        aspek: "Proyek/Karya Tugas Akhir",
        field: "nilai_proyek",
        bobot: 30,
      },
      {
        no: 3,
        aspek: "Evaluasi Pembelajaran Mandiri",
        field: "nilai_evaluasi",
        bobot: 15,
      },
      {
        no: 4,
        aspek: "Laporan Akhir dan Portofolio",
        field: "nilai_laporan",
        bobot: 20,
      },
      {
        no: 5,
        aspek: "Presentasi Refleksi Pembelajaran",
        field: "nilai_presentasi",
        bobot: 20,
      },
    ];

    const colX = [50, 75, 295, 360, 420, 480];
    const headerY = doc.y;
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("No", colX[0], headerY, { width: 25, lineBreak: false });
    doc.text("Aspek Penilaian", colX[1], headerY, {
      width: 215,
      lineBreak: false,
    });
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
      doc.text(nilaiVal.toFixed(2), colX[3], rowY, {
        width: 55,
        lineBreak: false,
      });
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
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        `Dicetak pada: ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`,
        { align: "right" },
      );

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const eksporSemuaPenilaianPDF = async (req, res) => {
  try {
    const [dsn] = await db.query(
      "SELECT id, nama FROM dosen WHERE user_id = ?",
      [req.user.id],
    );
    if (!dsn.length)
      return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { periode_id } = req.query;
    const [rows] = await db.query(
      `
      SELECT p.*, m.nama, m.nim, m.program_studi, pr.nama_periode
      FROM penilaian p
      JOIN mahasiswa m ON p.mahasiswa_id = m.id
      JOIN periode pr ON p.periode_id = pr.id
      WHERE p.dosen_id = ? ${periode_id ? "AND p.periode_id = ?" : ""}
      ORDER BY m.nama ASC
    `,
      periode_id ? [dsn[0].id, periode_id] : [dsn[0].id],
    );

    if (!rows.length)
      return res.status(404).json({ message: "Belum ada data penilaian." });

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=rekap_penilaian_semua.pdf",
    );
    doc.pipe(res);

    doc
      .fontSize(16)
      .font("Helvetica-Bold")
      .text("REKAP NILAI AKHIR MAHASISWA", { align: "center" });
    doc
      .fontSize(12)
      .font("Helvetica")
      .text("Program Studi Sistem dan Teknologi Informasi", {
        align: "center",
      });
    doc.text("Institut Teknologi & Bisnis Sabda Setia", { align: "center" });
    doc.moveDown(0.5);
    doc
      .font("Helvetica")
      .text(`Dosen Pembimbing : ${dsn[0].nama}`, { align: "center" });
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
    doc
      .font("Helvetica")
      .fontSize(10)
      .text(
        `Dicetak pada: ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`,
        { align: "right" },
      );

    doc.end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getLogbookMahasiswa = async (req, res) => {
  try {
    const [dsn] = await db.query("SELECT id FROM dosen WHERE user_id = ?", [
      req.user.id,
    ]);
    if (!dsn.length)
      return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { mahasiswa_id, periode_id } = req.query;

    if (!mahasiswa_id || mahasiswa_id === "semua") {
      if (!periode_id)
        return res.status(400).json({ message: "periode_id wajib diisi." });

      const [rows] = await db.query(
        `
        SELECT l.*, m.nama as nama_mahasiswa, m.nim
        FROM logbook l
        JOIN mahasiswa m ON l.mahasiswa_id = m.id
        JOIN bimbingan b ON b.mahasiswa_id = l.mahasiswa_id AND b.periode_id = l.periode_id
        WHERE b.dosen_id = ? AND l.periode_id = ?
        ORDER BY m.nama ASC, l.tanggal DESC
      `,
        [dsn[0].id, periode_id],
      );

      return res.json({ data: rows });
    }

    const [rows] = await db.query(
      `
      SELECT l.*, m.nama as nama_mahasiswa, m.nim
      FROM logbook l JOIN mahasiswa m ON l.mahasiswa_id = m.id
      WHERE l.mahasiswa_id = ? ${periode_id ? "AND l.periode_id = ?" : ""}
      ORDER BY l.tanggal DESC
    `,
      periode_id ? [mahasiswa_id, periode_id] : [mahasiswa_id],
    );

    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const verifikasiLogbook = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, feedback_dosen } = req.body;
    if (!["diverifikasi", "revisi"].includes(status)) {
      return res.status(400).json({ message: "Status tidak valid." });
    }

    await db.query(
      "UPDATE logbook SET status = ?, feedback_dosen = ?, verified_at = NOW() WHERE id = ?",
      [status, feedback_dosen, id],
    );

    const [logbook] = await db.query(
      `SELECT l.kegiatan, m.user_id, m.nama, m.email
       FROM logbook l JOIN mahasiswa m ON l.mahasiswa_id = m.id WHERE l.id = ?`,
      [id],
    );

    if (logbook.length) {
      const mhs = logbook[0];
      const pesan =
        status === "diverifikasi"
          ? "Logbook kamu telah diverifikasi oleh dosen pembimbing."
          : `Logbook kamu perlu direvisi. Feedback: ${feedback_dosen}`;

      await db.query(
        "INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
        [
          uuidv4(),
          mhs.user_id,
          "Status Logbook",
          pesan,
          status === "diverifikasi" ? "sukses" : "peringatan",
        ],
      );

      await sendPushToUser(mhs.user_id, {
        title: "Status Logbook",
        body: pesan,
        url: "/mahasiswa/logbook",
      });

      if (mhs.email) {
        await sendEmail({
          to: mhs.email,
          subject:
            status === "diverifikasi"
              ? "✅ Logbook Kamu Telah Diverifikasi"
              : "⚠️ Logbook Kamu Perlu Direvisi",
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
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getDokumenMahasiswa = async (req, res) => {
  try {
    const [dsn] = await db.query("SELECT id FROM dosen WHERE user_id = ?", [
      req.user.id,
    ]);
    if (!dsn.length)
      return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { mahasiswa_id, periode_id } = req.query;

    if (!mahasiswa_id || mahasiswa_id === "semua") {
      if (!periode_id)
        return res.status(400).json({ message: "periode_id wajib diisi." });

      const [rows] = await db.query(
        `
        SELECT d.*, m.nama as nama_mahasiswa, m.nim
        FROM dokumen d
        JOIN mahasiswa m ON d.mahasiswa_id = m.id
        JOIN bimbingan b ON b.mahasiswa_id = d.mahasiswa_id AND b.periode_id = d.periode_id
        WHERE b.dosen_id = ? AND d.periode_id = ?
        ORDER BY m.nama ASC, d.created_at DESC
      `,
        [dsn[0].id, periode_id],
      );

      return res.json({ data: rows });
    }

    const [rows] = await db.query(
      `
      SELECT d.*, m.nama as nama_mahasiswa, m.nim
      FROM dokumen d JOIN mahasiswa m ON d.mahasiswa_id = m.id
      WHERE d.mahasiswa_id = ? ${periode_id ? "AND d.periode_id = ?" : ""}
      ORDER BY d.created_at DESC
    `,
      periode_id ? [mahasiswa_id, periode_id] : [mahasiswa_id],
    );

    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const verifikasiDokumen = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, feedback } = req.body;

    const validStatus = ["revisi_dospem", "disetujui_dospem"];
    if (!validStatus.includes(status))
      return res.status(400).json({ message: "Status tidak valid." });

    const [dok] = await db.query("SELECT * FROM dokumen WHERE id = ?", [id]);
    if (!dok.length)
      return res.status(404).json({ message: "Dokumen tidak ditemukan." });

    if (
      dok[0].jenis === "laporan_akhir" &&
      dok[0].status !== "disetujui_kaprodi"
    ) {
      return res.status(400).json({
        message:
          "Laporan Akhir harus disetujui Kaprodi terlebih dahulu sebelum dapat diverifikasi Dosen.",
      });
    }

    if (dok[0].jenis === "ppt" && dok[0].status === "diverifikasi") {
      return res.status(400).json({ message: "PPT sudah diverifikasi." });
    }

    let statusAkhir = status;
    if (status === "disetujui_dospem") {
      statusAkhir = "diverifikasi";
    }

    await db.query(
      `UPDATE dokumen SET
        status = ?,
        feedback_dospem = ?,
        verified_dospem_by = ?,
        verified_dospem_at = NOW()
      WHERE id = ?`,
      [statusAkhir, feedback || null, req.user.id, id],
    );

    const [mhs] = await db.query(`SELECT user_id FROM mahasiswa WHERE id = ?`, [
      dok[0].mahasiswa_id,
    ]);

    if (mhs.length) {
      let pesan;
      if (statusAkhir === "diverifikasi") {
        pesan =
          dok[0].jenis === "ppt"
            ? "PPT kamu telah diverifikasi oleh Dosen Pembimbing."
            : "Laporan Akhir kamu telah diverifikasi oleh Kaprodi dan Dosen Pembimbing.";
      } else {
        pesan = `Dokumen ${dok[0].jenis === "ppt" ? "PPT" : "Laporan Akhir"} kamu perlu direvisi. Catatan: ${feedback || "-"}`;
      }

      await db.query(
        "INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
        [
          uuidv4(),
          mhs[0].user_id,
          "Status Dokumen",
          pesan,
          statusAkhir === "diverifikasi" ? "sukses" : "peringatan",
        ],
      );

      await sendPushToUser(mhs[0].user_id, {
        title: "Status Dokumen",
        body: pesan,
        url: "/mahasiswa/dokumen",
      });
    }

    res.json({ message: "Dokumen berhasil diverifikasi." });
  } catch (error) {
    console.error("verifikasiDokumen dosen error:", error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const berikanFeedback = async (req, res) => {
  try {
    const [dsn] = await db.query("SELECT id FROM dosen WHERE user_id = ?", [
      req.user.id,
    ]);
    const {
      mahasiswa_id,
      periode_id,
      referensi_id,
      referensi_tipe,
      isi_feedback,
    } = req.body;
    if (!mahasiswa_id || !periode_id || !isi_feedback) {
      return res.status(400).json({ message: "Data feedback tidak lengkap." });
    }
    await db.query(
      `INSERT INTO feedback (id, mahasiswa_id, dosen_id, periode_id, referensi_id, referensi_tipe, isi_feedback)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        mahasiswa_id,
        dsn[0].id,
        periode_id,
        referensi_id || null,
        referensi_tipe || "logbook",
        isi_feedback,
      ],
    );
    const [mhs] = await db.query("SELECT user_id FROM mahasiswa WHERE id = ?", [
      mahasiswa_id,
    ]);
    if (mhs.length) {
      await db.query(
        "INSERT INTO notifikasi (id, user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?, ?)",
        [
          uuidv4(),
          mhs[0].user_id,
          "Feedback Baru",
          `Dosen pembimbing memberikan feedback: ${isi_feedback}`,
          "info",
        ],
      );

      await sendPushToUser(mhs[0].user_id, {
        title: "Feedback Baru",
        body: isi_feedback,
        url: "/mahasiswa/bimbingan",
      });
    }
    res.status(201).json({ message: "Feedback berhasil dikirim." });
  } catch (error) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

const getAktivitasTerbaru = async (req, res) => {
  try {
    const [dsn] = await db.query("SELECT id FROM dosen WHERE user_id = ?", [
      req.user.id,
    ]);
    if (!dsn.length)
      return res.status(404).json({ message: "Data dosen tidak ditemukan." });

    const { periode_id } = req.query;
    const periodeFilter = periode_id ? "AND l.periode_id = ?" : "";
    const periodeFilterD = periode_id ? "AND d.periode_id = ?" : "";

    const lbParams = periode_id ? [dsn[0].id, periode_id] : [dsn[0].id];
    const dkParams = periode_id ? [dsn[0].id, periode_id] : [dsn[0].id];

    const [logbooks] = await db.query(
      `
      SELECT 'logbook' as tipe, l.id, m.nama as nama_mahasiswa, m.nim,
        l.created_at, l.status, l.kegiatan as deskripsi
      FROM logbook l JOIN mahasiswa m ON l.mahasiswa_id = m.id
      JOIN bimbingan b ON b.mahasiswa_id = m.id AND b.dosen_id = ?
      WHERE 1=1 ${periodeFilter}
      ORDER BY l.created_at DESC LIMIT 5
    `,
      lbParams,
    );

    const [dokumen] = await db.query(
      `
      SELECT 'dokumen' as tipe, d.id, m.nama as nama_mahasiswa, m.nim,
        d.created_at, d.status, d.nama_file as deskripsi
      FROM dokumen d JOIN mahasiswa m ON d.mahasiswa_id = m.id
      JOIN bimbingan b ON b.mahasiswa_id = m.id AND b.dosen_id = ?
      WHERE 1=1 ${periodeFilterD}
      ORDER BY d.created_at DESC LIMIT 5
    `,
      dkParams,
    );

    const aktivitas = [...logbooks, ...dokumen]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);

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
  berikanFeedback,
  eksporPenilaianPDF,
  eksporSemuaPenilaianPDF,
  getMahasiswaSiapDinilai,
};
