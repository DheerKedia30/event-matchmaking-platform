// The URLs under /events. Browsing is public: no login needed to look at events.
const express = require("express");
const { asyncHandler } = require("../middleware/errorHandler");
const ctrl = require("../controllers/eventController");

const router = express.Router();

router.get("/", asyncHandler(ctrl.listEvents));     // list + search + category filter
router.get("/:id", asyncHandler(ctrl.getEvent));    // one event's details

module.exports = router;
