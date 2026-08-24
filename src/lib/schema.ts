import { PoolClient } from "pg";
import { createMasterTables } from "./lib";
import { ensureCurrenciesSeeded } from "./currencySeed";
import { ensureLocationTableShape } from "./locationSchema";

/**
 * Creates isolated schema + base tables for a new company
 */
export async function createCompanySchema(
  client: PoolClient,
  rawSchema: string
) {
  console.log("Creating schema with name:", rawSchema);
  if (!rawSchema || typeof rawSchema !== "string") {
    throw new Error("Schema name is required.");
  }

  // Normalize input
  const schema = rawSchema.trim().toLowerCase();

  // Strict validation (PostgreSQL identifier rules)
  // Must start with letter, only lowercase/number/underscore, max 63 chars
  const schemaRegex = /^[a-z][a-z0-9_]{0,62}$/;
  if (!schemaRegex.test(schema)) {
    throw new Error(
      "Invalid schema name. Use lowercase letters, numbers, underscore only. Must start with a letter. Max 63 characters."
    );
  }

  // Block system schemas
  const reservedSchemas = new Set([
    "public",
    "pg_catalog",
    "information_schema",
    "pg_toast"
  ]);

  if (reservedSchemas.has(schema)) {
    throw new Error("Reserved schema name is not allowed.");
  }

  /* =========================================================
     CREATE SCHEMA
     ========================================================= */
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  // Security hardening (important for SaaS isolation)
  await client.query(`REVOKE ALL ON SCHEMA "${schema}" FROM PUBLIC`);

  // Ensure UUID generation is available for discount IDs
  await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  /* =========================================================
     CUSTOMERS
     ========================================================= */
  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".customers (
        id SERIAL PRIMARY KEY,
        cust_code VARCHAR(20) UNIQUE,
        cust_name VARCHAR(50) NOT NULL,
        name VARCHAR(50),
        email VARCHAR(50),
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT now(),
        CONSTRAINT unique_cust_email UNIQUE(email)
      );
    `);

  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".customer_addresses (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES "${schema}".customers(id) ON DELETE CASCADE,
        address_line1 VARCHAR(100),
        address_line2 VARCHAR(100),
        address_line3 VARCHAR(100),
        city VARCHAR(100),
        state VARCHAR(100),
        pincode VARCHAR(20),
        country VARCHAR(100),
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_customer_default_idx
      ON "${schema}".customer_addresses (customer_id)
      WHERE is_default;
    `);

  /* =========================================================
     SUPPLIERS
     ========================================================= */
  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".suppliers (
        id SERIAL PRIMARY KEY,
        supplier_code VARCHAR(20) UNIQUE,
        short_name VARCHAR(100) NOT NULL,
        supplier_name VARCHAR(200) NOT NULL,
        classification SMALLINT NOT NULL,
        introduced_date DATE,
        introduced_by VARCHAR(100),
        effective_from DATE,
        effective_to DATE,
        purchase_hold BOOLEAN DEFAULT FALSE,
        qc_required BOOLEAN DEFAULT FALSE,
        name VARCHAR(200),
        email VARCHAR(150),
        phone VARCHAR(20),
        address_line1 VARCHAR(50),
        address_line2 VARCHAR(50),
        address_line3 VARCHAR(50),
        city VARCHAR(100),
        state VARCHAR(100),
        pincode VARCHAR(20),
        country VARCHAR(100),
        website VARCHAR(200),
        linkedin VARCHAR(200),
        skype VARCHAR(200),
        dispatch_terms VARCHAR(100),
        payment_terms VARCHAR(100),
        currency VARCHAR(20),
        gstin VARCHAR(30),
        cin VARCHAR(30),
        bank_name VARCHAR(150),
        beneficiary_name VARCHAR(150),
        beneficiary_code VARCHAR(100),
        branch VARCHAR(150),
        ifsc_code VARCHAR(50),
        swift_code VARCHAR(50),
        contact_person1 VARCHAR(100),
        contact_phone1 VARCHAR(30),
        contact_email1 VARCHAR(150),
        contact_person2 VARCHAR(100),
        contact_phone2 VARCHAR(30),
        contact_email2 VARCHAR(150),
        contact_person3 VARCHAR(100),
        contact_phone3 VARCHAR(30),
        contact_email3 VARCHAR(150),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT now(),
        CONSTRAINT unique_supplier_email UNIQUE(email)
      );
    `);

  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".tax_master (
        id SERIAL PRIMARY KEY,
        tax_name VARCHAR(100) NOT NULL,
        total_percentage NUMERIC(5,2) NOT NULL CHECK (total_percentage >= 0),
        effective_from DATE NOT NULL,
        effective_to DATE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".tax_component (
        id SERIAL PRIMARY KEY,
        tax_master_id INT NOT NULL
          REFERENCES "${schema}".tax_master(id) ON DELETE CASCADE,
        component_name VARCHAR(20) NOT NULL,
        component_percentage NUMERIC(5,2) NOT NULL CHECK (component_percentage >= 0),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".uom (
        id SERIAL PRIMARY KEY,
        uom_code VARCHAR(30) NOT NULL UNIQUE,
        uom_name VARCHAR(120) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".currencies (
        id SERIAL PRIMARY KEY,
        currency_code VARCHAR(10) UNIQUE NOT NULL,
        currency_name VARCHAR(120) NOT NULL
      );
    `);
  await client.query(`
    CREATE TABLE "${schema}".currency_rates (
    id SERIAL PRIMARY KEY,
    currency_id INT NOT NULL
        REFERENCES "${schema}".currencies(id)
        ON DELETE CASCADE,
    country VARCHAR(100),
    region VARCHAR(50),
    conversion_rate NUMERIC NOT NULL CHECK (conversion_rate >= 0),
    created_by VARCHAR(100),
    created_at TIMESTAMP,
    updated_by VARCHAR(100),
    updated_at TIMESTAMP,
    UNIQUE (currency_id)
    );
  `);

  await client.query(`
  CREATE TABLE "${schema}".company_settings (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL,              
  base_currency VARCHAR(10) NOT NULL,
  date_format VARCHAR(20) ,
  time_zone VARCHAR(50) ,
  financial_year_start DATE,
  financial_year_end DATE,
  sales_target NUMERIC DEFAULT 0,
  created_by VARCHAR(100),
  created_at TIMESTAMP ,
  updated_by VARCHAR(100),
  updated_at TIMESTAMP ,
  CONSTRAINT unique_company UNIQUE (company_id)
);
`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".business_settings (
      id SERIAL PRIMARY KEY,
      gst_number VARCHAR(20),
      gst_available BOOLEAN NOT NULL DEFAULT FALSE,
      pan_number VARCHAR(20),
      business_address TEXT,
      city VARCHAR(120),
      state VARCHAR(120),
      country VARCHAR(120),
      currency VARCHAR(20),
      timezone VARCHAR(80),
      invoice_prefix VARCHAR(20),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await ensureCurrenciesSeeded(client, schema);

  /* =========================================================
     PAYMENT TERMS MASTER
     ========================================================= */
  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".payment_terms (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        type VARCHAR(20) NOT NULL CHECK (type IN ('immediate', 'days', 'month')),
        days INT NULL CHECK (days IS NULL OR (days >= 1 AND days <= 30)),
        month INT NULL CHECK (month IS NULL OR (month >= 1 AND month <= 30)),
        description TEXT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT payment_terms_type_value_chk CHECK (
          (type = 'immediate' AND days IS NULL AND month IS NULL) OR
          (type = 'days' AND days IS NOT NULL AND month IS NULL) OR
          (type = 'month' AND month IS NOT NULL AND days IS NULL)
        )
      );
    `);

  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".payment_modes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_payment_modes_name UNIQUE (name)
      );
    `);

  /* =========================================================
     CATEGORY MASTER
     ========================================================= */
  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".product_categories (
        id BIGSERIAL PRIMARY KEY,
        category_name VARCHAR(150) NOT NULL,
        parent_id BIGINT NULL REFERENCES "${schema}".product_categories(id) ON DELETE CASCADE,
        level INT DEFAULT 1,
        path_string TEXT,
        path_ids TEXT,
        inactive_date DATE NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_cat_path_string
    ON "${schema}".product_categories (path_string);
  `);

  /* =========================================================
     PRODUCT MATERIALS
     ========================================================= */
  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".product_materials (
        id SERIAL PRIMARY KEY,
        material_code VARCHAR(20) NOT NULL,
        material_name VARCHAR(150) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
       `);
  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".product_fittings (
        id SERIAL PRIMARY KEY,
        fitting_name VARCHAR(150) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
       `);
  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".product_colors (
        id SERIAL PRIMARY KEY,
        color_name VARCHAR(150) NOT NULL UNIQUE,
        hex_code VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

  /* =========================================================
     DESPATCH TERMS MASTER
     ========================================================= */
  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".despatch_terms (
        id SERIAL PRIMARY KEY,
        code VARCHAR(30) NOT NULL UNIQUE,
        despatch_name VARCHAR(150) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

  /* =========================================================
     PRODUCTS
     ========================================================= */
  await client.query(`
