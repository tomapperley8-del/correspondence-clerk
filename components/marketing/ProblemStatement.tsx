export function ProblemStatement() {
  const scenarios = [
    {
      quote: '"I know someone emailed me last week but I can\'t find it."',
      label: 'Correspondence buried in your inbox',
    },
    {
      quote: '"Their contract must be up for renewal soon — I should really chase that."',
      label: 'Renewals slipping through quietly',
    },
    {
      quote: '"I meant to follow that up days ago."',
      label: 'Follow-ups that never happened',
    },
  ]

  return (
    <section className="bg-white py-20 px-6">
      <div className="max-w-5xl mx-auto">
        <h2
          className="text-3xl text-center text-[#1E293B] mb-14"
          style={{ fontFamily: 'Lora, Georgia, serif' }}
        >
          Sound familiar?
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {scenarios.map((s, i) => (
            <div key={i} className="flex flex-col gap-3">
              <p className="text-[#1E293B] text-base leading-relaxed italic">
                {s.quote}
              </p>
              <p className="text-sm text-slate-500 font-medium">{s.label}</p>
            </div>
          ))}
        </div>

        <p
          className="mt-14 text-center text-base font-medium"
          style={{ color: '#7C9A5E' }}
        >
          Correspondence Clerk fixes all three — every morning, in seconds.
        </p>
      </div>
    </section>
  )
}
