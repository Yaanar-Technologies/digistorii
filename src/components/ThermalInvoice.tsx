"use client";

import React, { forwardRef, useMemo } from "react";
import { useTenant } from "@/context/TenantContext";

type TaxComponent = {
  component_name: string;
  component_percentage: number;
};

type PaymentRow = {
  payment_mode_name?: string;
  mode_name?: string;
  name?: string;
  amount?: number | string;
};

type Detail = {
  product_name?: string;
  sku?: string;
  hsn_code?: string;
  hsn_no?: string;
  qty: number;
  rate: number;
  discount: number;
  tax_percent: number;
  tax_amount: number;
  line_total: number;
  tax_components?: TaxComponent[];
};

type Header = {
  sales_no: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  sales_date: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  company_name?: string;
  company_address?: string;
  address?: string;
  company_phone?: string;
  company_gstin?: string;
  gst_number?: string;
  city?: string;
  state?: string;
  pincode?: string;
  salesman_name?: string;
  sales_person_name?: string;
  sales_person?: string;
  salesperson?: string;
  created_by_name?: string;
  user_name?: string;
  payment_modes?: PaymentRow[];
  payments?: PaymentRow[];
  return_change?: number | string;
};

type Props = {
  header: Header;
  details: Detail[];
  onDataReady?: () => void;
};

const currency = (n: number) => Number(n || 0).toFixed(2);
const divider = "-".repeat(38);

const formatDateTime = (date: string) => {
  if (!date) return "";
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");

  return `${day}-${month}-${year} ${hours}:${minutes}`;
};

const keyRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "6px",
};

const labelStyle: React.CSSProperties = {
  whiteSpace: "pre",
  flex: "0 0 auto",
};

const valueStyle: React.CSSProperties = {
  textAlign: "right",
  flex: 1,
  minWidth: 0,
  wordBreak: "break-word",
};

