"use client";

import { useState, useEffect } from "react";

const PLATFORMS = ["instagram", "tiktok", "threads", "x", "facebook", "pinterest"];

export default function SocialsPage() {
  const [socials, setSocials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingSocial, setEditingSocial] = useState(null);
  const [form, setForm] = useState({ platform: "instagram", url: "", sortOrder: 0, isActive: true });

  const fetchSocials = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/socials");
      const json = await res.json();
      setSocials(json.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchSocials(); }, []);

  const resetForm = () => {
    setForm({ platform: "instagram", url: "", sortOrder: 0, isActive: true });
    setEditingSocial(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editingSocial ? "PUT" : "POST";
    const payload = editingSocial ? { ...form, id: editingSocial._id } : form;
    try {
      const res = await fetch("/api/admin/socials", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        resetForm();
        fetchSocials();
      } else {
        alert(json.error);
      }
    } catch (e) { console.error(e); }
  };

  const handleEdit = (social) => {
    setForm({ platform: social.platform, url: social.url, sortOrder: social.sortOrder || 0, isActive: social.isActive });
    setEditingSocial(social);
    setShowForm(true);
  };

  const handleToggleActive = async (social) => {
    await fetch("/api/admin/socials", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: social._id, isActive: !social.isActive }),
    });
    fetchSocials();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Social Media</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
          Add Social Link
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-medium text-gray-900">{editingSocial ? "Edit Social Link" : "Add Social Link"}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Platform *</label>
              <select
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value })}
                disabled={!!editingSocial}
                className="mt-1 block w-full rounded-md border-0 py-2 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-gray-900 sm:text-sm disabled:bg-gray-100"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">URL * (https://)</label>
              <input type="url" required value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://instagram.com/eternalglory"
                className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-gray-900 sm:text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Sort Order</label>
              <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-gray-900 sm:text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="socialActive" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
            <label htmlFor="socialActive" className="text-sm text-gray-700">Active</label>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              {editingSocial ? "Save Changes" : "Create"}
            </button>
            <button type="button" onClick={resetForm} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Platform</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">URL</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Order</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-500">Loading...</td></tr>
            ) : socials.length === 0 ? (
              <tr><td colSpan={5} className="py-8 text-center text-gray-500">No social links. Add one above.</td></tr>
            ) : socials.map((social) => (
              <tr key={social._id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 capitalize">{social.platform}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 max-w-[300px] truncate">{social.url}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{social.sortOrder}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm">
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                    social.isActive ? "bg-green-50 text-green-700 ring-green-600/20" : "bg-gray-50 text-gray-600 ring-gray-500/10"
                  }`}>
                    {social.isActive ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-right space-x-2">
                  <button onClick={() => handleEdit(social)} className="text-gray-600 hover:text-gray-900 font-medium">Edit</button>
                  <button onClick={() => handleToggleActive(social)} className={`font-medium ${social.isActive ? "text-red-600 hover:text-red-800" : "text-green-600 hover:text-green-800"}`}>
                    {social.isActive ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
