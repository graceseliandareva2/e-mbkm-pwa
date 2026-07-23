const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  AlignmentType,
  BorderStyle,
  WidthType,
  VerticalAlign,
  HeightRule,
  Header,
} = require('docx');

// Sesuaikan path ini ke lokasi logo di project kamu
const LOGO_PATH = path.join(__dirname, '../assets/logo-itbss (1).png');

const FONT = 'Cambria';
const BORDER_COLOR = '000000';

const THIN_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 8, color: BORDER_COLOR },
  bottom: { style: BorderStyle.SINGLE, size: 8, color: BORDER_COLOR },
  left: { style: BorderStyle.SINGLE, size: 8, color: BORDER_COLOR },
  right: { style: BorderStyle.SINGLE, size: 8, color: BORDER_COLOR },
};

const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

const BULAN_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function formatTanggalIndo(dateInput) {
  const d = new Date(dateInput);
  return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

/** Format waktu "09:00:00" (dari MySQL TIME) jadi "09.00" (pakai titik, sesuai template) */
function formatJam(timeString) {
  if (!timeString) return '-';
  const [h, m] = timeString.split(':');
  return `${h}.${m}`;
}

function labelValueRow(label, value) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 30, type: WidthType.PERCENTAGE },
        borders: NO_BORDER,
        children: [new Paragraph({ children: [new TextRun({ text: label, font: FONT, size: 22 })] })],
      }),
      new TableCell({
        width: { size: 5, type: WidthType.PERCENTAGE },
        borders: NO_BORDER,
        children: [new Paragraph({ children: [new TextRun({ text: ':', font: FONT, size: 22 })] })],
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        borders: NO_BORDER,
        children: [new Paragraph({ children: [new TextRun({ text: value || '-', font: FONT, size: 22 })] })],
      }),
    ],
  });
}

function tableHeaderCell(text) {
  return new TableCell({
    borders: THIN_BORDER,
    verticalAlign: VerticalAlign.CENTER,
    shading: { fill: 'FFFFFF' },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: true, font: FONT, size: 22 })],
      }),
    ],
  });
}

function tableBodyCell(text, opts = {}) {
  return new TableCell({
    borders: THIN_BORDER,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: [new TextRun({ text: text || '-', font: FONT, size: 22 })],
      }),
    ],
  });
}

/** Gabungkan hasil + kendala jadi satu isi kolom "Hasil dan Kendala (jika ada)" */
function formatHasilKendala(hasil, kendala) {
  const hasilText = hasil && hasil.trim() ? hasil.trim() : '-';
  const kendalaText = kendala && kendala.trim() && kendala.trim() !== '-' ? kendala.trim() : null;
  if (!kendalaText) return hasilText;
  return `${hasilText}\n\nKendala: ${kendalaText}`;
}

