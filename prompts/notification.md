## 1. Goal

- `product_variant.low_stock_threshold` and `backorders_allowed` currently just sit in the DB with hardcoded defaults. We want:
  1. Extend the **existing** `business_settings` table with a store-wide default low stock threshold, default backorders-allowed value, and notification enable/allocation — not a new table.
  2. `low_stock_threshold` / `backorders_allowed` on `product_variant` stay **fully optional** — nothing forces every product to define them. They're edited per-variant only if the user opens that variant's form and chooses to override the store default. `NULL` = "use the business default."
  3. Stock is **not** a column on `product_variant` — it's derived from `stock_ledger` via the `current_stock` view (`qty_in - qty_out`, grouped by `tenant_id, warehouse_id, locator_id, product_id`, where `product_id` = the variant's id). The low-stock check has to run against this view/ledger, not against a `quantity` field.
  4. When a variant's effective current stock drops to/below its effective threshold, the system fires an **in-app notification** to a configurable set of users (allocated from the Business Configuration page).
  5. Notifications support: real-time delivery (socket), a bell/inbox UI, mark-as-read, and a history of previous notifications.

---

## 2. Database schema

### 2.1 `business_settings` — extend the existing table, don't create a new one

```sql
ALTER TABLE "${schema}".business_settings
  ADD COLUMN IF NOT EXISTS default_low_stock_threshold INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS default_backorders_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS low_stock_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
```

Everything else about the business (GST, PAN, address, currency, invoice prefix, etc.) is untouched — this just adds the inventory-alert defaults to the same single settings row.

### 2.2 `product_variant` — keep as fully optional, per-variant override

If `low_stock_threshold` / `backorders_allowed` don't exist yet on `product_variant`, add them as **nullable, no default** — never force a value:

```sql
ALTER TABLE "${schema}".product_variant
  ADD COLUMN IF NOT EXISTS low_stock_threshold INT,          -- NULL = inherit business default
  ADD COLUMN IF NOT EXISTS backorders_allowed BOOLEAN,        -- NULL = inherit business default
  ADD COLUMN IF NOT EXISTS last_low_stock_notified_at TIMESTAMPTZ; -- debounce tracker, see §3.2
```

