"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  QuestionMarkCircleIcon,
  EnvelopeIcon,
  ChatBubbleLeftRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
import { formatPrice } from "@/lib/currency";

export default function CustomerSupportPage() {
  const params = useParams();
  const company = (params.company as string) || "";
  const { customer } = useCustomerAuthStore();

  const [orders, setOrders] = useState<any[]>([]);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [faqCategory, setFaqCategory] = useState("all");

  // Form State
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [category, setCategory] = useState("order_inquiry");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState<string | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);

  useEffect(() => {
    if (company && customer) {
      fetch(`/api/${company}/ecom/customer/orders`)
        .then((r) => r.json())
        .then((data) => {
          if (data.success && Array.isArray(data.orders)) {
            setOrders(data.orders);
          }
        })
        .catch(() => {});
    }
  }, [company, customer]);

  const faqs = [
    {
      category: "shipping",
      q: "How can I track my shipment after placing an order?",
      a: "Once your order is packed and dispatched, a tracking AWB number is assigned. You can track your shipment timeline directly from 'My Orders' > 'Details & Tracking' or via our public tracking portal.",
    },
    {
      category: "shipping",
      q: "What are the standard delivery timelines within India?",
      a: "Metro cities typically receive delivery within 2 to 4 business days. For non-metro and regional pincodes, delivery takes 4 to 7 business days via our verified courier partners (Shiprocket, Delhivery).",
    },
    {
      category: "returns",
      q: "What is your return and exchange policy?",
      a: "We offer a 7-day return and exchange policy for unworn sarees with original tags attached. Once your return request is approved in your account dashboard, our courier partner schedules reverse pickup from your doorstep.",
    },
    {
      category: "returns",
      q: "How long does it take to receive a refund?",
      a: "After the returned saree passes quality control at our warehouse, refunds are initiated immediately to your original payment mode (taking 3-5 business days for bank settlement) or as instant store credit.",
    },
    {
      category: "payments",
      q: "What payment methods are supported?",
      a: "We accept all major UPI apps (Google Pay, PhonePe, Paytm), Credit & Debit cards, Net Banking, and Cash on Delivery (COD) subject to pin-code and Maximum Order Value eligibility.",
    },
    {
      category: "orders",
      q: "Can I cancel an order after placing it?",
      a: "Yes, you can cancel your order directly from your account page before it enters 'Shipped' or 'Packed' status. If prepaid, an instant refund is triggered upon cancellation.",
    },
  ];

  const filteredFaqs = faqCategory === "all" ? faqs : faqs.filter((f) => f.category === faqCategory);

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setTicketError(null);
    try {
      const res = await fetch(`/api/${company}/ecom/support/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subject,
          message,
          orderId: selectedOrderId ? Number(selectedOrderId) : null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to submit ticket.");
      }

      setTicketSuccess(
        `Ticket #${data.ticket?.ticket_no || "SUBMITTED"} created. Our support team will reply within 24 hours.`
      );
      setSubject("");
      setMessage("");
      setSelectedOrderId("");
    } catch (err: any) {
      setTicketError(err.message || "Unable to send support ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <h1 className="text-lg font-bold text-slate-900">Help & Support Center</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Find instant answers to common questions or submit a ticket to our concierge team
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Left: Dynamic FAQ Accordion */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <QuestionMarkCircleIcon className="h-4 w-4 text-indigo-600" />
              <span>Frequently Asked Questions</span>
            </h2>

            <select
              value={faqCategory}
              onChange={(e) => setFaqCategory(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-2xs font-semibold text-slate-700"
            >
              <option value="all">All Topics</option>
              <option value="shipping">Shipping & Delivery</option>
              <option value="returns">Returns & Refunds</option>
              <option value="payments">Payments & COD</option>
              <option value="orders">Orders & Cancellation</option>
            </select>
          </div>

          <div className="divide-y divide-slate-100">
            {filteredFaqs.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="py-3">
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between text-left text-xs font-semibold text-slate-800 hover:text-indigo-600 transition-colors py-1 cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    {isOpen ? (
                      <ChevronUpIcon className="h-4 w-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="mt-2 text-xs text-slate-500 leading-relaxed pl-1 pr-4">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Contact Support Ticket Form */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
          <div className="pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <EnvelopeIcon className="h-4 w-4 text-indigo-600" />
              <span>Submit Support Ticket</span>
            </h2>
            <p className="text-2xs text-slate-400 mt-0.5">We typically reply within 24 business hours</p>
          </div>

          {ticketSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-start gap-2">
              <CheckCircleIcon className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{ticketSuccess}</span>
            </div>
          )}

          {ticketError && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800">
              {ticketError}
            </div>
          )}

          <form onSubmit={handleSubmitTicket} className="space-y-3">
            {orders.length > 0 && (
              <div>
                <label className="text-2xs font-bold text-slate-700 uppercase">Related Order (Optional)</label>
                <select
                  value={selectedOrderId}
                  onChange={(e) => setSelectedOrderId(e.target.value)}
                  className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-mono"
                >
                  <option value="">No specific order</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>
                      Order #{o.order_no} ({formatPrice(Number(o.total_amount))})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-2xs font-bold text-slate-700 uppercase">Inquiry Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs"
              >
                <option value="order_inquiry">Order Status / Delivery Delay</option>
                <option value="return_request">Return & Exchange Issue</option>
                <option value="payment_problem">Payment or Refund Failure</option>
                <option value="product_feedback">Fabric / Product Feedback</option>
                <option value="other">General Inquiry</option>
              </select>
            </div>

            <div>
              <label className="text-2xs font-bold text-slate-700 uppercase">Subject</label>
              <input
                type="text"
                required
                placeholder="Brief summary of your inquiry..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="text-2xs font-bold text-slate-700 uppercase">Message</label>
              <textarea
                required
                rows={4}
                placeholder="Describe your issue in detail..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full mt-1 px-3 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {submitting ? "Sending..." : "Submit Ticket"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

