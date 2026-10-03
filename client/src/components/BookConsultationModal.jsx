import React, { useState, useEffect } from "react";
import api from "../services/api";

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function BookConsultationModal({
  isOpen,
  onClose,
  professionalId,
  professionalName,
  dark,
  onSuccess
}) {
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    if (isOpen && professionalId) {
      setLoading(true);
      setError("");
      api.get(`/availability/${professionalId}`)
        .then((res) => {
          setAvailability(res.data);
          setLoading(false);
        })
        .catch((err) => {
          setError("This professional is currently not accepting consultations.");
          setLoading(false);
        });
    }
  }, [isOpen, professionalId]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!topic || !date || !time) return setError("Please fill all required fields.");
    
    setBooking(true);
    setError("");
    
    try {
      const res = await loadRazorpayScript();
      if (!res) {
        throw new Error("Razorpay SDK failed to load. Are you online?");
      }

      const orderRes = await api.post("/consultations", {
        professionalId,
        date,
        time,
        topic,
        additionalMessage: message,
        duration: availability?.duration || 30
      });

      const { orderId, amount, currency, key, consultationId } = orderRes.data;

      const options = {
        key,
        amount,
        currency,
        name: "Ckript Consultations",
        description: `Consultation with ${professionalName}`,
        order_id: orderId,
        handler: async function (response) {
          try {
            await api.post(`/consultations/${consultationId}/payment/verify`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            onSuccess?.();
            onClose();
          } catch (err) {
            setError("Payment verification failed. If money was deducted, it will be refunded.");
          }
        },
        theme: {
          color: dark ? "#1a3050" : "#2563eb",
        },
      };

      const paymentObject = new window.Razorpay(options);
      paymentObject.open();
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to initiate booking.");
    } finally {
      setBooking(false);
    }
  };

  const priceFormatted = availability?.consultationPrice
    ? new Intl.NumberFormat("en-IN", { style: "currency", currency: availability.currency || "INR" })
        .format(availability.consultationPrice / 100) // Assuming price is in paise
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`w-full max-w-lg rounded-2xl p-6 shadow-xl ${dark ? "bg-[#0d1520] border border-white/10" : "bg-white border border-gray-200"}`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-xl font-bold ${dark ? "text-white" : "text-gray-900"}`}>
            Book Consultation with {professionalName}
          </h2>
          <button onClick={onClose} className={`p-2 rounded-full ${dark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
            âœ•
          </button>
        </div>

        {loading ? (
          <div className="py-10 text-center">Loading availability...</div>
        ) : error ? (
          <div className="py-10 text-center text-red-500">{error}</div>
        ) : !availability?.enabled ? (
          <div className="py-10 text-center text-gray-500">This professional is currently not accepting consultations.</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className={`p-4 rounded-xl ${dark ? "bg-white/5" : "bg-blue-50 text-blue-900"}`}>
              <p className="text-sm font-semibold mb-1">Session Details:</p>
              <ul className="text-sm space-y-1">
                <li>â€¢ Duration: {availability.duration} minutes</li>
                <li>â€¢ Price: {priceFormatted}</li>
                <li>â€¢ Timezone: {availability.timezone}</li>
              </ul>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${dark ? "text-gray-300" : "text-gray-700"}`}>Topic / Script Name *</label>
              <input
                type="text"
                required
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className={`w-full px-4 py-2 rounded-xl border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-gray-300"}`}
                placeholder="What do you want to discuss?"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${dark ? "text-gray-300" : "text-gray-700"}`}>Date *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={`w-full px-4 py-2 rounded-xl border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-gray-300"}`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${dark ? "text-gray-300" : "text-gray-700"}`}>Time *</label>
                <input
                  type="time"
                  required
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={`w-full px-4 py-2 rounded-xl border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-gray-300"}`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-1 ${dark ? "text-gray-300" : "text-gray-700"}`}>Additional Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={`w-full px-4 py-2 rounded-xl border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-gray-300"}`}
                rows={3}
                placeholder="Any specific questions?"
              />
            </div>

            <button
              type="submit"
              disabled={booking}
              className="w-full py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {booking ? "Processing..." : `Pay ${priceFormatted} & Book`}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
