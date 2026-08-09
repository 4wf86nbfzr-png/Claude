import PageHeader from '@/components/ui/PageHeader'
import Button from '@/components/ui/Button'

export default function NotFound() {
  return (
    <>
      <PageHeader
        eyebrow={['Seite nicht gefunden']}
        title="Hier wächst nichts"
        lead="Die Adresse führt ins Leere. Vielleicht hilft einer dieser Wege weiter."
      />
      <section className="section bg-soil">
        <div className="shell flex flex-wrap gap-4">
          <Button href="/">Zur Startseite</Button>
          <Button href="/produkte" variant="ghost">
            Produkte
          </Button>
          <Button href="/hofladen" variant="ghost">
            Direkt vom Hof
          </Button>
        </div>
      </section>
    </>
  )
}
