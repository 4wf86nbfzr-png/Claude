import { Hero } from "@/components/home/Hero";
import { ScrollStory } from "@/components/home/ScrollStory";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { HowItWorks } from "@/components/home/HowItWorks";
import { DeliveryInfo } from "@/components/home/DeliveryInfo";
import { FinalCta } from "@/components/home/FinalCta";
import { StructuredData } from "@/components/home/StructuredData";
import { BUILDER_CATEGORIES } from "@/data/categories";
import { productsOfCategory } from "@/data/products";

export default function HomePage() {
  const stories = BUILDER_CATEGORIES.map((category) => {
    const products = productsOfCategory(category.id);
    return { category, product: products.find((p) => !p.freestyle) ?? products[0] };
  });

  return (
    <>
      <StructuredData />
      <Hero />

      {stories.map(({ category, product }, index) =>
        product ? (
          <ScrollStory key={category.id} category={category} product={product} index={index} />
        ) : null,
      )}

      <section aria-labelledby="auswahl" className="shell border-t border-line py-20 lg:py-28">
        <header className="max-w-2xl">
          <p className="kicker">Deine Entscheidung</p>
          <h2 id="auswahl" className="display display-l mt-3">
            Was bauen wir heute?
          </h2>
        </header>
        <div className="mt-12">
          <CategoryGrid categories={BUILDER_CATEGORIES} />
        </div>
      </section>

      <HowItWorks />
      <DeliveryInfo />
      <FinalCta />
    </>
  );
}
