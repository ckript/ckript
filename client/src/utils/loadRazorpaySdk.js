const RAZORPAY_SDK_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/* Load the Razorpay checkout SDK once and reuse it. Resolves false (never throws)
   when the script is blocked or the network is down, so callers can show a
   friendly message instead of crashing the page. */
export const loadRazorpaySdk = () =>
  new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existing = document.querySelector('script[data-razorpay-sdk="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SDK_SRC;
    script.async = true;
    script.setAttribute("data-razorpay-sdk", "true");
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

export default loadRazorpaySdk;
