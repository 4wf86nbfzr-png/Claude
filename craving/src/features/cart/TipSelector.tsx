"use client";

import { useState } from "react";
import { TIP_PRESETS } from "@/data/config";
import { formatPrice } from "@/lib/format";
import { useCartStore } from "@/stores/cart-store";

/** Trinkgeld — nie vorausgewaehlt, immer abwaehlbar. */
export function TipSelector({ base }: { base: number }) {
  const tipPercent = useCartStore((s) => s.tipPercent);
  const tipAbsolute = useCartStore((s) => s.tipAbsolute);
  const setTipPercent = useCartStore((s) => s.setTipPercent);
  const setTipAbsolute = useCartStore((s) => s.setTipAbsolute);
  const [custom, setCustom] = useState("");

  return (
    <div>
      <p className="kicker mb-3">Trinkgeld</p>
      <div className="flex flex-wrap gap-2">
        {TIP_PRESETS.map((percent) => {
          const active = tipAbsolute === undefined && tipPercent === percent;
          return (
            <button
              key={percent}
              type="button"
              onClick={() => {
                setTipPercent(percent);
                setCustom("");
              }}
              aria-pressed={active}
              className={`rounded-full border px-4 py-2 text-[0.8125rem] font-semibold transition ${
                active ? "border-transparent bg-paper text-black" : "border-line text-chrome hover:border-line-strong hover:text-paper"
              }`}
            >
              {percent === 0 ? "Kein Trinkgeld" : `${percent} %`}
              {percent > 0 && (
                <span className="num ml-1.5 font-normal opacity-70">
                  {formatPrice(Math.round((base * percent) / 100))}
                </span>
              )}
            </button>
          );
        })}
        <div className="flex items-center gap-2 rounded-full border border-line px-3 py-1.5">
          <label htmlFor="tip-custom" className="text-[0.75rem] text-muted">
            Eigener Betrag
          </label>
          <input
            id="tip-custom"
            inputMode="decimal"
            value={custom}
            onChange={(e) => {
              const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
              setCustom(raw);
              const value = Number.parseFloat(raw);
              setTipAbsolute(Number.isFinite(value) ? Math.round(value * 100) : undefined);
            }}
            placeholder="0,00"
            className="num w-16 bg-transparent text-right text-sm focus:outline-none"
          />
          <span className="text-sm text-muted">€</span>
        </div>
      </div>
    </div>
  );
}
