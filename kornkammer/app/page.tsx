import Loader from '@/components/layout/Loader'
import Hero from '@/components/sections/Hero'
import Manifest from '@/components/sections/Manifest'
import SoilToTable from '@/components/sections/SoilToTable'
import FarmStory from '@/components/sections/FarmStory'
import ProductWorld from '@/components/sections/ProductWorld'
import CropRotation from '@/components/sections/CropRotation'
import FarmShop from '@/components/sections/FarmShop'
import Team from '@/components/sections/Team'
import BioCerts from '@/components/sections/BioCerts'

export default function Home() {
  return (
    <>
      <Loader />
      <Hero />
      <Manifest />
      <SoilToTable />
      <FarmStory />
      <ProductWorld />
      <CropRotation />
      <FarmShop />
      <Team />
      <BioCerts />
    </>
  )
}
