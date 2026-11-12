import { PoolClient } from "pg";

/**
 * ============================================================================
 * TENANT LOOKUP MASTER DATA SEEDER
 * ============================================================================
 * Automatically populates foundational/lookup master data for a newly created
 * tenant schema in PostgreSQL (similar to currencySeed.ts).
 *
 * Designed to be clean, modular, fully typed, and strictly idempotent.
 */

/* ----------------------------------------------------------------------------
 * TypeScript Interfaces
 * ---------------------------------------------------------------------------- */

export interface ColorSeed {
  colorName: string;
  hexCode: string;
}

export interface UomSeed {
  uomCode: string;
  uomName: string;
}

export interface DespatchTermSeed {
  code: string;
  despatchName: string;
}

export interface PaymentTermSeed {
  name: string;
  type: "immediate" | "days" | "month";
  days?: number | null;
  month?: number | null;
  description?: string;
}

export interface PaymentModeSeed {
  name: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface TaxComponentSeed {
  componentName: string;
  componentPercentage: number;
}

export interface TaxMasterSeed {
  taxName: string;
  totalPercentage: number;
  effectiveFrom: string;
  isActive: boolean;
  components: TaxComponentSeed[];
}

export interface LocatorSeed {
  locatorName: string;
  row: string;
  rack: string;
  bin: string;
  type:
  | "receiving"
  | "main_storage"
  | "bulk_storage"
  | "despatch"
  | "return_area"
  | "scrap";
  description: string;
}

export interface SeedTenantLookupOptions {
  wrapTransaction?: boolean;
}

export interface SeedTenantLookupResult {
  schema: string;
  seeded: boolean;
  counts: {
    colors: number;
    uom: number;
    despatchTerms: number;
    paymentTerms: number;
    paymentModes: number;
    taxRates: number;
    taxComponents: number;
    locators: number;
  };
}

/* ----------------------------------------------------------------------------
 * Seed Data Specifications (Cleanly typed, easily editable arrays)
 * ---------------------------------------------------------------------------- */

export const DEFAULT_COLORS: ColorSeed[] = [
  { colorName: "Black", hexCode: "#000000" },
  { colorName: "White", hexCode: "#FFFFFF" },
  { colorName: "Blue", hexCode: "#0000FF" },
];

export const DEFAULT_UOMS: UomSeed[] = [
  { uomCode: "EA", uomName: "Each" },
  { uomCode: "PCS", uomName: "Pieces" },
];

export const DEFAULT_DESPATCH_TERMS: DespatchTermSeed[] = [
  { code: "001", despatchName: "By Road" },
  { code: "002", despatchName: "By Air" },
];

export const DEFAULT_PAYMENT_TERMS: PaymentTermSeed[] = [
  {
    name: "Immediate",
    type: "immediate",
    days: null,
    month: null,
    description: "Immediate payment / Net 0 / Due upon receipt",
  },
];

export const DEFAULT_PAYMENT_MODES: PaymentModeSeed[] = [
  { name: "UPI", isDefault: true, isActive: true },
  { name: "Cash", isDefault: false, isActive: true },
];

const getTodayDate = (): string => {
  return new Date().toISOString().split('T')[0];
};
export const DEFAULT_TAXES: TaxMasterSeed[] = [
  {
    taxName: "GST 12%",
    totalPercentage: 12.0,
    effectiveFrom: getTodayDate(),
    isActive: true,
    components: [
      { componentName: "CGST", componentPercentage: 6.0 },
      { componentName: "SGST", componentPercentage: 6.0 },
    ],
  },
];

export const DEFAULT_LOCATORS: LocatorSeed[] = [
  {
    locatorName: "1-1-1",
    row: "1",
    rack: "1",
    bin: "1",
    type: "main_storage",
    description: "Default Storage Bin (Aisle 1, Rack 1, Shelf/Bin 1)",
  },
];

/* ----------------------------------------------------------------------------
 * Seeder Execution
 * ---------------------------------------------------------------------------- */

/**
 * Validates schema name identifier format to prevent SQL injection.
 */
function validateSchemaName(schemaName: string): string {
  const schema = String(schemaName || "").trim().toLowerCase();
  const schemaRegex = /^[a-z][a-z0-9_]{0,62}$/;
  if (!schemaRegex.test(schema)) {
    throw new Error(
      `Invalid tenant schema name '${schemaName}'. Must be 1-63 alphanumeric/underscore characters starting with a letter.`
    );
  }
  return schema;
}

/**
 * Seeds foundational lookup master data into the specified tenant schema.
 * Operates idempotently using standard sequence generation and conflict checking.
 *
 * @param client PostgreSQL PoolClient
 * @param schemaName Target tenant schema (e.g., 'tenant_1', 'tenant_3')
 * @param options Optional configuration (e.g. wrapTransaction)
 */
export async function seedTenantLookupData(
  client: PoolClient,
  schemaName: string,
  options: SeedTenantLookupOptions = {}
): Promise<SeedTenantLookupResult> {
  const schema = validateSchemaName(schemaName);

  if (options.wrapTransaction) {
    await client.query("BEGIN");
  }

  const result: SeedTenantLookupResult = {
    schema,
    seeded: false,
    counts: {
      colors: 0,
      uom: 0,
      despatchTerms: 0,
      paymentTerms: 0,
      paymentModes: 0,
      taxRates: 0,
      taxComponents: 0,
      locators: 0,
    },
  };

  try {
    /* 1. Colors (product_colors) */
    for (const color of DEFAULT_COLORS) {
      const res = await client.query(
        `
        INSERT INTO "${schema}".product_colors (color_name, hex_code)
        VALUES ($1, $2)
        ON CONFLICT (color_name) DO NOTHING
        `,
        [color.colorName, color.hexCode]
      );
      result.counts.colors += res.rowCount ?? 0;
    }

    /* 2. Units of Measurement (uom) */
    for (const uom of DEFAULT_UOMS) {
      const res = await client.query(
        `
        INSERT INTO "${schema}".uom (uom_code, uom_name)
        VALUES ($1, $2)
        ON CONFLICT (uom_code) DO NOTHING
        `,
        [uom.uomCode, uom.uomName]
      );
      result.counts.uom += res.rowCount ?? 0;
    }

    /* 3. Despatch / Shipping Terms (despatch_terms) */
    for (const term of DEFAULT_DESPATCH_TERMS) {
      const res = await client.query(
        `
        INSERT INTO "${schema}".despatch_terms (code, despatch_name)
        VALUES ($1, $2)
        ON CONFLICT (code) DO NOTHING
        `,
        [term.code, term.despatchName]
      );
      result.counts.despatchTerms += res.rowCount ?? 0;
    }

    /* 4. Payment Terms (payment_terms) */
    for (const term of DEFAULT_PAYMENT_TERMS) {
      const existing = await client.query(
        `SELECT id FROM "${schema}".payment_terms WHERE name = $1 LIMIT 1`,
        [term.name]
      );

      if (!existing.rowCount) {
        const res = await client.query(
          `
          INSERT INTO "${schema}".payment_terms (name, type, days, month, description)
          VALUES ($1, $2, $3, $4, $5)
          `,
          [
            term.name,
            term.type,
            term.days ?? null,
            term.month ?? null,
            term.description ?? null,
          ]
        );
        result.counts.paymentTerms += res.rowCount ?? 0;
      }
    }

    /* 5. Payment Modes (payment_modes) */
    for (const mode of DEFAULT_PAYMENT_MODES) {
      const res = await client.query(
        `
        INSERT INTO "${schema}".payment_modes (name, is_default, is_active)
        VALUES ($1, $2, $3)
        ON CONFLICT (name) DO NOTHING
        `,
        [mode.name, mode.isDefault, mode.isActive]
      );
      result.counts.paymentModes += res.rowCount ?? 0;
    }

    /* 6. Tax Rates & Tax Components (tax_master & tax_component) */
    for (const tax of DEFAULT_TAXES) {
      let taxMasterId: number;

      const existingTax = await client.query(
        `SELECT id FROM "${schema}".tax_master WHERE tax_name = $1 LIMIT 1`,
        [tax.taxName]
      );

      if (existingTax.rowCount) {
        taxMasterId = Number(existingTax.rows[0].id);
      } else {
        const insertTaxRes = await client.query(
          `
          INSERT INTO "${schema}".tax_master (tax_name, total_percentage, effective_from, is_active)
          VALUES ($1, $2, $3, $4)
          RETURNING id
          `,
          [tax.taxName, tax.totalPercentage, tax.effectiveFrom, tax.isActive]
        );
        taxMasterId = Number(insertTaxRes.rows[0].id);
        result.counts.taxRates += 1;
      }

      for (const comp of tax.components) {
        const existingComp = await client.query(
          `
          SELECT id FROM "${schema}".tax_component
          WHERE tax_master_id = $1 AND component_name = $2
          LIMIT 1
          `,
          [taxMasterId, comp.componentName]
        );

        if (!existingComp.rowCount) {
          const insertCompRes = await client.query(
            `
            INSERT INTO "${schema}".tax_component (tax_master_id, component_name, component_percentage)
            VALUES ($1, $2, $3)
            `,
            [taxMasterId, comp.componentName, comp.componentPercentage]
          );
          result.counts.taxComponents += insertCompRes.rowCount ?? 0;
        }
      }
    }

    /* 7. Warehouse Locators (locators) */
    const warehouseRes = await client.query(
      `
      SELECT id FROM "${schema}".warehouses
      ORDER BY is_default DESC, id ASC
      LIMIT 1
      `
    );

    if (warehouseRes.rowCount) {
      const defaultWarehouseId = Number(warehouseRes.rows[0].id);

      for (const loc of DEFAULT_LOCATORS) {
        const existingLoc = await client.query(
          `
          SELECT id FROM "${schema}".locators
          WHERE warehouse_id = $1 AND (locator_name = $2 OR (row = $3 AND rack = $4 AND bin = $5))
          LIMIT 1
          `,
          [defaultWarehouseId, loc.locatorName, loc.row, loc.rack, loc.bin]
        );

        if (!existingLoc.rowCount) {
          const insertLocRes = await client.query(
            `
            INSERT INTO "${schema}".locators (
              locator_name, row, rack, bin, warehouse_id, type, description
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [
              loc.locatorName,
              loc.row,
              loc.rack,
              loc.bin,
              defaultWarehouseId,
              loc.type,
              loc.description,
            ]
          );
          result.counts.locators += insertLocRes.rowCount ?? 0;
        }
      }
    }

    if (options.wrapTransaction) {
      await client.query("COMMIT");
    }

    const totalInserted = Object.values(result.counts).reduce(
      (acc, count) => acc + count,
      0
    );
    result.seeded = totalInserted > 0;

    return result;
  } catch (error) {
    if (options.wrapTransaction) {
      await client.query("ROLLBACK");
    }
    console.error(`[seedTenantLookupData] Error seeding schema '${schema}':`, error);
    throw error;
  }
}

/**
 * Convenience alias matching the currencySeed export convention.
 */
export async function ensureTenantLookupDataSeeded(
  client: PoolClient,
  schema: string,
  options?: SeedTenantLookupOptions
): Promise<SeedTenantLookupResult> {
  return seedTenantLookupData(client, schema, options);
}
