const audience = [
  {
    title: 'Virtual Assistants',
    description:
      'You manage correspondence for multiple clients. Keep each client\u2019s history separate and always know what needs attention.',
  },
  {
    title: 'Account managers & sales teams',
    description:
      'You\u2019re juggling dozens of relationships. Stop relying on memory and inbox search.',
  },
  {
    title: 'Independent consultants',
    description:
      'Your reputation depends on responsiveness. Never let a follow-up go cold again.',
  },
  {
    title: 'Small business owners',
    description:
      'You wear every hat. Let the Daily Briefing tell you what actually needs your attention today.',
  },
]

export function WhoItsFor() {
  return (
    <section className="py-24" style={{ backgroundColor: '#FAFAF8' }}>
      <div className="container mx-auto px-6">
        <h2
          className="text-3xl md:text-4xl font-bold mb-16 text-center"
          style={{ fontFamily: 'Lora, Georgia, serif', color: '#1E293B', letterSpacing: '-0.01em' }}
        >
          Built for anyone managing ongoing business relationships
        </h2>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {audience.map((item, index) => (
            <div
              key={index}
              className="p-8 rounded-sm"
              style={{
                backgroundColor: '#fff',
                border: '1px solid rgba(0,0,0,0.08)',
                borderTop: '3px solid #7C9A5E',
              }}
            >
              <h3
                className="text-base font-semibold mb-3"
                style={{ fontFamily: 'Lora, Georgia, serif', color: '#1E293B' }}
              >
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: '#64748b', lineHeight: '1.7' }}>
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
