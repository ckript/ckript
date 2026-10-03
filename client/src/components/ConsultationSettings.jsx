import React, { useState, useEffect } from "react";
import api from "../services/api";

export default function ConsultationSettings({ dark }) {
  const [settings, setSettings] = useState({
    enabled: false,
    consultationPrice: 200000,
    duration: 30,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/availability/me")
      .then(res => {
        if (res.data) setSettings(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/availability/me", settings);
      alert("Settings saved successfully.");
    } catch (err) {
      alert("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className={`p-6 rounded-2xl border ${dark ? "bg-[#0d1520] border-white/10" : "bg-white border-gray-200"}`}>
      <h2 className={`text-xl font-bold mb-4 ${dark ? "text-white" : "text-gray-900"}`}>Consultation Availability</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="enabled"
            checked={settings.enabled}
            onChange={(e) => setSettings({...settings, enabled: e.target.checked})}
            className="w-5 h-5 rounded border-gray-300"
          />
          <label htmlFor="enabled" className={`font-semibold ${dark ? "text-white" : "text-gray-900"}`}>
            Accept Paid Consultations
          </label>
        </div>

        {settings.enabled && (
          <>
            <div>
              <label className={`block text-sm mb-1 ${dark ? "text-gray-400" : "text-gray-600"}`}>Price (in INR, assuming paise so 200000 = â‚¹2000)</label>
              <input
                type="number"
                value={settings.consultationPrice}
                onChange={(e) => setSettings({...settings, consultationPrice: Number(e.target.value)})}
                className={`w-full px-4 py-2 rounded-xl border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-gray-300"}`}
              />
            </div>
            <div>
              <label className={`block text-sm mb-1 ${dark ? "text-gray-400" : "text-gray-600"}`}>Duration (minutes)</label>
              <input
                type="number"
                value={settings.duration}
                onChange={(e) => setSettings({...settings, duration: Number(e.target.value)})}
                className={`w-full px-4 py-2 rounded-xl border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-gray-300"}`}
              />
            </div>
            <div>
              <label className={`block text-sm mb-1 ${dark ? "text-gray-400" : "text-gray-600"}`}>Timezone</label>
              <input
                type="text"
                value={settings.timezone}
                onChange={(e) => setSettings({...settings, timezone: e.target.value})}
                className={`w-full px-4 py-2 rounded-xl border ${dark ? "bg-white/5 border-white/10 text-white" : "bg-white border-gray-300"}`}
              />
            </div>
          </>
        )}

        <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl">
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
