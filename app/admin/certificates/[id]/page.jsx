"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, FileText, Ban, AlertTriangle } from "lucide-react";

export default function CertificateDetailPage() {
  const { data: session } = useSession();
  const params = useParams();
  const router = useRouter();
  const [cert, setCert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const fetchCert = async () => {
      try {
        const res = await fetch(`/api/admin/certificates/${params.id}`);
        const json = await res.json();
        if (json.success) {
          setCert(json.data);
        } else {
          alert(json.error || "Not found");
          router.push("/admin/certificates");
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    };
    fetchCert();
  }, [params.id, router]);

  const handleAction = async (action) => {
    if (!confirm(`Are you sure you want to ${action} this certificate?`)) return;
    
    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/certificates/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const json = await res.json();
      if (json.success) {
        alert(`Successfully ${action}ed certificate.`);
        window.location.reload();
      } else {
        alert(json.error || `Failed to ${action} certificate.`);
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred.");
    }
    setActionLoading(false);
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading...</div>;
  if (!cert) return null;

  const serial = cert.serialId || {};
  const stats = cert.stats || {};
  const events = cert.events || [];

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link href="/admin/certificates" className="inline-flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-900">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Certificates
        </Link>
      </div>

      <div className="md:flex md:items-center md:justify-between mb-8">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl sm:tracking-tight">
            Certificate Details
          </h2>
          <div className="mt-1 flex flex-col sm:mt-0 sm:flex-row sm:flex-wrap sm:space-x-6">
            <div className="mt-2 flex items-center text-sm text-gray-500 font-mono">
              <FileText className="mr-1.5 h-5 w-5 flex-shrink-0 text-gray-400" />
              {cert.publicId}
            </div>
            <div className="mt-2 flex items-center text-sm text-gray-500">
              <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                cert.status === 'READY' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                cert.status === 'PROCESSING' ? 'bg-yellow-50 text-yellow-700 ring-yellow-600/20' : 
                cert.status === 'FAILED' ? 'bg-red-50 text-red-700 ring-red-600/20' : 
                'bg-gray-50 text-gray-600 ring-gray-500/10'
              }`}>
                {cert.status}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 flex md:ml-4 md:mt-0 space-x-3">
          {cert.status === "FAILED" && (
            <button
              onClick={() => handleAction("regenerate")}
              disabled={actionLoading}
              className="inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              Regenerate PDF
            </button>
          )}
          {cert.status !== "REVOKED" && (
            <button
              onClick={() => handleAction("revoke")}
              disabled={actionLoading}
              className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50"
            >
              <Ban className="mr-1.5 h-4 w-4" /> Revoke
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden bg-white shadow sm:rounded-lg mb-8">
        <div className="px-4 py-6 sm:px-6">
          <h3 className="text-base font-semibold leading-7 text-gray-900">Provenance & Origin</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">Origin details of the physical product serial.</p>
        </div>
        <div className="border-t border-gray-100">
          <dl className="divide-y divide-gray-100">
            <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Source</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{serial.source}</dd>
            </div>
            {serial.storeId && (
              <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-900">Marketplace Store</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{serial.storeId.name}</dd>
              </div>
            )}
            {(serial.orderId || serial.externalOrderId) && (
              <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-900">Order Reference</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{serial.orderId || serial.externalOrderId}</dd>
              </div>
            )}
            {serial.assignedToRef && (
              <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-900">Manual Assignment Ref</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{serial.assignedToRef}</dd>
              </div>
            )}
            <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Generated At</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {new Date(serial.generatedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="overflow-hidden bg-white shadow sm:rounded-lg mb-8">
        <div className="px-4 py-6 sm:px-6">
          <h3 className="text-base font-semibold leading-7 text-gray-900">Verification & Claim Audit</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">Summary of client interactions with this serial.</p>
        </div>
        <div className="border-t border-gray-100">
          <dl className="divide-y divide-gray-100">
            <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">First Claimed / Verified At</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {stats.firstVerified ? new Date(stats.firstVerified).toLocaleString() : "Never"}
              </dd>
            </div>
            <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Total Verification Events</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{stats.totalEvents}</dd>
            </div>
            <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Successful Views (Already Verified)</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{stats.successfulVerifications}</dd>
            </div>
            <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium flex items-center text-red-600">
                <AlertTriangle className="mr-2 h-4 w-4" /> Failed / Invalid Attempts
              </dt>
              <dd className="mt-1 text-sm font-semibold leading-6 text-red-600 sm:col-span-2 sm:mt-0">
                {stats.failedAttempts}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="overflow-hidden bg-white shadow sm:rounded-lg mb-8">
        <div className="px-4 py-6 sm:px-6">
          <h3 className="text-base font-semibold leading-7 text-gray-900">PDF Asset</h3>
        </div>
        <div className="border-t border-gray-100 px-4 py-6 sm:px-6">
          {cert.status === "READY" && cert.downloadUrl ? (
            <div>
              <p className="text-sm text-gray-500 mb-4">SHA-256: <span className="font-mono text-xs">{cert.pdfSha256}</span></p>
              <iframe src={cert.downloadUrl} className="w-full h-[600px] border border-gray-200 rounded-md shadow-inner" />
            </div>
          ) : (
            <p className="text-sm text-gray-500">PDF is not available or generation failed.</p>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-base font-semibold leading-7 text-gray-900 mb-4">Verification Events (Last 50)</h3>
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Time</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Result</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">IP Hash</th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">User Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {events.map((evt) => (
                <tr key={evt._id}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-500 sm:pl-6">
                    {new Date(evt.createdAt).toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm font-medium">
                    <span className={evt.result === 'VERIFIED' ? 'text-green-600' : evt.result === 'ALREADY_VERIFIED' ? 'text-blue-600' : 'text-red-600'}>
                      {evt.result}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm font-mono text-gray-500">{evt.ipHash}</td>
                  <td className="px-3 py-4 text-xs text-gray-500 max-w-xs truncate" title={evt.userAgent}>
                    {evt.userAgent}
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-sm text-gray-500">No events logged yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
