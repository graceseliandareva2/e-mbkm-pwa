const path = require("path");
const PDFDocument = require("pdfkit");
const db = require("../config/db");

const LOGO_PATH = path.join(__dirname, "../assets/logo-itbss (1).png");

const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function formatTanggalIndo(dateInput) {
  const d = new Date(dateInput);
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function formatJam(timeString) {
  if (!timeString) return "-";
  const [h, m] = String(timeString).split(":");
  return `${h}.${m}`;
}

function formatHasilKendala(hasil, kendala) {
  const hasilText = hasil && hasil.trim() ? hasil.trim() : "-";
  const kendalaText = kendala && kendala.trim() ? kendala.trim() : null;
  if (!kendalaText) return hasilText;
  return `${hasilText}\nKendala: ${kendalaText}`;
}

/**
 * Ambil data pengajuan + mahasiswa + dosen pembimbing capstone + seluruh entri logbook
 * berdasarkan pengajuan_id. Dipakai bareng oleh 4 controller (mahasiswa/dosen/kaprodi/staff).
 */
async function getLogbookExportData(pengajuanId) {
  const [pengajuanRows] = await db.query(
    `SELECT p.id_pengajuan AS pengajuan_id,
            u.nim, u.nama,
            dp.penyelenggara, dp.durasi_pelatihan_jam, dp.judul,
            d.nama AS dosen_nama, d.id_dosen AS dosen_nidn
     FROM pengajuan p
     JOIN users u ON u.id_users = p.mahasiswa_id
     LEFT JOIN detail_pengajuan dp ON dp.pengajuan_id = p.id_pengajuan
     LEFT JOIN users d ON d.id_users = p.dosen_id
     WHERE p.id_pengajuan = ?`,
    [pengajuanId]
  );
  if (!pengajuanRows.length) return null;

  const [entries] = await db.query(
    `SELECT tanggal, jam_mulai, jam_selesai, topik, tugas, hasil, kendala, link_dokumentasi_drive
     FROM logbook
     WHERE pengajuan_id = ?
     ORDER BY tanggal ASC, jam_mulai ASC`,
    [pengajuanId]
  );

  // Link Dokumentasi (Drive) ditampilkan sebagai satu field di header PDF, meski
  // datanya tersimpan per-entri logbook -- ambil link non-kosong dari entri terbaru.
  const linkDokumentasi = [...entries]
    .reverse()
    .find((e) => e.link_dokumentasi_drive && e.link_dokumentasi_drive.trim())
    ?.link_dokumentasi_drive || null;

  // Kolom detail_pengajuan.waktu_studi_independen sudah tidak diisi form -- yang ditampilkan
  // di sini adalah durasi_pelatihan_jam (mis. "30 jam"), sesuai field yang benar-benar diisi mahasiswa.
  const waktuStudiIndependen = pengajuanRows[0].durasi_pelatihan_jam != null
    ? `${pengajuanRows[0].durasi_pelatihan_jam} jam`
    : null;

  return {
    ...pengajuanRows[0],
    entries,
    link_dokumentasi_drive: linkDokumentasi,
    waktu_studi_independen: waktuStudiIndependen,
  };
}

const COL = { tgl: 30, durasi: 85, topik: 145, tugas: 260, hasil: 375, paraf: 490 };
const WID = { tgl: 55, durasi: 60, topik: 115, tugas: 115, hasil: 115, paraf: 75 };
const FONT_SIZE = 7.5;
const LINE_H = 10;
const ROW_PAD = 5;
const CELL_PAD_X = 4; // jarak teks isi sel ke garis kolom kiri/kanan
const TABLE_RIGHT = 535;
const INFO_LINE_GAP = 6; // jarak antar baris info (NIM/Nama, Penyelenggara, dst), dalam pt

function textHeight(text, width) {
  const usableWidth = Math.max(1, width - CELL_PAD_X * 2);
  const chars = Math.max(1, Math.floor(usableWidth / (FONT_SIZE * 0.5)));
  const lines = String(text || "-").split("\n").reduce((acc, line) => acc + Math.ceil((line.length || 1) / chars), 0);
  return Math.max(1, lines) * LINE_H;
}

/**
 * Generate buffer PDF logbook, layout sama persis dengan template resmi ITBSS.
 * @param {Object} data hasil dari getLogbookExportData()
 * @returns {Promise<Buffer>}
 */
function generateLogbookPdfBuffer(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Kop surat -- logo di pojok kiri atas (bukan di tengah), supaya tidak menabrak judul yang center
    try {
      doc.image(LOGO_PATH, 30, 25, { width: 55 });
    } catch { /* logo opsional, lanjut tanpa logo kalau file tidak ada */ }
    doc.font("Helvetica-Bold").fontSize(13).text("Institut Teknologi & Bisnis SABDA SETIA", 30, 30, { align: "center", width: TABLE_RIGHT });
    doc.font("Helvetica").fontSize(8);
    ["(Ijin Pendirian Mendikbudristek No. 460/E/O/2021)", "Jalan Purnama 2, Parit Tokaya", "Pontianak Selatan, Kalimantan Barat", "website: https://itbss.ac.id/", "email: humas@itbss.ac.id", "HP: 0852 818 17855"].forEach((line) => {
      doc.text(line, 30, doc.y, { align: "center", width: TABLE_RIGHT });
    });
    doc.moveDown(0.3);
    doc.moveTo(30, doc.y).lineTo(30 + TABLE_RIGHT, doc.y).lineWidth(1.2).stroke();
    doc.moveDown(0.6);

    doc.font("Helvetica-Bold").fontSize(12).text("LOG-BOOK CAPSTONE PROJECT", { align: "center", underline: true });
    doc.text("STUDI INDEPENDEN", { align: "center", underline: true });
    doc.moveDown(0.6);

    doc.font("Helvetica").fontSize(9);
    const infoField = (label, value) => {
      const y = doc.y;
      doc.text(label, 30, y, { width: 140, lineBreak: false });
      doc.text(`: ${value || "-"}`, 175, y, { width: 390 });
      doc.y = y + doc.currentLineHeight() + INFO_LINE_GAP;
    };
    infoField("NIM / Nama", `${data.nim} / ${data.nama}`);
    infoField("Penyelenggara", data.penyelenggara);
    infoField("Waktu Studi Independen", data.waktu_studi_independen);
    infoField("Judul Capstone Project", data.judul);
    infoField("Link Dokumentasi (Drive)", data.link_dokumentasi_drive);
    doc.moveDown(0.6);

    const drawHeader = () => {
      const y = doc.y;
      doc.lineWidth(0.5);
      doc.rect(30, y, TABLE_RIGHT, 20).fillAndStroke("#ffffff", "#000000");
      doc.fillColor("#000000").font("Helvetica-Bold").fontSize(FONT_SIZE);
      doc.text("Hari/\nTanggal", COL.tgl, y + 3, { width: WID.tgl, align: "center" });
      doc.text("Durasi\nBelajar", COL.durasi, y + 3, { width: WID.durasi, align: "center" });
      doc.text("Topik yang\nDipelajari", COL.topik, y + 3, { width: WID.topik, align: "center" });
      doc.text("Tugas/ Proyek yang\ndikerjakan", COL.tugas, y + 3, { width: WID.tugas, align: "center" });
      doc.text("Hasil dan Kendala\n(jika ada)", COL.hasil, y + 3, { width: WID.hasil, align: "center" });
      doc.text("Paraf\nDosen", COL.paraf, y + 3, { width: WID.paraf, align: "center" });
      doc.font("Helvetica").fontSize(FONT_SIZE);
      doc.y = y + 20;
      // garis vertikal antar kolom
      Object.values(COL).forEach((x) => doc.moveTo(x, y).lineTo(x, y + 20).lineWidth(0.5).stroke());
      doc.moveTo(30 + TABLE_RIGHT, y).lineTo(30 + TABLE_RIGHT, y + 20).lineWidth(0.5).stroke();
    };

    drawHeader();

    const entries = data.entries?.length ? data.entries : [{}];
    entries.forEach((entry) => {
      const isEmpty = !data.entries?.length;
      const hasilKendalaText = isEmpty ? "" : formatHasilKendala(entry.hasil, entry.kendala);
      const rowH = isEmpty
        ? 18
        : Math.max(
            LINE_H,
            textHeight(entry.topik, WID.topik),
            textHeight(entry.tugas, WID.tugas),
            textHeight(hasilKendalaText, WID.hasil)
          ) + ROW_PAD * 2;

      if (doc.y + rowH > 780) {
        doc.addPage();
        doc.y = 30;
        drawHeader();
      }

      const y = doc.y;
      doc.lineWidth(0.5);
      doc.rect(30, y, TABLE_RIGHT, rowH).stroke();
      Object.values(COL).forEach((x) => doc.moveTo(x, y).lineTo(x, y + rowH).lineWidth(0.5).stroke());
      doc.moveTo(30 + TABLE_RIGHT, y).lineTo(30 + TABLE_RIGHT, y + rowH).lineWidth(0.5).stroke();

      doc.fillColor("#000000").font("Helvetica").fontSize(FONT_SIZE);
      if (!isEmpty) {
        doc.text(formatTanggalIndo(entry.tanggal), COL.tgl, y + ROW_PAD, { width: WID.tgl, align: "center" });
        doc.text(`${formatJam(entry.jam_mulai)} – ${formatJam(entry.jam_selesai)}`, COL.durasi, y + ROW_PAD, { width: WID.durasi, align: "center" });
        doc.text(entry.topik || "-", COL.topik + CELL_PAD_X, y + ROW_PAD, { width: WID.topik - CELL_PAD_X * 2 });
        doc.text(entry.tugas || "-", COL.tugas + CELL_PAD_X, y + ROW_PAD, { width: WID.tugas - CELL_PAD_X * 2 });
        doc.text(hasilKendalaText, COL.hasil + CELL_PAD_X, y + ROW_PAD, { width: WID.hasil - CELL_PAD_X * 2 });
      } else {
        doc.text("…", COL.tgl, y + ROW_PAD, { width: WID.tgl, align: "center" });
      }
      doc.y = y + rowH;
    });

    doc.moveDown(1.2);
    if (doc.y > 740) { doc.addPage(); doc.y = 30; }

    const today = formatTanggalIndo(new Date());
    doc.font("Helvetica").fontSize(9).text(`Pontianak, ${today}`, 30, doc.y, { align: "right", width: TABLE_RIGHT });
    doc.moveDown(0.5);

    // Blok TTD hanya menempati separuh kanan halaman (bukan lebar penuh tabel dari margin kiri)
    const SIG_START = 30 + TABLE_RIGHT / 2;
    const SIG_COL_W = (TABLE_RIGHT / 2) / 2;

    const sigY = doc.y;
    doc.text("Diverifikasi oleh,", SIG_START, sigY, { width: SIG_COL_W });
    doc.text("Disusun oleh,", SIG_START + SIG_COL_W, sigY, { width: SIG_COL_W });

    const sigNameY = sigY + 60;
    doc.text(`(${data.dosen_nama || "-"})`, SIG_START, sigNameY, { width: SIG_COL_W });
    doc.text(`(${data.nama})`, SIG_START + SIG_COL_W, sigNameY, { width: SIG_COL_W });
    doc.text(`NIDN. ${data.dosen_nidn || "-"}`, SIG_START, sigNameY + 14, { width: SIG_COL_W });
    doc.text(`NIM. ${data.nim}`, SIG_START + SIG_COL_W, sigNameY + 14, { width: SIG_COL_W });

    doc.end();
  });
}

module.exports = { getLogbookExportData, generateLogbookPdfBuffer };