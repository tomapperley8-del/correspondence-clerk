import { MarketingNav } from './MarketingNav'
import { MarketingFooter } from './MarketingFooter'
import { Hero } from './Hero'
import { ProblemStatement } from './ProblemStatement'
import { WhoItsFor } from './WhoItsFor'
import { Features } from './Features'
import { HowItWorks } from './HowItWorks'
import { Pricing } from './Pricing'
import { SocialProof } from './SocialProof'
import { CTASection } from './CTASection'
import { FAQ } from './FAQ'

export function LandingPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <Hero />
      <ProblemStatement />
      <WhoItsFor />
      <Features />
      <HowItWorks />
      <Pricing />
      <SocialProof />
      <FAQ />
      <CTASection />
      <MarketingFooter />
    </div>
  )
}
