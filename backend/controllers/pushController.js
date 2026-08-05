const db = require("../config/db");

const subscribe = async (req, res) => {
  console.log("=== PUSH SUBSCRIBE MASUK ===");
   console.log("Headers:", req.headers.authorization);
  console.log(req.body);
  console.log(req.user);
  try {
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      console.log("DATA TIDAK LENGKAP");
      return res.status(400).json({
        message: "Data subscription tidak lengkap.",
      });
    }

    console.log("INSERT KE DATABASE...");

    await db.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         p256dh = VALUES(p256dh),
         auth = VALUES(auth)`,
      [req.user.id, endpoint, keys.p256dh, keys.auth]
    );

    console.log("BERHASIL DISIMPAN");

    res.status(201).json({
      message: "Subscription berhasil disimpan.",
    });
  } catch (error) {
    console.error("SUBSCRIBE ERROR:", error);
    res.status(500).json({
      message: "Terjadi kesalahan server.",
    });
  }
};

const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({ message: "Endpoint wajib diisi." });
    }

    await db.query(
      "DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?",
      [endpoint, req.user.id]
    );

    res.json({ message: "Subscription berhasil dihapus." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
};

module.exports = { subscribe, unsubscribe };