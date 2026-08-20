const webpush = require("../config/webPush");
const db = require("../config/db");

const sendPushToUser = async (userId, { title, body, url = "/" }) => {
  try {

    const [subs] = await db.query(
      "SELECT id_push_subscriptions AS id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?",
      [userId]
    );

    if (!subs.length) {
      console.log(`[push] User ${userId} belum punya subscription aktif, skip kirim.`);
      return;
    }

    console.log(`[push] Mengirim ke user ${userId}, ${subs.length} device.`);
    const payload = JSON.stringify({ title, body, url });

    await Promise.all(
      subs.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };

        try {
          await webpush.sendNotification(pushSubscription, payload, {
            TTL: 60 * 60 * 24, // simpan pesan max 1 hari kalau device offline
            urgency: "high",
          });
          console.log(`[push] Berhasil kirim ke subscription ${sub.id}`);
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await db.query("DELETE FROM push_subscriptions WHERE id_push_subscriptions = ?", [sub.id]);
            console.log(`[push] Subscription ${sub.id} expired, dihapus dari DB.`);
          } else {
            console.error("Gagal kirim push ke subscription", sub.id, ":", err.message);
          }
        }
      })
    );
  } catch (error) {
    console.error("sendPushToUser error:", error.message);
  }
};

module.exports = { sendPushToUser };