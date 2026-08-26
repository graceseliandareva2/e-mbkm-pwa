const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");

// Toleransi pembulatan saat validasi total bobot = 100
const EPSILON = 0.01;

async function hitungTotalBobotAktif({ excludeId = null } = {}) {
  const params = [];
  let query = "SELECT COALESCE(SUM(bobot), 0) as total FROM rubrik_penilaian WHERE is_active = 1";
  if (excludeId) {
    query += " AND id_rubrik != ?";
    params.push(excludeId);
  }
  const [rows] = await db.query(query, params);
  return parseFloat(rows[0].total) || 0;
}

// GET /rubrik  -> daftar rubrik aktif saja, dipakai form penilaian (dosen) & PDF export
const getRubrikAktif = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id_rubrik, field_key, aspek, kode_cpl, deskripsi, bobot, urutan FROM rubrik_penilaian WHERE is_active = 1 ORDER BY urutan ASC, created_at ASC"
    );
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// GET /kaprodi/rubrik -> semua rubrik (termasuk nonaktif), buat halaman kelola bobot
const getSemuaRubrik = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM rubrik_penilaian ORDER BY urutan ASC, created_at ASC"
    );
    res.json({ data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// POST /kaprodi/rubrik -> tambah aspek rubrik baru
const tambahRubrik = async (req, res) => {
  try {
    const { field_key, aspek, kode_cpl, deskripsi, bobot, urutan, is_active } = req.body;

    if (!field_key || !aspek || bobot === undefined || bobot === null) {
      return res.status(400).json({ message: "field_key, aspek, dan bobot wajib diisi." });
    }

    const bobotNum = parseFloat(bobot);
    if (isNaN(bobotNum) || bobotNum < 0 || bobotNum > 100) {
      return res.status(400).json({ message: "Bobot harus berupa angka 0-100." });
    }

    const aktif = is_active === undefined ? true : !!is_active;

    if (aktif) {
      const totalSebelumnya = await hitungTotalBobotAktif();
      const totalBaru = totalSebelumnya + bobotNum;
      if (Math.abs(totalBaru - 100) > EPSILON) {
        return res.status(400).json({
          message: `Total bobot rubrik aktif harus 100%. Saat ini ${totalSebelumnya.toFixed(2)}% + ${bobotNum.toFixed(2)}% = ${totalBaru.toFixed(2)}%.`,
        });
      }
    }

    const id_rubrik = uuidv4();
    await db.query(
      `INSERT INTO rubrik_penilaian (id_rubrik, field_key, aspek, kode_cpl, deskripsi, bobot, urutan, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id_rubrik, field_key, aspek, kode_cpl || null, deskripsi || null, bobotNum, urutan ?? 0, aktif ? 1 : 0]
    );

    res.status(201).json({ message: "Rubrik berhasil ditambahkan.", id_rubrik });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ message: "field_key sudah dipakai rubrik lain." });
    }
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// PUT /kaprodi/rubrik/:id -> ubah aspek, bobot, deskripsi, urutan, atau status aktif
const updateRubrik = async (req, res) => {
  try {
    const { id } = req.params;
    const { aspek, kode_cpl, deskripsi, bobot, urutan, is_active } = req.body;

    const [existingRows] = await db.query("SELECT * FROM rubrik_penilaian WHERE id_rubrik = ?", [id]);
    if (!existingRows.length) return res.status(404).json({ message: "Rubrik tidak ditemukan." });
    const existing = existingRows[0];

    const bobotBaru = bobot === undefined || bobot === null ? parseFloat(existing.bobot) : parseFloat(bobot);
    if (isNaN(bobotBaru) || bobotBaru < 0 || bobotBaru > 100) {
      return res.status(400).json({ message: "Bobot harus berupa angka 0-100." });
    }
    const aktifBaru = is_active === undefined ? !!existing.is_active : !!is_active;

    if (aktifBaru) {
      const totalLain = await hitungTotalBobotAktif({ excludeId: id });
      const totalBaru = totalLain + bobotBaru;
      if (Math.abs(totalBaru - 100) > EPSILON) {
        return res.status(400).json({
          message: `Total bobot rubrik aktif harus 100%. Rubrik lain sudah ${totalLain.toFixed(2)}%, ditambah ${bobotBaru.toFixed(2)}% jadi ${totalBaru.toFixed(2)}%.`,
        });
      }
    }

    await db.query(
      `UPDATE rubrik_penilaian
       SET aspek = ?, kode_cpl = ?, deskripsi = ?, bobot = ?, urutan = ?, is_active = ?
       WHERE id_rubrik = ?`,
      [
        aspek ?? existing.aspek,
        kode_cpl ?? existing.kode_cpl,
        deskripsi ?? existing.deskripsi,
        bobotBaru,
        urutan ?? existing.urutan,
        aktifBaru ? 1 : 0,
        id,
      ]
    );

    res.json({ message: "Rubrik berhasil diperbarui." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

// PATCH /kaprodi/rubrik/:id/nonaktifkan -> soft delete (data histori detail_penilaian tetap aman)
const nonaktifkanRubrik = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.query("SELECT id_rubrik FROM rubrik_penilaian WHERE id_rubrik = ?", [id]);
    if (!rows.length) return res.status(404).json({ message: "Rubrik tidak ditemukan." });

    await db.query("UPDATE rubrik_penilaian SET is_active = 0 WHERE id_rubrik = ?", [id]);
    res.json({ message: "Rubrik dinonaktifkan. Bobot rubrik aktif lainnya perlu disesuaikan ulang ke total 100%." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

module.exports = {
  getRubrikAktif,
  getSemuaRubrik,
  tambahRubrik,
  updateRubrik,
  nonaktifkanRubrik,
};