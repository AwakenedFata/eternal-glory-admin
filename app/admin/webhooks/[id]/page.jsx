"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";

export default function WebhookIntegrationPage({ params }) {
  const integrationId = use(params).id;
  const router = useRouter();

  const [integration, setIntegration] = useState(null);
  const [health, setHealth] = useState(null);
  const [events, setEvents] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states for configuration
  const [partnerId, setPartnerId] = useState("");
  const [partnerKey, setPartnerKey] = useState("");
  const [shopId, setShopId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    fetchData();
  }, [integrationId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [intRes, healthRes, eventRes, prodRes] = await Promise.all([
        fetch(`/api/admin/webhooks/${integrationId}`),
        fetch(`/api/admin/webhooks/${integrationId}/health`),
        fetch(`/api/admin/webhooks/${integrationId}/events?limit=10`),
        fetch(`/api/admin/webhooks/${integrationId}/products`)
      ]);
      
      const intData = await intRes.json();
      setIntegration(intData);
      
      if (intData.configuration) {
        setPartnerId(intData.configuration.partnerId || "");
        setShopId(intData.configuration.shopId || "");
        // Don't set state for masked secrets, leave them blank unless changing
      }

      setHealth(await healthRes.json());
      setEvents((await eventRes.json()).events || []);
      setProducts(await prodRes.json());
      
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    try {
      const configPayload = {
        partnerId,
        shopId
      };
      
      if (partnerKey) configPayload.partnerKey = partnerKey;
      if (accessToken) configPayload.accessToken = accessToken;
      
      const res = await fetch(`/api/admin/webhooks/${integrationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configuration: configPayload })
      });
      
      if (res.ok) {
        alert("Configuration saved securely.");
        setPartnerKey("");
        setAccessToken("");
        fetchData();
      } else {
        const error = await res.json();
        alert(`Failed to save: ${error.error}`);
      }
    } catch (error) {
      alert("Error saving configuration");
    }
  };

  const handleTestConnection = async () => {
    try {
      setTestResult({ status: "testing", message: "Connecting to provider API..." });
      const res = await fetch(`/api/admin/webhooks/${integrationId}/test`, {
        method: "POST"
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult({ status: "success", message: `Connected in ${data.latencyMs}ms` });
      } else {
        setTestResult({ status: "error", message: data.error });
      }
      fetchData(); // Refresh health and status
    } catch (err) {
      setTestResult({ status: "error", message: "Network error during test" });
    }
  };

  const handleRetryEvent = async (eventId) => {
    try {
      const res = await fetch(`/api/admin/webhooks/${integrationId}/events/${eventId}/retry`, {
        method: "POST"
      });
      if (res.ok) {
        alert("Event queued for retry");
        fetchData();
      }
    } catch (error) {
      alert("Error retrying event");
    }
  };

  if (loading) return <div className="p-8">Loading integration data...</div>;
  if (!integration || integration.error) return <div className="p-8">Integration not found</div>;

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">{integration.provider} Integration</h1>
          <p className="text-gray-500">Store: {integration.name} | Status: <Badge>{integration.status || 'NOT_CONFIGURED'}</Badge></p>
        </div>
      </div>

      <Tabs defaultValue="config" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="webhook">Webhook & Health</TabsTrigger>
          <TabsTrigger value="rules">Product Rules</TabsTrigger>
          <TabsTrigger value="events">Event Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <div className="bg-white p-6 rounded-md border space-y-6 max-w-2xl">
            <h2 className="text-xl font-semibold">API Credentials</h2>
            <div className="space-y-4">
              <div>
                <Label>Partner ID</Label>
                <Input value={partnerId} onChange={e => setPartnerId(e.target.value)} placeholder="e.g. 1004523" />
              </div>
              <div>
                <Label>Shop ID</Label>
                <Input value={shopId} onChange={e => setShopId(e.target.value)} placeholder="e.g. 84931" />
              </div>
              <div>
                <Label>Partner Key (Secret)</Label>
                <Input type="password" value={partnerKey} onChange={e => setPartnerKey(e.target.value)} placeholder={integration.configuration?.hasPartnerKey ? "•••••••••••••••• (Set to overwrite)" : "Enter Partner Key"} />
              </div>
              <div>
                <Label>Access Token</Label>
                <Input type="password" value={accessToken} onChange={e => setAccessToken(e.target.value)} placeholder={integration.configuration?.hasAccessToken ? "•••••••••••••••• (Set to overwrite)" : "Enter Access Token"} />
              </div>
              
              <div className="pt-4 flex gap-4">
                <Button onClick={handleSaveConfig}>Save Configuration</Button>
                <Button variant="outline" onClick={handleTestConnection}>Test API Connection</Button>
              </div>

              {testResult && (
                <div className={`p-4 rounded-md mt-4 ${testResult.status === 'success' ? 'bg-green-50 text-green-800' : testResult.status === 'error' ? 'bg-red-50 text-red-800' : 'bg-gray-100'}`}>
                  <strong>{testResult.status.toUpperCase()}:</strong> {testResult.message}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="webhook">
          <div className="bg-white p-6 rounded-md border space-y-6">
            <h2 className="text-xl font-semibold">Webhook Endpoint</h2>
            <div className="bg-gray-50 p-4 rounded-md font-mono text-sm break-all">
              {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/{integration?.provider?.toLowerCase() || 'unknown'}/{integration?.endpointKey}
            </div>
            <p className="text-sm text-gray-500">Configure this exact URL in the {integration?.provider || 'Provider'} Developer Console.</p>
            
            <hr className="my-6" />

            <h2 className="text-xl font-semibold">Integration Health</h2>
            {health && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border p-4 rounded-md">
                  <div className="text-sm text-gray-500">Total Events</div>
                  <div className="text-2xl font-bold">{health.webhookHealth.totalEvents}</div>
                </div>
                <div className="border p-4 rounded-md">
                  <div className="text-sm text-gray-500">Pending Queue</div>
                  <div className="text-2xl font-bold">{health.webhookHealth.pendingEvents}</div>
                </div>
                <div className="border p-4 rounded-md">
                  <div className="text-sm text-gray-500">Failed Events</div>
                  <div className="text-2xl font-bold text-red-600">{health.webhookHealth.failedEvents}</div>
                </div>
                <div className="border p-4 rounded-md">
                  <div className="text-sm text-gray-500">Last API Error</div>
                  <div className="text-sm font-medium mt-1">{health.apiHealth.lastErrorAt ? new Date(health.apiHealth.lastErrorAt).toLocaleString() : "None"}</div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="rules">
          <div className="bg-white p-6 rounded-md border space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">SKU Mapping Rules</h2>
              <Button variant="outline">Add Rule</Button>
            </div>
            {/* Real implementation would have a form here */}
            {products.length === 0 ? (
              <p className="text-gray-500">No SKU rules configured. Serials will not be generated automatically.</p>
            ) : (
              <div className="space-y-2">
                {products.map(p => (
                  <div key={p._id} className="border p-4 flex justify-between">
                    <div>
                      <div className="font-bold">{p.sku || "N/A"} (Provider ID: {p.providerProductId})</div>
                      <div className="text-sm text-gray-500">Eligible: {p.isEligible ? "Yes" : "No"} | Serials per unit: {p.serialsPerUnit}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="events">
          <div className="bg-white rounded-md border">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-xl font-semibold">Recent Event Logs</h2>
              <Button variant="outline" size="sm" onClick={fetchData}>Refresh</Button>
            </div>
            {events.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No webhook events received yet.</div>
            ) : (
              <div className="divide-y">
                {events.map(event => (
                  <div key={event._id} className="p-4 hover:bg-gray-50">
                    <div className="flex justify-between mb-2">
                      <div className="font-semibold">{event.eventType || "UNKNOWN EVENT"} <span className="text-sm font-normal text-gray-500 ml-2">{new Date(event.receivedAt).toLocaleString()}</span></div>
                      <Badge variant="outline" className={
                        event.status === "PROCESSED" ? "bg-green-100 text-green-800" :
                        event.status === "FAILED" ? "bg-red-100 text-red-800" :
                        event.status === "QUEUED" || event.status === "PROCESSING" ? "bg-blue-100 text-blue-800" :
                        "bg-gray-100 text-gray-800"
                      }>{event.status}</Badge>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      Event ID: {event.externalEventId} | Attempts: {event.attemptCount}
                    </div>
                    {event.lastError && (
                      <div className="text-sm text-red-600 bg-red-50 p-2 rounded mb-2">Error: {event.lastError}</div>
                    )}
                    {event.status === "FAILED" && (
                      <Button variant="outline" size="sm" onClick={() => handleRetryEvent(event._id)}>Retry Event</Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
