**Context & Objective:**

We have to update our PostgreSQL database schema to support change tracking and proper calculation of split/excess payments.

**New Database Schema Changes:**

```sql
ALTER TABLE "{schema}".sales_header 
ADD COLUMN IF NOT EXISTS return_change NUMERIC(12,2) DEFAULT 0.00;

ALTER TABLE "{schema}".sales_payments 
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(12,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS return_change NUMERIC(12,2) DEFAULT 0.00;

```

---

### **Task Requirements:**

#### **1. Frontend Payload (`SalesForm.tsx`)**

Update `saveSales()` to pass the new payment tracking fields:

```typescript
const payloadPayments = payments.map((payment) => {
    const rawAmt = Number(payment.amount || 0);
    return {
        ...payment,
        paid_amount: rawAmt,                                // Total tendered by customer
        actual_amount: Math.min(rawAmt, netTotalAmount),    // Amount applied toward bill
        return_change: balanceAmountstore,                  // Change returned
        amount: rawAmt,
    };
});

const finalHeader = {
    ...header,
    user_name: user?.name,
    warehouse_id: selectedWarehouse?.id ?? activeWarehouseId ?? header.warehouse_id,
    location_id: selectedWarehouse?.location_id ?? activeLocationId ?? header.location_id,
    status: overrideStatus || (header.status === "Hold" ? "Entered" : header.status || "Entered"),
    payment_status: calculatePaymentStatus(netTotalAmount, totalPaidAmount),
    total_amount: Number(netTotalAmount.toFixed(2)),
    return_change: balanceAmountstore,                      // Header change tracking
};

```

---

#### **2. Backend Queries & Validation Updates (`/api/sales`)**

* **Remove Overpayment Validation Error:**
Remove or disable the check throwing `"Paid amount cannot exceed grand total"`.
* **Update Payment Status Calculation Logic:**
Use `paid_amount` (tendered) to compute total cash received, but use `actual_amount` when validating invoice balance settlement:
```typescript
const totalTendered = roundMoney(
    normalizedPayments.reduce((sum, row) => sum + Number(row.paid_amount || row.amount || 0), 0)
);
const totalAmount = roundMoney(header.total_amount);

// Use calculatePaymentStatus with total tendered vs total bill
const paymentStatus = calculatePaymentStatus(totalAmount, totalTendered);

```


* **Update SQL Insert Queries for `sales_payments`:**
```sql
INSERT INTO "{schema}".sales_payments (
  sales_id, payment_mode_id, amount, paid_amount, actual_amount, return_change,
  created_by, location_id, warehouse_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

```


* **Update SQL Insert/Update Queries for `sales_header`:**
Ensure `return_change` is saved to the `sales_header` table alongside `total_amount` and `payment_status`.