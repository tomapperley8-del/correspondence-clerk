# Routine prompt wording, Stage 16c2 (29 Oct 2026)

For Tom to paste into claude.ai. Nothing in the app depends on these changes.

## CC New Business Prospecting (weekly, Mondays)

Find 8 to 12 businesses in Chiswick (W4) and the edges of Hammersmith, Acton, Kew and Brentford that are new, newly reopened, or changing hands, and that would suit the Club Card or advertising. Write each one to prospect_leads.

Look in this order, because these have produced leads that became members:
1. Instagram and TikTok posts tagged Chiswick or W4 announcing an opening, a launch or a new menu.
2. chiswickw4.com and Inside Chiswick news of openings and closures.
3. Our own news on chiswickcalendar.co.uk from the last 14 days: any business named that has no deal in Correspondence Clerk.
4. Hounslow planning and licensing applications for W4 (new premises licences, shopfronts).
5. Hot Dinners and the Evening Standard for restaurant openings in Chiswick.

Companies House is now read by the app every Monday morning (source_name "Companies House"), so skip it unless you are following up one of those leads.

For each, before writing it:
- Run match_prospect_leads so it is linked to the business if we already know them, and set match_type.
- Prefer businesses we have never approached, and former members whose term ended more than 60 days ago (match_type existing_expired). These convert best: 4 of 5 lapsed-member leads became members again.
- Find a named person and their email address from the business's own website, Instagram bio or Companies House officers. Put them in opportunity_notes as "Contact: name, role, email". Businesses with a named contact replied 33% of the time, against 6% without.
- Say in snippet, in one or two sentences, what is new and where you saw it, with the date.
- Category: one of Food & Drink, Retail, Health & Beauty, Activities, Entertainment, Services, For Children.

Do not add chains with head-office marketing, businesses already Active in Correspondence Clerk, or anything outside the area. If you find fewer than 8, say so in scraper_logs and list the sources you checked.

## CC Outreach Manager (optional addition)

Work from the same list as the Outreach tab: read `v_outreach_next` ordered by `next_order`. Draft only for buckets `chase`, `follow_up` and `new` (the first 8 `new` rows), skipping any business with `draft_ready` true. Never draft for `reply` (Tom answers those himself) or the `tidy_*` buckets. The columns `pts_*` and `fit_score` say why a business is high on the list.
