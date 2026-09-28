"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function NewWebhookIntegrationPage() {
  const router = useRouter();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    provider: "SHOPEE",
    storeId: ""
  });

  useEffect(() => {
    fetch("/api/admin/stores")
      .then(res => res.json())
      .then(result => {
        const data = result.data || [];
        setStores(data);
        if (data.length > 0) {
          setFormData(prev => ({ ...prev, storeId: data[0]._id }));
        }
      });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/admin/webhooks/${data._id}`);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to create");
      }
    } catch (err) {
      alert("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-xl">
      <h1 className="text-3xl font-bold mb-6">Add Integration</h1>
      
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-md border space-y-4">
        <div>
          <Label>Integration Name</Label>
          <Input 
            required 
            placeholder="e.g. Eternal Glory Shopee" 
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
          />
        </div>

        <div>
          <Label>Provider</Label>
          <select 
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            value={formData.provider}
            onChange={e => setFormData({...formData, provider: e.target.value})}
          >
            <option value="SHOPEE">Shopee</option>
            <option value="TOKOPEDIA" disabled>Tokopedia (Coming Soon)</option>
            <option value="TIKTOK" disabled>TikTok Shop (Coming Soon)</option>
          </select>
        </div>

        <div>
          <Label>Target Store (Internal)</Label>
          <select 
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            value={formData.storeId}
            required
            onChange={e => setFormData({...formData, storeId: e.target.value})}
          >
            {stores.map(store => (
              <option key={store._id} value={store._id}>{store.name}</option>
            ))}
          </select>
        </div>

        <div className="pt-4 flex gap-4">
          <Button type="submit" disabled={loading}>Create Integration</Button>
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        </div>
      </form>
    </div>
  );
}
