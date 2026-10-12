/**
 * A Razorpay API client, or null when the keys are not configured.
 *
 * Keys are read at CALL time, never at module load — dotenv.config() runs inside server.js's body,
 * after every import has been evaluated, so a module-level read would capture undefined forever
 * (see companyContacts.js for the full story of that trap).
 */
export const getRazorpayClient = async () => {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) return null;
  try {
    const { default: Razorpay } = await import("razorpay");
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  } catch (error) {
    console.error("[razorpay] could not initialise the client:", error?.message || error);
    return null;
  }
};

export default getRazorpayClient;
