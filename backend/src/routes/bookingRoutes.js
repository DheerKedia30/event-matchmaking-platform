// Booking, payment and ticket URLs. All need a login.
const express = require("express");
const { requireAuth } = require("../middleware/authMiddleware");
const { asyncHandler } = require("../middleware/errorHandler");
const ctrl = require("../controllers/bookingController");

const router = express.Router();

router.get("/groups/:id/booking", requireAuth, asyncHandler(ctrl.getBooking));          // booking page data
router.post("/groups/:id/booking/start", requireAuth, asyncHandler(ctrl.startBooking)); // hold seats
router.post("/bookings/:id/pay", requireAuth, asyncHandler(ctrl.pay));                  // pay my share
router.get("/tickets/mine", requireAuth, asyncHandler(ctrl.myTickets));                 // My tickets page

module.exports = router;
