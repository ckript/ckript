import { useState, useEffect } from "react";
import { adminApi } from "../dashboardShared";

export default function ConsultationsSection({ dark }) {
  const [consultations, setConsultations] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [subTab, setSubTab] = useState("all");
  const [filter, setFilter] = useState("All"); 

  const [selectedConsultation, setSelectedConsultation] = useState(null);

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

  const getFilteredConsultations = () => {
    if (filter === "All") return consultations;
    if (filter === "Rescheduled") return consultations.filter(c => c.isRescheduled);
    return consultations.filter(c => c.status.toLowerCase() === filter.toLowerCase().replace(" ", "_"));
  };

  const filteredConsultations = getFilteredConsultations();

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
                  <p className="text-sm">Amount: ?{p.professionalAmount / 100}</p>
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
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2">
            {["All", "Awaiting Response", "Accepted", "Completed", "Rejected", "Rescheduled"].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-colors ${
                  filter === f 
                    ? dark ? "bg-white text-black" : "bg-gray-800 text-white" 
                    : dark ? "bg-white/5 text-gray-400 hover:bg-white/10" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredConsultations.length === 0 && <div className={`col-span-full py-8 text-center ${dark ? "text-gray-400" : "text-gray-500"}`}>No consultations found.</div>}
            
            {filteredConsultations.map(c => (
              <div 
                key={c._id} 
                onClick={() => setSelectedConsultation(c)}
                className={`p-4 rounded-2xl border cursor-pointer flex flex-col gap-3 transition-all transform hover:-translate-y-1 ${dark ? "bg-white/[0.02] border-white/5 hover:border-white/20 hover:shadow-xl hover:shadow-white/5" : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-lg shadow-sm"}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <h4 className={`font-bold truncate ${dark ? "text-white" : "text-gray-900"}`}>{c.topic}</h4>
                  <span className={`shrink-0 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                    c.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                    c.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    c.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                    c.status === 'rescheduled' ? 'bg-amber-100 text-amber-700' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {c.status.replace('_', ' ')}
                  </span>
                </div>
                
                <div className={`text-[12px] flex flex-col gap-1.5 ${dark ? "text-white/60" : "text-gray-500"}`}>
                  <p className="flex justify-between"><span>Writer:</span> <strong className={dark ? "text-white" : "text-gray-700"}>{c.writer?.name}</strong></p>
                  <p className="flex justify-between"><span>FIP:</span> <strong className={dark ? "text-white" : "text-gray-700"}>{c.professional?.name}</strong></p>
                  <p className="flex justify-between"><span>Date:</span> <strong className={dark ? "text-white" : "text-gray-700"}>{new Date(c.scheduledStart).toLocaleDateString()}</strong></p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedConsultation && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto"
          onClick={() => setSelectedConsultation(null)}
        >
          <div 
            onClick={e => e.stopPropagation()}
            className={`relative max-w-2xl w-full p-6 rounded-2xl shadow-2xl border ${dark ? "bg-[#0f172a] border-white/10" : "bg-white border-gray-200"}`}
          >
            <button 
              onClick={() => setSelectedConsultation(null)}
              className={`absolute top-4 right-4 p-2 rounded-full transition-colors ${dark ? "bg-white/5 hover:bg-white/10 text-white/70" : "bg-gray-100 hover:bg-gray-200 text-gray-500"}`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className="flex flex-col gap-6 mt-2">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 gap-4" style={{ borderColor: dark ? "rgba(255,255,255,0.05)" : "#f1f5f9" }}>
                <div>
                  <div className="flex flex-wrap items-center gap-3 mb-1">
                    <h3 className={`text-xl font-bold ${dark ? "text-white" : "text-gray-900"}`}>{selectedConsultation.topic}</h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                      selectedConsultation.status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                      selectedConsultation.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      selectedConsultation.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                      selectedConsultation.status === 'rescheduled' ? 'bg-amber-100 text-amber-700' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {selectedConsultation.status.replace('_', ' ')}
                    </span>
                    {selectedConsultation.isRescheduled && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-50 text-amber-600 border border-amber-200">
                        Rescheduled
                      </span>
                    )}
                  </div>
                  <p className={`text-[13px] ${dark ? "text-white/60" : "text-gray-500"}`}>
                    Scheduled for: <span className={`font-semibold ${dark ? "text-gray-300" : "text-gray-800"}`}>{new Date(selectedConsultation.scheduledStart).toLocaleString()}</span>
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <div className="text-xl font-extrabold text-blue-600 dark:text-blue-400">
                    {selectedConsultation.amount / 100} {selectedConsultation.currency}
                  </div>
                  <div className={`text-[11px] font-semibold uppercase ${dark ? "text-white/40" : "text-gray-400"}`}>
                    Total Amount
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={`p-4 rounded-xl ${dark ? "bg-white/[0.02] border border-white/5" : "bg-gray-50 border border-gray-100"}`}>
                  <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${dark ? "text-white/40" : "text-gray-500"}`}>Booked By (Writer)</p>
                  <p className={`font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{selectedConsultation.writer?.name || "Unknown Writer"}</p>
                  {selectedConsultation.writer?.email && <a href={`mailto:${selectedConsultation.writer.email}`} className="text-sm text-blue-500 hover:underline mt-1 block">{selectedConsultation.writer.email}</a>}
                </div>

                <div className={`p-4 rounded-xl ${dark ? "bg-white/[0.02] border border-white/5" : "bg-gray-50 border border-gray-100"}`}>
                  <p className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${dark ? "text-white/40" : "text-gray-500"}`}>Booked To (Professional)</p>
                  <p className={`font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{selectedConsultation.professional?.name || "Unknown Professional"}</p>
                  {selectedConsultation.professional?.email && <a href={`mailto:${selectedConsultation.professional.email}`} className="text-sm text-blue-500 hover:underline mt-1 block">{selectedConsultation.professional.email}</a>}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {selectedConsultation.additionalMessage && (
                  <div>
                    <p className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${dark ? "text-white/40" : "text-gray-500"}`}>Description / Note</p>
                    <p className={`text-sm italic p-4 rounded-xl border ${dark ? "bg-white/[0.02] border-white/5 text-white/80" : "bg-white border-gray-200 text-gray-700"}`}>
                      "{selectedConsultation.additionalMessage}"
                    </p>
                  </div>
                )}

                {(selectedConsultation.fileLink || selectedConsultation.googleMeetUrl) && (
                  <div className="flex flex-wrap gap-4 mt-2">
                    {selectedConsultation.fileLink && (
                      <a href={selectedConsultation.fileLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[13px] font-semibold text-sky-600 hover:text-sky-700 bg-sky-50 hover:bg-sky-100 px-4 py-2.5 rounded-xl transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        View Attached File
                      </a>
                    )}
                    {selectedConsultation.googleMeetUrl && (
                      <a href={selectedConsultation.googleMeetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[13px] font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-4 py-2.5 rounded-xl transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        Join Google Meet
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Advanced Technical Details Section */}
              <div className={`mt-4 p-5 rounded-xl border ${dark ? "bg-white/[0.01] border-white/5" : "bg-gray-50 border-gray-200"}`}>
                <h4 className={`text-sm font-bold mb-4 ${dark ? "text-white" : "text-gray-900"}`}>System & Technical Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-[12px]">
                  
                  {/* General */}
                  <div className="flex flex-col gap-1">
                    <span className={`uppercase tracking-wider font-bold text-[9px] ${dark ? "text-white/40" : "text-gray-500"}`}>Booking ID</span>
                    <span className={`font-mono ${dark ? "text-white/80" : "text-gray-800"}`}>{selectedConsultation.bookingId || "N/A"}</span>
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <span className={`uppercase tracking-wider font-bold text-[9px] ${dark ? "text-white/40" : "text-gray-500"}`}>Meeting Duration</span>
                    <span className={dark ? "text-white/80" : "text-gray-800"}>{selectedConsultation.duration} Minutes</span>
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <span className={`uppercase tracking-wider font-bold text-[9px] ${dark ? "text-white/40" : "text-gray-500"}`}>Timezone</span>
                    <span className={dark ? "text-white/80" : "text-gray-800"}>{selectedConsultation.timezone || "N/A"}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className={`uppercase tracking-wider font-bold text-[9px] ${dark ? "text-white/40" : "text-gray-500"}`}>Platform Fee Split</span>
                    <span className={dark ? "text-white/80" : "text-gray-800"}>Fee: {selectedConsultation.platformFee / 100} {selectedConsultation.currency} | FIP Earnings: {selectedConsultation.professionalAmount / 100} {selectedConsultation.currency}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className={`uppercase tracking-wider font-bold text-[9px] ${dark ? "text-white/40" : "text-gray-500"}`}>Creation Date</span>
                    <span className={dark ? "text-white/80" : "text-gray-800"}>{new Date(selectedConsultation.createdAt).toLocaleString()}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className={`uppercase tracking-wider font-bold text-[9px] ${dark ? "text-white/40" : "text-gray-500"}`}>Paid At</span>
                    <span className={dark ? "text-white/80" : "text-gray-800"}>{selectedConsultation.paidAt ? new Date(selectedConsultation.paidAt).toLocaleString() : "Not Paid"}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className={`uppercase tracking-wider font-bold text-[9px] ${dark ? "text-white/40" : "text-gray-500"}`}>Payment Order ID (Razorpay)</span>
                    <span className={`font-mono ${dark ? "text-white/80" : "text-gray-800"}`}>{selectedConsultation.razorpayOrderId || "N/A"}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className={`uppercase tracking-wider font-bold text-[9px] ${dark ? "text-white/40" : "text-gray-500"}`}>Payment ID (Razorpay)</span>
                    <span className={`font-mono ${dark ? "text-white/80" : "text-gray-800"}`}>{selectedConsultation.razorpayPaymentId || "N/A"}</span>
                  </div>
                  
                  {selectedConsultation.googleMeetUrl && (
                    <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
                      <span className={`uppercase tracking-wider font-bold text-[9px] ${dark ? "text-white/40" : "text-gray-500"}`}>Raw Meet Link</span>
                      <a href={selectedConsultation.googleMeetUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline break-all">{selectedConsultation.googleMeetUrl}</a>
                    </div>
                  )}

                  {selectedConsultation.fileLink && (
                    <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
                      <span className={`uppercase tracking-wider font-bold text-[9px] ${dark ? "text-white/40" : "text-gray-500"}`}>Raw Attachment Link</span>
                      <a href={selectedConsultation.fileLink} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline break-all">{selectedConsultation.fileLink}</a>
                    </div>
                  )}

                  {selectedConsultation.rejectionReason && (
                    <div className="col-span-1 sm:col-span-2 flex flex-col gap-1">
                      <span className={`uppercase tracking-wider font-bold text-[9px] text-red-500`}>Rejection Reason</span>
                      <span className="text-red-600 font-semibold">{selectedConsultation.rejectionReason}</span>
                    </div>
                  )}
                  
                  {selectedConsultation.payoutProviderReference && (
                    <div className="col-span-1 sm:col-span-2 flex flex-col gap-1 mt-2 p-3 rounded bg-emerald-50 border border-emerald-100 dark:bg-emerald-900/10 dark:border-emerald-500/20">
                      <span className={`uppercase tracking-wider font-bold text-[9px] text-emerald-600`}>Payout Provider Ref</span>
                      <span className="font-mono text-emerald-700">{selectedConsultation.payoutProviderReference}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}