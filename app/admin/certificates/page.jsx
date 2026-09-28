"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

export default function CertificatesPage() {
  const { data: session } = useSession();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchCertificates = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/certificates?status=${statusFilter}`);
      const json = await res.json();
      if (json.data) {
        setCertificates(json.data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCertificates();
  }, [statusFilter]);

  // Removed if (!session) return null; to allow rendering and debugging
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Certificates</h1>
          <p className="mt-2 text-sm text-gray-700">
            A list of all generated authenticity certificates, their status, and provenance.
          </p>
        </div>
        <div className="mt-4 sm:ml-16 sm:mt-0 sm:flex-none">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
          >
            <option value="all">All Statuses</option>
            <option value="READY">READY</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="FAILED">FAILED</option>
            <option value="REVOKED">REVOKED</option>
          </select>
        </div>
      </div>

      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Public ID</th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Serial Source</th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Order Ref</th>
                    <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Generated</th>
                    <th className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">View</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-gray-500">Loading...</td>
                    </tr>
                  ) : certificates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-gray-500">No certificates found.</td>
                    </tr>
                  ) : (
                    certificates.map((cert) => (
                      <tr key={cert._id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                          <span className="font-mono">{cert.publicId?.split("-")[0] || "Unknown"}...</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                            cert.status === 'READY' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                            cert.status === 'PROCESSING' ? 'bg-yellow-50 text-yellow-700 ring-yellow-600/20' : 
                            cert.status === 'FAILED' ? 'bg-red-50 text-red-700 ring-red-600/20' : 
                            'bg-gray-50 text-gray-600 ring-gray-500/10'
                          }`}>
                            {cert.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {cert.serialId?.source || "N/A"}
                          {cert.serialId?.storeId?.name ? ` (${cert.serialId.storeId.name})` : ""}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {cert.serialId?.orderId || cert.serialId?.externalOrderId || "-"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {new Date(cert.createdAt).toLocaleDateString()}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          <Link href={`/admin/certificates/${cert._id}`} className="text-indigo-600 hover:text-indigo-900">
                            View<span className="sr-only">, {cert.publicId}</span>
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
