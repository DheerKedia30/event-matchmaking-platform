// The URLs under /events. Browsing is public: no login needed to look at events.
const express = require("express");
const { asyncHandler } = require("../middleware/errorHandler");
const { requireAuth, requireCanGroup } = require("../middleware/authMiddleware");
const ctrl = require("../controllers/eventController");
const groups = require("../controllers/groupController");

const router = express.Router();

router.get("/", asyncHandler(ctrl.listEvents));     // list + search + category filter
router.get("/:id", asyncHandler(ctrl.getEvent));    // one event's details

// Groups for one event (CP3)
router.get("/:id/groups", requireAuth, asyncHandler(groups.listForEvent));
router.post("/:id/groups", requireCanGroup, asyncHandler(groups.createGroup));

module.exports = router;
