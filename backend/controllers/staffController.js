const db = require("../config/db");
const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

// ─────────────────────────────────────────
// GET /staff/dashboard-stats
// ─────────────────────────────────────────
const getDashboardStats = async (req, res) => {
  try {
    const [[{ total }]] = await db.query(
      "SELECT COUNT(*) as total FROM pengajuan_capstone"
    );
    res.json({ data: { total_pengajuan: total } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ─────────────────────────────────────────
// GET /staff/aktivitas-terbaru
// ─────────────────────────────────────────
const getAktivitasTerbaru = async (req, res) => {
  try {
    const [pengajuan] = await db.query(`
      SELECT 'pengajuan' as tipe, pc.id, m.nama as nama_mahasiswa, m.nim,
        pc.created_at, pc.status, pc.judul as deskripsi
      FROM pengajuan_capstone pc
      JOIN mahasiswa m ON pc.mahasiswa_id = m.id
      ORDER BY pc.created_at DESC LIMIT 5
    `);

    const [dokumen] = await db.query(`
      SELECT 'dokumen' as tipe, d.id, m.nama as nama_mahasiswa, m.nim,
        d.created_at, d.status, d.nama_file as deskripsi
      FROM dokumen d
      JOIN mahasiswa m ON d.mahasiswa_id = m.id
      ORDER BY d.created_at DESC LIMIT 5
    `);

    const aktivitas = [...pengajuan, ...dokumen]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);

    res.json({ data: aktivitas });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ─────────────────────────────────────────
// GET /staff/pengajuan
// ─────────────────────────────────────────
const getDaftarPengajuan = async (req, res) => {
  try {
    const { periode_id, status, search } = req.query;

    let where = "WHERE 1=1";
    const params = [];

    if (periode_id) { where += " AND pc.periode_id = ?"; params.push(periode_id); }
    if (status)     { where += " AND pc.status = ?";     params.push(status); }
    if (search) {
      where += " AND (m.nama LIKE ? OR m.nim LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await db.query(`
      SELECT
        pc.id, pc.judul, pc.status, pc.created_at, pc.periode_id,
        m.id as mahasiswa_id, m.nim, m.nama, m.program_studi, m.angkatan,
        p.nama_periode,
        d.nama as nama_dosen
      FROM pengajuan_capstone pc
      JOIN mahasiswa m ON pc.mahasiswa_id = m.id
      JOIN periode p ON pc.periode_id = p.id
      LEFT JOIN bimbingan b ON b.mahasiswa_id = m.id AND b.periode_id = pc.periode_id
      LEFT JOIN dosen d ON b.dosen_id = d.id
      ${where}
      ORDER BY pc.created_at DESC
    `, params);

    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ─────────────────────────────────────────
// GET /staff/pengajuan/:id
// ─────────────────────────────────────────
const getDetailPengajuan = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await db.query(`
      SELECT
        pc.id, pc.mahasiswa_id, pc.periode_id,
        pc.pelatihan, pc.judul, pc.deskripsi, pc.lokasi,
        pc.tanggal_mulai, pc.tanggal_selesai,
        pc.status, pc.catatan_dosen, pc.catatan_kaprodi,
        pc.created_at, pc.archived_at,
        m.nim, m.nama, m.program_studi, m.angkatan, m.email,
        p.nama_periode,
        d.nama as nama_dosen
      FROM pengajuan_capstone pc
      JOIN mahasiswa m ON pc.mahasiswa_id = m.id
      JOIN periode p ON pc.periode_id = p.id
      LEFT JOIN bimbingan b ON b.mahasiswa_id = m.id AND b.periode_id = pc.periode_id
      LEFT JOIN dosen d ON b.dosen_id = d.id
      WHERE pc.id = ?
    `, [id]);

    if (!rows.length) return res.status(404).json({ message: "Pengajuan tidak ditemukan." });
    const pengajuan = rows[0];

    // Parse kolom pelatihan (JSON array of object)
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
      // Bukan JSON, perlakukan sebagai plain string
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

// ─────────────────────────────────────────
// POST /staff/pengajuan/:id/arsipkan
// ─────────────────────────────────────────
const arsipkanPengajuan = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      "SELECT pc.*, m.user_id FROM pengajuan_capstone pc JOIN mahasiswa m ON pc.mahasiswa_id = m.id WHERE pc.id = ?",
      [id]
    );
    if (!rows.length) return res.status(404).json({ message: "Pengajuan tidak ditemukan." });
    const pengajuan = rows[0];
    if (pengajuan.status === 'diarsipkan')
      return res.status(400).json({ message: "Pengajuan sudah diarsipkan." });

    await db.query(
      "UPDATE pengajuan_capstone SET status = 'diarsipkan', archived_at = NOW(), archived_by = ? WHERE id = ?",
      [req.user.id, id]
    );
    await db.query(
      "INSERT INTO notifikasi (user_id, judul, pesan, tipe) VALUES (?, ?, ?, ?)",
      [pengajuan.user_id, "Data Diarsipkan",
        "Data Capstone Project kamu telah diarsipkan oleh Staff Akademik.", "sukses"]
    );
    res.json({ message: "Pengajuan berhasil diarsipkan." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// ─────────────────────────────────────────
// Helper: ambil data pengajuan + pelatihan untuk export
// ─────────────────────────────────────────
const _getExportRows = async (periode_id, mahasiswa_id) => {
  let where = "WHERE 1=1";
  const params = [];
  if (periode_id)   { where += " AND pc.periode_id = ?"; params.push(periode_id); }
  if (mahasiswa_id) { where += " AND m.id = ?";          params.push(mahasiswa_id); }

  const [rows] = await db.query(`
    SELECT
      m.id as mahasiswa_id,
      m.nim, m.nama, m.program_studi, m.angkatan,
      pc.id as pengajuan_id,
      pc.pelatihan, pc.judul,
      p.nama_periode, pc.status,
      d.nama as nama_dosen
    FROM pengajuan_capstone pc
    JOIN mahasiswa m ON pc.mahasiswa_id = m.id
    JOIN periode p ON pc.periode_id = p.id
    LEFT JOIN bimbingan b ON b.mahasiswa_id = m.id AND b.periode_id = pc.periode_id
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

// ─────────────────────────────────────────
// Helper: label status
// ─────────────────────────────────────────
const _statusLabel = (s) => ({
  disetujui_kaprodi: 'Disetujui',
  ditolak:           'Ditolak',
  diajukan:          'Diajukan',
  revisi:            'Revisi',
  diarsipkan:        'Diarsipkan',
}[s] || s || '-');

// ─────────────────────────────────────────
// GET /staff/pengajuan/export-excel
// ─────────────────────────────────────────
const exportPengajuanExcel = async (req, res) => {
  try {
    const { periode_id, mahasiswa_id } = req.query;
    const rows = await _getExportRows(periode_id, mahasiswa_id);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Data Pengajuan MBKM");

    // Lebar kolom
    sheet.getColumn(1).width = 5;   // No
    sheet.getColumn(2).width = 14;  // NIM
    sheet.getColumn(3).width = 25;  // Nama
    sheet.getColumn(4).width = 25;  // Program Studi
    sheet.getColumn(5).width = 25;  // Dosen Pembimbing
    sheet.getColumn(6).width = 35;  // Judul Pelatihan
    sheet.getColumn(7).width = 15;  // Status
    sheet.getColumn(8).width = 18;  // Periode


    // ── Header ──
    const headerRow = sheet.addRow([
      "No",
      "NIM",
      "Nama",
      "Program Studi",
      "Dosen Pembimbing",
      "Judul Pelatihan",
      "Status",
      "Periode"
    ]);

    headerRow.height = 25;

    headerRow.eachCell(cell => {
      cell.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
        size: 9
      };

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' }
      };

      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true
      };

      cell.border = {
        top: {
          style: 'medium',
          color: { argb: 'FF1D4ED8' }
        },
        bottom: {
          style: 'medium',
          color: { argb: 'FF1D4ED8' }
        },
        left: {
          style: 'thin',
          color: { argb: 'FF1D4ED8' }
        },
        right: {
          style: 'thin',
          color: { argb: 'FF1D4ED8' }
        },
      };
    });


    const cellBorder = {
      top: {
        style: 'thin',
        color: { argb: 'FFE2E8F0' }
      },
      bottom: {
        style: 'thin',
        color: { argb: 'FFE2E8F0' }
      },
      left: {
        style: 'thin',
        color: { argb: 'FFD1D5DB' }
      },
      right: {
        style: 'thin',
        color: { argb: 'FFD1D5DB' }
      },
    };


    // Estimasi jumlah baris berdasarkan panjang teks
    const charsPerRow = {
      nama: 25,
      prodi: 25,
      dosen: 25,
      judul: 40,
    };


    const estimateLines = (text, chars) =>
      Math.max(
        1,
        Math.ceil(String(text || '-').length / chars)
      );


    let excelRowIndex = 1;


    rows.forEach((r, i) => {

      const pelatihanList = r.daftar_pelatihan;
      const bgArgb = i % 2 === 0
        ? 'FFFFFFFF'
        : 'FFF8FAFF';

      const startRow = excelRowIndex + 1;


      const ROW_H_BASE = 18;


      pelatihanList.forEach((pt, ptIdx) => {


        // Hitung tinggi row berdasarkan isi teks
        const namaLines =
          estimateLines(r.nama, charsPerRow.nama);

        const prodiLines =
          estimateLines(r.program_studi, charsPerRow.prodi);

        const dosenLines =
          estimateLines(r.nama_dosen, charsPerRow.dosen);

        const judulLines =
          estimateLines(pt.nama_pelatihan, charsPerRow.judul);


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

          ptIdx === 0
            ? (r.program_studi || '-')
            : null,

          ptIdx === 0
            ? (r.nama_dosen || '-')
            : null,

          pt.nama_pelatihan || '-',

          _statusLabel(pt.status),

          ptIdx === 0
            ? r.nama_periode
            : null,

        ]);


        exRow.height = rowH;


        exRow.eachCell(
          {
            includeEmpty: true
          },
          (cell, colNum) => {


            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: {
                argb: bgArgb
              }
            };


            cell.border = cellBorder;


            cell.font = {
              size: 9,
              color: {
                argb: 'FF111827'
              }
            };


            cell.alignment = {
              vertical: 'middle',
              horizontal:
                colNum === 1
                  ? 'center'
                  : 'left',
              wrapText: true
            };


            // Warna status
            if (colNum === 7) {

              const statusColor =
                pt.status === 'disetujui_kaprodi'
                  ? 'FF16a34a'
                  :
                pt.status === 'ditolak'
                  ? 'FFdc2626'
                  :
                pt.status === 'diarsipkan'
                  ? 'FF2563eb'
                  :
                pt.status === 'revisi'
                  ? 'FFd97706'
                  :
                'FF6b7280';


              cell.font = {
                size: 9,
                bold: true,
                color: {
                  argb: statusColor
                }
              };

            }

          }
        );


        excelRowIndex++;

      });



      const endRow = excelRowIndex;



      // Merge data mahasiswa jika memiliki banyak pelatihan
      if (pelatihanList.length > 1) {

        [1, 2, 3, 4, 5, 8]
          .forEach(col => {


            sheet.mergeCells(
              startRow,
              col,
              endRow,
              col
            );


            const cell =
              sheet.getCell(startRow, col);



            cell.alignment = {
              vertical: 'middle',
              horizontal:
                col === 1
                  ? 'center'
                  : 'left',
              wrapText: true
            };


            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: {
                argb: bgArgb
              }
            };


            cell.border = cellBorder;


            cell.font = {
              size: 9,
              color: {
                argb: 'FF111827'
              }
            };


          });

      }



      // Border bawah
      const lastRow = sheet.getRow(endRow);


      lastRow.eachCell(
        {
          includeEmpty: true
        },
        cell => {

          cell.border = {
            ...cellBorder,
            bottom: {
              style: 'thin',
              color: {
                argb: 'FFCBD5E1'
              }
            },
          };

        }
      );


    });


    // Freeze header
    sheet.views = [
      {
        state: 'frozen',
        ySplit: 1
      }
    ];


    // Setting semua cell agar wrap aktif
    sheet.eachRow(row => {

      row.eachCell(cell => {

        cell.alignment = {
          ...cell.alignment,
          vertical: 'middle',
          wrapText: true
        };

      });

    });



    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );


    res.setHeader(
      'Content-Disposition',
      'attachment; filename=pengajuan_mbkm.xlsx'
    );


    await workbook.xlsx.write(res);

    res.end();


  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Terjadi kesalahan server."
    });

  }
};

