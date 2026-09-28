"use client";

import { useState, useEffect } from "react";

export default function VerificationLogsPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    const params = new URLSearchParams({ page, limit: 20 });
    if (statusFilter) params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/admin/verification-logs?${params}`);
      const json = await res.json();
      setEvents(json.data || []);
      setTotalPages(json.pagination?.pages || 1);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [page, statusFilter]);

  const resultColors = {
    VERIFIED: "bg-green-50 text-green-700 ring-green-600/20",
    ALREADY_VERIFIED: "bg-blue-50 text-blue-700 ring-blue-600/20",
    INVALID: "bg-red-50 text-red-700 ring-red-600/20",
    RATE_LIMITED: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Verification Logs</h1>

      <div className="mt-6 flex gap-4 items-center">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-md border-0 py-2 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-gray-900 sm:text-sm"
        >
          <option value="">All Results</option>
          <option value="VERIFIED">Verified</option>
          <option value="ALREADY_VERIFIED">Already Verified</option>
          <option value="INVALID">Invalid</option>
          <option value="RATE_LIMITED">Rate Limited</option>
        </select>
      </div>

      <div className="mt-6 overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Result</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">IP Hash</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Request ID</th>
              <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr><td colSpan={4} className="py-8 text-center text-gray-500">Loading...</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-gray-500">No verification events found.</td></tr>
            ) : events.map((ev) => (
              <tr key={ev._id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm">
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${resultColors[ev.result] || ""}`}>
                    {ev.result}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 font-mono">{ev.ipHash?.slice(0, 8)}...</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 font-mono">{ev.requestId?.slice(0, 8)}...</td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{new Date(ev.createdAt).toLocaleString()}</td>
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
