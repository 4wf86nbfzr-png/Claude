"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/lib/storage";
import { uid } from "@/lib/id";
import type { Address, Customer, Order, SavedBuild, Selections } from "@/types/domain";

/**
 * Alles, was spaeter ein Kundenkonto uebernimmt: Bestellungen, Favoriten,
 * gespeicherte Adressen, Kontaktdaten. Heute lokal im Geraet, damit
 * "Bestellen ohne Account" trotzdem Komfort hat. Beim Anschluss eines
 * Backends wird nur die Persistenz ausgetauscht.
 */
interface AccountState {
  orders: Order[];
  favorites: SavedBuild[];
  addresses: Address[];
  customer: Partial<Customer>;
  soundEnabled: boolean;

  addOrder: (order: Order) => void;
  advanceOrder: (id: string, status: Order["status"]) => void;
  getOrder: (id: string) => Order | undefined;

  saveFavorite: (fav: Omit<SavedBuild, "id" | "createdAt">) => string;
  renameFavorite: (id: string, label: string) => void;
  removeFavorite: (id: string) => void;
  isFavorite: (categoryId: string, selections: Selections) => boolean;

  saveAddress: (address: Address) => void;
  removeAddress: (index: number) => void;
  setCustomer: (customer: Partial<Customer>) => void;
  setSound: (on: boolean) => void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      orders: [],
      favorites: [],
      addresses: [],
      customer: {},
      soundEnabled: false,

      addOrder: (order) => set((s) => ({ orders: [order, ...s.orders].slice(0, 25) })),
      advanceOrder: (id, status) =>
        set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)) })),
      getOrder: (id) => get().orders.find((o) => o.id === id),

      saveFavorite: (fav) => {
        const id = uid("fav");
        set((s) => ({ favorites: [{ ...fav, id, createdAt: Date.now() }, ...s.favorites] }));
        return id;
      },
      renameFavorite: (id, label) =>
        set((s) => ({ favorites: s.favorites.map((f) => (f.id === id ? { ...f, label } : f)) })),
      removeFavorite: (id) => set((s) => ({ favorites: s.favorites.filter((f) => f.id !== id) })),
      isFavorite: (categoryId, selections) => {
        const key = JSON.stringify(selections);
        return get().favorites.some(
          (f) => f.categoryId === categoryId && JSON.stringify(f.selections) === key,
        );
      },

      saveAddress: (address) =>
        set((s) => {
          const key = `${address.street}${address.houseNumber}${address.postalCode}`.toLowerCase();
          const rest = s.addresses.filter(
            (a) => `${a.street}${a.houseNumber}${a.postalCode}`.toLowerCase() !== key,
          );
          return { addresses: [address, ...rest].slice(0, 5) };
        }),
      removeAddress: (index) => set((s) => ({ addresses: s.addresses.filter((_, i) => i !== index) })),
      setCustomer: (customer) => set((s) => ({ customer: { ...s.customer, ...customer } })),
      setSound: (soundEnabled) => set({ soundEnabled }),
    }),
    {
      name: "craving.account.v1",
      storage: createJSONStorage(() => safeStorage),
      skipHydration: true,
    },
  ),
);
