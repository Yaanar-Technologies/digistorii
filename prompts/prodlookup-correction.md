# Task Specification: Product Lookup API & UI Modal Refactoring

##  Overview

Refactor the **Product Lookup Modal** (`Select Products`) and its corresponding Next.js API route. The update fixes product listing rules across modules (Sales, Purchase, Opening Stock,Pricing), replaces basic category names with full hierarchy path strings (`path_string`), enables row-level selection clicks, fixes barcode scanning behavior, and enhances overall table UI/UX.

---

##  Part 1: Backend API Route Updates (`GET /api/products`)

### 1. Integrate Full Category Path (`path_string`)

Currently, category names render as single top-level names (e.g., `"Women"`). Update the query to return `path_string` (e.g., `"Women > Ethnic"`) from the `product_categories` table. for Product Filters.

* **SQL Selection Update:**
```sql
COALESCE(pc.path_string, pc.category_name, p.category) AS category_name,
COALESCE(pc.path_string, pc.category_name, p.category) AS category

```


* Ensure `LEFT JOIN "${schema}".product_categories pc ON pc.id::text = p.category::text` is preserved across all query branches.

---

### 2. Add Opening Stock Lookup Module Support (`module=ops`)

To ensure newly created products appear when adding Opening Stock (OPS) without duplicating existing entries:

* Check for `module === 'ops'` or `type === 'ops_lookup'` from request query parameters.
* **Filter Rule:** Exclude variants that already have an opening stock entry in `opening_stock_items` for the selected `warehouse_id`.

#### Complete Query Logic Structure for Lookup:

```typescript
const moduleParam = req.nextUrl.searchParams.get("module") || "";
const isOpsModule = moduleParam === "ops" || type === "ops_lookup";
const isSalesModule = moduleParam === "sales";

// Determine warehouse filter clause
let warehouseSourceFilter = "";

if (isSalesModule) {
  warehouseSourceFilter = `
    AND p.${productTypeColumn} = 'finished_good'
    AND (
      EXISTS (
        SELECT 1 FROM "${schema}".opening_stock_items osi
        WHERE osi.product_id = pv.id AND osi.warehouse_id = $2
      )
      OR EXISTS (
        SELECT 1 FROM "${schema}".grn_detail gd
        WHERE gd.product_id = pv.id AND gd.warehouse_id = $2
      )
    )
  `;
} else if (isOpsModule) {
  warehouseSourceFilter = `
    AND NOT EXISTS (
      SELECT 1 FROM "${schema}".opening_stock_items osi
      WHERE osi.product_id = pv.id AND osi.warehouse_id = $2
    )
  `;
}

```

* Ensure standard lookup for Purchase (`module=purchase`) or default catalog views continues to list active products without restriction.

---

##  Part 2: Frontend UI & Interaction Fixes (`Select Products` Modal)

### 1. Full Row Click Selection

Users currently must click directly on the checkbox `<input>`. Update the table row (`<tr>`) behavior so that clicking anywhere on the row toggles item selection.

```tsx
<tr
  key={item.variant_id}
  onClick={() => toggleSelectProduct(item.variant_id)}
  className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${
    isSelected(item.variant_id) ? "bg-blue-50 font-medium" : ""
  }`}
>
  <td onClick={(e) => e.stopPropagation()}>
    <input
      type="checkbox"
      checked={isSelected(item.variant_id)}
      onChange={() => toggleSelectProduct(item.variant_id)}
      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
    />
  </td>
  {/* Other table cells */}
</tr>

```

---

### 2. Barcode Scanning & Auto-Selection Logic

* **Fix Uneditable Barcode Input:** Ensure the barcode input element is not blocked by `disabled`, `readOnly`, or pointer-events CSS properties. that is in 
`products/components/ProductFilters.tsx`
```tsx
<input
            value={barcodeValue}
            onChange={(e) => onBarcodeChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onBarcodeSubmit?.();
              }
            }}
            placeholder="Scan barcode"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
```

* **Scan & Select Behavior:** When a user types or scans a barcode into the "Scan barcode" field:
1. Match the value against `pv.barcode`  in the loaded list.
2. If matched, **auto-check the item's checkbox** (select the row) in place within the modal.
3. Scroll the table to bring the matched row into view and clear the input field for the next scan (do not close the modal or auto-add to order until "Add Selected" is clicked).



```tsx
const handleBarcodeScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Enter") {
    e.preventDefault();
    const scannedCode = barcodeInput.trim().toLowerCase();
    if (!scannedCode) return;

    const matchedProduct = products.find(
      (p) =>
        p.barcode?.toLowerCase() === scannedCode ||
        p.sku?.toLowerCase() === scannedCode
    );

    if (matchedProduct) {
      if (!selectedIds.includes(matchedProduct.variant_id)) {
        setSelectedIds((prev) => [...prev, matchedProduct.variant_id]);
      }
      // Scroll matched element into view
      document
        .getElementById(`product-row-${matchedProduct.variant_id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      
      setBarcodeInput(""); // Reset input for next scan
    } else {
      toast.error("Product with scanned barcode not found!");
    }
  }
};

```

---

### 3. Category Filter Populated with Hierarchical Paths
as in `products/components/ProductFilters.tsx`

Ensure the "All Categories" dropdown selector derives its options using `path_string` (e.g., `Women > Ethnic`, `Women > Saree`), providing clear parent-child context to users filtering the table.

---

##  Part 3: UI / UX Enhancements

1. **Active Row Highlighting:** Give selected rows a subtle blue background (`bg-blue-50`) and a distinct left border (`border-l-4 border-l-blue-600`) for clear visual feedback.
2. **Sticky Table Header:** Add `sticky top-0 bg-gray-50 z-10` to `<thead>` so column titles remain visible during scrolling.
3. **Badge Formatting for On Hand Stock:**
* Low stock (< 10): Yellow badge (`bg-yellow-100 text-yellow-800`).
* Zero stock (= 0): Red badge (`bg-red-100 text-red-800`).
* Normal stock: Neutral/Green badge.


4. **Selected Count Summary:** Display a badge on the action button showing selection status: `Add Selected (3)`.

---

##  Acceptance Criteria

* [ ] API returns full category path strings (e.g., `Women > Saree`) instead of flat names.
* [ ] Query parameter `module=ops` correctly displays new products while suppressing items with existing OPS records in the specified warehouse.
* [ ] Clicking anywhere on a table row toggles its selection checkbox.
* [ ] The barcode input is fully interactive, captures barcode scans on `Enter`, selects the matching row, and scrolls it into view.
* [ ] Modal selection state remains responsive with clear visual row highlights.