"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export default function WebhooksPage() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      const res = await fetch("/api/admin/webhooks");
      const data = await res.json();
      setIntegrations(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "ACTIVE": return "bg-green-100 text-green-800";
      case "CONFIGURED": return "bg-blue-100 text-blue-800";
      case "NOT_CONFIGURED": return "bg-gray-100 text-gray-800";
      case "AUTH_ERROR": return "bg-red-100 text-red-800";
      case "DEGRADED": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Webhook Integrations</h1>
        <Link href="/admin/webhooks/new">
          <Button>Add Integration</Button>
        </Link>
      </div>

      <div className="bg-white rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Store</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Event</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4">Loading...</TableCell>
              </TableRow>
            ) : integrations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4">No integrations found. You must configure them in DB first.</TableCell>
              </TableRow>
            ) : (
              integrations.map((integration) => (
                <TableRow key={integration._id}>
                  <TableCell className="font-medium">{integration.provider}</TableCell>
                  <TableCell>{integration.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={getStatusColor(integration.status || 'NOT_CONFIGURED')}>
                      {integration.status || 'NOT_CONFIGURED'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {integration.lastEventAt ? new Date(integration.lastEventAt).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/webhooks/${integration._id}`}>
                      <Button variant="outline" size="sm">Manage</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
