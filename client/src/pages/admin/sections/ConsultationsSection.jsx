import { useState, useEffect } from "react";
import { adminApi } from "../dashboardShared";

export default function ConsultationsSection({ dark }) {
  const [consultations, setConsultations] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      if (subTab === "payouts") {
        const res = await adminApi.get("/admin/consultations/payouts");
        setPayouts(res.data);
      } else if (subTab === "refunds") {
        const res = await adminApi.get("/admin/consultations/refunds");
        setRefunds(res.data);
      } else {
        const res = await adminApi.get("/admin/consultations");
        setConsultations(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch admin consultations", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [subTab]);

  const handlePayout = async (id) => {
    const ref = prompt("Enter payout provider reference (e.g. Razorpay Payout ID):");
    if (!ref) return;
    try {
      await adminApi.post(`/admin/consultations/${id}/payout`, { providerReference: ref });
      fetchData();
    } catch (err) {
      alert("Payout failed.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {["all", "payouts", "refunds"].map(tab => (
          <button
            key={tab}
            onClick={() => setSubTab(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-bold capitalize ${subTab === tab ? "bg-blue-600 text-white" : dark ? "bg-white/10 text-gray-300" : "bg-gray-100 text-gray-600"}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-10 text-center">Loading...</div>
      ) : subTab === "payouts" ? (
        <div className="grid gap-4">
          {payouts.length === 0 && <div className={dark ? "text-gray-400" : "text-gray-500"}>No pending payouts.</div>}
          {payouts.map(p => (
            <div key={p._id} className={`p-4 rounded-xl border ${dark ? "border-white/10" : "border-gray-200"}`}>
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold">{p.professional?.name}</p>
                  <p className="text-sm">Amount: ₹{p.professionalAmount / 100}</p>
                  <p className="text-sm">Bank: {p.professional?.bankDetails?.accountNumber || "Not provided"}</p>
                </div>
                <button onClick={() => handlePayout(p._id)} className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-bold">
                  Mark Paid
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : subTab === "refunds" ? (
        <div className="grid gap-4">
          {refunds.length === 0 && <div className={dark ? "text-gray-400" : "text-gray-500"}>No refunds.</div>}
          {refunds.map(r => (
            <div key={r._id} className={`p-4 rounded-xl border ${dark ? "border-white/10" : "border-gray-200"}`}>
              <p className="font-bold">{r.topic}</p>
              <p className="text-sm">Status: {r.status}</p>
              <p className="text-sm">Refund ID: {r.razorpayRefundId || "N/A"}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4">
          {consultations.map(c => (
            <div key={c._id} className={`p-4 rounded-xl border ${dark ? "border-white/10" : "border-gray-200"}`}>
              <p className="font-bold">{c.topic}</p>
              <p className="text-sm">Writer: {c.writer?.name}</p>
              <p className="text-sm">Professional: {c.professional?.name}</p>
              <p className="text-sm">Status: {c.status}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
