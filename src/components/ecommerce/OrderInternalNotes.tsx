"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  ChatBubbleLeftRightIcon,
  EyeIcon,
  EyeSlashIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";

export interface OrderNote {
  id: number;
  order_id: number;
  company_id: number;
  author_name: string;
  author_type: string;
  content: string;
  is_customer_visible: boolean;
  created_at: string;
}

interface OrderInternalNotesProps {
  orderId: number;
  company: string;
  authorName?: string;
}

export function OrderInternalNotes({
  orderId,
  company,
  authorName = "Support Staff",
}: OrderInternalNotesProps) {
  const [notes, setNotes] = useState<OrderNote[]>([]);
  const [newContent, setNewContent] = useState("");
  const [isCustomerVisible, setIsCustomerVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${company}/ecom/orders/${orderId}/notes`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.notes)) {
          setNotes(data.notes);
        }
      }
    } catch (err) {
      console.error("Failed to fetch order notes:", err);
    } finally {
      setLoading(false);
    }
  }, [orderId, company]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/${company}/ecom/orders/${orderId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent.trim(),
          authorName,
          authorType: "staff",
          isCustomerVisible,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to post order note.");
      }
      setNewContent("");
      setIsCustomerVisible(false);
      await fetchNotes();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to add note.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-gray-900">
          <ChatBubbleLeftRightIcon className="h-4 w-4 text-indigo-600" />
          <span>Order Activity & Notes ({notes.length})</span>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">{errorMsg}</div>
      )}

      {/* Notes Stream */}
      <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
        {loading && notes.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400">
            No internal or public notes recorded for this order yet.
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className={`rounded-xl p-3 text-xs border ${
                note.is_customer_visible
                  ? "bg-blue-50/50 border-blue-100"
                  : "bg-gray-50/70 border-gray-100"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900">{note.author_name}</span>
                  <span className="text-[10px] uppercase font-semibold text-gray-400">
                    ({note.author_type})
                  </span>
                  {note.is_customer_visible ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.2 text-[10px] font-bold text-blue-700">
                      <EyeIcon className="h-3 w-3" /> Customer Visible
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-200 px-2 py-0.2 text-[10px] font-semibold text-gray-600">
                      <EyeSlashIcon className="h-3 w-3" /> Internal Only
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-gray-400">
                  {new Date(note.created_at).toLocaleString("en-IN", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap">{note.content}</p>
            </div>
          ))
        )}
      </div>

      {/* Add Note Form */}
      <form onSubmit={handleSubmitNote} className="space-y-2 pt-2 border-t border-gray-100">
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add an internal note or customer update..."
          rows={2}
          className="w-full rounded-xl border border-gray-200 p-2.5 text-xs focus:border-black focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isCustomerVisible}
              onChange={(e) => setIsCustomerVisible(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-0 cursor-pointer"
            />
            <span className="flex items-center gap-1">
              <EyeIcon className="h-3.5 w-3.5 text-blue-600" />
              Make visible to customer on their account timeline
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting || !newContent.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-black disabled:opacity-50 cursor-pointer"
          >
            <PaperAirplaneIcon className="h-3.5 w-3.5" />
            {submitting ? "Posting..." : "Post Note"}
          </button>
        </div>
      </form>
    </div>
  );
}
