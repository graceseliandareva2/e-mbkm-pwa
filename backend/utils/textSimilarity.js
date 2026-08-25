const normalisasiTeks = (teks) => {
  if (!teks) return "";
  return teks
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const ambilBigram = (teks) => {
  const bersih = normalisasiTeks(teks);
  const bigram = [];
  for (let i = 0; i < bersih.length - 1; i++) {
    bigram.push(bersih.substring(i, i + 2));
  }
  return bigram;
};

const hitungKemiripanDice = (teksA, teksB) => {
  const bigramA = ambilBigram(teksA);
  const bigramB = ambilBigram(teksB);
  if (!bigramA.length || !bigramB.length) return 0;

  const hitungB = new Map();
  for (const bg of bigramB) {
    hitungB.set(bg, (hitungB.get(bg) || 0) + 1);
  }

  let irisan = 0;
  for (const bg of bigramA) {
    const sisa = hitungB.get(bg) || 0;
    if (sisa > 0) {
      irisan++;
      hitungB.set(bg, sisa - 1);
    }
  }

  return (2 * irisan) / (bigramA.length + bigramB.length);
};

const AMBANG_MIRIP = 0.6;
const AMBANG_SANGAT_MIRIP = 0.8;

// daftarPengajuan: array of { id, judul, nama_mahasiswa, nim }
const cariJudulMirip = (idSaatIni, judulSaatIni, daftarPengajuan, ambang = AMBANG_MIRIP) => {
  if (!judulSaatIni) return [];

  const hasil = [];
  for (const item of daftarPengajuan) {
    if (item.id === idSaatIni) continue;
    if (!item.judul) continue;

    const skor = hitungKemiripanDice(judulSaatIni, item.judul);
    if (skor >= ambang) {
      hasil.push({
        id: item.id,
        nama_mahasiswa: item.nama_mahasiswa,
        nim: item.nim,
        judul: item.judul,
        skor: Math.round(skor * 100),
        level: skor >= AMBANG_SANGAT_MIRIP ? "sangat_mirip" : "mirip",
      });
    }
  }

  return hasil.sort((a, b) => b.skor - a.skor);
};

module.exports = {
  normalisasiTeks,
  hitungKemiripanDice,
  cariJudulMirip,
  AMBANG_MIRIP,
  AMBANG_SANGAT_MIRIP,
};