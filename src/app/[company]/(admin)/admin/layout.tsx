"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Inter } from "next/font/google";
import { usePathname, useParams, useRouter } from "next/navigation";
import useIdleLogout from "@/hooks/useIdleLogout";
import { useUser } from "@/context/CurrentUserContext";
import AdminHeader from "@/components/admin/AdminHeader";
import { TenantProvider } from "@/context/TenantContext";
import { RenewalBannerAndModal } from "@/components/admin/RenewalBannerAndModal";
import { SubscriptionAlertBanner } from "@/components/admin/SubscriptionAlertBanner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useParams();
  const router = useRouter();
  const { user, setUser } = useUser();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [subscription, setSubscription] = useState<any>(null);

  const companyParam = params.company;

  // Ensure tenant is always a string
  const tenant = Array.isArray(companyParam) ? companyParam[0] : companyParam || "default-tenant";

  //   // Idle logout after 5 minutes
  useIdleLogout(tenant, "admin");

  const triggerOnboardingRefresh = async () => {
    try {
      const onboardingRes = await fetch(
        `/api/onboarding?company=${encodeURIComponent(tenant)}`
      );
      if (onboardingRes.ok) {
        const onboardingData = await onboardingRes.json();
        if (onboardingData?.subscription) {
          setSubscription(onboardingData.subscription);
        }
      }
    } catch (err) {
      console.error("Failed to refresh subscription data:", err);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // allow login page
        if (pathname?.endsWith("/admin/login")) {
          setCheckingAuth(false);
          return;
        }

        if (!user) {
          const res = await fetch(`/api/admin/current-user`);
          if (!res.ok) {
            router.replace(`/${tenant}/admin/login`);
            return;
          }
          const data = await res.json();

          if (data.success) {
            setUser(data.user);
            return;
          } else {
            router.replace(`/${tenant}/admin/login`);
          }
        } else {
          if (user.company_name !== tenant) {
            router.replace(`/${tenant}/admin/login`);
            return;
          }
          const onboardingRes = await fetch(
            `/api/onboarding?company=${encodeURIComponent(tenant)}`
          );
          if (onboardingRes.ok) {
            const onboardingData = await onboardingRes.json();
            if (onboardingData?.subscription) {
              setSubscription(onboardingData.subscription);
            }
            if (
              onboardingData?.success &&
              onboardingData?.company?.setup_stage &&
              onboardingData.company.setup_stage !== "LIVE"
            ) {
              router.replace(`/setup?company=${encodeURIComponent(tenant)}`);
              return;
            }
          }

          setCheckingAuth(false);
        }
      } catch (err) {
        console.error("Auth check failed", err);
        router.replace(`/${tenant}/admin/login`);
      }
    };

    checkAuth();
  }, [user, pathname, tenant, router, setUser]);

  // Prevent UI flash before auth check
  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading Admin Panel...
      </div>
    );
  }

  // LOGIN PAGE ALLOWED
  if (pathname?.endsWith("/admin/login")) {
    return (
      <TenantProvider value={{ company: tenant }}>
        <div className={inter.className}>{children}</div>
      </TenantProvider>
    );
  }

  return (
    <TenantProvider value={{ company: tenant }}>
      <div className={`${inter.className} min-h-screen bg-gray-100`}>
        <SubscriptionAlertBanner
          subscriptionEndDate={subscription?.subscription_end}
          subscriptionStatus={subscription?.status}
          tenant={tenant}
        />
        <AdminHeader company={tenant} />
        <div className="p-6">{children}</div>
        <RenewalBannerAndModal
          subscription={subscription}
          tenant={tenant}
          onRenewSuccess={triggerOnboardingRefresh}
        />
      </div>
    </TenantProvider>
  );
}
