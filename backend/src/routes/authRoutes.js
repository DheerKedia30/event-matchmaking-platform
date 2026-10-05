// The URLs under /auth. Each line: method + path + gatekeepers + function.
const express = require("express");
const { verifyToken, requireAuth, requireVerified } = require("../middleware/authMiddleware");
const ctrl = require("../controllers/authController");

const router = express.Router();

router.post("/register", verifyToken, ctrl.register);              // token only (no profile yet)
router.get("/me", requireAuth, ctrl.me);                           // token + profile
router.post("/verify-phone", requireAuth, ctrl.verifyPhone);
router.put("/profile", requireAuth, ctrl.updateProfile);
router.get("/verified-only", requireAuth, requireVerified, ctrl.verifiedOnly);

module.exports = router;
