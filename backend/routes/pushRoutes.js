const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/authMiddleware");
const { subscribe, unsubscribe } = require("../controllers/pushController");

router.post("/subscribe", verifyToken, subscribe);
router.post("/unsubscribe", verifyToken, unsubscribe);

module.exports = router;