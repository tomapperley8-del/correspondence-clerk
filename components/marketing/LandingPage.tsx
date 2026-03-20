import { MarketingNav } from './MarketingNav'
import { MarketingFooter } from './MarketingFooter'
import { Hero } from './Hero'
import { Features } from './Features'
import { HowItWorks } from './HowItWorks'
import { Pricing } from './Pricing'
import { CTASection } from './CTASection'

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <CTASection />
      <MarketingFooter />
    </div>
  )
}
