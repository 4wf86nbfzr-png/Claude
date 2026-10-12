import { SiteFooter, SiteHeader } from "@/components/site";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="inhalt" className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
