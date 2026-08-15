const sanitizeFilename = (s) =>
  String(s || "")
    .replace(/[\\/]/g, "-") 
    .replace(/[:*?"<>|]/g, "") 
    .trim();

const buildExportFilename = ({ nama, nim, namaPeriode, isSingle, ext }) => {
  if (isSingle) {
    return `${sanitizeFilename(nama)} - ${sanitizeFilename(nim)}.${ext}`;
  }
  return `Daftar pengajuan - ${sanitizeFilename(namaPeriode || "periode")}.${ext}`;
};


const buildExportFilenameFromRows = (rows, mahasiswaId, ext) => {
  const isSingle = !!mahasiswaId && rows.length > 0;
  const first = rows[0] || {};
  return buildExportFilename({
    nama: first.nama,
    nim: first.nim,
    namaPeriode: first.nama_periode,
    isSingle,
    ext,
  });
};

const buildContentDispositionHeader = (filename) =>
  `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`;

module.exports = {
  sanitizeFilename,
  buildExportFilename,
  buildExportFilenameFromRows,
  buildContentDispositionHeader,
};