"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getSession, setSession } from "./api";

export type User = { id: string; email: string; full_name: string; email_verified: boolean; is_operator: boolean };
export type TenantInfo = { id: string; name: string; slug: string; role: string; trade: string };

type AuthState = {
  loading: boolean;
  user: User | null;
  tenants: TenantInfo[];
  tenantId: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  switchTenant: (id: string) => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const me = await api<{ user: User; tenants: TenantInfo[] }>("/api/auth/me");
      setUser(me.user);
      setTenants(me.tenants);
      const current = getSession().tenantId || me.tenants[0]?.id || null;
      setTenantId(current);
      setSession(getSession().accessToken, current);
    } catch {
      setUser(null);
      setTenants([]);
      setTenantId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(reload);
  }, [reload]);

  const login = async (email: string, password: string) => {
    const data = await api<{ access_token: string; tenant_id: string | null }>("/api/auth/login", { method: "POST", json: { email, password } });
    setSession(data.access_token, data.tenant_id);
    await reload();
  };
  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    setSession(null, null);
    setUser(null);
    setTenants([]);
    setTenantId(null);
  };
  const switchTenant = async (id: string) => {
    const data = await api<{ access_token: string; tenant_id: string }>("/api/auth/switch-tenant", { method: "POST", json: { tenant_id: id } });
    setSession(data.access_token, data.tenant_id);
    setTenantId(id);
  };

  return <Ctx.Provider value={{ loading, user, tenants, tenantId, login, logout, reload, switchTenant }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth außerhalb des AuthProviders");
  return v;
}
