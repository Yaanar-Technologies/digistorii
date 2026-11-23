const ExcelJS = require('exceljs');
const path = require('path');

async function generateTestSuite() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Senior QA Automation & Test Lead';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('DigiStorii Test Suite', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  // Setup columns
  worksheet.columns = [
    { header: 'Test ID', key: 'testId', width: 16 },
    { header: 'Test Sidebar Page Name', key: 'pageName', width: 26 },
    { header: 'Test Description', key: 'description', width: 68 },
    { header: 'Expected Result', key: 'expectedResult', width: 62 },
    { header: 'Actual Result', key: 'actualResult', width: 28 },
    { header: 'Status', key: 'status', width: 14 }
  ];

  // Header styling
  const headerRow = worksheet.getRow(1);
  headerRow.height = 32;
  headerRow.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' } // Deep Blue
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      left: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FF94A3B8' } }
    };
  });

  const testCases = [
    // ==========================================
    // MODULE A: SCREEN SEPARATION & RBAC (TC-SEC)
    // ==========================================
    {
      testId: 'TC-SEC-001',
      pageName: 'Customer Auth / Workspace',
      description: 'Step 1: Register and log in as an E-Commerce storefront customer on https://testdigistorii.workpro.cloud/tanviboutique/store.\nStep 2: Without logging out, enter the URL directly in the browser address bar: https://testdigistorii.workpro.cloud/tanviboutique/workspace.\nStep 3: Observe page redirection and UI response.',
      expectedResult: 'HTTP 401/403 or immediate redirection to /workspace/login. Customer session cookie cannot authenticate workspace dashboard. Internal navigation sidebar, product masters, and sales registers are never rendered.'
    },
    {
      testId: 'TC-SEC-002',
      pageName: 'Admin / Workspace Dashboard',
      description: 'Step 1: As a logged-in storefront customer, directly navigate to admin routes: /tanviboutique/admin, /tanviboutique/admin/users, and /tanviboutique/admin/settings.\nStep 2: Inspect browser developer tools network tab for HTTP response and verify no sensitive payload is leaked.',
      expectedResult: 'System returns HTTP 302 Redirect to /admin/login or HTTP 403 Forbidden. No admin statistics, tenant credentials, or sensitive billing configurations are returned in JSON or DOM.'
    },
    {
      testId: 'TC-SEC-003',
      pageName: 'Custom Domain Storefront',
      description: 'Step 1: Configure custom domain "pothys.com" for tenant in store settings.\nStep 2: Access storefront via custom apex/subdomain: https://pothys.com/.\nStep 3: Attempt accessing internal routes on custom domain: https://pothys.com/workspace, https://pothys.com/admin, and https://pothys.com/tanviboutique/workspace.',
      expectedResult: 'Root https://pothys.com/ renders public storefront cleanly without /store in the URL. Direct navigation to /workspace or /admin on the custom domain returns HTTP 404 Not Found as enforced by middleware. Workspace chrome is inaccessible via merchant domain.'
    },
    {
      testId: 'TC-SEC-004',
      pageName: 'Multi-Tenant Isolation',
      description: 'Step 1: Create and authenticate customer "UserA" in Tenant "tanviboutique". Place Order #1001.\nStep 2: Capture authorization token / session cookies for UserA.\nStep 3: Attempt to fetch Order #1001 or Account details using UserA session on another tenant: https://testdigistorii.workpro.cloud/pothys/account/orders or GET /api/pothys/ecom/customer/orders.',
      expectedResult: 'Request rejected with HTTP 403 Forbidden or empty dataset. PostgreSQL schema isolation prevents cross-tenant schema queries. UserA cannot access Tenant B orders or customer records.'
    },
    {
      testId: 'TC-SEC-005',
      pageName: 'Sales Billing / POS',
      description: 'Step 1: Log in with cashier staff credentials (role: Cashier / POS Operator).\nStep 2: Verify cashier can access and operate POS Sales Billing terminal at /workspace/sales/counter.\nStep 3: Attempt to open workspace management pages: /workspace/settings, /workspace/site-management, and /workspace/administration/business-configuration.',
      expectedResult: 'Cashier successfully loads POS terminal and can scan items. Navigating to restricted settings or business configuration pages redirects to fallback accessible route or displays permission denied error without destructive access.'
    },
    {
      testId: 'TC-SEC-006',
      pageName: 'Sales Billing / POS',
      description: 'Step 1: Set up two distinct physical POS warehouse locations (Location 1: Main Store Counter, Location 2: Annex Store).\nStep 2: Assign Cashier A exclusively to Location 1.\nStep 3: Cashier A attempts to select or bill against Location 2 / Warehouse 2 inventory.',
      expectedResult: 'POS terminal locks location selection to Cashier A permitted warehouse/location. Stock reservation and invoice issuance can only debit assigned warehouse inventory.'
    },
    {
      testId: 'TC-SEC-007',
      pageName: 'E-Commerce Storefront',
      description: 'Step 1: Log in as Workspace Admin/Staff in Browser Tab 1.\nStep 2: Open Storefront in Tab 2 at /tanviboutique/store.\nStep 3: Verify the storefront layout does not display workspace sidebar, top admin navigation, or staff debugging pills to public visitors.',
      expectedResult: 'Storefront displays only public e-commerce header, banner, category navigation, product cards, and storefront footer. Workspace layout chrome and staff breadcrumbs are strictly isolated.'
    },
    {
      testId: 'TC-SEC-008',
      pageName: 'Order Management',
      description: 'Step 1: Log in as a Storefront Customer and view "My Account -> Orders" at /account/orders.\nStep 2: Observe order details layout and actions.\nStep 3: Attempt to trigger internal warehouse fulfillment actions (Pack, Generate AWB, Mark Shipped) via browser console or direct API call.',
      expectedResult: 'Customer UI only shows read-only tracking timeline, invoice download, and Cancel button (if eligible). Direct calls to /api/[company]/ecom/orders/[orderId]/ship fail with HTTP 401/403 Unauthorized.'
    },

    // ==========================================
    // MODULE B: DUAL AUTHENTICATION FLOWS (TC-AUTH)
    // ==========================================
    {
      testId: 'TC-AUTH-001',
      pageName: 'Customer Auth Portal',
      description: 'Step 1: Navigate to Storefront header -> Click "Sign In / Register".\nStep 2: Enter unique Full Name, Email ("qa_cust_01@example.com"), Phone ("9876543210"), and Password (Min 8 chars, 1 uppercase, 1 symbol).\nStep 3: Submit registration form.',
      expectedResult: 'Customer account created in tenant customer table with bcrypt hashed password. System auto-authenticates customer, sets customer session cookie, and updates header UI with customer initial avatar.'
    },
    {
      testId: 'TC-AUTH-002',
      pageName: 'Customer Auth Portal',
      description: 'Step 1: On Storefront as unauthenticated guest, add 3 items to shopping cart.\nStep 2: Click "Sign In" from header or cart checkout drawer.\nStep 3: Enter credentials for existing registered customer ("qa_cust_01@example.com") and log in.',
      expectedResult: 'Login succeeds. Guest cart items are seamlessly merged into the customer server-side cart without item loss or duplicate pricing. Cart badge retains correct combined item count.'
    },
    {
      testId: 'TC-AUTH-003',
      pageName: 'Customer Auth Portal',
      description: 'Step 1: Log in as customer. Refresh page multiple times and navigate across categories, product detail pages, and cart.\nStep 2: Close browser tab and reopen storefront URL within token expiration period.\nStep 3: Check authentication state.',
      expectedResult: 'Customer session persists smoothly across navigation and tab reopens via secure HTTP-only session cookie. No unexpected logouts occur.'
    },
    {
      testId: 'TC-AUTH-004',
      pageName: 'Customer Auth Portal',
      description: 'Step 1: On customer login modal, click "Forgot Password?".\nStep 2: Enter registered email "qa_cust_01@example.com" and submit.\nStep 3: Follow reset token URL and set new password.\nStep 4: Attempt logging in with old password, then new password.',
      expectedResult: 'Old password rejected with "Invalid credentials". New password authenticates successfully and invalidates prior reset tokens.'
    },
    {
      testId: 'TC-AUTH-005',
      pageName: 'Admin/Workspace Dashboard',
      description: 'Step 1: Open workspace login screen at /tanviboutique/workspace/login.\nStep 2: Enter valid store cashier/owner credentials ("cashier1", password).\nStep 3: Verify issued session cookie name, payload, and redirection.',
      expectedResult: 'Staff session cookie ("staff_session") issued containing user_id, company_name, and assigned permissions. User redirected to /workspace/sales or first authorized module.'
    },
    {
      testId: 'TC-AUTH-006',
      pageName: 'Customer Auth / Workspace',
      description: 'Step 1: In the same browser, log into Storefront as Customer in Tab 1.\nStep 2: Log into Workspace POS as Cashier in Tab 2.\nStep 3: Verify both sessions operate independently without overwriting or invalidating each other.',
      expectedResult: 'Dual cookie separation: Customer auth cookie and Staff session cookie coexist under distinct names. Tab 1 operates as Storefront Customer; Tab 2 operates as POS Staff.'
    },
    {
      testId: 'TC-AUTH-007',
      pageName: 'Customer Auth Portal',
      description: 'Step 1: Attempt registering with an existing registered email address.\nStep 2: Attempt registering with invalid phone formats (e.g. 5 digits, letters, special symbols).\nStep 3: Attempt login with empty fields and SQL injection strings (\' OR \'1\'=\'1).',
      expectedResult: 'Registration fails with friendly validation error: "Email already registered". Invalid phone formats blocked by schema validation. Injection attempts safely parameterized without error.'
    },
    {
      testId: 'TC-AUTH-008',
      pageName: 'Customer Auth Portal',
      description: 'Step 1: As logged-in customer, navigate to /account/settings.\nStep 2: Update delivery phone number, default address, and change password.\nStep 3: Log out and verify session cookie is cleared.',
      expectedResult: 'Profile updates persist in database. Logging out removes session cookie; navigating back via browser history redirects to login without showing cached private account data.'
    },

    // ==========================================
    // MODULE C: POS BILLING & REAL-TIME SYNC (TC-POS)
    // ==========================================
    {
      testId: 'TC-POS-001',
      pageName: 'Sales Billing',
      description: 'Step 1: Open POS Billing terminal at /workspace/sales/counter.\nStep 2: Focus on barcode scan input and scan barcode for SKU "TSHIRT-BLK-L".\nStep 3: Repeat scan 2 more times for the same barcode.',
      expectedResult: 'Item added to cart on first scan with correct product title, variant attribute (Black, L), and unit price. Subsequent 2 scans increment quantity to 3 without duplicating line items.'
    },
    {
      testId: 'TC-POS-002',
      pageName: 'Sales Billing',
      description: 'Step 1: In POS terminal, type partial SKU or product name "Silk Saree" in manual product search.\nStep 2: Select variant from the dropdown.\nStep 3: Verify line total, tax calculation (CGST + SGST @ 5% or 12%), and discount application.',
      expectedResult: 'Variant loads with correct selling price. Tax slab correctly splits CGST and SGST on taxable amount. Line total accurately computed: (Rate * Qty) - Discount + Tax.'
    },
    {
      testId: 'TC-POS-003',
      pageName: 'Sales Billing',
      description: 'Step 1: In POS customer selector, search for existing phone "9876543210".\nStep 2: Verify existing customer name and loyalty/history binds to invoice.\nStep 3: Test alternate branch: Enter new phone "9123456789" -> click "+ Quick Add Customer" -> Enter Name "Ramesh Kumar" -> Save & select.',
      expectedResult: 'Existing customer binds immediately. Quick-added customer persists in tenant customer table and attaches to current POS invoice without leaving the billing screen.'
    },
    {
      testId: 'TC-POS-004',
      pageName: 'Sales Billing',
      description: 'Step 1: Add items worth Total ₹2,500 to POS cart.\nStep 2: Select "Split Payment" mode.\nStep 3: Enter Cash: ₹1,000; UPI: ₹1,500. Generate Dynamic UPI QR code.\nStep 4: Confirm payment receipt and click "Complete Sale".',
      expectedResult: 'System validates that sum of split payments exactly equals total bill amount. Invoice generated with unique invoice number (e.g. INV-2026-0001). Payment method recorded as split (Cash: 1000, UPI: 1500).'
    },
    {
      testId: 'TC-POS-005',
      pageName: 'Sales Billing',
      description: 'Step 1: Complete a POS invoice sale for 2 units of SKU "JEANS-SLIM-32".\nStep 2: Verify thermal invoice preview / print dialogue opens.\nStep 3: Query inventory stock ledger for SKU "JEANS-SLIM-32".',
      expectedResult: 'Thermal slip displays tenant header, GSTIN, invoice number, itemized lines, HSN, tax breakdown, and split payment details. Inventory stock ledger records credit deduction of exactly 2 units.'
    },
    {
      testId: 'TC-POS-006',
      pageName: 'Sales Billing / E-Commerce Storefront',
      description: 'Step 1: Identify SKU "WATCH-GLD-01" having exactly 1 unit remaining in stock.\nStep 2: Open E-Commerce Storefront product page for this item in Browser 1.\nStep 3: In Browser 2, scan and complete a POS checkout sale for that 1 unit.\nStep 4: Refresh storefront product page in Browser 1.',
      expectedResult: 'Storefront product status immediately transitions from "In Stock" to "Out of Stock". "Add to Cart" and "Buy Now" buttons are disabled. Attempting direct checkout throws out-of-stock error.'
    },
    {
      testId: 'TC-POS-007',
      pageName: 'Sales Billing / E-Commerce Storefront',
      description: 'Step 1: Identify SKU "BAG-LTHR-01" with exactly 1 unit in stock.\nStep 2: Place and complete an online order on E-Commerce Storefront for that 1 unit.\nStep 3: On POS Sales Billing terminal, attempt to scan and add SKU "BAG-LTHR-01" to POS bill.',
      expectedResult: 'POS terminal displays warning: "Item out of stock or insufficient quantity (Available: 0)". Cashier cannot proceed to invoice generation for out-of-stock item unless backorders are explicitly enabled.'
    },
    {
      testId: 'TC-POS-008',
      pageName: 'Sales Billing / E-Commerce Storefront',
      description: 'Step 1: In Workspace -> Inventory -> Products, update selling price of SKU "SHIRT-BLU-M" from ₹799 to ₹899.\nStep 2: Check POS billing terminal item scan price.\nStep 3: Check E-Commerce storefront item card price.',
      expectedResult: 'Price update immediately reflects on both channels. POS scan loads ₹899; Storefront product card and checkout drawer calculate total using new ₹899 price without stale cache.'
    },
    {
      testId: 'TC-POS-009',
      pageName: 'Sales Billing',
      description: 'Step 1: On POS terminal, add items with non-round decimal totals (e.g. ₹1,234.67).\nStep 2: Observe automatic round-off calculation.\nStep 3: Complete sale with cash payment.',
      expectedResult: 'System applies standard round-off (+₹0.33 -> ₹1,235.00). Thermal receipt prints taxable amount, GST, round-off adjustment, and final net payable amount.'
    },
    {
      testId: 'TC-POS-010',
      pageName: 'Sales Billing',
      description: 'Step 1: Customer returns 1 item from previous Invoice #INV-2026-0001.\nStep 2: Cashier opens POS Sales Return / Exchange screen and looks up invoice.\nStep 3: Select item to return, enter return reason, and choose Cash Refund or Store Credit.\nStep 4: Confirm transaction.',
      expectedResult: 'Credit Note / Return slip generated. Stock ledger posts debit entry returning 1 unit to warehouse inventory. Customer store credit or cash ledger updated accordingly.'
    },
    {
      testId: 'TC-POS-011',
      pageName: 'Sales Billing',
      description: 'Step 1: Add 5 items to POS cart.\nStep 2: Cashier clicks "Hold Bill" (Park Sale).\nStep 3: Cashier bills another customer completely.\nStep 4: Cashier clicks "Recall Bill" and selects the parked cart.\nStep 5: Complete original bill.',
      expectedResult: 'Parked cart restored with identical SKUs, quantities, and customer details. Sale completed normally with stock deducted only once upon final completion.'
    },
    {
      testId: 'TC-POS-012',
      pageName: 'Sales Billing',
      description: 'Step 1: Test POS offline resilience: disconnect network momentarily while cart has 3 items.\nStep 2: Attempt to complete sale offline or verify offline warning.\nStep 3: Reconnect network and complete transaction.',
      expectedResult: 'UI informs cashier of offline status gracefully. Upon reconnection, cart state is preserved and sale commits to PostgreSQL without duplicate order IDs.'
    },

    // ==========================================
    // MODULE D: ORDER LIFECYCLE & INTEGRATIONS (TC-ORD)
    // ==========================================
    {
      testId: 'TC-ORD-001',
      pageName: 'E-Commerce Storefront',
      description: 'Step 1: Storefront customer adds 2 items to cart and proceeds to checkout.\nStep 2: Enter shipping address and choose Razorpay Prepaid.\nStep 3: Complete test payment in Razorpay modal (using test card/UPI).\nStep 4: Verify order confirmation screen.',
      expectedResult: 'Payment captured successfully. Order created with order_status = "confirmed", payment_status = "paid". Customer redirected to order success page showing Order #, tracking link, and estimated delivery.'
    },
    {
      testId: 'TC-ORD-002',
      pageName: 'E-Commerce Storefront',
      description: 'Step 1: Customer selects Cash on Delivery (COD) at checkout.\nStep 2: Review shipping fee threshold (free above configured amount, else ₹49 COD/shipping fee added).\nStep 3: Click "Place Order".',
      expectedResult: 'Order created with order_status = "confirmed", payment_status = "pending", payment_method = "cod". Inventory reserved/deducted immediately. Shipping fee applied accurately per tenant settings.'
    },
    {
      testId: 'TC-ORD-003',
      pageName: 'Order Management',
      description: 'Step 1: Warehouse manager opens Workspace -> Order Management.\nStep 2: Locate new confirmed order.\nStep 3: Click "Mark as Packed" -> Verify packing slips generated and status updates to "packed".',
      expectedResult: 'Order status transitions to "packed". Inventory items marked allocated. Audit status history logs staff username and timestamp.'
    },
    {
      testId: 'TC-ORD-004',
      pageName: 'Order Management',
      description: 'Step 1: For order in "packed" status, click "Ship Order" / "Generate Shipment".\nStep 2: Courier adapter queries tenant credentials (Shiprocket/Delhivery) and item dimensions (L*W*H/5000 vs dead weight).\nStep 3: Inspect created shipment record.',
      expectedResult: 'AWB number generated (or simulated test AWB in dev). Record inserted in online_order_deliveries with awb_number, courier_partner, tracking_url, shipping_label_url, and volumetric weight. Order status transitions to "shipped".'
    },
    {
      testId: 'TC-ORD-005',
      pageName: 'API / Postman Security',
      description: 'Step 1: Simulate carrier webhook POST /api/[company]/ecom/webhooks/delivery/shiprocket with payload: { current_status: "PICKED UP", awb: "<AWB>" }.\nStep 2: Sign request with valid HMAC SHA256 header.\nStep 3: Check order status in DB and customer tracking page.',
      expectedResult: 'Webhook verified and processed (HTTP 200). OrderStateMachine transitions delivery_status to "picked_up" and order_status to "shipped". Chronological event logged in online_order_status_history.'
    },
    {
      testId: 'TC-ORD-006',
      pageName: 'API / Postman Security',
      description: 'Step 1: Send carrier webhook with status "DELIVERED" and delivery timestamp.\nStep 2: Verify customer order tracking timeline at /tanviboutique/track/<AWB> or /account/orders.\nStep 3: Resend identical webhook payload to test idempotency.',
      expectedResult: 'Delivery status transitions to "delivered" with confirmed delivery timestamp. Stepper shows 100% completed. Duplicate webhook recognized as idempotent checkpoint and dropped without error or duplicate history rows.'
    },
    {
      testId: 'TC-ORD-007',
      pageName: 'E-Commerce Storefront',
      description: 'Step 1: In Razorpay checkout modal, intentionally click "Cancel / Dismiss" or simulate payment failure.\nStep 2: Observe storefront checkout redirection and order state.\nStep 3: Click "Retry Payment" from payment-retry page.',
      expectedResult: 'Order marked with payment_status = "failed". Customer redirected to payment retry screen with explicit failure reason and one-click button to re-initiate payment without re-entering cart items.'
    },
    {
      testId: 'TC-ORD-008',
      pageName: 'Order Management',
      description: 'Step 1: Customer cancels an online order in "placed" or "confirmed" status before dispatch.\nStep 2: Merchant approves cancellation in Order Management.\nStep 3: Check stock ledger and payment refund trigger.',
      expectedResult: 'Order status transitions to "cancelled". Reserved items immediately credited back to stock ledger. Razorpay refund initiated if prepaid; audit log records cancellation note.'
    },
    {
      testId: 'TC-ORD-009',
      pageName: 'Order Management',
      description: 'Step 1: Simulate NDR (Non-Delivery Report) webhook from carrier: { status: "UNDELIVERED", reason: "Customer unavailable" }.\nStep 2: Observe warehouse delivery dashboard.\nStep 3: Send subsequent RTO (Return to Origin) confirmed webhook.',
      expectedResult: 'Order delivery_status updates to "failed_delivery" (NDR logged for re-attempt). Upon RTO confirmation, marked as "rto" without prematurely marking order "returned" until package physically received at warehouse.'
    },
    {
      testId: 'TC-ORD-010',
      pageName: 'Customer Tracking Portal',
      description: 'Step 1: Open public customer tracking page at /tanviboutique/track/<AWB_OR_ORDER_NO>.\nStep 2: Verify timeline stepper display: Placed -> Confirmed -> Packed -> Shipped -> Out for Delivery -> Delivered.\nStep 3: Click carrier AWB link.',
      expectedResult: 'Public-safe tracking metadata displays correct carrier name, clickable AWB tracking URL, live status pill, and timestamped milestone history. No internal staff notes or customer payment credentials exposed.'
    },

    // ==========================================
    // MODULE E: MULTI-CUSTOMER & BULK OPERATIONS (TC-BULK)
    // ==========================================
    {
      testId: 'TC-BULK-001',
      pageName: 'E-Commerce Storefront',
      description: 'Step 1: Set stock for SKU "FESTIVE-KURTI-M" to exactly 5 units.\nStep 2: Use 8 distinct customer browser sessions (incognito/different profiles).\nStep 3: All 8 customers add 1 unit to cart and trigger checkout simultaneously within a 3-second window.\nStep 4: Monitor database transaction handling.',
      expectedResult: 'Exactly 5 orders succeed with confirmed status and payment authorizations. Remaining 3 customers receive clear "Item sold out during checkout" notification. Stock level reaches exactly 0 without negative inventory.'
    },
    {
      testId: 'TC-BULK-002',
      pageName: 'Sales Billing',
      description: 'Step 1: On POS Sales Billing counter, scan 40 distinct items in rapid succession (simulating peak festival rush).\nStep 2: Verify UI table responsiveness, scroll performance, and live calculation.\nStep 3: Complete sale with mixed cash & card.',
      expectedResult: 'POS interface remains completely fluid with 0 UI lag or input drops. Cart summary updates totals instantly. Invoice generated with all 40 line items and stock ledger debited accurately for each SKU.'
    },
    {
      testId: 'TC-BULK-003',
      pageName: 'Bulk Order Processing',
      description: 'Step 1: In Workspace -> Order Management, filter orders by status "packed".\nStep 2: Select "Select All" master checkbox (selecting 20+ packed orders).\nStep 3: Observe floating bottom bulk dock -> Click "Generate Shipments" (Bulk Ship).\nStep 4: Monitor progress indicator.',
      expectedResult: 'Bulk ship route executes in concurrency chunks of 5 using Promise.allSettled. AWBs assigned for all valid orders. Results drawer displays success count and list of generated AWBs.'
    },
    {
      testId: 'TC-BULK-004',
      pageName: 'Bulk Order Processing',
      description: 'Step 1: In Order Management, select 15 shipped orders.\nStep 2: Click "Print Selected Labels" on floating bulk action toolbar.\nStep 3: Verify browser print stream output.',
      expectedResult: 'Bulk print endpoint returns merged PDF label stream or opens printable shipping labels in a single tab ready for thermal label printing without requiring 15 separate popup dialogues.'
    },
    {
      testId: 'TC-BULK-005',
      pageName: 'Bulk Order Processing',
      description: 'Step 1: Select 10 orders ready for carrier handover.\nStep 2: Click "Generate Manifest" on floating action dock.\nStep 3: Verify generated manifest document.',
      expectedResult: 'Manifest API calls courier adapter generateManifest(), saves manifest_id to online_order_deliveries, and downloads official courier handover manifest PDF containing AWB barcode list and total packet count.'
    },
    {
      testId: 'TC-BULK-006',
      pageName: 'Bulk Order Processing',
      description: 'Step 1: Include 1 order with an invalid delivery pincode (e.g. 000000) inside a batch of 10 bulk ship orders.\nStep 2: Execute "Generate Shipments".\nStep 3: Inspect results summary drawer.',
      expectedResult: '9 valid orders successfully generate AWBs and transition to "shipped". 1 invalid order fails gracefully without rolling back the other 9. Drawer displays exact failure reason ("Invalid Pincode") and provides a "Retry Failed" action.'
    },
    {
      testId: 'TC-BULK-007',
      pageName: 'Inventory / Product Excel',
      description: 'Step 1: Download Product Excel Import template from /workspace/inventory/products.\nStep 2: Fill template with 50 new products including variant attributes, barcodes, and initial stock quantities (Warehouse + Locator).\nStep 3: Upload and commit import.',
      expectedResult: 'Excel validated without errors. Products, variants, and colors created in database. Opening stock document automatically posted to stock ledger with status "Entered", establishing initial on-hand balance.'
    },
    {
      testId: 'TC-BULK-008',
      pageName: 'Inventory / Image Master',
      description: 'Step 1: Upload batch of 30 product images to Image Master V2.\nStep 2: Click "Auto-Match by SKU" -> Preview matched filenames to existing SKUs/barcodes.\nStep 3: Click "Confirm & Link".',
      expectedResult: 'System matches images by exact SKU, barcode, and _1/-1 variant image suffixes. Links 30 images to target product variant galleries, marking primary images where missing, and updating status to "linked".'
    },

    // ==========================================
    // MODULE F: POSTMAN & API SECURITY (TC-API)
    // ==========================================
    {
      testId: 'TC-API-001',
      pageName: 'API / Postman Security',
      description: '[POSTMAN] Send GET request to internal workspace endpoint /api/tanviboutique/ecom/orders/bulk-ship using an Authorization: Bearer <Customer_Token> or customer session cookie header.',
      expectedResult: 'HTTP 401 Unauthorized or HTTP 403 Forbidden. Server-side session verification detects missing staff role and strictly blocks access without leaking order data.'
    },
    {
      testId: 'TC-API-002',
      pageName: 'API / Postman Security',
      description: '[POSTMAN] Send POST /api/tanviboutique/ecom/checkout with tampered body payload: { items: [{ variant_id: 101, price: 1.00, qty: 5 }] }, where actual catalog price is ₹1,499.00.',
      expectedResult: 'Server rejects client-submitted prices. Server queries database variant pricing directly and computes total amount using official DB landed rate + taxes. Client price tampering is completely nullified.'
    },
    {
      testId: 'TC-API-003',
      pageName: 'API / Postman Security',
      description: '[POSTMAN] Send POST /api/tanviboutique/ecom/checkout with negative and zero quantity payload: { items: [{ variant_id: 101, qty: -2 }, { variant_id: 102, qty: 0 }] }.',
      expectedResult: 'HTTP 400 Bad Request. Validation schema catches invalid quantities and returns "Quantity must be a positive integer" without creating order records or database corruption.'
    },
    {
      testId: 'TC-API-004',
      pageName: 'API / Postman Security',
      description: '[POSTMAN] Setup Postman Collection Runner with 10 iterations concurrently targeting POST /api/tanviboutique/ecom/checkout for variant_id 205 (which has stock = 1).',
      expectedResult: 'PostgreSQL row-level locking (SELECT ... FOR UPDATE) ensures serial execution. Exactly 1 request receives HTTP 200 Order Created. Remaining 9 requests receive HTTP 400 / 409 "Insufficient inventory". Negative stock is impossible.'
    },
    {
      testId: 'TC-API-005',
      pageName: 'API / Postman Security',
      description: '[POSTMAN] Send forged POST /api/tanviboutique/ecom/webhooks/delivery/shiprocket with arbitrary status update { current_status: "DELIVERED" } using an invalid or missing x-shiprocket-signature header.',
      expectedResult: 'HTTP 401 Unauthorized. Server validates HMAC-SHA256 signature against tenant decrypted webhook secret. Forged webhook is rejected and logged as security warning.'
    },
    {
      testId: 'TC-API-006',
      pageName: 'API / Postman Security',
      description: '[POSTMAN] Send POST /api/tanviboutique/ecom/payment/verify with forged razorpay_signature hash not matching razorpay_order_id|razorpay_payment_id.',
      expectedResult: 'HTTP 400 / 403 Verification Failed. crypto.timingSafeEqual comparison fails; order payment_status remains "failed" / "pending" and subscription or order is never marked paid.'
    },
    {
      testId: 'TC-API-007',
      pageName: 'API / Postman Security',
      description: '[POSTMAN] Send GET /api/products?search=\' OR 1=1 -- and parameter injection payloads in tenant header: x-tenant: \'; DROP TABLE companies; --.',
      expectedResult: 'HTTP 400 or safe parameterized search result. Database queries use parameterized queries ($1, $2) and strict schema validation regex. SQL injection fails completely.'
    },
    {
      testId: 'TC-API-008',
      pageName: 'API / Postman Security',
      description: '[POSTMAN] Verify stock ledger integrity API: Query GET /api/tanviboutique/workspace/reports/stock-ledger?sku=TSHIRT-BLK-L after running 10 POS sales and 5 online checkouts.',
      expectedResult: 'Sum of Opening Stock + Inward GRN - Outward Sales = Current On-Hand Balance. Every invoice number links to a corresponding credit entry with exact timestamp and user ID.'
    }
  ];

  // Add rows with clean formatting
  testCases.forEach((tc, index) => {
    const row = worksheet.addRow({
      testId: tc.testId,
      pageName: tc.pageName,
      description: tc.description,
      expectedResult: tc.expectedResult,
      actualResult: '',
      status: ''
    });

    row.height = 72; // Generous height for readability
    row.font = { name: 'Calibri', size: 10 };
    row.alignment = { vertical: 'top', wrapText: true };

    // Row borders
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };

      // Zebra striping for even rows
      if (index % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' } // Slate 50
        };
      }

      // Center Test ID and Status
      if (colNumber === 1 || colNumber === 6) {
        cell.alignment = { vertical: 'top', horizontal: 'center' };
      }
    });

    // Make Test ID bold
    row.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } };
  });

  // Add Data Validation dropdown on Status column (Column F: F2:F<lastRow>)
  const totalRows = testCases.length + 1;
  for (let r = 2; r <= totalRows; r++) {
    const statusCell = worksheet.getCell(`F${r}`);
    statusCell.dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Pass,Fail,Blocked,N/A"'],
      showErrorMessage: true,
      errorTitle: 'Invalid Status',
      error: 'Please choose Pass, Fail, Blocked, or N/A'
    };
  }

  const outputPath = path.resolve(process.cwd(), 'DigiStorii_POS_Ecom_Test_Suite.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Successfully generated: ${outputPath}`);
}

generateTestSuite().catch((err) => {
  console.error('Failed to generate test suite:', err);
  process.exit(1);
});

