import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface CustomerProfile {
  id: number;
  cust_code?: string;
  cust_name?: string;
  name: string;
  email?: string;
  phone?: string;
  channel?: string;
  addresses?: any[];
}

interface CustomerAuthState {
  customer: CustomerProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setCustomer: (customer: CustomerProfile | null) => void;
  clearCustomer: () => void;
  checkSession: (company?: string) => Promise<void>;
  logout: (company?: string) => Promise<void>;
}

export const useCustomerAuthStore = create<CustomerAuthState>()(
  persist(
    (set, get) => ({
      customer: null,
      isAuthenticated: false,
      isLoading: false,

      setCustomer: (customer) => {
        set({
          customer,
          isAuthenticated: !!customer && !!customer.id,
        });
      },

      clearCustomer: () => {
        set({
          customer: null,
          isAuthenticated: false,
        });
      },

      checkSession: async (company) => {
        set({ isLoading: true });
        try {
          const url = company ? `/api/ecom/auth/me?company=${company}` : `/api/ecom/auth/me`;
          const res = await fetch(url);
          if (res.ok) {
            const data = await res.json();
            if (data.authenticated && data.customer) {
              set({
                customer: data.customer,
                isAuthenticated: true,
              });
              return;
            }
          }
          set({ customer: null, isAuthenticated: false });
        } catch (err) {
          console.error("Failed to check customer session:", err);
          set({ customer: null, isAuthenticated: false });
        } finally {
          set({ isLoading: false });
        }
      },

      logout: async (company) => {
        try {
          await fetch("/api/ecom/auth/logout", { method: "POST" });
        } catch (err) {
          console.error("Logout API call error:", err);
        } finally {
          set({ customer: null, isAuthenticated: false });
        }
      },
    }),
    {
      name: "customer_auth_storage",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
