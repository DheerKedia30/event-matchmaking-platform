// The PaymentGateway "interface" (from the class diagram) plus a SIMULATED gateway.
// The rest of the app only calls charge() and refund(), so swapping in a real
// provider later (e.g. Stripe in test mode) means writing one new object with
// the same two functions. Nothing else changes.
const crypto = require("crypto");

const simulatedGateway = {
  name: "simulated",

  // Take money. `simulate: "fail"` pretends the card was declined (for the demo).
  async charge({ amount, simulate }) {
    if (simulate === "fail") {
      return { ok: false, reason: "Card declined (simulated)." };
    }
    if (!(amount > 0)) return { ok: false, reason: "Invalid amount." };
    return { ok: true, reference: `SIM-${crypto.randomBytes(4).toString("hex").toUpperCase()}` };
  },

  // Give money back (always works in the simulation).
  async refund({ amount }) {
    return { ok: true, reference: `SIMR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`, amount };
  },
};

// The gateway the app uses. Change this one line to switch providers.
module.exports = { gateway: simulatedGateway };
