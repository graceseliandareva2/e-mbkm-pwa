/**
 * scripts/backfillPelatihan.js
 *
 * Migrasi data satu kali (one-off): baca JSON `detail_pengajuan.pelatihan`
 * yang sudah ada, lalu isi tabel `pelatihan` baru dengan ID yang stabil
 * per item. JSON lama di `detail_pengajuan.pelatihan` DIPERBARUI supaya
 * setiap item juga menyimpan `id` yang sama persis dengan baris di tabel
 * `pelatihan` -- ini menjaga konsistensi antara sumber lama (JSON, dipakai
 * kaprodi/staff export) dan sumber baru (tabel, dipakai logbook).
 *
 * Jalankan SETELAH migration SQL 001_add_pelatihan_and_logbook_link.sql:
 *   node scripts/backfillPelatihan.js
 *
 * Aman dijalankan berkali-kali (idempotent): baris pengajuan yang sudah
 * punya data di tabel `pelatihan` akan dilewati.
 */

const { v4: uuidv4 } = require("uuid");
const db = require("../config/db");

async function run() {
  const [detailRows] = await db.query(
    `SELECT id, pengajuan_id, pelatihan FROM detail_pengajuan WHERE pelatihan IS NOT NULL`
  );

  let migrated = 0;
  let skipped = 0;

  for (const row of detailRows) {
    const [existing] = await db.query(
      `SELECT COUNT(*) as cnt FROM pelatihan WHERE pengajuan_id = ?`,
      [row.pengajuan_id]
    );
    if (existing[0].cnt > 0) {
      skipped++;
      continue; // sudah pernah dimigrasi
    }

    let parsed;
    try {
      parsed = typeof row.pelatihan === "string" ? JSON.parse(row.pelatihan) : row.pelatihan;
    } catch {
      console.warn(`[SKIP] pengajuan_id=${row.pengajuan_id}: JSON pelatihan tidak valid`);
      continue;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) continue;

    // Maks 3 sesuai ketentuan baru -- kalau data lama kebetulan lebih dari
    // 3 (harusnya tidak mungkin di sistem lama, tapi jaga-jaga), ambil 3
    // pertama saja dan catat di log supaya bisa dicek manual.
    const items = parsed.slice(0, 3);
    if (parsed.length > 3) {
      console.warn(`[PERHATIAN] pengajuan_id=${row.pengajuan_id} punya ${parsed.length} pelatihan, dipotong jadi 3.`);
    }

    const withIds = items.map((item, idx) => ({
      id: item.id || uuidv4(),
      nama: item.nama || item.nama_pelatihan || item.judul || "Pelatihan tanpa nama",
      link: item.link || null,
      durasi_jam: Number(item.durasi_jam) || 0,
      urutan: idx,
    }));

    for (const pl of withIds) {
      await db.query(
        `INSERT INTO pelatihan (id, pengajuan_id, nama, link, durasi_jam, urutan)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [pl.id, row.pengajuan_id, pl.nama, pl.link, pl.durasi_jam, pl.urutan]
      );
    }

    // Sinkronkan balik ke JSON legacy supaya id konsisten di kedua tempat.
    const newJson = JSON.stringify(
      withIds.map((pl) => ({ id: pl.id, nama: pl.nama, link: pl.link, durasi_jam: pl.durasi_jam }))
    );
    await db.query(`UPDATE detail_pengajuan SET pelatihan = ? WHERE id = ?`, [newJson, row.id]);

    migrated++;
  }

  console.log(`Selesai. ${migrated} pengajuan dimigrasi, ${skipped} dilewati (sudah ada).`);
  process.exit(0);
}

run().catch((err) => {
  console.error("Backfill gagal:", err);
  process.exit(1);
});