function buildLogbookTable(entries) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      tableHeaderCell('Hari/\nTanggal'),
      tableHeaderCell('Durasi Belajar'),
      tableHeaderCell('Topik yang Dipelajari'),
      tableHeaderCell('Tugas/ Proyek yang dikerjakan'),
      tableHeaderCell('Hasil dan Kendala (jika ada)'),
    ],
  });

  const bodyRows = entries.map((entry) => {
    return new TableRow({
      children: [
        tableBodyCell(formatTanggalIndo(entry.tanggal), { center: true }),
        tableBodyCell(`${formatJam(entry.jam_mulai)} – ${formatJam(entry.jam_selesai)}`, { center: true }),
        tableBodyCell(entry.kegiatan),
        tableBodyCell(entry.deskripsi),
        tableBodyCell(formatHasilKendala(entry.hasil, entry.kendala)),
      ],
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

function buildSignatureBlock({ dosenNama, dosenNidn, mahasiswaNama, mahasiswaNim }) {
  const today = formatTanggalIndo(new Date());

  return [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 400 },
      children: [new TextRun({ text: `Pontianak, ${today}`, font: FONT, size: 22 })],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: NO_BORDER,
              children: [new Paragraph({ children: [new TextRun({ text: 'Diverifikasi oleh,', font: FONT, size: 22 })] })],
            }),
            new TableCell({
              borders: NO_BORDER,
              children: [new Paragraph({ children: [new TextRun({ text: 'Disusun oleh,', font: FONT, size: 22 })] })],
            }),
          ],
        }),
        // baris kosong buat ruang tanda tangan fisik
        new TableRow({
          height: { value: 1000, rule: HeightRule.ATLEAST },
          children: [
            new TableCell({ borders: NO_BORDER, children: [new Paragraph({ children: [new TextRun({ text: '', font: FONT })] })] }),
            new TableCell({ borders: NO_BORDER, children: [new Paragraph({ children: [new TextRun({ text: '', font: FONT })] })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: NO_BORDER,
              children: [new Paragraph({ children: [new TextRun({ text: `(${dosenNama || '-'})`, font: FONT, size: 22 })] })],
            }),
            new TableCell({
              borders: NO_BORDER,
              children: [new Paragraph({ children: [new TextRun({ text: `(${mahasiswaNama})`, font: FONT, size: 22 })] })],
            }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({
              borders: NO_BORDER,
              children: [new Paragraph({ children: [new TextRun({ text: `NIDN. ${dosenNidn || '-'}`, font: FONT, size: 22 })] })],
            }),
            new TableCell({
              borders: NO_BORDER,
              children: [new Paragraph({ children: [new TextRun({ text: `NIM. ${mahasiswaNim}`, font: FONT, size: 22 })] })],
            }),
          ],
        }),
      ],
    }),
  ];
}

/**
 * @param {Object} data
 * @param {Object} data.mahasiswa - { nim, nama }
 * @param {Object} data.detailPengajuan - { penyelenggara, waktu_studi_independen, judul }
 * @param {Object} data.dosenPembimbing - { nama, nidn } - dosen pembimbing capstone (dari tabel bimbingan, BUKAN dospem akademik)
 * @param {Array}  data.logbookEntries - array baris logbook dari DB, urut by tanggal ASC
 * @returns {Promise<Buffer>}
 */
async function generateLogbookDocx(data) {
  const { mahasiswa, detailPengajuan, dosenPembimbing, logbookEntries } = data;

  const logoBuffer = fs.readFileSync(LOGO_PATH);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 454, bottom: 454, left: 850, right: 850, header: 454 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new ImageRun({
                    data: logoBuffer,
                    transformation: { width: 60, height: 85 },
                    floating: {
                      horizontalPosition: { offset: 0 },
                      verticalPosition: { offset: 0 },
                    },
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Institut Teknologi & Bisnis SABDA SETIA', bold: true, font: FONT, size: 28 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '(Ijin Pendirian Mendikbudristek No. 460/E/O/2021)', font: FONT, size: 20 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Jalan Purnama 2, Parit Tokaya', font: FONT, size: 20 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Pontianak Selatan, Kalimantan Barat', font: FONT, size: 20 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'website: https://itbss.ac.id/', font: FONT, size: 20 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'email: humas@itbss.ac.id', font: FONT, size: 20 })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BORDER_COLOR } },
                children: [new TextRun({ text: 'HP: 0852 818 17855', font: FONT, size: 20 })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 200 },
            children: [new TextRun({ text: 'LOG-BOOK CAPSTONE PROJECT', bold: true, underline: {}, font: FONT, size: 26 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [new TextRun({ text: 'STUDI INDEPENDEN', bold: true, underline: {}, font: FONT, size: 26 })],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              labelValueRow('NIM / Nama', `${mahasiswa.nim} / ${mahasiswa.nama}`),
              labelValueRow('Penyelenggara', detailPengajuan.penyelenggara),
              labelValueRow('Waktu Studi Independen', detailPengajuan.waktu_studi_independen),
              labelValueRow('Judul Capstone Project', detailPengajuan.judul),
            ],
          }),
          new Paragraph({ spacing: { before: 200 }, children: [] }),
          buildLogbookTable(logbookEntries),
          ...buildSignatureBlock({
            dosenNama: dosenPembimbing?.nama,
            dosenNidn: dosenPembimbing?.nidn,
            mahasiswaNama: mahasiswa.nama,
            mahasiswaNim: mahasiswa.nim,
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = { generateLogbookDocx };