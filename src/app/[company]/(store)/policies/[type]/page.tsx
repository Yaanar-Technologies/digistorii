import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import { pool } from "@/lib/db";
import {
  DocumentTextIcon,
  ShieldCheckIcon,
  ArrowUturnLeftIcon,
  ArrowLeftIcon,
  EnvelopeIcon,
  PhoneIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

interface PolicyPageProps {
  params: Promise<{
    company: string;
    type: string;
  }>;
}

type PolicyKey = "terms" | "privacy" | "returns";

interface PolicyConfig {
  key: PolicyKey;
  slug: string;
  title: string;
  subtitle: string;
  dbColumn: "terms_and_conditions" | "privacy_policy" | "return_refund_policy";
  icon: React.ComponentType<{ className?: string }>;
}

const POLICY_CONFIGS: Record<string, PolicyConfig> = {
  terms: {
    key: "terms",
    slug: "terms",
    title: "Terms & Conditions",
    subtitle: "Terms of service, usage guidelines, and customer rights",
    dbColumn: "terms_and_conditions",
    icon: DocumentTextIcon,
  },
  "terms-and-conditions": {
    key: "terms",
    slug: "terms",
    title: "Terms & Conditions",
    subtitle: "Terms of service, usage guidelines, and customer rights",
    dbColumn: "terms_and_conditions",
    icon: DocumentTextIcon,
  },
  privacy: {
    key: "privacy",
    slug: "privacy",
    title: "Privacy Policy",
    subtitle: "How we collect, store, and safeguard your personal information",
    dbColumn: "privacy_policy",
    icon: ShieldCheckIcon,
  },
  "privacy-policy": {
    key: "privacy",
    slug: "privacy",
    title: "Privacy Policy",
    subtitle: "How we collect, store, and safeguard your personal information",
    dbColumn: "privacy_policy",
    icon: ShieldCheckIcon,
  },
  returns: {
    key: "returns",
    slug: "returns",
    title: "Return & Refund Policy",
    subtitle: "Guidelines on returns, exchanges, refunds, and cancellations",
    dbColumn: "return_refund_policy",
    icon: ArrowUturnLeftIcon,
  },
  "return-policy": {
    key: "returns",
    slug: "returns",
    title: "Return & Refund Policy",
    subtitle: "Guidelines on returns, exchanges, refunds, and cancellations",
    dbColumn: "return_refund_policy",
    icon: ArrowUturnLeftIcon,
  },
  refund: {
    key: "returns",
    slug: "returns",
    title: "Return & Refund Policy",
    subtitle: "Guidelines on returns, exchanges, refunds, and cancellations",
    dbColumn: "return_refund_policy",
    icon: ArrowUturnLeftIcon,
  },
};

const ALL_TABS: PolicyConfig[] = [
  POLICY_CONFIGS.terms,
  POLICY_CONFIGS.privacy,
  POLICY_CONFIGS.returns,
];

async function fetchTenantPolicyData(companySlug: string) {
  const client = await pool.connect();
  try {
    const compRes = await client.query(
      `SELECT id, schema_name, company_name 
       FROM public.companies 
       WHERE LOWER(subdomain_url) = LOWER($1) 
       LIMIT 1`,
      [companySlug]
    );

    if (!compRes.rowCount) return null;

    const { id: companyId, schema_name: schema, company_name } = compRes.rows[0];

    const settingsRes = await client.query(
      `SELECT terms_and_conditions, return_refund_policy, privacy_policy, support_email, support_phone
       FROM "${schema}".ecom_settings 
       WHERE company_id = $1 
       LIMIT 1`,
      [companyId]
    );

    const settings = settingsRes.rows[0] || {};

    return {
      companyName: company_name || companySlug,
      companySlug,
      terms_and_conditions: (settings.terms_and_conditions || "").trim(),
      return_refund_policy: (settings.return_refund_policy || "").trim(),
      privacy_policy: (settings.privacy_policy || "").trim(),
      supportEmail: (settings.support_email || "").trim(),
      supportPhone: (settings.support_phone || "").trim(),
    };
  } catch (err) {
    console.error("Failed to load policy data from database:", err);
    return null;
  } finally {
    client.release();
  }
}

export async function generateMetadata({ params }: PolicyPageProps): Promise<Metadata> {
  const { company, type } = await params;
  const config = POLICY_CONFIGS[type.toLowerCase()];

  if (!config) {
    return {
      title: "Store Policy Not Found",
    };
  }

  const data = await fetchTenantPolicyData(company);
  const storeName = data?.companyName || company;

  return {
    title: `${config.title} | ${storeName}`,
    description: `Read the official ${config.title.toLowerCase()} for ${storeName}. ${config.subtitle}.`,
    openGraph: {
      title: `${config.title} - ${storeName}`,
      description: `Read the official ${config.title.toLowerCase()} for ${storeName}.`,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function PolicyPage({ params }: PolicyPageProps) {
  const { company, type } = await params;
  const normalizedType = type.toLowerCase();
  const config = POLICY_CONFIGS[normalizedType];

  if (!config) {
    notFound();
  }

  const tenantData = await fetchTenantPolicyData(company);
  if (!tenantData) {
    notFound();
  }

  const policyContent = tenantData[config.dbColumn];
  const hasContent = Boolean(policyContent && policyContent.length > 0);
  const IconComponent = config.icon;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Navigation Breadcrumb / Back Link */}
        <div className="flex items-center justify-between">
          <Link
            href={`/${company}/store`}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Back to Store</span>
          </Link>

          <span className="text-xs text-gray-400 font-medium">
            {tenantData.companyName} Legal
          </span>
        </div>

        {/* Header Header & Tabs */}
        <header className="bg-white rounded-2xl p-6 sm:p-8 shadow-xs border border-gray-200/80 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <IconComponent className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                  {config.title}
                </h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {config.subtitle}
                </p>
              </div>
            </div>

            <div className="text-xs text-gray-400">
              Last updated: {new Date().toLocaleDateString("en-IN", {
                month: "short",
                year: "numeric",
              })}
            </div>
          </div>

          {/* Policy Navigation Tabs */}
          <nav className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
            {ALL_TABS.map((tab) => {
              const isActive = tab.key === config.key;
              const TabIcon = tab.icon;
              return (
                <Link
                  key={tab.key}
                  href={`/${company}/policies/${tab.slug}`}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                    isActive
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200/60"
                  }`}
                >
                  <TabIcon className="w-4 h-4" />
                  <span>{tab.title}</span>
                </Link>
              );
            })}
          </nav>
        </header>

        {/* Policy Body Content or Fallback UI */}
        <main className="bg-white rounded-2xl p-6 sm:p-10 shadow-xs border border-gray-200/80">
          {hasContent ? (
            <article className="prose prose-gray max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-a:text-blue-600 text-gray-700 leading-relaxed whitespace-pre-wrap">
              {policyContent}
            </article>
          ) : (
            <div className="py-12 px-4 text-center space-y-4 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <InformationCircleIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-gray-900">
                  This policy has not been published yet.
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  The merchant has not provided details for the {config.title.toLowerCase()} at this time. Please check back soon or reach out directly with any questions.
                </p>
              </div>

              {(tenantData.supportEmail || tenantData.supportPhone) && (
                <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-gray-600 border-t border-gray-100">
                  {tenantData.supportEmail && (
                    <div className="flex items-center gap-1.5">
                      <EnvelopeIcon className="w-4 h-4 text-gray-400" />
                      <span>{tenantData.supportEmail}</span>
                    </div>
                  )}
                  {tenantData.supportPhone && (
                    <div className="flex items-center gap-1.5">
                      <PhoneIcon className="w-4 h-4 text-gray-400" />
                      <span>{tenantData.supportPhone}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </main>

        {/* Footer Support Information */}
        <footer className="text-center text-xs text-gray-400 space-y-2 pt-4">
          <p>
            Have questions regarding these policies? Contact{" "}
            <strong>{tenantData.companyName}</strong> support.
          </p>
          <p>© {new Date().getFullYear()} {tenantData.companyName}. All rights reserved.</p>
        </footer>

      </div>
    </div>
  );
}
