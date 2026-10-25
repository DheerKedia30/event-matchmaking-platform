// One small function per backend URL for booking, payment and tickets.
import { apiFetch } from "./client";

export const getBooking = (groupId) => apiFetch(`/groups/${groupId}/booking`);
// seatIds = the seats the group creator picked, one per member
export const startBooking = (groupId, seatIds) =>
  apiFetch(`/groups/${groupId}/booking/start`, { method: "POST", body: { seat_ids: seatIds } });
// simulate: "success" (default) or "fail" (pretend the card was declined)
export const payShare = (bookingId, simulate = "success") =>
  apiFetch(`/bookings/${bookingId}/pay`, { method: "POST", body: { simulate } });
export const myTickets = () => apiFetch("/tickets/mine");