CREATE TABLE IF NOT EXISTS "${schema}".products (
  id BIGSERIAL PRIMARY KEY,
  product_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  material VARCHAR(50),
  uom VARCHAR(20),
  hsn_code VARCHAR(20),
  weight NUMERIC(10,2),
  length NUMERIC(10,2),
  width NUMERIC(10,2),
  height NUMERIC(10,2),
  type VARCHAR(20) NOT NULL DEFAULT 'finished_good' CHECK (type IN ('finished_good', 'raw_material', 'other')),
  source VARCHAR(20) NOT NULL DEFAULT 'own' CHECK (source IN ('own', 'vendor')),
  status SMALLINT NOT NULL DEFAULT 1 CHECK (status IN (1, 2)), -- 1=active, 2=inactive
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`);

  await client.query(`
CREATE TABLE IF NOT EXISTS "${schema}".product_variants (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES "${schema}".products(id) ON DELETE CASCADE,
  color_id BIGINT REFERENCES "${schema}".product_colors(id) ON DELETE SET NULL,
  size VARCHAR(30),
  fitting_id BIGINT REFERENCES "${schema}".product_fittings(id) ON DELETE SET NULL,
  gender VARCHAR(20) CHECK (gender IN ('Male', 'Female', 'Transgender', 'Not Specified')),
  sku VARCHAR(120) NOT NULL UNIQUE,
  qty INT NOT NULL DEFAULT 0,
  low_stock_threshold INT DEFAULT 5,
  backorders_allowed BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  barcode VARCHAR(40),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT product_variants_status_chk
  CHECK (status IN ('draft', 'active', 'inactive')),
  CONSTRAINT unique_variant_barcode UNIQUE (barcode),
  CONSTRAINT unique_variant_combination
  UNIQUE (product_id, color_id, size)
);
`);

  await client.query(`
    UPDATE "${schema}".product_variants v
    SET status = CASE
      WHEN p.status = 2 THEN 'inactive'
      ELSE 'draft'
    END
    FROM "${schema}".products p
    WHERE v.product_id = p.id
      AND v.status NOT IN ('active', 'inactive');
  `);
  await client.query(`
    UPDATE "${schema}".product_variants
    SET barcode = CONCAT('INT', LPAD(id::text, 10, '0'))
    WHERE barcode IS NULL OR barcode = '';
  `);
  await client.query(`
CREATE INDEX IF NOT EXISTS idx_variants_product
ON "${schema}".product_variants(product_id);
`);
  await client.query(`
CREATE INDEX IF NOT EXISTS idx_variants_barcode
ON "${schema}".product_variants(barcode);
`);



  await client.query(`
CREATE INDEX IF NOT EXISTS idx_variants_size
ON "${schema}".product_variants(size);
`);

  await client.query(`
CREATE INDEX IF NOT EXISTS idx_variants_status
ON "${schema}".product_variants(status);
`);

  /* =========================================================
     IMAGE MASTER (staged uploads)
     ========================================================= */
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".image_master (
      id BIGSERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      file_path VARCHAR(500) NOT NULL,
      file_hash VARCHAR(64),
      category_id BIGINT REFERENCES "${schema}".product_categories(id),
      material_id INT REFERENCES "${schema}".product_materials(id),
      uom_id INT REFERENCES "${schema}".uom(id),
      source VARCHAR(20) CHECK (source IN ('vendor','own')),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
CREATE TABLE IF NOT EXISTS "${schema}".product_images (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL  REFERENCES "${schema}".products(id) ON DELETE CASCADE,
  variant_id BIGINT REFERENCES "${schema}".product_variants(id)  ON DELETE SET NULL,
  image_id BIGINT REFERENCES "${schema}".image_master(id) ON DELETE SET NULL,
  image_url VARCHAR(500) NOT NULL,
  alt_text VARCHAR(100),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".product_pricing (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(40) NOT NULL,
      product_id BIGINT NOT NULL REFERENCES "${schema}".products(id) ON DELETE RESTRICT,
      variant_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE RESTRICT,
      source_type VARCHAR(10) NOT NULL DEFAULT 'own' CHECK (source_type IN ('vendor', 'own')),
      base_cost NUMERIC(12,2) NOT NULL CHECK (base_cost >= 0),
      operational_cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (operational_cost >= 0),
      landed_price NUMERIC(12,2) NOT NULL CHECK (landed_price >= 0),
      margin_type VARCHAR(10) NOT NULL DEFAULT 'percentage' CHECK (margin_type IN ('percentage','amount')),
      margin_value NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (margin_value >= 0),
      margin_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (margin_amount >= 0),
      unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
      tax_percent NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
      tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
      final_selling_price NUMERIC(12,2) NOT NULL CHECK (final_selling_price >= 0),
      active_from DATE NOT NULL DEFAULT CURRENT_DATE,
      expires_at TIMESTAMP NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_product_pricing_active_per_variant
      ON "${schema}".product_pricing(tenant_id, variant_id)
      WHERE is_active = TRUE;
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_product_pricing_variant_history
      ON "${schema}".product_pricing(variant_id, created_at DESC);
  `);/* =========================================================
       INVENTORY
       ========================================================= */
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".discounts (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
      value NUMERIC(12,2) NOT NULL CHECK (value >= 0),
      coupon_code VARCHAR(100) UNIQUE,
      priority INTEGER NOT NULL DEFAULT 1,
      starts_at TIMESTAMP,
      ends_at TIMESTAMP,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".discount_variants (
      discount_id BIGINT NOT NULL REFERENCES "${schema}".discounts(id) ON DELETE CASCADE,
      variant_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
      PRIMARY KEY (discount_id, variant_id)
    );
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_discount_variants_variant
      ON "${schema}".discount_variants(variant_id);
  `);
  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".inventory (
        id SERIAL PRIMARY KEY,
        item_code VARCHAR(50) NOT NULL,
        category VARCHAR(100),
        brand VARCHAR(100),
        barcode VARCHAR(100),
        unit VARCHAR(20) NOT NULL DEFAULT 'PCS',
        hsn_code VARCHAR(20),
        purchase_price NUMERIC(15,2) NOT NULL DEFAULT 0,  -- Finance
        selling_price NUMERIC(15,2) NOT NULL DEFAULT 0, -- Ecommerce
        tax_master_id INTEGER
          REFERENCES "${schema}".tax_master(id)
          ON DELETE SET NULL,
        discount_percentage NUMERIC(5,2) DEFAULT 0,
        opening_stock NUMERIC(15,2) NOT NULL DEFAULT 0,
        current_stock NUMERIC(15,2) NOT NULL DEFAULT 0,
        min_stock_level NUMERIC(15,2) DEFAULT 0,
        warehouse VARCHAR(100),
        location VARCHAR(100),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT unique_item_code UNIQUE(item_code)
      );
    `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".locations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(20) NOT NULL CHECK (type IN ('global', 'local')),
      inactive_date DATE,
      is_default BOOLEAN DEFAULT FALSE,
      same_as_registered BOOLEAN DEFAULT FALSE,
      same_as_bill_to BOOLEAN DEFAULT FALSE,
      description TEXT,
      registered_address_line_1 TEXT,
      registered_address_line_2 TEXT,
      registered_country VARCHAR(120),
      registered_state VARCHAR(120),
      registered_city VARCHAR(120),
      registered_pincode VARCHAR(20),
      bill_address_line_1 TEXT,
      bill_address_line_2 TEXT,
      bill_country VARCHAR(120),
      bill_state VARCHAR(120),
      bill_city VARCHAR(120),
      bill_pincode VARCHAR(20),
      ship_address_line_1 TEXT,
      ship_address_line_2 TEXT,
      ship_country VARCHAR(120),
      ship_state VARCHAR(120),
      ship_city VARCHAR(120),
      ship_pincode VARCHAR(20),
      landline VARCHAR(30),
      mobile VARCHAR(30),
      fax VARCHAR(30),
      email VARCHAR(150),
      contact_person VARCHAR(150),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await ensureLocationTableShape(client, schema);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".warehouses (
      id SERIAL PRIMARY KEY,
      code VARCHAR(30) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      location_id INT NOT NULL REFERENCES "${schema}".locations(id) ON DELETE RESTRICT,
      type VARCHAR(20) NOT NULL CHECK (type IN ('global', 'local')),
      is_default BOOLEAN DEFAULT FALSE,
      same_as_ship_to BOOLEAN DEFAULT TRUE,
      effective_from DATE,
      effective_to DATE,
      description TEXT,
      landline VARCHAR(30),
      mobile_no VARCHAR(30),
      fax VARCHAR(30),
      email VARCHAR(150),
      address_line_1 TEXT,
      address_line_2 TEXT,
      city VARCHAR(100),
      state VARCHAR(100),
      country VARCHAR(100) DEFAULT 'India',
      pincode VARCHAR(10),
      contact_person_name VARCHAR(150),
      contact_person_mobile VARCHAR(30),
      contact_person_email VARCHAR(150),
      pan VARCHAR(30),
      gstin VARCHAR(30),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".locators (
      id SERIAL PRIMARY KEY,
      locator_name VARCHAR(120) NOT NULL,
      row VARCHAR(20) NOT NULL,
      rack VARCHAR(20) NOT NULL,
      bin VARCHAR(20) NOT NULL,
      effective_from DATE,
      effective_to DATE,
      warehouse_id INT NOT NULL REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      type VARCHAR(30) NOT NULL CHECK (type IN (
        'receiving',
        'main_storage',
        'bulk_storage',
        'despatch',
        'return_area',
        'scrap'
      )),
      max_qty NUMERIC(12,2) DEFAULT 0,
      current_qty NUMERIC(12,2) DEFAULT 0,
      suggested_qty NUMERIC(12,2) DEFAULT 0,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  /* =========================================================
     PURCHASES
     ========================================================= */
  await client.query(`
        CREATE TABLE IF NOT EXISTS "${schema}".purchase_header (
          id SERIAL PRIMARY KEY,
          po_type VARCHAR(20) NOT NULL DEFAULT 'standard'
            CHECK (po_type IN ('standard', 'manual')),
          purchase_no VARCHAR(30) UNIQUE NOT NULL,  
          ref_no VARCHAR(30),
          bill_to TEXT,
          ship_to TEXT,
          despatch_terms BIGINT,
          payment_terms BIGINT,
          freight_charges NUMERIC(10,2) DEFAULT 0,
          freight_tax NUMERIC(10,2) DEFAULT 0,
          freight_tax_amount NUMERIC(10,2) DEFAULT 0,
          packaging_amount NUMERIC(10,2) DEFAULT 0,
          notes TEXT,
          attachment_url TEXT,
          supplier_id INTEGER NOT NULL
          REFERENCES "${schema}".suppliers(id) ON DELETE CASCADE,
          purchase_date DATE NOT NULL,
          req_date DATE,
          currency INTEGER,
          conversion_rate NUMERIC(18,6) DEFAULT 0,
          approval_status VARCHAR(50) DEFAULT 'Awaiting for approval',
          status VARCHAR(50) DEFAULT 'Entered',
          reject_reason TEXT,
          subtotal NUMERIC(12,2) DEFAULT 0,
          tax_amount NUMERIC(12,2) DEFAULT 0,
          total_amount NUMERIC(12,2) DEFAULT 0,
          renewed_from_po_id INT NULL
          REFERENCES "${schema}".purchase_header(id) ON DELETE SET NULL,
          created_by VARCHAR(100),
          created_at TIMESTAMP,
          updated_by VARCHAR(100),
          updated_at TIMESTAMP
        );
      `)



  await client.query(`
        CREATE TABLE IF NOT EXISTS "${schema}".purchase_detail (
          id SERIAL PRIMARY KEY,
          purchase_id INT NOT NULL REFERENCES "${schema}".purchase_header(id) ON DELETE CASCADE,
          product_id BIGINT NOT NULL
          REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
          UOM VARCHAR(20),
          HSN_NO VARCHAR(20),
          rate NUMERIC(12,2) NOT NULL DEFAULT 0,
          qty NUMERIC(12,2) NOT NULL DEFAULT 0,
          tax_master_id INT
          REFERENCES "${schema}".tax_master(id) ON DELETE CASCADE,
          tax_amount NUMERIC(12,2) DEFAULT 0,
          extra_cost_allocated NUMERIC(12,2) DEFAULT 0,
          line_total NUMERIC(12,2) DEFAULT 0,
          created_by VARCHAR(100),
          created_at TIMESTAMP,
          updated_by VARCHAR(100),
          updated_at TIMESTAMP
        );
      `)


  await client.query(`
        CREATE TABLE IF NOT EXISTS "${schema}".grn_header (
          id SERIAL PRIMARY KEY,
          grn_no VARCHAR(30) UNIQUE NOT NULL,
          grn_date DATE NOT NULL,
          purchase_id INT NOT NULL REFERENCES "${schema}".purchase_header(id) ON DELETE CASCADE,
          supplier_id INTEGER NOT NULL
          REFERENCES "${schema}".suppliers(id) ON DELETE CASCADE,
          status VARCHAR(20) DEFAULT 'Entered',
          po_status VARCHAR(20),
          created_by VARCHAR(100),
          created_date TIMESTAMP,
          updated_by VARCHAR(100),
          updated_date TIMESTAMP
        );
      `);

  await client.query(`
        CREATE TABLE IF NOT EXISTS "${schema}".grn_detail (
          id SERIAL PRIMARY KEY,
          grn_id INT NOT NULL REFERENCES "${schema}".grn_header(id) ON DELETE CASCADE,
          product_id BIGINT NOT NULL
          REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
          warehouse_id INT NOT NULL REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
          locator_id INT NOT NULL REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
          UOM VARCHAR(20),
          HSN_NO VARCHAR(20),
          order_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
          received_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
          qty NUMERIC(12,2) NOT NULL DEFAULT 0,
          created_by VARCHAR(100),
          created_date TIMESTAMP,
          updated_by VARCHAR(100),
          updated_date TIMESTAMP
        );
      `);
  await client.query(`
        CREATE TABLE IF NOT EXISTS "${schema}".sales_header (
          id SERIAL PRIMARY KEY,
          sales_no VARCHAR(30) UNIQUE NOT NULL,  
          customer_id INTEGER NOT NULL
          REFERENCES "${schema}".customers(id) ON DELETE CASCADE,
          sales_date DATE NOT NULL,
          currency VARCHAR(100),
             location_id INT REFERENCES "${schema}".locations(id) ON DELETE RESTRICT,
          warehouse_id INT REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
          locator_id INT REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
          status VARCHAR(50) DEFAULT 'Entered',
          payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid'
            CHECK (payment_status IN ('paid', 'unpaid', 'partial')),
          subtotal NUMERIC(12,2) DEFAULT 0,
          tax_amount NUMERIC(12,2) DEFAULT 0,
          total_amount NUMERIC(12,2) DEFAULT 0,
          return_change NUMERIC(12,2) DEFAULT 0.00,
          created_by VARCHAR(100),
          created_at TIMESTAMP,
          updated_by VARCHAR(100),
          updated_at TIMESTAMP
        );
      `);


  await client.query(`
    UPDATE "${schema}".sales_header sh
    SET location_id = w.location_id
    FROM "${schema}".warehouses w
    WHERE sh.warehouse_id = w.id
      AND (sh.location_id IS NULL OR sh.location_id <> w.location_id);
  `);

  await client.query(`
        CREATE TABLE IF NOT EXISTS "${schema}".sales_detail (
          id SERIAL PRIMARY KEY,
          sales_id INT NOT NULL
          REFERENCES "${schema}".sales_header(id) ON DELETE CASCADE,
          product_id INTEGER NOT NULL
          REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
          UOM VARCHAR(20),
          HSN_NO VARCHAR(20),
          rate NUMERIC(12,2) NOT NULL DEFAULT 0,
          qty NUMERIC(12,2) NOT NULL DEFAULT 0,
          discount NUMERIC(12,2) DEFAULT 0,
          tax_master_id INT
          REFERENCES "${schema}".tax_master(id) ON DELETE CASCADE,
          tax_amount NUMERIC(12,2) DEFAULT 0,
          line_total NUMERIC(12,2) DEFAULT 0,
          created_by VARCHAR(100),
          created_at TIMESTAMP,
          updated_by VARCHAR(100),
          updated_at TIMESTAMP
        );
      `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".sales_returns (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(80) NOT NULL,
      sales_invoice_id INT NOT NULL REFERENCES "${schema}".sales_header(id) ON DELETE RESTRICT,
      txn_date DATE NOT NULL,
      refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".sales_return_items (
      id BIGSERIAL PRIMARY KEY,
      sales_return_id BIGINT NOT NULL REFERENCES "${schema}".sales_returns(id) ON DELETE CASCADE,
      sales_invoice_line_id INT NOT NULL REFERENCES "${schema}".sales_detail(id) ON DELETE RESTRICT,
      product_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE RESTRICT,
      warehouse_id INT REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      locator_id INT REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
      returned_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_return_items_header
    ON "${schema}".sales_return_items(sales_return_id);
  `);


  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".purchase_returns (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(80) NOT NULL,
      grn_id INT NOT NULL REFERENCES "${schema}".grn_header(id) ON DELETE RESTRICT,
      purchase_return_no VARCHAR(100) UNIQUE,
      txn_date DATE NOT NULL,
      refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".purchase_return_items (
      id BIGSERIAL PRIMARY KEY,
      purchase_return_id BIGINT NOT NULL REFERENCES "${schema}".purchase_returns(id) ON DELETE CASCADE,
      grn_line_id INT NOT NULL REFERENCES "${schema}".grn_detail(id) ON DELETE RESTRICT,
      product_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE RESTRICT,
      warehouse_id INT REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      locator_id INT REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
      returned_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
      unit_price NUMERIC(12,2) NOT NULL DEFAULT 0
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_purchase_return_items_header
    ON "${schema}".purchase_return_items(purchase_return_id);
  `);



  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".product_import_mapping_templates (
      id BIGSERIAL PRIMARY KEY,
      template_name VARCHAR(120) NOT NULL,
      sheet_name VARCHAR(120),
      mapping_json JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (template_name)
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".product_import_batches (
      id BIGSERIAL PRIMARY KEY,
      sheet_name VARCHAR(120),
      mapping_template_id BIGINT REFERENCES "${schema}".product_import_mapping_templates(id) ON DELETE SET NULL,
      source_file_name VARCHAR(255),
      total_rows INT NOT NULL DEFAULT 0,
      imported_products INT NOT NULL DEFAULT 0,
      imported_variants INT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'completed',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".product_import_batch_items (
      id BIGSERIAL PRIMARY KEY,
      batch_id BIGINT NOT NULL REFERENCES "${schema}".product_import_batches(id) ON DELETE CASCADE,
      product_id BIGINT REFERENCES "${schema}".products(id) ON DELETE CASCADE,
      variant_id BIGINT REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
      row_number INT,
      item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('product', 'variant')),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE c.conname = 'sales_header_payment_status_chk'
          AND n.nspname = '${schema}'
      ) THEN
        ALTER TABLE "${schema}".sales_header
          ADD CONSTRAINT sales_header_payment_status_chk
          CHECK (payment_status IN ('paid', 'unpaid', 'partial'));
      END IF;
    END $$;
  `);


  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".sales_payments (
      id SERIAL PRIMARY KEY,
      sales_id INT NOT NULL REFERENCES "${schema}".sales_header(id) ON DELETE CASCADE,
      payment_mode_id INT NOT NULL REFERENCES "${schema}".payment_modes(id) ON DELETE RESTRICT,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
      paid_amount NUMERIC(12,2) DEFAULT 0.00,
      actual_amount NUMERIC(12,2) DEFAULT 0.00,
      return_change NUMERIC(12,2) DEFAULT 0.00,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      created_by VARCHAR(100),
      location_id INT REFERENCES "${schema}".locations(id) ON DELETE RESTRICT,
      warehouse_id INT REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_payments_sales_id
    ON "${schema}".sales_payments(sales_id);
  `);

  // Ensure tables shape is updated for existing schemas and backfill legacy records
  await client.query(`
    ALTER TABLE "${schema}".sales_header 
    ADD COLUMN IF NOT EXISTS return_change NUMERIC(12,2) DEFAULT 0.00;
  `);

  await client.query(`
  ALTER TABLE "${schema}".business_settings
  ADD COLUMN IF NOT EXISTS gst_available BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await client.query(`
    ALTER TABLE "${schema}".sales_payments 
    ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(12,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS return_change NUMERIC(12,2) DEFAULT 0.00;
  `);

  await client.query(`
    UPDATE "${schema}".sales_payments
    SET paid_amount = amount,
        actual_amount = amount
    WHERE paid_amount = 0.00 AND actual_amount = 0.00;
  `);

  /* =========================================================
 SALES / BILLING

 
  await client.query(`
        CREATE TABLE IF NOT EXISTS "${schema}".sales_header (
          id SERIAL PRIMARY KEY,
          sales_no VARCHAR(30) UNIQUE NOT NULL,  
          customer_id INTEGER NOT NULL
          REFERENCES "${schema}".customers(id) ON DELETE CASCADE,
          sales_date DATE NOT NULL,
          currency VARCHAR(100),
          warehouse_id INT REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
          location_id INT REFERENCES "${schema}".locations(id) ON DELETE RESTRICT,
          locator_id INT REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
          status VARCHAR(50) DEFAULT 'Entered',
          payment_status VARCHAR(20) NOT NULL DEFAULT 'unpaid'
            CHECK (payment_status IN ('paid', 'unpaid', 'partial')),
          subtotal NUMERIC(12,2) DEFAULT 0,
          tax_amount NUMERIC(12,2) DEFAULT 0,
          total_amount NUMERIC(12,2) DEFAULT 0,
          created_by VARCHAR(100),
          created_at TIMESTAMP,
          updated_by VARCHAR(100),
          updated_at TIMESTAMP
        );
      `);
 
  await client.query(`
        CREATE TABLE IF NOT EXISTS "${schema}".sales_detail (
          id SERIAL PRIMARY KEY,
          sales_id INT NOT NULL
          REFERENCES "${schema}".sales_header(id) ON DELETE CASCADE,
          product_id INTEGER NOT NULL
          REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
          UOM VARCHAR(20),
          HSN_NO VARCHAR(20),
          rate NUMERIC(12,2) NOT NULL DEFAULT 0,
          qty NUMERIC(12,2) NOT NULL DEFAULT 0,
          discount NUMERIC(12,2) DEFAULT 0,
          tax_master_id INT
          REFERENCES "${schema}".tax_master(id) ON DELETE CASCADE,
          tax_amount NUMERIC(12,2) DEFAULT 0,
          line_total NUMERIC(12,2) DEFAULT 0,
          created_by VARCHAR(100),
          created_at TIMESTAMP,
          updated_by VARCHAR(100),
          updated_at TIMESTAMP
        );
      `);
      

  /* =========================================================
     OPENING STOCK
     ========================================================= */

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".user_settings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      default_warehouse_id INT
        REFERENCES "${schema}".warehouses(id) ON DELETE SET NULL,
      default_locator_id INT
        REFERENCES "${schema}".locators(id) ON DELETE SET NULL,
      branch_name VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".opening_stock (
      id SERIAL PRIMARY KEY,
      doc_no VARCHAR(20) UNIQUE,
      date DATE,
      description TEXT,
      warehouse_id INT REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      locator_id INT REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
      status VARCHAR(20),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".opening_stock_items (
      id SERIAL PRIMARY KEY,
      opening_stock_id INT REFERENCES "${schema}".opening_stock(id) ON DELETE CASCADE,
      product_id BIGINT,
      sku VARCHAR(120),
      warehouse_id INT REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      locator_id INT REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
      qty NUMERIC(12,2),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_opening_stock_items_header
    ON "${schema}".opening_stock_items(opening_stock_id);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".stock_adjustments (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(80) NOT NULL,
      txn_date DATE NOT NULL,
      warehouse_id INT NOT NULL REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      locator_id INT NOT NULL REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
      reason TEXT,
      created_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".stock_adjustment_items (
      id BIGSERIAL PRIMARY KEY,
      adjustment_id BIGINT NOT NULL REFERENCES "${schema}".stock_adjustments(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE RESTRICT,
      system_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
      physical_qty NUMERIC(12,2) NOT NULL DEFAULT 0,
      adjustment_qty NUMERIC(12,2) NOT NULL DEFAULT 0
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_stock_adjustment_items_header
    ON "${schema}".stock_adjustment_items(adjustment_id);
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".stock_layers (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(80) NOT NULL,
      product_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE RESTRICT,
      warehouse_id INT NOT NULL REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      locator_id INT NOT NULL REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
      source_txn_type VARCHAR(30) NOT NULL CHECK (source_txn_type IN ('Opening', 'GRN')),
      source_ref_id BIGINT NOT NULL,
      source_ref_line_id BIGINT NOT NULL,
      qty_remaining NUMERIC(12,2) NOT NULL CHECK (qty_remaining >= 0),
      cost NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (cost >= 0),
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_stock_layers_fifo
    ON "${schema}".stock_layers(tenant_id, product_id, warehouse_id, created_at, id)
    WHERE qty_remaining > 0;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".sales_allocations (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(80) NOT NULL,
      sales_detail_id BIGINT NOT NULL REFERENCES "${schema}".sales_detail(id) ON DELETE CASCADE,
      stock_layer_id BIGINT NOT NULL REFERENCES "${schema}".stock_layers(id) ON DELETE RESTRICT,
      qty_allocated NUMERIC(12,2) NOT NULL CHECK (qty_allocated > 0)
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_allocations_sales_detail
    ON "${schema}".sales_allocations(sales_detail_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_sales_allocations_stock_layer
    ON "${schema}".sales_allocations(stock_layer_id);
  `);

  /* =========================================================
     STOCK LEDGER
     ========================================================= */
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".stock_ledger (
      id BIGSERIAL PRIMARY KEY,
      tenant_id VARCHAR(80) NOT NULL,
      txn_date DATE NOT NULL,
      txn_type VARCHAR(30) NOT NULL CHECK (txn_type IN (
        'Opening',
        'GRN',
        'Sales',
        'Sales Return',
        'Purchase Return',
        'Transfer In',
        'Transfer Out',
        'Adjustment'
      )),
      ref_type VARCHAR(50) NOT NULL,
      ref_id BIGINT NOT NULL,
      ref_line_id BIGINT NOT NULL,
      warehouse_id INT NOT NULL REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      locator_id INT NOT NULL REFERENCES "${schema}".locators(id) ON DELETE RESTRICT,
      product_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE RESTRICT,
      qty_in NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qty_in >= 0),
      qty_out NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (qty_out >= 0),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      CONSTRAINT stock_ledger_qty_one_side_chk
        CHECK (
          (qty_in = 0 AND qty_out > 0) OR
          (qty_out = 0 AND qty_in > 0)
        )
    );
  `);

  await client.query(`
    CREATE OR REPLACE FUNCTION "${schema}".stock_ledger_immutable()
    RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'stock_ledger is immutable. Use reversing entries.';
    END;
    $$ LANGUAGE plpgsql;
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE t.tgname = 'trg_stock_ledger_immutable'
          AND n.nspname = '${schema}'
      ) THEN
        CREATE TRIGGER trg_stock_ledger_immutable
        BEFORE UPDATE OR DELETE ON "${schema}".stock_ledger
        FOR EACH ROW EXECUTE FUNCTION "${schema}".stock_ledger_immutable();
      END IF;
    END $$;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_stock_ledger_stock_grouping
    ON "${schema}".stock_ledger(tenant_id, warehouse_id, locator_id, product_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_stock_ledger_ref
    ON "${schema}".stock_ledger(ref_type, ref_id, ref_line_id);
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_stock_ledger_txn_date
    ON "${schema}".stock_ledger(txn_date);
  `);

  await client.query(`
    CREATE OR REPLACE VIEW "${schema}".current_stock AS
    SELECT
      tenant_id,
      warehouse_id,
      locator_id,
      product_id,
      SUM(qty_in) - SUM(qty_out) AS current_stock
    FROM "${schema}".stock_ledger
    GROUP BY tenant_id, warehouse_id, locator_id, product_id;
  `);

  /* =========================================================
     OPTIONAL: AUDIT LOG TABLE (Recommended for Finance SaaS)
     ========================================================= */
  await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}".audit_log (
        id SERIAL PRIMARY KEY,
        action TEXT NOT NULL,
        entity TEXT NOT NULL,
        entity_id INT,
        performed_by TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

  /* =========================================================
     INVENTORY ALERTS & NOTIFICATIONS
     ========================================================= */
  
  await client.query(`
    ALTER TABLE "${schema}".business_settings
      ADD COLUMN IF NOT EXISTS default_low_stock_threshold INT NOT NULL DEFAULT 5,
      ADD COLUMN IF NOT EXISTS default_backorders_allowed BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS low_stock_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS low_stock_email_notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await client.query(`
    ALTER TABLE "${schema}".product_variants
      ADD COLUMN IF NOT EXISTS low_stock_threshold INT,
      ADD COLUMN IF NOT EXISTS backorders_allowed BOOLEAN,
      ADD COLUMN IF NOT EXISTS last_low_stock_notified_at TIMESTAMPTZ;
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".notification_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(50) NOT NULL,
      user_id INTEGER NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (event_type, user_id)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".notification_recipients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id UUID NOT NULL REFERENCES "${schema}".notifications(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      read_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (notification_id, user_id)
    );
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_notif_recipients_user_unread 
    ON "${schema}".notification_recipients (user_id, is_read);
  `);
}

