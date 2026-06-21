const cron = require('node-cron');
const db = require('../config/db');
const { sendEmail } = require('../utils/mailer');

const runAutoToggle = async () => {
  const conn = await db.getConnection();
  try {
    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');

    // ── AUTO OPEN ──────────────────────────────────────────
    await conn.query(
      `UPDATE periode
       SET form_pengajuan_buka = 1,
           form_logbook_buka   = 1,
           form_dokumen_buka   = 1,
           auto_opened_at      = NOW()
       WHERE tanggal_mulai_pengajuan = ?
         AND auto_opened_at IS NULL`,
      [todayStr]
    );

    // ── AUTO CLOSE PENGAJUAN ───────────────────────────────
    await conn.query(
      `UPDATE periode
       SET form_pengajuan_buka      = 0,
           auto_closed_pengajuan_at = NOW()
       WHERE tanggal_selesai_pengajuan IS NOT NULL
         AND tanggal_selesai_pengajuan < ?
         AND auto_closed_pengajuan_at IS NULL
         AND manual_open_pengajuan   = 0`,
      [todayStr]
    );

    // ── AUTO CLOSE LOGBOOK ─────────────────────────────────
    await conn.query(
      `UPDATE periode
       SET form_logbook_buka      = 0,
           auto_closed_logbook_at = NOW()
       WHERE tanggal_selesai_logbook IS NOT NULL
         AND tanggal_selesai_logbook < ?
         AND auto_closed_logbook_at IS NULL
         AND manual_open_logbook   = 0`,
      [todayStr]
    );

    // ── AUTO CLOSE DOKUMEN ─────────────────────────────────
    await conn.query(
      `UPDATE periode
       SET form_dokumen_buka      = 0,
           auto_closed_dokumen_at = NOW()
       WHERE tanggal_selesai_laporan IS NOT NULL
         AND tanggal_selesai_laporan < ?
         AND auto_closed_dokumen_at IS NULL
         AND manual_open_dokumen   = 0`,
      [todayStr]
    );

    // ── PERINGATAN DEADLINE LOGBOOK H-3 dan H-1 ───────────
    await runDeadlineReminder(conn, todayStr);

    console.log(`[periodeCron] Auto-toggle selesai ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[periodeCron] Error:', err);
  } finally {
    conn.release();
  }
};

const runDeadlineReminder = async (conn, todayStr) => {
  try {
    const [periodeList] = await conn.query(
      `SELECT id, nama_periode, tanggal_selesai_logbook
       FROM periode
       WHERE tanggal_selesai_logbook IS NOT NULL
         AND form_logbook_buka = 1
         AND (
           DATE_SUB(tanggal_selesai_logbook, INTERVAL 3 DAY) = ?
           OR DATE_SUB(tanggal_selesai_logbook, INTERVAL 1 DAY) = ?
         )`,
      [todayStr, todayStr]
    );

    for (const periode of periodeList) {
      const selisih = Math.round(
        (new Date(periode.tanggal_selesai_logbook) - new Date(todayStr)) / (1000 * 60 * 60 * 24)
      );

      const [mahasiswaList] = await conn.query(
        `SELECT m.id, m.nama, m.email,
           COALESCE(SUM(l.jam), 0) as total_menit
         FROM mahasiswa m
         LEFT JOIN logbook l ON l.mahasiswa_id = m.id
           AND l.periode_id = ? AND l.status = 'diverifikasi'
         WHERE m.periode_id = ?
         GROUP BY m.id, m.nama, m.email
         HAVING total_menit < 2880`,
        [periode.id, periode.id]
      );

      for (const mhs of mahasiswaList) {
        if (!mhs.email) continue;

        const jamTerverifikasi = Math.floor(mhs.total_menit / 60);
        const menitTerverifikasi = mhs.total_menit % 60;
        const sisaJam = Math.floor((2880 - mhs.total_menit) / 60);
        const sisaMenit = (2880 - mhs.total_menit) % 60;

        await sendEmail({
          to: mhs.email,
          subject: `⏰ Peringatan Deadline Logbook H-${selisih} — ${periode.nama_periode}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #1e4db7; padding: 24px; border-radius: 12px 12px 0 0;">
                <h2 style="color: white; margin: 0;">e-MBKM ITBSS</h2>
              </div>
              <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb;">
                <p>Halo <strong>${mhs.nama}</strong>,</p>
                <p>Deadline pengisian logbook periode <strong>${periode.nama_periode}</strong> tinggal <span style="color: #dc2626; font-weight: bold;">${selisih} hari lagi</span> (${new Date(periode.tanggal_selesai_logbook).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}).</p>
                <div style="background: #eff6ff; border-left: 4px solid #1e4db7; padding: 12px 16px; border-radius: 4px; margin: 16px 0;">
                  <p style="margin: 0; color: #1e3a8a;"><strong>Progress Logbook Kamu:</strong></p>
                  <p style="margin: 8px 0 0; color: #1e40af;">
                    Terverifikasi: ${jamTerverifikasi} jam ${menitTerverifikasi} menit / 48 jam<br>
                    Kurang: ${sisaJam} jam ${sisaMenit} menit lagi
                  </p>
                </div>
                <p>Segera lengkapi logbook kamu sebelum deadline.</p>
                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="color: #6b7280; font-size: 12px; margin: 0;">Email ini dikirim otomatis oleh sistem e-MBKM ITBSS.</p>
              </div>
            </div>
          `
        });

        console.log(`[deadlineReminder] Email H-${selisih} terkirim ke ${mhs.email}`);
      }
    }
  } catch (err) {
    console.error('[deadlineReminder] Error:', err);
  }
};

const startPeriodeCron = () => {
  cron.schedule('1 0 * * *', runAutoToggle);
  console.log('[periodeCron] Scheduler aktif (setiap hari jam 00:01)');
};

module.exports = { startPeriodeCron, runAutoToggle };