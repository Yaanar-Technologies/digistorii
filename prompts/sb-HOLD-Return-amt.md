To support hold bills, payment status badges, return change tracking, and excess payment receipt prints, make the following database updates, UI modifications, backend changes, and thermal print updates.

---

# Architecture & Feature Implementation Plan

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   FEATURE ROADMAP                                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Database Migrations   ➜  update sales_payments table              │
│ 2. Sales Form UI         ➜ Rename "Extra Paid" to "Return Change" & bypass error        │
│ 3. Hold Bill Feature     ➜ Add "Hold Bill" button & status indicator in View Bills     │
│ 4. Payment Badges        ➜ Add status badge (Paid / Pending / Draft) in View Bills      │
│ 5. Thermal Invoice Print ➜ Display "Return Change" when customer overpays (> 0)        │
└────────────────────────────────────────────────────────────────────────────────────────┘

```

---

## Part 1: Database Migration Script

Run this SQL migration script to update your PostgreSQL schema.

```sql


-- 2. Update sales_payments table schema
-- Adding paid_amount to differentiate tender amount vs actual applied payment
ALTER TABLE tenant_68.sales_payments 
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(12,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS return_change NUMERIC(12,2) DEFAULT 0.00;

-- Backfill existing payment entries
UPDATE tenant_68.sales_payments 
SET paid_amount = amount, 
    actual_amount = amount, 
    return_change = 0.00 
WHERE paid_amount = 0.00 OR paid_amount IS NULL;



```

---

## Part 2: Updates in `SalesForm.tsx`

### 1. Update Payment Validation Rule

Locate `validate()` inside `SalesForm.tsx` and allow excess payment amounts without throwing validation errors:

```tsx
// REMOVE OR COMMENT OUT THIS CHECK:
/*
if (targetTotal > 0 && normalizedTotalPaid - targetTotal > 0.01) {
    newErrors.payments = "Paid amount cannot exceed grand total";
}
*/

// REPLACE WITH:
// Allow payment amounts >= net total (excess will be calculated as Return Change)
payments.forEach((payment) => {
    if (Number(payment.amount || 0) <= 0) {
        newErrors[`payment_mode_${payment.payment_mode_id}`] = "Enter payment amount";
    }
});

```

---

### 2. Update Summary UI Text

Replace the "Extra Paid" summary section in `SalesForm.tsx` with **Return Change**:

```tsx
<div className="border-t border-gray-100 pt-2 mt-2">
    <div className="flex justify-between">
        <span>Paid</span>
        <span>{totalPaidAmount.toFixed(2)}</span>
    </div>
    <div className="mt-1 flex justify-between">
        <span>Balance Due</span>
        <span>{balanceAmount.toFixed(2)}</span>
    </div>
    {/* Updated block for Return Change */}
    <div className="mt-1 flex justify-between font-semibold text-emerald-600">
        <span>Change</span>
        <span>{balanceAmountstore.toFixed(2)}</span>
    </div>
</div>

```

---

### 3. Add "Hold Bill" Logic & Action Button

Add a function to handle putting a bill on "Hold" status:

```tsx
const handleHoldBill = async () => {
    // Temporarily update status to 'Hold'
    setHeader((prev) => ({ ...prev, status: "Hold" }));
    
    // Save without clearing redirection/validation locks
    const savedBill = await saveSales(false, { redirect: false, reset: true });
    if (savedBill?.id) {
        alert(`Bill ${savedBill.sales_no} placed on Hold!`);
    }
};

```

Update the action buttons panel to include the **Hold Bill** button:
instead of save (ctrl+s) keep this hold bill where only three butons still exists
```tsx    
    {/* Added Hold Button */}
    <button
        type="button"
        onClick={handleHoldBill}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 text-sm font-medium text-white hover:bg-amber-600"
    >
        Hold Bill
    </button>

    <button
        type="button"
        onClick={handleSaveAndPrint}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white hover:bg-slate-800"
    >
        <PrinterIcon className="h-4 w-4" />
        Print
    </button>
    <button
        type="button"
        onClick={resetFormAfterSave}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
        <ArrowPathIcon className="h-4 w-4" />
        Reset
    </button>
</div>

```

---

### 4. Update Previous Bills Slide-Over Table

Update the bills drawer table rendering logic to display **Status Badges**, **Hold Dots**, and **Return/Exchange Action Buttons**:
add search bar next to text `Previous Bills` search by amount, customer name, date,bill number
```tsx
<table className="w-full text-sm">
    <thead className="bg-gray-50 text-gray-600 sticky top-0 border-b">
        <tr>
            <th className="p-3 text-left font-semibold">Bill No</th>
            <th className="p-3 text-left font-semibold">Customer</th>
            <th className="p-3 text-left font-semibold">Date</th>
            <th className="p-3 text-center font-semibold">Payment Status</th>
            <th className="p-3 text-right font-semibold">Total</th>
            <th className="p-3 text-center font-semibold">Action</th>
        </tr>
    </thead>
    <tbody>
        {sortedBills.map((bill) => {
            const isHold = bill.status === "Hold";
            const paymentStatus = bill.payment_status || "unpaid";

            return (
                <tr key={bill.id} className="border-t hover:bg-blue-50 transition">
                    <td onClick={() => handleSelectBill(bill)} className="p-3 font-medium text-gray-700 cursor-pointer">
                        <div className="flex items-center gap-2">
                            {/* Green pulse point to represent Hold / Pending state */}
                            {isHold && (
                                <span className="relative flex h-2.5 w-2.5" title="Payment Due / Bill on Hold">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                </span>
                            )}
                            <span>{bill.sales_no}</span>
                        </div>
                    </td>
                    <td onClick={() => handleSelectBill(bill)} className="p-3 text-gray-600 cursor-pointer">
                        {bill.customer_name || bill.customer_id}
                    </td>
                    <td onClick={() => handleSelectBill(bill)} className="p-3 text-gray-600 cursor-pointer">
                        {formatDateLabel(bill.sales_date || bill.created_at)}
                    </td>
                    {/* Status Badge */}
                    <td className="p-3 text-center">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            paymentStatus === "paid"
                                ? "bg-emerald-100 text-emerald-800"
                                : paymentStatus === "partial"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                        }`}>
                            {paymentStatus.toUpperCase()}
                        </span>
                    </td>
                    <td onClick={() => handleSelectBill(bill)} className="p-3 text-right font-semibold text-gray-700 cursor-pointer">
                        {Number(bill.total_amount || 0).toFixed(2)}
                    </td>
                    <td className="p-3 text-center">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void handleOpenReturnSelection(bill);
                            }}
                            className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-600 hover:bg-indigo-100 transition"
                        >
                            Return/Exch
                        </button>
                    </td>
                </tr>
            );
        })}
    </tbody>
</table>

```

---

## Part 3: Updates in `ThermalInvoice.tsx`

Add **Return Change** to the payment breakdown section on the thermal receipt:

```tsx
{payments.length > 0 && (
  <>
    <div style={{ margin: "4px 0" }}>{divider}</div>
    <div style={{ fontWeight: 700, marginBottom: "2px" }}>PAYMENT DETAILS</div>
    {payments.map((p, idx) => (
      <div key={`payment-${idx}`} style={keyRowStyle}>
        <span style={labelStyle}>{p.mode_name} :</span>
        <span style={valueStyle}>{currency(p.amount)}</span>
      </div>
    ))}

    {/* Render Return Change line if overpaid */}
    {header.return_change && header.return_change > 0 ? (
      <div style={{ ...keyRowStyle, marginTop: "2px", fontWeight: 700 }}>
        <span style={labelStyle}>Change:</span>
        <span style={valueStyle}>{currency(header.return_change)}</span>
      </div>
    ) : null}
  </>
)}

```