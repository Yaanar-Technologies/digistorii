import { getTenantSchemaByCompany } from "@/lib/tenant";
import { pool } from "@/lib/db";
import Link from "next/link";
import {
  FolderIcon,
  PuzzlePieceIcon,
  SwatchIcon,
  Square3Stack3DIcon,
  ListBulletIcon,
  ReceiptPercentIcon,
  BanknotesIcon,
  DocumentTextIcon,
  CurrencyDollarIcon,
  BuildingStorefrontIcon,
  BuildingOffice2Icon,
  MapPinIcon,
  TruckIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";

type PageProps = {
  params: Promise<{ company: string }>;
};

export default async function MastersPage({ params }: PageProps) {
  const { company } = await params;
  let schema = "";
  let counts: any = {};

  try {
    const tenantInfo = await getTenantSchemaByCompany(company);
    schema = tenantInfo.schema;

    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM "${schema}".product_categories) as categories,
        (SELECT COUNT(*) FROM "${schema}".product_fittings) as fittings,
        (SELECT COUNT(*) FROM "${schema}".product_colors) as colors,
        (SELECT COUNT(*) FROM "${schema}".product_materials) as materials,
        (SELECT COUNT(*) FROM "${schema}".uom) as uom,
        (SELECT COUNT(*) FROM "${schema}".tax_master) as tax,
        (SELECT COUNT(*) FROM "${schema}".payment_modes) as payment_modes,
        (SELECT COUNT(*) FROM "${schema}".payment_terms) as payment_terms,
        (SELECT COUNT(*) FROM "${schema}".currencies) as currencies,
        (SELECT COUNT(*) FROM "${schema}".locations) as locations,
        (SELECT COUNT(*) FROM "${schema}".warehouses) as warehouses,
        (SELECT COUNT(*) FROM "${schema}".locators) as locators,
        (SELECT COUNT(*) FROM "${schema}".despatch_terms) as despatch_terms
    `);

    if (result.rows.length > 0) {
      counts = result.rows[0];
    }
  } catch (error) {
    console.error("Error fetching master counts:", error);
  }

  const groups = [
    {
      name: "Inventory Basics",
      items: [
        { name: "Categories", path: "/workspace/inventory/categories", count: counts.categories, icon: <FolderIcon /> },
        { name: "Fittings", path: "/workspace/inventory/fittings", count: counts.fittings, icon: <PuzzlePieceIcon /> },
        { name: "Colors", path: "/workspace/inventory/colors", count: counts.colors, icon: <SwatchIcon /> },
        { name: "Materials", path: "/workspace/inventory/materials", count: counts.materials, icon: <Square3Stack3DIcon /> },
        { name: "UOM", path: "/workspace/inventory/uom", count: counts.uom, icon: <ListBulletIcon /> },
      ]
    },
    {
      name: "Financial",
      items: [
        { name: "Tax", path: "/workspace/inventory/tax", count: counts.tax, icon: <ReceiptPercentIcon /> },
        { name: "Payment Modes", path: "/workspace/inventory/payment-mode", count: counts.payment_modes, icon: <BanknotesIcon /> },
        { name: "Payment Terms", path: "/workspace/inventory/payment-terms", count: counts.payment_terms, icon: <DocumentTextIcon /> },
        { name: "Currencies", path: "/workspace/inventory/currency-rate", count: counts.currencies, icon: <CurrencyDollarIcon /> },
      ]
    },
    {
      name: "Logistics",
      items: [
        { name: "Store Location", path: "/workspace/inventory/location", count: counts.locations, icon: <BuildingStorefrontIcon /> },
        { name: "Warehouse", path: "/workspace/inventory/warehouse", count: counts.warehouses, icon: <BuildingOffice2Icon /> },
        { name: "Locator", path: "/workspace/inventory/locator", count: counts.locators, icon: <MapPinIcon /> },
        { name: "Despatch Terms", path: "/workspace/inventory/despatch-terms", count: counts.despatch_terms, icon: <TruckIcon /> },
      ]
    },
    {
      name: "General",
      items: [
        { name: "Configuration", path: "/workspace/administration/business-configuration", count: null, icon: <Cog6ToothIcon /> },
      ]
    }
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Masters</h1>
          <p className="text-sm text-gray-500">Configure and manage all essential data lists and defaults.</p>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {groups.map((group) => (
          <div key={group.name} className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">{group.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {group.items.map((item) => (
                <Link
                  href={`/${company}${item.path}`}
                  key={item.name}
                  className="block p-4 border border-gray-200 rounded-xl bg-white hover:shadow-md transition-shadow group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-lg shrink-0 group-hover:bg-blue-100 transition-colors">
                      <div className="w-6 h-6 flex items-center justify-center">
                        {item.icon}
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <h3 className="font-semibold text-gray-900">{item.name}</h3>
                      {item.count !== null ? (
                        Number(item.count) > 0 ? (
                          <span className="text-sm font-medium text-green-600 mt-1">{item.count} items</span>
                        ) : (
                          <span className="text-sm font-medium text-gray-400 mt-1">No items added</span>
                        )
                      ) : (
                        <span className="text-sm font-medium text-gray-400 mt-1">Configure</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}