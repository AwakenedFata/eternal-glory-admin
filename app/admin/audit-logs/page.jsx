"use client";

import { useState, useEffect } from "react";

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/audit-logs?page=${page}&limit=30`);
      const json = await res.json();
      setLogs(json.data || []);
      setTotalPages(json.pagination?.pages || 1);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [page]);

  const actionColors = {
    LOGIN: "bg-blue-50 text-blue-700",
    GENERATE_SINGLE_SERIAL: "bg-green-50 text-green-700",
    GENERATE_BATCH_SERIAL: "bg-green-50 text-green-700",
    CSV_IMPORT_SERIALS: "bg-purple-50 text-purple-700",
    VOID_SERIAL: "bg-red-50 text-red-700",
    CREATE_STORE: "bg-indigo-50 text-indigo-700",
    UPDATE_STORE: "bg-yellow-50 text-yellow-700",
    DISABLE_STORE: "bg-red-50 text-red-700",
    CREATE_SOCIAL: "bg-indigo-50 text-indigo-700",
    UPDATE_SOCIAL: "bg-yellow-50 text-yellow-700",
    CREATE_WEBHOOK_INTEGRATION: "bg-indigo-50 text-indigo-700",
    ROTATE_WEBHOOK_SECRET: "bg-orange-50 text-orange-700",
    DISABLE_WEBHOOK: "bg-red-50 text-red-700",
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Audit Logs</h1>
      <p className="mt-2 text-sm text-gray-600">All administrative actions are recorded here.</p>

      <div className="mt-6 overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Action</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Admin</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Target</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr><td colSpan={4} className="py-8 text-center text-gray-500">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-gray-500">No audit logs yet.</td></tr>
            ) : logs.map((log) => (
              <tr key={log._id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm">
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${actionColors[log.action] || "bg-gray-50 text-gray-700"}`}>
                    {log.action}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{log.adminEmail}</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  {log.targetType}{log.targetId ? ` #${log.targetId.slice(-6)}` : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50">
            Previous
          </button>
          <span className="text-sm text-gray-700">Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
