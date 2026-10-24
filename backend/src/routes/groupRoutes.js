// The URLs under /groups. Everything here needs a login.
// Creating/joining also needs a verified phone and no active block.
const express = require("express");
const { requireAuth, requireCanGroup } = require("../middleware/authMiddleware");
const { asyncHandler } = require("../middleware/errorHandler");
const ctrl = require("../controllers/groupController");

const router = express.Router();

router.get("/mine", requireAuth, asyncHandler(ctrl.myGroups));          // must be above "/:id"
router.get("/:id", requireAuth, asyncHandler(ctrl.getGroup));
router.post("/:id/join", requireCanGroup, asyncHandler(ctrl.joinGroup));
router.post("/:id/lock-in", requireAuth, asyncHandler(ctrl.lockIn));    // one-way commitment
router.post("/:id/leave", requireAuth, asyncHandler(ctrl.leaveGroup));  // leaving is always allowed

module.exports = router;
