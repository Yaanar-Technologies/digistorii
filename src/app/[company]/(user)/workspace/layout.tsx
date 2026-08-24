"use client";
import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Inter } from "next/font/google";
import { usePathname, useParams, useRouter } from "next/navigation";
import { SidebarProvider } from "@/context/SidebarContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { TenantProvider } from "@/context/TenantContext";
import { CompanySettingsProvider } from "@/context/CompanySettingsContext";

import useIdleLogout from "@/hooks/useIdleLogout";
import { useUser } from "@/context/CurrentUserContext";

const AdminLayout = dynamic(() => import("@/layout/AdminLayout"), {
  ssr: false,
});

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export default function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();

  const companyParam = params.company;
  const tenant = Array.isArray(companyParam)
    ? companyParam[0]
    : companyParam || "default-tenant";

  useIdleLogout(tenant, "/workspace/login");

  const [checkingAuth, setCheckingAuth] = useState(true);
  const { user, setUser } = useUser();
  useEffect(() => {
    const checkAuthAndOnboarding = async () => {
      try {
        if (
          pathname?.endsWith("/workspace/login") ||
          pathname?.endsWith("/workspace/reset-password")
        ) {
          setCheckingAuth(false);
          return;
        }

        if (!user || user.company_name !== tenant) {
          router.replace(`/${tenant}/workspace/login`);
          return;
        }

        const onboardingRes = await fetch(
          `/api/onboarding?company=${encodeURIComponent(tenant)}`
        );
        if (onboardingRes.ok) {
          const onboardingData = await onboardingRes.json();
          if (
            onboardingData?.success &&
            onboardingData?.company?.setup_stage &&
            onboardingData.company.setup_stage !== "LIVE"
          ) {
            router.replace(`/setup?company=${encodeURIComponent(tenant)}`);
            return;
          }
        }

        // ONE-TIME REDIRECT: Auto-mark as completed & redirect once
        const configPath = `/${tenant}/workspace/administration/business-configuration`;
        if (!user.has_completed_guided_setup) {
          // 1. Immediately update state so layout never redirects again
          setUser({ ...user, has_completed_guided_setup: true });

          // 2. Persist to DB in the background
          fetch(`/api/guided-setup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ company: user.subdomain_url || tenant }),
          }).catch((err) => console.error("Failed to update guided setup flag", err));

          // 3. Redirect to configuration page if not already there
          if (pathname !== configPath) {
            router.replace(configPath);
            return;
          }
        }

        setCheckingAuth(false);
      } catch (err) {
        console.error("Auth check failed", err);
        router.replace(`/${tenant}/workspace/login`);
      }
    };

    checkAuthAndOnboarding();
  }, [user, pathname, tenant, router, setUser]);

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading...
      </div>
    );
  }

  if (
    pathname?.endsWith("/workspace/login") ||
    pathname?.endsWith("/workspace/reset-password")
  ) {
    return <div className={inter.className}>{children}</div>;
  }

  const isLiveBilling = pathname?.includes("/workspace/transactions/sales/add");
  console.log("--- CompanyLayout Diagnostic ---", {
    AdminLayout: typeof AdminLayout,
    TenantProvider: typeof TenantProvider,
    ThemeProvider: typeof ThemeProvider,
    SidebarProvider: typeof SidebarProvider,
    isLiveBilling,
  });
  return (
    <TenantProvider value={{ company: tenant }}>
      <CompanySettingsProvider>
        <ThemeProvider>
          <SidebarProvider>
            <div
              className={`${inter.className} font-sans antialiased text-gray-800 dark:text-white/90`}
            >
              {isLiveBilling ? children : <AdminLayout>{children}</AdminLayout>}
            </div>
          </SidebarProvider>
        </ThemeProvider>
      </CompanySettingsProvider>
    </TenantProvider>
  );
}