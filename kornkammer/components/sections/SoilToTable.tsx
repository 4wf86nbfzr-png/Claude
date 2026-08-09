import PinnedStory from '@/components/motion/PinnedStory'
import SplitLines from '@/components/motion/SplitLines'
import Eyebrow from '@/components/ui/Eyebrow'
import { STATIONS } from '@/data/stations'

export default function SoilToTable() {
  return (
    <section className="bg-soilDeep" aria-labelledby="story-titel">
      <div className="shell pt-[var(--sec)]">
        <Eyebrow items={['Vom Boden auf den Teller']} tone="wheat" />
        <SplitLines
          as="h2"
          id="story-titel"
          className="optical mt-8 max-w-[16ch] text-h2 leading-[0.98] tracking-[-0.03em]"
        >
          Was niemand sieht, wenn das Glas auf dem Tisch steht.
        </SplitLines>
      </div>

      <PinnedStory stations={STATIONS} />
    </section>
  )
}
