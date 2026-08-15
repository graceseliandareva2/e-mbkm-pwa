const cron = require('node-cron');
const db = require('../config/db');
const { sendEmail } = require('../utils/mailer');
const { sendPushToUser } = require('../utils/pushSender');

const TIMEZONE = 'Asia/Jakarta';

const runAutoToggle = async () => {
  const conn = await db.getConnection();
  try {
    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');

    //AUTO OPEN PENGAJUAN 
    await conn.query(
      `UPDATE periode
       SET form_pengajuan_buka = 1,
           auto_opened_at      = NOW()
       WHERE tanggal_mulai_pengajuan = ?
         AND auto_opened_at IS NULL`,
      [todayStr]
    );

    // AUTO OPEN LOGBOOK
    await conn.query(
      `UPDATE periode
       SET form_logbook_buka      = 1,
           auto_opened_logbook_at = NOW()
       WHERE tanggal_mulai_logbook = ?
         AND auto_opened_logbook_at IS NULL`,
      [todayStr]
    );

    // AUTO OPEN PPT
    await conn.query(
      `UPDATE periode
       SET form_ppt_buka      = 1,
           auto_opened_ppt_at = NOW()
       WHERE tanggal_mulai_dokumen = ?
         AND auto_opened_ppt_at IS NULL`,
      [todayStr]
    );

    //AUTO OPEN LAPORAN AKHIR
    await conn.query(
      `UPDATE periode
       SET form_laporan_buka      = 1,
           auto_opened_laporan_at = NOW()
       WHERE tanggal_mulai_dokumen = ?
         AND auto_opened_laporan_at IS NULL`,
      [todayStr]
    );

    // AUTO CLOSE PENGAJUAN
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

    //AUTO CLOSE LOGBOOK
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

    //AUTO CLOSE PPT
    await conn.query(
      `UPDATE periode
       SET form_ppt_buka      = 0,
           auto_closed_ppt_at = NOW()
       WHERE tanggal_selesai_ppt IS NOT NULL
         AND tanggal_selesai_ppt < ?
         AND auto_closed_ppt_at IS NULL
         AND manual_open_ppt   = 0`,
      [todayStr]
    );

    //AUTO CLOSE LAPORAN AKHIR
    await conn.query(
      `UPDATE periode
       SET form_laporan_buka      = 0,
           auto_closed_laporan_at = NOW()
       WHERE tanggal_selesai_laporan IS NOT NULL
         AND tanggal_selesai_laporan < ?
         AND auto_closed_laporan_at IS NULL
         AND manual_open_laporan   = 0`,
      [todayStr]
    );

    //PERINGATAN DEADLINE LOGBOOK H-3 dan H-1 
    await runDeadlineReminderLogbook(conn, todayStr);

    // PERINGATAN DEADLINE PENGAJUAN H-3 dan H-1 
    await runDeadlineReminderPengajuan(conn, todayStr);

    //PERINGATAN DEADLINE DOKUMEN (PPT & LAPORAN) H-3 dan H-1
    await runDeadlineReminderDokumen(conn, todayStr);

    console.log(`[periodeCron] Auto-toggle selesai ${new Date().toISOString()}`);
  } catch (err) {
    console.error('[periodeCron] Error:', err);
  } finally {
    conn.release();
  }
};

