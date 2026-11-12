import Link from "next/link";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import { normalizeBillingInterval } from "@/lib/onboarding";
import { pool } from "@/lib/db";

type SetupPageProps = {
  searchParams: Promise<{ company?: string; plan_id?: string; billing_cycle?: string }>;
};

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const params = await searchParams;
  const company = (params?.company || "").trim().toLowerCase();

  let initialOwnerEmail = "";
  if (company) {
    try {
      const client = await pool.connect();
      try {
        const res = await client.query(
          `SELECT u.email 
           FROM public.users u
           JOIN public.companies c ON c.id = u.company_id
           WHERE LOWER(c.subdomain_url) = LOWER($1)
           ORDER BY u.id ASC
           LIMIT 1`,
          [company]
        );
        if (res.rows.length > 0 && res.rows[0].email) {
          initialOwnerEmail = res.rows[0].email;
        }
      } finally {
        client.release();
      }
    } catch (e) {
      console.error("Error fetching initial owner email:", e);
    }
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      {!company ? (
        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-gray-900">Onboarding Setup</h1>
          <p className="text-sm text-gray-600">
            Company slug is missing. Start from account creation.
          </p>
          <Link
            href="/"
            className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Go to Signup
          </Link>
        </div>
      ) : (
        <OnboardingWizard
          company={company}
          initialPlanId={Number(params?.plan_id || 0) || null}
          initialBillingInterval={normalizeBillingInterval(params?.billing_cycle)}
          initialOwnerEmail={initialOwnerEmail}
        />
      )}
    </div>
  );
}
