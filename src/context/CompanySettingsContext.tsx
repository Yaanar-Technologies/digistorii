'use client';
import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useTenant } from "@/context/TenantContext";
 
 
type CompanySettings = {
    baseCurrency: string;
    dateFormat: string;
    financialYearStart: string;
    financialYearEnd: string;
    companyName: string;
    salesTarget: number;
    yearType?: string;
};
 
type CompanySettingsContextType = {
    settings: CompanySettings | null;
    setSettings: (s: CompanySettings) => void;
    loading: boolean;
};
 
const CompanySettingsContext = createContext<CompanySettingsContextType>({
    settings: null,
    setSettings: () => {},
    loading: true,
});
 
export const useCompanySettings = () => useContext(CompanySettingsContext);
 
 
export const CompanySettingsProvider = ({ children }: { children: React.ReactNode }) => {
    const { company } = useTenant();
    const [settings, setSettings] = useState<CompanySettings | null>(null);
    const [loading, setLoading] = useState(true);
 
    const hasFetched = useRef(false);
    useEffect(() => {
        const fetchSettings = async () => {
            if (!company || hasFetched.current) return;
            hasFetched.current = true;
            try {
                setLoading(true);
                const res = await fetch('/api/company-settings', {
                    headers: {
                        'Content-Type': 'application/json',
                        "x-tenant": company
                    },
                });
                const result = await res.json();
                if (result.success) {
                    console.log("CompanySettingsContext :", result.data);
                    const data = result.data;
                    const { getYearRange } = await import("@/lib/dateRange");
                    const range = getYearRange(data.year_type || "fiscal");

                    setSettings({
                        companyName: data.companyname || company || "",
                        baseCurrency: data.base_currency || "",
                        dateFormat: data.date_format || "DD/MM/YYYY",
                        // timeZone: data.time_zone || "",
                        yearType: data.year_type || "fiscal",
                        financialYearStart: range.from,
                        financialYearEnd: range.to,
                        salesTarget: Number(data.sales_target)
                    });
                }
            } catch (err) {
                console.error('Failed to load company settings', err);
            } finally {
                setLoading(false);
            }
        };
 
        fetchSettings();
    }, [company]);
 
    return (
        <CompanySettingsContext.Provider value={{ settings,setSettings, loading }}>
            {children}
        </CompanySettingsContext.Provider>
    );
};