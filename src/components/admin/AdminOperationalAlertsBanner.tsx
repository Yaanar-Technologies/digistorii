"use client";

import React, { useEffect, useState } from "react";
import {
  ExclamationTriangleIcon,
  XMarkIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";

interface OperationalAlert {
  id: number;
  alert_type: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  created_at: string;
}

export function AdminOperationalAlertsBanner({ company }: { company: string }) {
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [dismissingId, setDismissingId] = useState<number | null>(null);

  const fetchAlerts = async () => {
    try {
      const res = await fetch(`/api/${company}/ecom/operational-alerts`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.alerts)) {
          setAlerts(data.alerts);
        }
      }
    } catch {
      // Silent catch
    }
  };

  useEffect(() => {
    if (company) {
      fetchAlerts();
    }
  }, [company]);

  const handleDismiss = async (alertId: number) => {
    setDismissingId(alertId);
    try {
      const res = await fetch(`/api/${company}/ecom/operational-alerts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertId }),
      });
      if (res.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch {
      // Ignore
    } finally {
      setDismissingId(null);
    }
  };

  if (alerts.length === 0) return null;

  return (
    <div className="w-full space-y-2 mb-4">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 shadow-sm text-xs ${
            alert.severity === "CRITICAL"
              ? "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200"
              : "bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200"
          }`}
        >
          <div className="flex items-start gap-2.5">
            <ExclamationTriangleIcon
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                alert.severity === "CRITICAL" ? "text-rose-600" : "text-amber-600"
              }`}
            />
            <div>
              <div className="font-bold">{alert.title}</div>
              <p className="mt-0.5 opacity-90 leading-relaxed">{alert.message}</p>
            </div>
          </div>

          <button
            type="button"
            disabled={dismissingId === alert.id}
            onClick={() => handleDismiss(alert.id)}
            className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition shrink-0"
            title="Acknowledge and dismiss"
          >
            {dismissingId === alert.id ? (
              <ArrowPathIcon className="w-4 h-4 animate-spin" />
            ) : (
              <XMarkIcon className="w-4 h-4" />
            )}
          </button>
        </div>
      ))}
    </div>
  );
}

