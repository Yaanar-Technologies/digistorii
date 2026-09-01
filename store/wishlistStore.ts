import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { WishlistItemType } from "@/components/storefront/types";

export type WishlistItem = WishlistItemType;

export type WishlistState = {
  items: WishlistItem[];
  addItem: (item: WishlistItem) => void;
  removeItem: (variantId: number) => void;
  toggleItem: (item: WishlistItem) => void;
  isInWishlist: (variantId: number) => boolean;
  clearWishlist: () => void;
  setItems: (items: WishlistItem[]) => void;
};

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item: WishlistItem) =>
        set((state) => {
          if (state.items.some((i) => i.variantId === item.variantId)) {
            return state;
          }
          return { items: [...state.items, item] };
        }),
      removeItem: (variantId: number) =>
        set((state) => ({
          items: state.items.filter((i) => i.variantId !== variantId),
        })),
      toggleItem: (item: WishlistItem) =>
        set((state) => {
          const exists = state.items.some((i) => i.variantId === item.variantId);
          if (exists) {
            return { items: state.items.filter((i) => i.variantId !== item.variantId) };
          }
          return { items: [...state.items, item] };
        }),
      isInWishlist: (variantId: number) => {
        return get().items.some((i) => i.variantId === variantId);
      },
      clearWishlist: () => set({ items: [] }),
      setItems: (items: WishlistItem[]) => set({ items }),
    }),
    {
      name: "digistorii_guest_wishlist",
      storage: createJSONStorage(() => (typeof window !== "undefined" ? localStorage : ({} as any))),
    }
  )
);
