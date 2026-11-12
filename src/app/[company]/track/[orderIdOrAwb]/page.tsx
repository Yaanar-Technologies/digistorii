import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { getTenantSchemaByCompany } from "@/lib/tenant";
import { CustomerTrackingTimeline } from "@/components/storefront/CustomerTrackingTimeline";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";

interface TrackingPageProps {
  params: Promise<{
    company: string;
    orderIdOrAwb: string;
  }>;
}

export default async function TrackingPage({ params }: TrackingPageProps) {
  const { company, orderIdOrAwb } = await params;
  const decodedQuery = decodeURIComponent(orderIdOrAwb || "").trim();

  let schema = "";
  let companyName = company;
  try {
    const tenantInfo = await getTenantSchemaByCompany(company);
    schema = tenantInfo.schema;
    companyName = tenantInfo.company || company;
  } catch (err) {
    notFound();
  }

  const client = await pool.connect();

  try {
    // 1. Resolve order by order_no, numeric id, or delivery awb_number
    const isNumeric = /^\d+$/.test(decodedQuery);

    const orderQuery = `
      SELECT
        o.id, o.order_no, o.order_status, o.delivery_status, o.total_amount, o.currency, o.created_at,
        ca.name AS address_name, ca.city, ca.state, ca.pincode,
        d.courier_partner, d.awb_number, d.tracking_url, d.shipping_label_url,
        d.pickup_scheduled_at, d.dispatched_at, d.picked_up_at, d.out_for_delivery_at,
        d.delivered_at, d.estimated_delivery_at, d.attempt_count, d.failure_reason,
        d.next_retry_date, d.rto_initiated_at, d.pod_type, d.pod_resource_url,
        d.delivered_to_person_name, d.delivery_coordinates, d.last_location
      FROM "${schema}".online_orders o
      LEFT JOIN "${schema}".customer_addresses ca ON ca.id = o.shipping_address_id
      LEFT JOIN "${schema}".online_order_deliveries d ON d.order_id = o.id
      WHERE o.order_no = $1
         OR ($2::boolean AND o.id = $3::bigint)
         OR (d.awb_number IS NOT NULL AND d.awb_number = $1)
      LIMIT 1
    `;

    const orderRes = await client.query(orderQuery, [
      decodedQuery,
      isNumeric,
      isNumeric ? parseInt(decodedQuery, 10) : 0,
    ]);

    if (orderRes.rowCount === 0) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center items-center p-4">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center shadow-sm">
            <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
              ✕
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              Shipment Not Found
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              No delivery record or active order was found matching &ldquo;{decodedQuery}&rdquo;.
              Please verify your tracking number or order ID.
            </p>
            <div className="mt-6">
              <Link
                href={`/${company}/store`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 transition"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                Return to Store
              </Link>
            </div>
          </div>
        </div>
      );
    }

    const order = orderRes.rows[0];
    const orderId = order.id;

    // 2. Fetch line items
    const itemsRes = await client.query(
      `SELECT product_name AS name, qty, rate AS selling_price
       FROM "${schema}".online_order_items
       WHERE order_id = $1`,
      [orderId]
    );

    // 3. Fetch status history checkpoints
    const historyRes = await client.query(
      `SELECT id, status_type, from_status, to_status, note, created_at
       FROM "${schema}".online_order_status_history
       WHERE order_id = $1
       ORDER BY created_at ASC`,
      [orderId]
    );

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 py-10 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
          <Link
            href={`/${company}/store`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to {companyName} Store
          </Link>
          <span className="text-xs text-slate-400 font-medium">Real-Time Tracking Service</span>
        </div>

        <CustomerTrackingTimeline
          orderNo={order.order_no}
          orderDate={order.created_at}
          orderStatus={order.order_status}
          deliveryStatus={order.delivery_status}
          delivery={{
            courier_partner: order.courier_partner,
            awb_number: order.awb_number,
            tracking_url: order.tracking_url,
            shipping_label_url: order.shipping_label_url,
            pickup_scheduled_at: order.pickup_scheduled_at,
            dispatched_at: order.dispatched_at,
            picked_up_at: order.picked_up_at,
            out_for_delivery_at: order.out_for_delivery_at,
            delivered_at: order.delivered_at,
            estimated_delivery_at: order.estimated_delivery_at,
            attempt_count: order.attempt_count,
            failure_reason: order.failure_reason,
            next_retry_date: order.next_retry_date,
            rto_initiated_at: order.rto_initiated_at,
            pod_type: order.pod_type,
            pod_resource_url: order.pod_resource_url,
            delivered_to_person_name: order.delivered_to_person_name,
            delivery_coordinates: order.delivery_coordinates,
            last_location: order.last_location,
          }}
          checkpoints={historyRes.rows}
          shippingAddress={{
            name: order.address_name,
            city: order.city,
            state: order.state,
            pincode: order.pincode,
          }}
          items={itemsRes.rows.map((r) => ({
            name: r.name,
            qty: Number(r.qty || 1),
            selling_price: Number(r.selling_price || 0),
          }))}
          totalAmount={Number(order.total_amount)}
          currency={order.currency || "INR"}
        />
      </div>
    );
  } finally {
    client.release();
  }
}
