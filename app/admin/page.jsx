"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";

export default function AdminDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error);
  }, []);

  const cards = stats
    ? [
        { label: "Total Serials", value: stats.totalSerials },
        { label: "Available", value: stats.availableSerials },
        { label: "Allocated", value: stats.allocatedSerials },
        { label: "Verified", value: stats.verifiedSerials },
        { label: "Voided", value: stats.voidSerials },
        { label: "Active Stores", value: stats.activeStores },
        { label: "Total Verifications", value: stats.totalVerifications },
        { label: "Verifications (24h)", value: stats.recentVerifications },
      ]
    : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
      <p className="mt-2 text-gray-600">
        Welcome back, {session?.user?.name || session?.user?.email}.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats ? (
          cards.map((card) => (
            <div key={card.label} className="overflow-hidden rounded-lg bg-white shadow border border-gray-100 px-4 py-5 sm:p-6">
              <dt className="truncate text-sm font-medium text-gray-500">{card.label}</dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">{card.value.toLocaleString()}</dd>
            </div>
          ))
        ) : (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-lg bg-white shadow border border-gray-100 px-4 py-5 sm:p-6 animate-pulse">
              <div className="h-4 w-24 bg-gray-200 rounded" />
              <div className="mt-3 h-8 w-16 bg-gray-200 rounded" />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
