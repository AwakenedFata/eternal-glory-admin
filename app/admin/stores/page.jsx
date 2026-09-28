"use client";

import { useState, useEffect } from "react";

export default function StoresPage() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [form, setForm] = useState({ name: "", mark: "", storeUrl: "", sortOrder: 0, isActive: true });

  const fetchStores = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stores");
      const json = await res.json();
      setStores(json.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchStores(); }, []);

  const resetForm = () => {
    setForm({ name: "", mark: "", storeUrl: "", sortOrder: 0, isActive: true });
    setEditingStore(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editingStore ? "PUT" : "POST";
    const payload = editingStore ? { ...form, id: editingStore._id } : form;

    try {
      const res = await fetch("/api/admin/stores", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok) {
        resetForm();
        fetchStores();
      } else {
        alert(json.error);
      }
    } catch (e) { console.error(e); }
  };

  const handleEdit = (store) => {
    setForm({ name: store.name, mark: store.mark || "", storeUrl: store.storeUrl, sortOrder: store.sortOrder || 0, isActive: store.isActive });
    setEditingStore(store);
    setShowForm(true);
  };

  const handleToggleActive = async (store) => {
    await fetch("/api/admin/stores", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: store._id, isActive: !store.isActive }),
    });
    fetchStores();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Stores</h1>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Add Store
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-medium text-gray-900">{editingStore ? "Edit Store" : "Add New Store"}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name *</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-gray-900 sm:text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Mark (abbreviation)</label>
              <input type="text" maxLength={4} value={form.mark} onChange={(e) => setForm({ ...form, mark: e.target.value.toUpperCase() })}
                className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-gray-900 sm:text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Store URL *</label>
              <input type="url" required value={form.storeUrl} onChange={(e) => setForm({ ...form, storeUrl: e.target.value })}
                className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-gray-900 sm:text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Sort Order</label>
              <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-gray-900 sm:text-sm" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isActive" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="rounded" />
            <label htmlFor="isActive" className="text-sm text-gray-700">Active</label>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              {editingStore ? "Save Changes" : "Create Store"}
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
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Name</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Mark</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">URL</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Order</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
              <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">Loading...</td></tr>
            ) : stores.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-gray-500">No stores found. Add your first store above.</td></tr>
            ) : stores.map((store) => (
              <tr key={store._id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900">{store.name}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 font-mono">{store.mark}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 max-w-[200px] truncate">{store.storeUrl}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{store.sortOrder}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm">
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                    store.isActive ? "bg-green-50 text-green-700 ring-green-600/20" : "bg-gray-50 text-gray-600 ring-gray-500/10"
                  }`}>
                    {store.isActive ? "Active" : "Disabled"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-right space-x-2">
                  <button onClick={() => handleEdit(store)} className="text-gray-600 hover:text-gray-900 font-medium">Edit</button>
                  <button onClick={() => handleToggleActive(store)} className={`font-medium ${store.isActive ? "text-red-600 hover:text-red-800" : "text-green-600 hover:text-green-800"}`}>
                    {store.isActive ? "Disable" : "Enable"}
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
