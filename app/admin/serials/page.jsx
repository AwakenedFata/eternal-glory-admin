"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

export default function SerialsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [serials, setSerials] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Assign Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignSerialId, setAssignSerialId] = useState(null);
  const [assignReference, setAssignReference] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  
  // Single generate
  const [singleGenerating, setSingleGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState(null);

  // Batch generate
  const [batchQuantity, setBatchQuantity] = useState(10);
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchResult, setBatchResult] = useState(null);

  // CSV Import
  const [csvFile, setCsvFile] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvSummary, setCsvSummary] = useState(null);

  const fetchSerials = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/serials");
      const json = await res.json();
      if (json.data) {
        setSerials(json.data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (activeTab === "all") {
      fetchSerials();
    }
  }, [activeTab]);

  const handleCsvUpload = async (confirm = false) => {
    if (!csvFile) return;
    setCsvUploading(true);
    const formData = new FormData();
    formData.append("file", csvFile);
    if (confirm) formData.append("confirm", "true");

    try {
      const res = await fetch("/api/admin/serials/import", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (json.success) {
        setCsvSummary(confirm ? { ...json.summary, importedCount: json.importedCount } : json.summary);
      } else {
        alert(json.error);
      }
    } catch (e) {
      console.error(e);
      alert("Upload failed");
    }
    setCsvUploading(false);
  };

  const handleGenerateSingle = async () => {
    setSingleGenerating(true);
    setLastGenerated(null);
    try {
      const res = await fetch("/api/admin/serials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_single" })
      });
      const json = await res.json();
      if (json.success) {
        setLastGenerated(json.plainCode);
      } else {
        alert(json.error);
      }
    } catch (e) {
      console.error(e);
    }
    setSingleGenerating(false);
  };

  const handleGenerateBatch = async () => {
    setBatchGenerating(true);
    setBatchResult(null);
    try {
      const res = await fetch("/api/admin/serials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate_batch", quantity: batchQuantity })
      });
      const json = await res.json();
      if (json.success) {
        setBatchResult(json.result);
      } else {
        alert(json.error);
      }
    } catch (e) {
      console.error(e);
    }
    setBatchGenerating(false);
  };

  const openAssignModal = (serialId) => {
    setAssignSerialId(serialId);
    setAssignReference("");
    setAssignModalOpen(true);
  };

  const submitAssign = async (e) => {
    e.preventDefault();
    if (!assignReference) return;

    setAssignLoading(true);
    try {
      const res = await fetch("/api/admin/serials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", serialId: assignSerialId, reference: assignReference })
      });
      const json = await res.json();
      if (json.success) {
        setAssignModalOpen(false);
        fetchSerials();
      } else {
        alert(json.error || "Failed to assign.");
      }
    } catch (e) {
      console.error(e);
      alert("Error assigning serial.");
    }
    setAssignLoading(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Serial Numbers</h1>
      
      <div className="mt-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {["all", "generate", "import"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-8">
        {activeTab === "all" && (
          <div>
            {loading ? (
              <p>Loading...</p>
            ) : (
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900">Serial Code</th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Source</th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Order Ref</th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Generated At</th>
                      <th className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {serials.map((serial) => (
                      <tr key={serial._id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 font-mono tracking-widest">
                          {serial.code}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                            serial.status === 'AVAILABLE' ? 'bg-green-50 text-green-700 ring-green-600/20' :
                            serial.status === 'ASSIGNED' ? 'bg-blue-50 text-blue-700 ring-blue-600/20' :
                            serial.status === 'ALLOCATED' ? 'bg-yellow-50 text-yellow-700 ring-yellow-600/20' :
                            'bg-gray-50 text-gray-700 ring-gray-600/20'
                          }`}>
                            {serial.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{serial.source}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {serial.assignedToRef || serial.orderId || serial.externalOrderId || "-"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {new Date(serial.generatedAt).toLocaleString()}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          {serial.status === 'AVAILABLE' && (
                            <button
                              onClick={() => openAssignModal(serial._id)}
                              className="text-indigo-600 hover:text-indigo-900"
                            >
                              Assign
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "generate" && (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Single */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-medium text-gray-900">Generate Single</h3>
              <p className="mt-2 text-sm text-gray-500">Generate a single secure 6-digit serial number.</p>
              <div className="mt-6">
                <button
                  onClick={handleGenerateSingle}
                  disabled={singleGenerating}
                  className="inline-flex justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {singleGenerating ? "Generating..." : "Generate Single"}
                </button>
              </div>
              {lastGenerated && (
                <div className="mt-6 rounded-md bg-green-50 p-4 border border-green-200">
                  <p className="text-sm text-green-800">Successfully generated:</p>
                  <p className="mt-1 text-3xl font-mono tracking-widest text-green-900 font-bold">{lastGenerated}</p>
                  <p className="mt-2 text-xs text-green-700">Please record this code. It will not be shown in plaintext again.</p>
                </div>
              )}
            </div>

            {/* Batch */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-medium text-gray-900">Generate Batch</h3>
              <p className="mt-2 text-sm text-gray-500">Generate multiple serials securely. Max 10,000 per request.</p>
              <div className="mt-6 flex flex-col sm:flex-row gap-4">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={batchQuantity}
                  onChange={(e) => setBatchQuantity(e.target.value)}
                  className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-gray-900 sm:text-sm sm:leading-6"
                />
                <button
                  onClick={handleGenerateBatch}
                  disabled={batchGenerating}
                  className="inline-flex justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap"
                >
                  {batchGenerating ? "Generating..." : "Generate Batch"}
                </button>
              </div>
              {batchResult && (
                <div className="mt-6 rounded-md bg-green-50 p-4 border border-green-200">
                  <p className="text-sm text-green-800 font-medium">Batch Completed</p>
                  <ul className="mt-2 text-sm text-green-700 space-y-1">
                    <li>Requested: {batchResult.requested}</li>
                    <li>Successfully Generated: {batchResult.generated}</li>
                    {batchResult.collisions > 0 && <li>Collisions Avoided: {batchResult.collisions}</li>}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "import" && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm max-w-2xl">
             <h3 className="text-lg font-medium text-gray-900">Import CSV</h3>
             <p className="mt-2 text-sm text-gray-500">Upload a CSV file containing serial codes. The file must have a header column named `code`.</p>
             
             {!csvSummary ? (
               <div className="mt-6">
                  <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files[0])} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100" />
                  <button onClick={() => handleCsvUpload(false)} disabled={!csvFile || csvUploading} className="mt-4 inline-flex justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50">
                    {csvUploading ? "Analyzing..." : "Preview Import"}
                  </button>
               </div>
             ) : (
               <div className="mt-6 rounded-md bg-gray-50 p-4 border border-gray-200">
                 <h4 className="text-sm font-medium text-gray-900">Import Summary</h4>
                 <ul className="mt-2 text-sm text-gray-600 space-y-1">
                   <li>Total Rows: {csvSummary.totalRows}</li>
                   <li>Valid Codes: {csvSummary.valid}</li>
                   <li className="text-red-600">Invalid Rows: {csvSummary.invalid}</li>
                   <li className="text-yellow-600">Duplicates in File: {csvSummary.duplicateInFile}</li>
                   <li className="text-yellow-600">Already in Database: {csvSummary.alreadyExisting}</li>
                   <li className="font-semibold text-green-700">Ready to Import: {csvSummary.readyToImport}</li>
                 </ul>
                 
                 {csvSummary.importedCount !== undefined ? (
                   <p className="mt-4 font-bold text-green-700">Import completed successfully! ({csvSummary.importedCount} codes)</p>
                 ) : (
                   <div className="mt-4 flex gap-4">
                     <button onClick={() => handleCsvUpload(true)} disabled={csvSummary.readyToImport === 0 || csvUploading} className="inline-flex justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                       {csvUploading ? "Importing..." : "Confirm Import"}
                     </button>
                     <button onClick={() => { setCsvSummary(null); setCsvFile(null); }} className="inline-flex justify-center rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50">
                       Cancel
                     </button>
                   </div>
                 )}
               </div>
             )}
          </div>
        )}
      </div>

      {/* Assign Modal */}
      {assignModalOpen && (
        <div className="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"></div>
          <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
                <div>
                  <div className="mt-3 text-center sm:mt-5">
                    <h3 className="text-base font-semibold leading-6 text-gray-900" id="modal-title">Assign Serial to Order</h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        Please enter the Customer Reference or Order ID for this serial number. This helps track which physical product was sent to which customer.
                      </p>
                    </div>
                  </div>
                </div>
                <form onSubmit={submitAssign} className="mt-5 sm:mt-6">
                  <div className="mb-4 text-left">
                    <label htmlFor="reference" className="block text-sm font-medium leading-6 text-gray-900">
                      Order Reference
                    </label>
                    <div className="mt-2">
                      <input
                        type="text"
                        name="reference"
                        id="reference"
                        required
                        value={assignReference}
                        onChange={(e) => setAssignReference(e.target.value)}
                        className="block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                        placeholder="e.g. WA-00125 or John Doe"
                      />
                    </div>
                  </div>
                  <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
                    <button
                      type="submit"
                      disabled={assignLoading || !assignReference}
                      className="inline-flex w-full justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 sm:col-start-2 disabled:opacity-50"
                    >
                      {assignLoading ? "Assigning..." : "Assign"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignModalOpen(false)}
                      className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