// ─────────────────────────────────────────
// GET /staff/pengajuan/export-pdf
// ─────────────────────────────────────────
const exportPengajuanPDF = async (req, res) => {
  try {
    const { periode_id, mahasiswa_id } = req.query;
    const rows = await _getExportRows(periode_id, mahasiswa_id);

    const isSingle = !!mahasiswa_id && rows.length === 1;

    const doc = new PDFDocument({
      margin: 50,
      size: 'A4'
    });


    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${
        isSingle
          ? `detail_${rows[0]?.nim || 'mahasiswa'}.pdf`
          : 'rekap_pengajuan_mbkm.pdf'
      }`
    );


    doc.pipe(res);



    // ============================
    // HEADER DOKUMEN
    // ============================

    doc.fontSize(14)
      .font('Helvetica-Bold')
      .text(
        'REKAP DATA PENGAJUAN MBKM',
        {
          align: 'center'
        }
      );


    doc.fontSize(10)
      .font('Helvetica')
      .text(
        'Program Studi Sistem dan Teknologi Informasi',
        {
          align: 'center'
        }
      )
      .text(
        'Institut Teknologi & Bisnis Sabda Setia',
        {
          align: 'center'
        }
      );


    if (rows.length) {
      doc.text(
        `Periode: ${rows[0].nama_periode}`,
        {
          align: 'center'
        }
      );
    }


    doc.moveDown(1);


    // ── Garis pembatas kop ──
    doc.moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .lineWidth(1)
      .stroke('#94a3b8');

    doc.moveDown(1);



    // ============================
    // DETAIL MAHASISWA
    // ============================

    if (isSingle) {

      const r = rows[0];


      const field = (label, value) => {

        const y = doc.y;

        doc.font('Helvetica-Bold')
          .fontSize(9)
          .text(
            label,
            50,
            y,
            {
              width: 155
            }
          );


        doc.font('Helvetica')
          .fontSize(9)
          .text(
            ': ' + String(value || '-'),
            205,
            y,
            {
              width:330
            }
          );


        doc.moveDown(0.5);

      };


      doc.font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#1e3a8a')
        .text(
          'Informasi Mahasiswa'
        );


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

        doc.font('Helvetica-Bold')
          .fontSize(9)
          .text(
            'Judul Pelatihan',
            50,
            y,
            {
              width: 155
            }
          );


        doc.font('Helvetica')
          .fontSize(9)
          .text(
            ':',
            PELATIHAN_NO_X,
            y,
            {
              width: 12
            }
          );


        doc.text(
          showNumbering
            ? `1. ${pelatihanList[0]?.nama_pelatihan || '-'}`
            : (pelatihanList[0]?.nama_pelatihan || '-'),
          PELATIHAN_NO_X + 12,
          y,
          {
            width: 330 - 12
          }
        );


        doc.moveDown(0.4);
      }


      pelatihanList.slice(1).forEach((pt,index)=>{


        doc.font('Helvetica')
          .fontSize(9)
          .text(
            `${index+2}. ${pt.nama_pelatihan}`,
            PELATIHAN_NO_X + 12,
            doc.y,
            {
              width: 330 - 12
            }
          );


        doc.moveDown(0.4);

      });



    }

    else {


      // ============================
      // TABLE REKAP
      // ============================


      const COL = {

        no:50,
        nim:70,
        nama:130,
        dosen:230,
        judul:335,
        status:490

      };


      const WID = {

        no:20,
        nim:60,
        nama:95,
        dosen:100,
        judul:145,
        status:55

      };


      const FONT_SIZE = 8;
      const LINE_H = 13;
      const ROW_PAD = 6;



      const textHeight = (text,width)=>{

        const chars =
          Math.floor(
            width /
            (FONT_SIZE * 0.52)
          );


        const lines =
          Math.ceil(
            String(text || '-').length /
            chars
          );


        return Math.max(
          1,
          lines
        ) * LINE_H;

      };



      const drawHeader = ()=>{


        const y = doc.y;


        doc.rect(
          50,
          y,
          495,
          22
        )
        .fill('#2563EB');



        doc.fillColor('white')
          .font('Helvetica-Bold')
          .fontSize(FONT_SIZE);



        doc.text(
          'No',
          COL.no,
          y+6,
          {
            width:WID.no
          }
        );


        doc.text(
          'NIM',
          COL.nim,
          y+6,
          {
            width:WID.nim
          }
        );


        doc.text(
          'Nama',
          COL.nama,
          y+6,
          {
            width:WID.nama
          }
        );


        doc.text(
          'Dosen Pembimbing',
          COL.dosen,
          y+6,
          {
            width:WID.dosen
          }
        );


        doc.text(
          'Judul Pelatihan',
          COL.judul,
          y+6,
          {
            width:WID.judul
          }
        );


        doc.text(
          'Status',
          COL.status,
          y+6,
          {
            width:WID.status
          }
        );


        doc.fillColor('black');


        doc.y = y + 22;

      };



      drawHeader();



      rows.forEach((r,i)=>{


        const list = r.daftar_pelatihan;


        const heights =
          list.map(pt =>
            Math.max(
              LINE_H,
              textHeight(
                pt.nama_pelatihan,
                WID.judul
              )
            )
          );



        const totalH =
          heights.reduce(
            (a,b)=>a+b,
            0
          )
          +
          ROW_PAD*2;



        if(doc.y + totalH > 760){

          doc.addPage();

          drawHeader();

        }



        const y = doc.y;



        const bg =
          i%2===0
          ? '#ffffff'
          : '#f0f6ff';



        // background row
        doc.rect(
          50,
          y,
          495,
          totalH
        )
        .fill(bg);



        doc.fillColor('#111827')
          .font('Helvetica')
          .fontSize(FONT_SIZE);



        const centerY =
          y +
          (totalH-LINE_H)/2;



        doc.text(
          `${i+1}`,
          COL.no,
          centerY,
          {
            width:WID.no
          }
        );


        doc.text(
          r.nim,
          COL.nim,
          centerY,
          {
            width:WID.nim
          }
        );


        doc.text(
          r.nama,
          COL.nama,
          centerY,
          {
            width:WID.nama
          }
        );


        doc.text(
          r.nama_dosen || '-',
          COL.dosen,
          centerY,
          {
            width:WID.dosen
          }
        );



        let ptY = y + ROW_PAD;



        list.forEach((pt,index)=>{


          doc.text(
            pt.nama_pelatihan || '-',
            COL.judul,
            ptY,
            {
              width:WID.judul
            }
          );



          doc.font('Helvetica-Bold')
            .fillColor('#16a34a')
            .text(
              _statusLabel(pt.status),
              COL.status,
              ptY,
              {
                width:WID.status
              }
            );


          doc.fillColor('#111827')
             .font('Helvetica');



          ptY += heights[index];



          // garis antar pelatihan
          if(index < list.length-1){

            doc.moveTo(
              COL.judul,
              ptY
            )
            .lineTo(
              545,
              ptY
            )
            .lineWidth(0.4)
            .stroke('#cbd5e1');

          }


        });



        // garis antar mahasiswa
        const bottom = y + totalH;


        doc.moveTo(
          50,
          bottom
        )
        .lineTo(
          545,
          bottom
        )
        .lineWidth(1)
        .stroke('#64748b');



        doc.y = bottom + 1;



      });



      // garis akhir tabel
      doc.moveTo(
        50,
        doc.y
      )
      .lineTo(
        545,
        doc.y
      )
      .lineWidth(1.5)
      .stroke('#334155');

    }



    doc.end();



  } catch(error){

    console.error(error);

    res.status(500).json({
      message:"Terjadi kesalahan server."
    });

  }
};

// ─────────────────────────────────────────
// GET /staff/profil
// ─────────────────────────────────────────
const getProfil = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, username, email, nama, role, created_at FROM users WHERE id = ?",
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
      "UPDATE users SET nama = ?, email = ? WHERE id = ?",
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

module.exports = {
  getDashboardStats,
  getAktivitasTerbaru,
  getDaftarPengajuan,
  getDetailPengajuan,
  arsipkanPengajuan,
  exportPengajuanExcel,
  exportPengajuanPDF,
  getProfil,
  updateProfil,
  getPeriode,
};