const runDeadlineReminderLogbook = async (conn, todayStr) => {
  try {
    const [periodeList] = await conn.query(
      `SELECT id_periode AS id, nama_periode, tanggal_selesai_logbook, min_jam_pengajuan
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

      const targetJam = Number(periode.min_jam_pengajuan) > 0 ? Number(periode.min_jam_pengajuan) : 48;
      const targetMenit = targetJam * 60;

      const [mahasiswaList] = await conn.query(
        `SELECT u.id_users AS id, u.id_users AS user_id, u.nama, u.email,
           COALESCE(SUM(l.durasi_menit), 0) as total_menit
         FROM users u
         JOIN pengajuan p ON p.mahasiswa_id = u.id_users AND p.periode_id = ?
         LEFT JOIN logbook l ON l.pengajuan_id = p.id_pengajuan AND l.status = 'diverifikasi'
         WHERE u.role = 'mahasiswa'
         GROUP BY u.id_users, u.nama, u.email
         HAVING total_menit < ?`,
        [periode.id, targetMenit]
      );

      for (const mhs of mahasiswaList) {
        const jamTerverifikasi = Math.floor(mhs.total_menit / 60);
        const menitTerverifikasi = mhs.total_menit % 60;
        const sisaMenitTotal = targetMenit - mhs.total_menit;
        const sisaJam = Math.floor(sisaMenitTotal / 60);
        const sisaMenit = sisaMenitTotal % 60;

        if (mhs.email) {
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
                      Terverifikasi: ${jamTerverifikasi} jam ${menitTerverifikasi} menit / ${targetJam} jam<br>
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
        }

        await sendPushToUser(mhs.user_id, {
          title: `Deadline Logbook H-${selisih}`,
          body: `Deadline logbook periode ${periode.nama_periode} tinggal ${selisih} hari lagi. Kurang ${sisaJam} jam ${sisaMenit} menit.`,
          url: '/mahasiswa/logbook',
        });

        console.log(`[deadlineReminderLogbook] H-${selisih} dikirim ke ${mhs.nama}`);
      }
    }
  } catch (err) {
    console.error('[deadlineReminderLogbook] Error:', err);
  }
};

// Reminder deadline pengajuan (H-3 / H-1) — push only, hanya yang belum submit
const runDeadlineReminderPengajuan = async (conn, todayStr) => {
  try {
    const [periodeList] = await conn.query(
      `SELECT id_periode AS id, nama_periode, tanggal_selesai_pengajuan
       FROM periode
       WHERE tanggal_selesai_pengajuan IS NOT NULL
         AND form_pengajuan_buka = 1
         AND (
           DATE_SUB(tanggal_selesai_pengajuan, INTERVAL 3 DAY) = ?
           OR DATE_SUB(tanggal_selesai_pengajuan, INTERVAL 1 DAY) = ?
         )`,
      [todayStr, todayStr]
    );

    for (const periode of periodeList) {
      const selisih = Math.round(
        (new Date(periode.tanggal_selesai_pengajuan) - new Date(todayStr)) / (1000 * 60 * 60 * 24)
      );

      const [belumSubmit] = await conn.query(
        `SELECT u.id_users AS id, u.id_users AS user_id, u.nama
         FROM users u
         JOIN pengajuan p ON p.mahasiswa_id = u.id_users AND p.periode_id = ?
         WHERE u.role = 'mahasiswa' AND p.status = 'draft'`,
        [periode.id]
      );

      for (const mhs of belumSubmit) {
        await sendPushToUser(mhs.user_id, {
          title: `Deadline Pengajuan H-${selisih}`,
          body: `Deadline pengajuan capstone periode ${periode.nama_periode} tinggal ${selisih} hari lagi. Kamu belum mengajukan, segera ajukan!`,
          url: '/mahasiswa/pengajuan',
        });
      }

      console.log(`[deadlineReminderPengajuan] H-${selisih} dikirim ke ${belumSubmit.length} mahasiswa (periode ${periode.nama_periode})`);
    }
  } catch (err) {
    console.error('[deadlineReminderPengajuan] Error:', err);
  }
};

// Reminder deadline dokumen PPT & Laporan Akhir (H-3 / H-1) — push only, hanya yang belum upload
const runDeadlineReminderDokumen = async (conn, todayStr) => {
  const jenisConfig = [
    { jenis: 'ppt', kolomDeadline: 'tanggal_selesai_ppt', kolomForm: 'form_ppt_buka', label: 'PPT' },
    { jenis: 'laporan_akhir', kolomDeadline: 'tanggal_selesai_laporan', kolomForm: 'form_laporan_buka', label: 'Laporan Akhir' },
  ];

  for (const cfg of jenisConfig) {
    try {
      const [periodeList] = await conn.query(
        `SELECT id_periode AS id, nama_periode, ${cfg.kolomDeadline} as deadline
         FROM periode
         WHERE ${cfg.kolomDeadline} IS NOT NULL
           AND ${cfg.kolomForm} = 1
           AND (
             DATE_SUB(${cfg.kolomDeadline}, INTERVAL 3 DAY) = ?
             OR DATE_SUB(${cfg.kolomDeadline}, INTERVAL 1 DAY) = ?
           )`,
        [todayStr, todayStr]
      );

      for (const periode of periodeList) {
        const selisih = Math.round(
          (new Date(periode.deadline) - new Date(todayStr)) / (1000 * 60 * 60 * 24)
        );

        const [belumLengkap] = await conn.query(
          `SELECT u.id_users AS id, u.id_users AS user_id, u.nama
           FROM users u
           JOIN pengajuan p ON p.mahasiswa_id = u.id_users
             AND p.periode_id = ? AND p.status = 'disetujui_kaprodi'
           WHERE u.role = 'mahasiswa'
             AND NOT EXISTS (
               SELECT 1 FROM dokumen d
               WHERE d.pengajuan_id = p.id_pengajuan
                 AND d.jenis = ?
             )`,
          [periode.id, cfg.jenis]
        );

        for (const mhs of belumLengkap) {
          await sendPushToUser(mhs.user_id, {
            title: `Deadline ${cfg.label} H-${selisih}`,
            body: `Deadline upload ${cfg.label} periode ${periode.nama_periode} tinggal ${selisih} hari lagi. Kamu belum upload, segera lengkapi!`,
            url: '/mahasiswa/dokumen',
          });
        }

        console.log(`[deadlineReminderDokumen:${cfg.jenis}] H-${selisih} dikirim ke ${belumLengkap.length} mahasiswa (periode ${periode.nama_periode})`);
      }
    } catch (err) {
      console.error(`[deadlineReminderDokumen:${cfg.jenis}] Error:`, err);
    }
  }
};

// Reminder harian logbook — push only, mahasiswa yang belum isi logbook hari ini.
// Dipanggil 2x sehari (17:00 & 21:00) 
const runLogbookHarianReminder = async () => {
  const conn = await db.getConnection();
  try {
    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');

    const [mahasiswaBelumIsi] = await conn.query(
      `SELECT u.id_users AS id, u.id_users AS user_id, u.nama
       FROM users u
       JOIN pengajuan p ON p.mahasiswa_id = u.id_users AND p.status = 'disetujui_kaprodi'
       JOIN periode per ON per.id_periode = p.periode_id
       WHERE u.role = 'mahasiswa'
         AND per.form_logbook_buka = 1
         AND NOT EXISTS (
           SELECT 1 FROM logbook l
           WHERE l.pengajuan_id = p.id_pengajuan
             AND l.tanggal = ?
         )`,
      [todayStr]
    );

    for (const mhs of mahasiswaBelumIsi) {
      await sendPushToUser(mhs.user_id, {
        title: 'Pengingat Logbook',
        body: `Kamu belum mengisi logbook hari ini, ${mhs.nama}. Yuk isi sebelum lupa!`,
        url: '/mahasiswa/logbook',
      });
    }

    console.log(`[logbookHarianReminder] Reminder terkirim ke ${mahasiswaBelumIsi.length} mahasiswa (${todayStr})`);
  } catch (err) {
    console.error('[logbookHarianReminder] Error:', err);
  } finally {
    conn.release();
  }
};

const startPeriodeCron = () => {
  // 00:01 WIB -- auto buka/tutup form periode + reminder deadline H-3/H-1
  cron.schedule('1 0 * * *', runAutoToggle, { timezone: TIMEZONE });

  // 17:00 WIB & 21:00 WIB -- reminder harian "belum isi logbook hari ini"
cron.schedule('0 17 * * *', runLogbookHarianReminder, { timezone: TIMEZONE });
cron.schedule('0 22 * * *', runLogbookHarianReminder, { timezone: TIMEZONE });

console.log('[periodeCron] Scheduler aktif (00:01 WIB auto-toggle & deadline, 17:00 & 22:00 WIB reminder harian logbook)');
};

module.exports = { startPeriodeCron, runAutoToggle, runLogbookHarianReminder };