Effective value at check time = `COALESCE(variant.low_stock_threshold, business_settings.default_low_stock_threshold)` (same pattern for `backorders_allowed`). `NULL` = "inherit from business config" (the common case — most products don't need to touch this); a non-null value = an explicit override the user typed into that one variant's form. In the UI this is an opt-in: e.g. a collapsed "Advanced / override defaults" toggle on the variant form, not two fields shown-and-required on every product.

### 2.3 `notification_subscriptions` — who should get which alert type

```sql
CREATE TABLE notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,       -- 'low_stock', 'backorder', etc.
  user_id UUID NOT NULL REFERENCES users(id),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_type, user_id)
);
```

This is what powers the "select which users get this notification" requirement in the Business Configuration UI — a multi-select of users tied to `event_type = 'low_stock'`.

### 2.4 `notifications` — the actual notification records (event, not per-user)

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,             -- 'low_stock'
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,                        -- {variant_id, product_id, sku, current_qty, threshold}
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.5 `notification_recipients` — fan-out / per-user read state

```sql
CREATE TABLE notification_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (notification_id, user_id)
);
CREATE INDEX idx_notif_recipients_user_unread ON notification_recipients (user_id, is_read);
```

This split (`notifications` = the event, `notification_recipients` = per-user inbox state) is what gives you "previous notifications" history per user, unread counts, and mark-as-read, without duplicating the message text per user.

---

## 3. Backend logic

### 3.1 Effective threshold resolver

```
function getEffectiveStockConfig(variant, businessSettings) {
  return {
    lowStockThreshold: variant.low_stock_threshold ?? businessSettings.default_low_stock_threshold,
    backordersAllowed: variant.backorders_allowed ?? businessSettings.default_backorders_allowed,
  };
}
```

Use this everywhere stock decisions are made (checkout, inventory adjustment, order fulfillment).

### 3.2 Stock-change hook (trigger point)

Stock has no column to watch — it's computed from `stock_ledger` via the `current_stock` view. So the hook fires **after any insert into `stock_ledger`** (order fulfillment writing `qty_out`, purchase receipt / return writing `qty_in`, manual adjustment, import), for the affected `(tenant_id, product_id)`:

1. Compute the variant's **current stock**. Decide once, up front, whether low-stock is evaluated:
   - **Aggregated across all warehouses/locators for that variant** (recommended default — matches how most storefronts show "in stock"):
     ```sql
     SELECT COALESCE(SUM(qty_in) - SUM(qty_out), 0) AS current_stock
     FROM "${schema}".stock_ledger
     WHERE tenant_id = $1 AND product_id = $2;
     ```
   - or **per warehouse/locator** (needed only if you alert warehouse managers separately) — same query but keep the `GROUP BY warehouse_id, locator_id` and check each row against the threshold individually. Flag this to your team if you need per-warehouse alerting; the rest of this spec assumes the aggregated total.
2. Load the variant row and `business_settings`, compute `effective = getEffectiveStockConfig(variant, businessSettings)`.
3. If `current_stock <= effective.lowStockThreshold` AND `business_settings.low_stock_notifications_enabled` is true:
   - Debounce: skip if `variant.last_low_stock_notified_at` is within the last 24h (configurable) so a low-stock item doesn't re-alert on every single order.
   - Insert one row into `notifications` (type `low_stock`, metadata = `{variant_id, product_id, sku, current_stock, threshold}`).
   - Look up recipients: `SELECT user_id FROM notification_subscriptions WHERE event_type='low_stock' AND enabled=true` — this is the "notification allocation" list the Business Configuration page manages.
   - Insert one `notification_recipients` row per recipient.
   - Update `product_variant.last_low_stock_notified_at = now()`.
   - Emit the notification over the socket to each recipient (see §4).
4. If `current_stock > effective.lowStockThreshold`, reset `last_low_stock_notified_at = NULL` so a future dip re-alerts.
5. If `current_stock <= 0` and `!effective.backordersAllowed`, block further sale (existing out-of-stock logic) — `backordersAllowed` doesn't change the notification, only whether the item can still be sold at 0 stock.

Wire this as a small service function called right after every `stock_ledger` insert (not a DB trigger, unless you'd rather keep it in Postgres — either works, but an app-level hook is easier to unit test and to call the notification/socket layer from).

### 3.3 API endpoints

**Business configuration**
- `GET /api/business-settings` → current defaults + list of users subscribed to `low_stock`.
- `PUT /api/business-settings` → update `default_low_stock_threshold`, `default_backorders_allowed`, `low_stock_notifications_enabled`, and replace the `notification_subscriptions` rows for `event_type='low_stock'` with the submitted `user_ids[]`.

**Notifications**
- `GET /api/notifications?read=false&page=1&limit=20` → paginated list for the current user (join `notification_recipients` → `notifications`, ordered by `created_at DESC`). This is your "previous notifications" list.
- `GET /api/notifications/unread-count` → badge count.
- `PATCH /api/notifications/:id/read` → mark one as read.
- `PATCH /api/notifications/read-all` → mark all as read for current user.

---

## 4. Real-time delivery (socket)

Use Socket.IO (or native `ws`) with **per-user rooms**:

```js
// server, on connection
io.on('connection', (socket) => {
  const userId = authenticateSocket(socket); // from JWT/session
  socket.join(`user:${userId}`);
});

// when creating a notification for a recipient
io.to(`user:${recipientUserId}`).emit('notification:new', {
  id, type, title, message, metadata, created_at
});
```

Frontend:
```js
socket.on('notification:new', (n) => {
  // increment bell badge, prepend to in-memory list, optionally toast
});
```

Fallback: if socket is disconnected, the next `GET /api/notifications` / `unread-count` call on reconnect/page-load reconciles state — don't rely on sockets as the source of truth, treat them as a push hint to refetch or prepend.

---

## 5. Frontend

### 5.1 Business Configuration page — new section "Inventory Alerts"
- Number input: **Default low stock threshold** (bound to `default_low_stock_threshold`, replaces hardcoded 5).
- Toggle: **Allow backorders by default** (`default_backorders_allowed`).
- Toggle: **Enable low stock notifications** (`low_stock_notifications_enabled`).
- Multi-select user picker: **Notify these users on low stock** → writes to `notification_subscriptions`.
- Save button → `PUT /api/business-settings`.

### 5.2 Product Variant edit form
- Optional fields "Low stock threshold" and "Backorders allowed" with a placeholder/helper text like *"Leave blank to use store default (currently {default})"* — this makes the nullable-override pattern clear in the UI.

### 5.3 Notification bell (global header component)
- Bell icon + unread count badge (from `unread-count` endpoint, live-updated via socket).
- Dropdown: latest ~10 notifications, each with title/message/time, unread = bold/dot.
- "Mark all as read" action.
- "View all" → full notifications page with pagination = the **previous notifications** list, using `GET /api/notifications`.

---

## 6. Build order (suggested)

1. Migrations: alter `business_settings` (add defaults), alter `product_variant` (add nullable overrides), create `notification_subscriptions`, `notifications`, `notification_recipients`.
2. Backend: business-settings CRUD API + effective-config resolver util.
3. Backend: stock-change hook wired into existing inventory update paths, with debounce.
4. Backend: notifications list/read/unread-count APIs.
5. Socket server + per-user room join on auth.
6. Frontend: Business Configuration "Inventory Alerts" section.
7. Frontend: notification bell + full notifications page.
8. Wire socket client to bell for live updates; verify fallback via polling/refetch on reconnect.