const ThermalInvoice = forwardRef<HTMLDivElement, Props>(({ header, details, onDataReady }, ref) => {
  const { company } = useTenant();
  const [thermalData, setThermalData] = React.useState<{
    company?: { company_name?: string; gst_number?: string };
    location?: Record<string, string>;
    salesmanName?: string;
    paymentModes?: { name?: string; payment_mode_name?: string; amount?: number }[];
  } | null>(null);

  React.useEffect(() => {
    if (company && header.sales_no) {
      fetch(`/api/thermal-invoice?sales_no=${encodeURIComponent(header.sales_no)}`, {
        headers: { "x-tenant": company },
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => {
          console.log("Thermal Invoice Data Loaded:", data);
          if (data && !data.error) {
            setThermalData(data);
          }
        })
        .catch((err) => console.error("Error fetching thermal invoice:", err));
    }
  }, [company, header.sales_no]);

  // Signal parent that data is ready to print (fires after thermalData state update renders)
  React.useEffect(() => {
    if (thermalData && onDataReady) {
      onDataReady();
    }
  }, [thermalData, onDataReady]);



  // GSTIN
  const companyGstin =
    thermalData?.company?.gst_number ||
    header?.company_gstin ||
    header?.gst_number ||
    "";

  // Phone
  const companyPhone =
    thermalData?.location?.mobile ||
    header?.company_phone ||
    "";

  // Address fallback – combine location fields from API or props
  const locationAddress = [
    thermalData?.location?.registered_address_line_1,
    thermalData?.location?.registered_address_line_2,
    thermalData?.location?.registered_city,
    thermalData?.location?.registered_state,
    thermalData?.location?.registered_pincode,
    thermalData?.location?.registered_country,
  ]
    .filter(Boolean)
    .join(", ") || header.company_address || header.address || header.customer_address || "";


  const companyName =
    thermalData?.company?.company_name ||
    header?.company_name ||
    "YOUR COMPANY";

  // 2. Fix Salesman (Fallback if header has it or thermalData has it)
  const salesmanName =
    thermalData?.salesmanName ||
    header?.salesman_name ||
    "-";

  // 3. Fix Payments Mapping (API returns Array of { name, amount })
  const rawPayments: any[] =
    (Array.isArray(thermalData?.paymentModes) && thermalData.paymentModes) ||
    (Array.isArray(header?.payments) && header.payments) ||
    [];

  const payments = rawPayments.map((p: any) => ({
    mode_name: p.name || p.payment_mode_name || p.mode_name || "Payment",
    amount: Number(p.amount ?? 0),
    paid_amount: Number(p.paid_amount ?? 0),
    actual_amount: Number(p.actual_amount ?? 0),
    return_change: Number(p.return_change ?? 0),
  }));

  const totals = useMemo(() => {
    const totalQty = details.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const totalDiscount = details.reduce((sum, row) => sum + Number(row.discount || 0), 0);
    const amount = Number(header.subtotal || 0) + totalDiscount;
    const rounding =
      Number(header.total_amount || 0) -
      Number(header.subtotal || 0) -
      Number(header.tax_amount || 0);

    return { totalQty, totalDiscount, amount, rounding, savings: totalDiscount };
  }, [details, header.subtotal, header.tax_amount, header.total_amount]);

  const taxGroups = useMemo(() => {
    const grouped = new Map<
      string,
      { label: string; cgst: number; sgst: number; tax: number }
    >();

    details.forEach((detail) => {
      const components = Array.isArray(detail.tax_components) ? detail.tax_components : [];
      const totalTax = Number(detail.tax_amount || 0);
      const percent = Number(detail.tax_percent || 0);
      if (!components.length || totalTax <= 0 || percent <= 0) return;

      const label = `GST${Number.isInteger(percent) ? percent : percent.toFixed(2)}`;
      const totalPercent = components.reduce(
        (sum, component) => sum + Number(component.component_percentage || 0),
        0
      );
      if (totalPercent <= 0) return;

      let cgst = 0;
      let sgst = 0;
      let otherTax = 0;

      components.forEach((component) => {
        const componentAmount =
          (Number(component.component_percentage || 0) / totalPercent) * totalTax;
        const name = String(component.component_name || "").toUpperCase();
        if (name.includes("CGST")) cgst += componentAmount;
        else if (name.includes("SGST")) sgst += componentAmount;
        else otherTax += componentAmount;
      });

      const existing = grouped.get(label) || { label, cgst: 0, sgst: 0, tax: 0 };
      existing.cgst += cgst;
      existing.sgst += sgst;
      existing.tax += totalTax + otherTax;
      grouped.set(label, existing);
    });

    return Array.from(grouped.values());
  }, [details]);

  return (
    <div
      ref={ref}
      style={{
        width: "280px",
        padding: "8px",
        color: "#000",
        background: "#fff",
        fontFamily:
          '"Courier New", Courier, "Liberation Mono", "DejaVu Sans Mono", monospace',
        fontSize: "11px",
        lineHeight: "1.2",
        letterSpacing: "0.1px",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "15px", fontWeight: 700 }}>{companyName}</div>
        {locationAddress ? <div>{locationAddress}</div> : null}
        {companyPhone ? <div>Ph: {companyPhone}</div> : null}
        {companyGstin ? <div>GST: {companyGstin}</div> : null}
        <div style={{ marginTop: "4px", fontWeight: 700 }}>TAX INVOICE</div>
      </div>

      <div style={{ margin: "4px 0" }}>{divider}</div>

      <div style={{ display: "grid", gap: "1px" }}>
        <div style={keyRowStyle}>
          <span style={labelStyle}>Bill No          :</span>
          <span style={valueStyle}>{header.sales_no}</span>
        </div>
        <div style={keyRowStyle}>
          <span style={labelStyle}>Date             :</span>
          <span style={valueStyle}>{formatDateTime(header.sales_date)}</span>
        </div>
        <div style={keyRowStyle}>
          <span style={labelStyle}>Customer         :</span>
          <span style={valueStyle}>{header.customer_name || "Walk-in Customer"}</span>
        </div>
        <div style={keyRowStyle}>
          <span style={labelStyle}>Mobile No        :</span>
          <span style={valueStyle}>{header.customer_phone || "-"}</span>
        </div>
      </div>

      <div style={{ margin: "9px 0" }}>{divider}</div>

      <div style={{ display: "grid", gap: "1px" }}>
        <div style={{ ...keyRowStyle, fontWeight: 700 }}>
          <span style={labelStyle}>Item Name</span>
          <span style={valueStyle}>Amount</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: "10px" }}>Qty x Unit Price</div>
      </div>

      <div style={{ margin: "9px 0" }}>{divider}</div>

      {details.map((item, index) => {
        const productName = item.product_name || "Item";
        const qty = Number(item.qty || 0);
        const rate = Number(item.rate || 0);
        const lineTotal = Number(item.line_total || 0);
        const discount = Number(item.discount || 0);
        const sku = String(item.sku || "").trim();
        const hsn = String(item.hsn_code || item.hsn_no || "").trim();

        return (
          <div key={`${productName}-${index}`} style={{ marginBottom: "4px" }}>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {productName}
            </div>
            {(sku || hsn) && (
              <div style={{ ...keyRowStyle, fontSize: "10px" }}>
                <span style={labelStyle}>{sku ? `SKU: ${sku}` : ""}</span>
                <span style={valueStyle}>{hsn ? `HSN: ${hsn}` : ""}</span>
              </div>
            )}
            <div style={{ ...keyRowStyle, marginTop: "1px" }}>
              <span style={labelStyle}>{`${qty} x ${currency(rate)}`}</span>
              <span style={{ ...valueStyle, fontWeight: 700 }}>{currency(lineTotal)}</span>
            </div>
            {discount > 0 ? (
              <div style={{ ...keyRowStyle, fontSize: "10px" }}>
                <span style={labelStyle}>Disc: {currency(discount)}</span>
                <span style={valueStyle}></span>
              </div>
            ) : null}
          </div>
        );
      })}

      <div style={{ margin: "4px 0" }}>{divider}</div>

      <div style={{ display: "grid", gap: "1px" }}>
        <div style={keyRowStyle}>
          <span style={labelStyle}>Amount          :</span>
          <span style={valueStyle}>{currency(totals.amount)}</span>
        </div>
        {totals.totalDiscount > 0 ? (
          <div style={keyRowStyle}>
            <span style={labelStyle}>Bill Discount   :</span>
            <span style={valueStyle}>{currency(totals.totalDiscount)}</span>
          </div>
        ) : null}
        {Number(header.tax_amount || 0) > 0 ? (
          <div style={keyRowStyle}>
            <span style={labelStyle}>Tax Amount      :</span>
            <span style={valueStyle}>{currency(Number(header.tax_amount || 0))}</span>
          </div>
        ) : null}
        {Math.abs(totals.rounding) > 0.001 ? (
          <div style={keyRowStyle}>
            <span style={labelStyle}>ROD             :</span>
            <span style={valueStyle}>{currency(totals.rounding)}</span>
          </div>
        ) : null}
      </div>

      <div style={{ margin: "4px 0" }}>{divider}</div>

      <div style={{ ...keyRowStyle, fontWeight: 700, fontSize: "13px" }}>
        <span style={labelStyle}>TOTAL AMOUNT    :</span>
        <span style={valueStyle}>{currency(Number(header.total_amount || 0))}</span>
      </div>

      <div style={{ display: "grid", gap: "1px", marginTop: "3px" }}>
        <div style={keyRowStyle}>
          <span style={labelStyle}>Items           :</span>
          <span style={valueStyle}>{details.length}</span>
        </div>

        {totals.savings > 0 ? (
          <div style={keyRowStyle}>
            <span style={labelStyle}>Savings         :</span>
            <span style={valueStyle}>{currency(totals.savings)}</span>
          </div>
        ) : null}
      </div>
      {taxGroups.length ? (
        <>
          <div style={{ margin: "4px 0" }}>{divider}</div>
          <div style={{ fontWeight: 700, marginBottom: "2px" }}>TAX DETAILS</div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.8fr",
              gap: "4px",
              fontSize: "10px",
              fontWeight: 700,
            }}
          >
            <div>Desc</div>
            <div style={{ textAlign: "right" }}>CGST</div>
            <div style={{ textAlign: "right" }}>SGST</div>
            <div style={{ textAlign: "right" }}>Tax</div>
          </div>
          {taxGroups.map((row) => (
            <div
              key={row.label}
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 0.8fr 0.8fr 0.8fr",
                gap: "4px",
                fontSize: "10px",
                marginTop: "1px",
              }}
            >
              <div>{row.label}</div>
              <div style={{ textAlign: "right" }}>{currency(row.cgst)}</div>
              <div style={{ textAlign: "right" }}>{currency(row.sgst)}</div>
              <div style={{ textAlign: "right" }}>{currency(row.tax)}</div>
            </div>
          ))}
        </>
      ) : null}

      {/* SALESMAN SECTION */}
      <div style={keyRowStyle}>
        <span style={labelStyle}>Salesman        :</span>
        <span style={valueStyle}>{salesmanName}</span>
      </div>

      {/* PAYMENT DETAILS SECTION */}
      {payments.length > 0 && (
        <>
          <div style={{ margin: "4px 0" }}>{divider}</div>
          <div style={{ fontWeight: 700, marginBottom: "2px" }}>
            PAYMENT DETAILS
          </div>

          {payments.map((p, idx) => (
            <React.Fragment key={`payment-${idx}`}>
              <div style={keyRowStyle}>
                <span style={labelStyle}>{p.mode_name} :</span>
                <span style={valueStyle}>{currency(p.amount)}</span>
              </div>

              {Number(p.return_change) > 0 && (
                <div
                  style={{
                    ...keyRowStyle,
                    marginTop: "2px",
                    fontWeight: 700,
                  }}
                >
                  <span style={labelStyle}>Change:</span>
                  <span style={valueStyle}>
                    {currency(Number(p.return_change))}
                  </span>
                </div>
              )}
            </React.Fragment>
          ))}
        </>
      )}

      <div style={{ margin: "4px 0" }}>{divider}</div>

      <div style={{ marginTop: "4px", textAlign: "center" }}>
        <div style={{ fontWeight: 700 }}>*** THANK YOU ***</div>
        <div>VISIT AGAIN</div>
      </div>
    </div>
  );
});

ThermalInvoice.displayName = "ThermalInvoice";

export default ThermalInvoice;