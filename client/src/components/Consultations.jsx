import React, { useState, useEffect } from "react";
import api from "../services/api";

export default function Consultations({ role, dark }) {
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchConsultations();
  }, [role]);

  const fetchConsultations = async () => {
    try {
      setLoading(true);
      const endpoint = role === "writer" ? "/consultations/my" : "/consultations/professional";
      const res = await api.get(endpoint);
      setConsultations(res.data);
    } catch (err) {
      setError("Failed to load consultations.");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id, action, reason = "") => {
    try {
      if (action === "reject" && !reason) {
        reason = prompt("Reason for rejection:");
        if (!reason) return;
      }
      
      const payload = reason ? { reason } : {};
      await api.post(`/consultations/${id}/${action}`, payload);
      fetchConsultations(); // refresh
    } catch (err) {
      alert(err.response?.data?.message || `Failed to ${action} consultation.`);
    }
  };

  if (loading) return <div className="py-10 text-center">Loading consultations...</div>;
  if (error) return <div className="py-10 text-center text-red-500">{error}</div>;

  if (consultations.length === 0) {
    return (
      <div className={`p-8 text-center rounded-2xl border ${dark ? "bg-[#0d1520] border-white/10" : "bg-white border-gray-200"}`}>
        <p className={dark ? "text-gray-400" : "text-gray-500"}>No consultations found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {consultations.map((c) => (
        <div key={c._id} className={`p-5 rounded-2xl border ${dark ? "bg-[#0d1520] border-white/10" : "bg-white border-gray-200"}`}>
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className={`font-bold ${dark ? "text-white" : "text-gray-900"}`}>{c.topic}</h3>
              <p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>
                With: {role === "writer" ? c.professional?.name : c.writer?.name}
              </p>
            </div>
            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${dark ? "bg-white/5 border-white/10" : "bg-gray-100 border-gray-200"}`}>
              {c.status.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>

          <div className={`text-sm mb-4 space-y-1 ${dark ? "text-gray-300" : "text-gray-600"}`}>
            <p><strong>Scheduled:</strong> {new Date(c.scheduledStart).toLocaleString()} ({c.duration} mins)</p>
            {c.additionalMessage && <p><strong>Note:</strong> {c.additionalMessage}</p>}
            {c.googleMeetUrl && (
              <p>
                <strong>Meet Link:</strong> <a href={c.googleMeetUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">{c.googleMeetUrl}</a>
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {role === "professional" && c.status === "awaiting_response" && (
              <>
                <button onClick={() => handleAction(c._id, "accept")} className="px-4 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg">Accept</button>
                <button onClick={() => handleAction(c._id, "reject")} className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg">Reject</button>
              </>
            )}
            {role === "writer" && c.status === "awaiting_response" && (
              <button onClick={() => handleAction(c._id, "cancel")} className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg">Cancel</button>
            )}
            {(c.status === "accepted" || c.status === "meeting_scheduled") && (
              <button onClick={() => handleAction(c._id, "complete")} className="px-4 py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg">Mark Completed</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