/**
 * Creates isolated storefront & ecommerce tables for a company schema
 */
export async function createEcomSchema(
  client: PoolClient,
  schema: string,
  companyId: number
) {
  console.log(`Creating ECOM tables for schema: ${schema}, company: ${companyId}`);

  // 1. Create ecom_settings table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".ecom_settings (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
      payment_mode VARCHAR(20) NOT NULL DEFAULT 'cod_only'
        CHECK (payment_mode IN ('cod_only','prepaid_only','both')),
      gateway_provider VARCHAR(30),
      gateway_key_id TEXT,
      gateway_key_secret_enc TEXT,
      serviceable_countries TEXT[] NOT NULL DEFAULT ARRAY['India'],
      serviceable_states TEXT[],
      serviceable_pincodes TEXT[],
      terms_and_conditions TEXT,
      return_refund_policy TEXT,
      privacy_policy TEXT,
      support_email VARCHAR(150),
      support_phone VARCHAR(20),
      use_custom_pricing BOOLEAN NOT NULL DEFAULT FALSE,
      use_custom_discounts BOOLEAN NOT NULL DEFAULT FALSE,
      setup_status VARCHAR(20) NOT NULL DEFAULT 'incomplete'
        CHECK (setup_status IN ('incomplete','complete')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // 2. Create storefront_config table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".storefront_config (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
      draft_theme JSONB NOT NULL DEFAULT '{}'::jsonb,
      published_theme JSONB,
      version INT NOT NULL DEFAULT 0,
      published_at TIMESTAMP,
      published_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // 3. Create storefront_products table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".storefront_products (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      variant_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
      is_selected_draft BOOLEAN NOT NULL DEFAULT FALSE,
      is_live BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(variant_id)
    );
  `);

  // 4. Create ecom_price_overrides table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".ecom_price_overrides (
      id SERIAL PRIMARY KEY,
      company_id INT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
      variant_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
      ecom_price NUMERIC(12,2) NOT NULL CHECK (ecom_price >= 0),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(variant_id)
    );
  `);

  // 5. Add channel column to discounts table
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = '${schema}' AND table_name = 'discounts' AND column_name = 'channel'
      ) THEN
        ALTER TABLE "${schema}".discounts
          ADD COLUMN channel VARCHAR(10) NOT NULL DEFAULT 'both'
            CHECK (channel IN ('pos','ecom','both'));
      END IF;
    END $$;
  `);

  // 6. Create inventory_reservations table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".inventory_reservations (
      id BIGSERIAL PRIMARY KEY,
      variant_id BIGINT NOT NULL REFERENCES "${schema}".product_variants(id) ON DELETE CASCADE,
      warehouse_id INT REFERENCES "${schema}".warehouses(id) ON DELETE RESTRICT,
      qty_reserved NUMERIC(12,2) NOT NULL CHECK (qty_reserved > 0),
      order_ref_id BIGINT,
      status VARCHAR(20) NOT NULL DEFAULT 'held'
        CHECK (status IN ('held','converted','released')),
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // 7. Create inventory reservation index
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_inventory_reservations_variant
      ON "${schema}".inventory_reservations(variant_id) WHERE status = 'held';
  `);

  // 8. Create ecom_available_stock view
  await client.query(`
    CREATE OR REPLACE VIEW "${schema}".ecom_available_stock AS
    SELECT
      cs.warehouse_id, cs.locator_id, cs.product_id AS variant_id,
      cs.current_stock - COALESCE(r.reserved_qty, 0) AS available_qty
    FROM "${schema}".current_stock cs
    LEFT JOIN (
      SELECT variant_id, SUM(qty_reserved) AS reserved_qty
      FROM "${schema}".inventory_reservations
      WHERE status = 'held' AND expires_at > NOW()
      GROUP BY variant_id
    ) r ON r.variant_id = cs.product_id
    WHERE cs.current_stock > 0;
  `);

  // 9. Create customer_ecom_auth table
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".customer_ecom_auth (
      id SERIAL PRIMARY KEY,
      customer_id INT NOT NULL UNIQUE REFERENCES "${schema}".customers(id) ON DELETE CASCADE,
      phone VARCHAR(20) NOT NULL UNIQUE,
      otp_hash TEXT,
      otp_expires_at TIMESTAMP,
      otp_attempts INT NOT NULL DEFAULT 0,
      is_verified BOOLEAN NOT NULL DEFAULT FALSE,
      last_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

