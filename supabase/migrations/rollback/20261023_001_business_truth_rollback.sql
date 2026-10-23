-- Rollback for 20261023_001_business_truth: restores every reader exactly as it
-- was (definitions taken from the live dump of 23 Oct), then drops the truth layer.
-- Stored status / last_contacted_at changes are undone separately from
-- cc_phase0_backup (supabase/data-fixes/20261023_stage11a_backfill_undo.sql).
CREATE OR REPLACE VIEW "public"."v_contract_status" WITH ("security_invoker"='true') AS
 SELECT "c"."id" AS "contract_id",
    "c"."business_id",
    "b"."name" AS "business_name",
    "c"."membership_type",
    "c"."contract_start",
    "c"."contract_end",
    "c"."contract_amount",
    "c"."billing_frequency",
    "c"."deal_terms",
    "c"."is_current",
    ("c"."is_current" AND ("c"."contract_end" >= CURRENT_DATE)) AS "in_force",
    ("c"."is_current" AND ("c"."contract_end" < CURRENT_DATE)) AS "lapsed",
        CASE
            WHEN ("c"."contract_end" IS NOT NULL) THEN ("c"."contract_end" - CURRENT_DATE)
            ELSE NULL::integer
        END AS "days_to_renewal",
    "f"."qbo_customer_id",
    "f"."open_balance",
    "f"."days_overdue",
    "f"."payment_status"
   FROM (("public"."contracts" "c"
     JOIN "public"."businesses" "b" ON (("b"."id" = "c"."business_id")))
     LEFT JOIN "public"."v_business_financials" "f" ON (("f"."business_id" = "c"."business_id")))
  WHERE "c"."is_current";

CREATE OR REPLACE VIEW "public"."v_business_financials" WITH ("security_invoker"='true') AS
 SELECT "b"."id" AS "business_id",
    "b"."name" AS "business_name",
    "b"."is_club_card",
    "b"."is_advertiser",
    "l"."qbo_customer_id",
    "q"."display_name" AS "qbo_display_name",
    "q"."email" AS "qbo_billing_email",
    COALESCE("q"."open_balance", (0)::numeric) AS "open_balance",
    "oi"."open_invoice_count",
    "oi"."oldest_due",
        CASE
            WHEN ("oi"."oldest_due" IS NOT NULL) THEN (CURRENT_DATE - "oi"."oldest_due")
            ELSE NULL::integer
        END AS "days_overdue",
    "oi"."open_docs",
    "q"."total_invoiced" AS "lifetime_invoiced",
    "q"."last_invoice_date",
        CASE
            WHEN ("l"."qbo_customer_id" IS NULL) THEN 'no_quickbooks_record'::"text"
            WHEN (COALESCE("q"."open_balance", (0)::numeric) <= (0)::numeric) THEN 'settled'::"text"
            WHEN ("oi"."oldest_due" IS NULL) THEN 'outstanding'::"text"
            WHEN ("oi"."oldest_due" >= CURRENT_DATE) THEN 'outstanding'::"text"
            WHEN ((CURRENT_DATE - "oi"."oldest_due") > 60) THEN 'seriously_overdue'::"text"
            ELSE 'overdue'::"text"
        END AS "payment_status"
   FROM ((("public"."businesses" "b"
     LEFT JOIN "public"."qbo_links" "l" ON (("l"."business_id" = "b"."id")))
     LEFT JOIN "public"."qbo_customers" "q" ON (("q"."qbo_customer_id" = "l"."qbo_customer_id")))
     LEFT JOIN LATERAL ( SELECT "count"(*) AS "open_invoice_count",
            "min"("i"."due_date") AS "oldest_due",
            "string_agg"("i"."doc_number", ', '::"text" ORDER BY "i"."due_date") AS "open_docs"
           FROM "public"."qbo_invoices" "i"
          WHERE (("i"."qbo_customer_id" = "l"."qbo_customer_id") AND ("i"."balance" > (0)::numeric) AND (COALESCE("i"."private_memo", ''::"text") <> 'Voided'::"text"))) "oi" ON (true));

CREATE OR REPLACE VIEW "public"."v_unrecorded_renewals" WITH ("security_invoker"='true') AS
 SELECT "b"."id" AS "business_id",
    "b"."name" AS "business_name",
    "c"."id" AS "expiring_contract_id",
    "c"."contract_end" AS "cc_thinks_ends",
    "i"."qbo_invoice_id",
    "i"."doc_number",
    "i"."txn_date" AS "invoiced_on",
    "i"."total_amount",
    "i"."balance",
    "i"."line_description"
   FROM ((("public"."contracts" "c"
     JOIN "public"."businesses" "b" ON (("b"."id" = "c"."business_id")))
     JOIN "public"."qbo_links" "l" ON (("l"."business_id" = "c"."business_id")))
     JOIN LATERAL ( SELECT "qi"."qbo_invoice_id",
            "qi"."organization_id",
            "qi"."qbo_customer_id",
            "qi"."doc_number",
            "qi"."txn_date",
            "qi"."due_date",
            "qi"."total_amount",
            "qi"."balance",
            "qi"."is_paid",
            "qi"."private_memo",
            "qi"."line_description",
            "qi"."synced_at"
           FROM "public"."qbo_invoices" "qi"
          WHERE (("qi"."qbo_customer_id" = "l"."qbo_customer_id") AND (COALESCE("qi"."private_memo", ''::"text") <> 'Voided'::"text") AND ("qi"."total_amount" > (0)::numeric))
          ORDER BY "qi"."txn_date" DESC
         LIMIT 1) "i" ON (true))
  WHERE ("c"."is_current" AND ("c"."contract_end" IS NOT NULL) AND ("i"."txn_date" >= ("c"."contract_end" - 3)) AND (NOT (EXISTS ( SELECT 1
           FROM "public"."contracts" "c2"
          WHERE (("c2"."business_id" = "c"."business_id") AND ("c2"."id" <> "c"."id") AND ("c2"."contract_end" > "c"."contract_end"))))));

CREATE OR REPLACE VIEW "public"."v_care_gaps" AS
 SELECT "severity",
    "gap",
    "detail",
    "business_id"
   FROM ( SELECT 1 AS "severity",
            'Owed money but not linked to a business'::"text" AS "gap",
            ((COALESCE("qc"."display_name", "i"."qbo_customer_id") || ', £'::"text") || "to_char"("sum"("i"."balance"), 'FM999999990.00'::"text")) AS "detail",
            NULL::"uuid" AS "business_id"
           FROM ("public"."qbo_invoices" "i"
             LEFT JOIN "public"."qbo_customers" "qc" ON (("qc"."qbo_customer_id" = "i"."qbo_customer_id")))
          WHERE (("i"."balance" > (0)::numeric) AND (COALESCE("i"."private_memo", ''::"text") <> 'Voided'::"text") AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."qbo_links" "l"
                  WHERE ("l"."qbo_customer_id" = "i"."qbo_customer_id")))))
          GROUP BY 'Owed money but not linked to a business'::"text", COALESCE("qc"."display_name", "i"."qbo_customer_id")
         HAVING ("sum"("i"."balance") >= (1)::numeric)
        UNION ALL
         SELECT 1,
            'Owes money but replies are muted'::"text",
            (("b"."name" || ', £'::"text") || "to_char"("sum"("i"."balance"), 'FM999999990.00'::"text")),
            "b"."id"
           FROM (("public"."qbo_invoices" "i"
             JOIN "public"."qbo_links" "l" ON (("l"."qbo_customer_id" = "i"."qbo_customer_id")))
             JOIN "public"."businesses" "b" ON (("b"."id" = "l"."business_id")))
          WHERE (("i"."balance" > (0)::numeric) AND (COALESCE("i"."private_memo", ''::"text") <> 'Voided'::"text") AND ("i"."due_date" <= (CURRENT_DATE - 7)) AND "b"."mute_replies")
          GROUP BY "b"."name", "b"."id"
        UNION ALL
         SELECT 2,
            'Payment chaser parked for more than a week'::"text",
            ((((("b"."name" || ' until '::"text") || "to_char"(("d"."snooze_until")::timestamp with time zone, 'DD Mon'::"text")) || ' ('::"text") || COALESCE("left"("d"."reason", 60), 'no reason'::"text")) || ')'::"text"),
            "b"."id"
           FROM ("public"."routine_drafts" "d"
             JOIN "public"."businesses" "b" ON (("b"."id" = "d"."business_id")))
          WHERE (("d"."outcome" = 'skipped'::"text") AND ("d"."kind" = 'overdue'::"text") AND ("d"."snooze_until" > (CURRENT_DATE + 7)))
        UNION ALL
         SELECT 2,
            'Draft waiting over a week'::"text",
            ((((("b"."name" || ', '::"text") || COALESCE("d"."subject", "d"."kind")) || ', written '::"text") || "to_char"("d"."created_at", 'DD Mon'::"text")) ||
                CASE
                    WHEN ("d"."bump_count" > 0) THEN ((', moved back up '::"text" || "d"."bump_count") || 'x'::"text")
                    ELSE ''::"text"
                END),
            "b"."id"
           FROM ("public"."routine_drafts" "d"
             JOIN "public"."businesses" "b" ON (("b"."id" = "d"."business_id")))
          WHERE (("d"."outcome" = 'drafted'::"text") AND ("d"."sent_at" IS NULL) AND ("d"."created_at" < ("now"() - '7 days'::interval)))
        UNION ALL
         SELECT 2,
            'Member with no contract on file'::"text",
            "b"."name",
            "b"."id"
           FROM "public"."businesses" "b"
          WHERE (("b"."is_club_card" OR "b"."is_advertiser") AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."contracts" "c"
                  WHERE (("c"."business_id" = "b"."id") AND "c"."is_current")))))
        UNION ALL
         SELECT 3,
            'Term ended, nothing recorded since'::"text",
            (("b"."name" || ', ended '::"text") || "to_char"(("s"."contract_end")::timestamp with time zone, 'DD Mon YYYY'::"text")),
            "b"."id"
           FROM ("public"."v_contract_status" "s"
             JOIN "public"."businesses" "b" ON (("b"."id" = "s"."business_id")))
          WHERE ("s"."is_current" AND (("s"."contract_end" >= (CURRENT_DATE - 120)) AND ("s"."contract_end" <= (CURRENT_DATE - 1))) AND (COALESCE("b"."renewal_stage", ''::"text") <> ALL (ARRAY['not_renewing'::"text", 'invoice_paid'::"text"])) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."contracts" "n"
                  WHERE (("n"."business_id" = "b"."id") AND "n"."is_current" AND ("n"."contract_start" > COALESCE("s"."contract_start", '1900-01-01'::"date")))))))) "g"
  WHERE (("business_id" IS NULL) OR (NOT (EXISTS ( SELECT 1
           FROM "public"."care_exclusions" "e"
          WHERE (("e"."business_id" = "g"."business_id") AND ("e"."kind" = 'all'::"text"))))));

CREATE OR REPLACE VIEW "public"."v_task_signals" AS
 WITH "r" AS (
         SELECT "task_rules"."id",
            "task_rules"."params",
            "task_rules"."task_category"
           FROM "public"."task_rules"
          WHERE "task_rules"."enabled"
        )
 SELECT 'invoice_overdue'::"text" AS "rule_id",
    ('invoice_overdue:'::"text" || "i"."qbo_invoice_id") AS "signal_key",
    "b"."id" AS "business_id",
    ((('Chase £'::"text" || "to_char"("i"."balance", 'FM999999990.00'::"text")) || ' from '::"text") || "b"."name") AS "title",
    ((((((('Invoice '::"text" || "i"."doc_number") || ' was due '::"text") || "to_char"(("i"."due_date")::timestamp with time zone, 'DD Mon YYYY'::"text")) || ' ('::"text") || (CURRENT_DATE - "i"."due_date")) || ' days ago). '::"text") || COALESCE("left"("i"."line_description", 160), ''::"text")) AS "notes",
    CURRENT_DATE AS "due_date",
    ((CURRENT_DATE - "i"."due_date") > (("r"."params" ->> 'priority_after_days'::"text"))::integer) AS "is_priority",
    "r"."task_category",
    "jsonb_build_object"('invoice', "i"."doc_number", 'balance', "i"."balance", 'due', "i"."due_date", 'days_overdue', (CURRENT_DATE - "i"."due_date")) AS "meta"
   FROM ((("r"
     JOIN "public"."qbo_invoices" "i" ON (("r"."id" = 'invoice_overdue'::"text")))
     JOIN "public"."qbo_links" "l" ON (("l"."qbo_customer_id" = "i"."qbo_customer_id")))
     JOIN "public"."businesses" "b" ON (("b"."id" = "l"."business_id")))
  WHERE (("i"."balance" > (0)::numeric) AND (COALESCE("i"."private_memo", ''::"text") <> 'Voided'::"text") AND ("i"."due_date" < (CURRENT_DATE - (("r"."params" ->> 'grace_days'::"text"))::integer)))
UNION ALL
 SELECT 'invoice_due_soon'::"text" AS "rule_id",
    ('invoice_due_soon:'::"text" || "i"."qbo_invoice_id") AS "signal_key",
    "b"."id" AS "business_id",
    ((('Payment due from '::"text" || "b"."name") || ' on '::"text") || "to_char"(("i"."due_date")::timestamp with time zone, 'DD Mon'::"text")) AS "title",
    ((((('Invoice '::"text" || "i"."doc_number") || ' for £'::"text") || "to_char"("i"."balance", 'FM999999990.00'::"text")) || '. '::"text") || COALESCE("left"("i"."line_description", 160), ''::"text")) AS "notes",
    ("i"."due_date" - 3) AS "due_date",
    false AS "is_priority",
    "r"."task_category",
    "jsonb_build_object"('invoice', "i"."doc_number", 'balance', "i"."balance", 'due', "i"."due_date") AS "meta"
   FROM ((("r"
     JOIN "public"."qbo_invoices" "i" ON (("r"."id" = 'invoice_due_soon'::"text")))
     JOIN "public"."qbo_links" "l" ON (("l"."qbo_customer_id" = "i"."qbo_customer_id")))
     JOIN "public"."businesses" "b" ON (("b"."id" = "l"."business_id")))
  WHERE (("i"."balance" > (0)::numeric) AND (COALESCE("i"."private_memo", ''::"text") <> 'Voided'::"text") AND ("i"."due_date" >= CURRENT_DATE) AND ("i"."due_date" <= (CURRENT_DATE + (("r"."params" ->> 'days_ahead'::"text"))::integer)))
UNION ALL
 SELECT 'renewal_due'::"text" AS "rule_id",
    ('renewal_due:'::"text" || ("c"."contract_id")::"text") AS "signal_key",
    "c"."business_id",
    (((('Renew '::"text" || "c"."business_name") || ' ('::"text") || COALESCE("c"."membership_type", 'membership'::"text")) || ')'::"text") AS "title",
    (((((('Ends '::"text" || "to_char"(("c"."contract_end")::timestamp with time zone, 'DD Mon YYYY'::"text")) || ', '::"text") || "c"."days_to_renewal") || ' days away'::"text") || COALESCE((' at £'::"text" || "to_char"("c"."contract_amount", 'FM999999990.00'::"text")), ''::"text")) || COALESCE(('. '::"text" || "left"("c"."deal_terms", 160)), ''::"text")) AS "notes",
    GREATEST(CURRENT_DATE, ("c"."contract_end" - (("r"."params" ->> 'lead_days'::"text"))::integer)) AS "due_date",
    false AS "is_priority",
    "r"."task_category",
    "jsonb_build_object"('contract', "c"."contract_id", 'ends', "c"."contract_end", 'amount', "c"."contract_amount") AS "meta"
   FROM ("r"
     JOIN "public"."v_contract_status" "c" ON (("r"."id" = 'renewal_due'::"text")))
  WHERE ("c"."in_force" AND (("c"."days_to_renewal" >= 0) AND ("c"."days_to_renewal" <= (("r"."params" ->> 'days_before'::"text"))::integer)))
UNION ALL
 SELECT 'renewal_lapsed'::"text" AS "rule_id",
    ('renewal_lapsed:'::"text" || ("c"."contract_id")::"text") AS "signal_key",
    "c"."business_id",
    ((('Lapsed: '::"text" || "c"."business_name") || ' ended '::"text") || "to_char"(("c"."contract_end")::timestamp with time zone, 'DD Mon'::"text")) AS "title",
    (((COALESCE("c"."membership_type", 'Membership'::"text") || ' ended '::"text") || "to_char"(("c"."contract_end")::timestamp with time zone, 'DD Mon YYYY'::"text")) || ' with nothing recorded since. Renew, or mark the relationship closed.'::"text") AS "notes",
    CURRENT_DATE AS "due_date",
    ((CURRENT_DATE - "c"."contract_end") > 30) AS "is_priority",
    "r"."task_category",
    "jsonb_build_object"('contract', "c"."contract_id", 'ended', "c"."contract_end") AS "meta"
   FROM ("r"
     JOIN "public"."v_contract_status" "c" ON (("r"."id" = 'renewal_lapsed'::"text")))
  WHERE ("c"."lapsed" AND ("c"."contract_end" >= (CURRENT_DATE - (("r"."params" ->> 'within_days'::"text"))::integer)) AND (NOT (EXISTS ( SELECT 1
           FROM "public"."v_unrecorded_renewals" "u"
          WHERE ("u"."expiring_contract_id" = "c"."contract_id")))))
UNION ALL
 SELECT 'unrecorded_renewal'::"text" AS "rule_id",
    ('unrecorded_renewal:'::"text" || "u"."qbo_invoice_id") AS "signal_key",
    "u"."business_id",
    ('Record the renewal for '::"text" || "u"."business_name") AS "title",
    ((((((((('Invoice '::"text" || "u"."doc_number") || ' raised '::"text") || "to_char"(("u"."invoiced_on")::timestamp with time zone, 'DD Mon YYYY'::"text")) || ' for £'::"text") || "to_char"("u"."total_amount", 'FM999999990.00'::"text")) || ', but the contract here still ends '::"text") || "to_char"(("u"."cc_thinks_ends")::timestamp with time zone, 'DD Mon YYYY'::"text")) || '. Invoice says: '::"text") || "left"("u"."line_description", 160)) AS "notes",
    CURRENT_DATE AS "due_date",
    true AS "is_priority",
    "r"."task_category",
    "jsonb_build_object"('invoice', "u"."doc_number", 'amount', "u"."total_amount", 'balance', "u"."balance") AS "meta"
   FROM ("r"
     JOIN "public"."v_unrecorded_renewals" "u" ON (("r"."id" = 'unrecorded_renewal'::"text")))
UNION ALL
 SELECT 'correspondence_flagged'::"text" AS "rule_id",
    ('corr_flagged:'::"text" || ("co"."id")::"text") AS "signal_key",
    "co"."business_id",
    (("initcap"("replace"(("co"."action_needed")::"text", '_'::"text", ' '::"text")) || ': '::"text") || "b"."name") AS "title",
    (((((COALESCE("co"."subject", '(no subject)'::"text") || ' — logged '::"text") || "to_char"("co"."entry_date", 'DD Mon YYYY'::"text")) || ', flagged as '::"text") || "replace"(("co"."action_needed")::"text", '_'::"text", ' '::"text")) || '.'::"text") AS "notes",
    COALESCE(("co"."due_at")::"date", CURRENT_DATE) AS "due_date",
    false AS "is_priority",
    "r"."task_category",
    "jsonb_build_object"('correspondence', "co"."id", 'flag', ("co"."action_needed")::"text", 'due_at', "co"."due_at") AS "meta"
   FROM (("r"
     JOIN "public"."correspondence" "co" ON (("r"."id" = 'correspondence_flagged'::"text")))
     JOIN "public"."businesses" "b" ON (("b"."id" = "co"."business_id")))
  WHERE ((("co"."action_needed")::"text" <> 'none'::"text") AND ("co"."due_at" IS NOT NULL) AND (NOT COALESCE("b"."mute_replies", false)) AND ("co"."due_at" <= ("now"() + ((("r"."params" ->> 'days_ahead'::"text") || ' days'::"text"))::interval)) AND (NOT (EXISTS ( SELECT 1
           FROM "public"."correspondence" "c2"
          WHERE (("c2"."business_id" = "co"."business_id") AND ("c2"."direction" = 'sent'::"text") AND ("c2"."entry_date" > "co"."entry_date"))))))
UNION ALL
 SELECT 'reply_needed'::"text" AS "rule_id",
    ('reply:'::"text" || ("t"."id")::"text") AS "signal_key",
    "t"."business_id",
    ((
        CASE "t"."intent"
            WHEN 'money'::"text" THEN 'Money: '::"text"
            WHEN 'lead'::"text" THEN 'Lead: '::"text"
            ELSE 'Reply to '::"text"
        END || "t"."business_name") || COALESCE((' — '::"text" || "left"("t"."subject", 60)), ''::"text")) AS "title",
    ((((('They wrote on '::"text" || "to_char"("t"."entry_date", 'DD Mon'::"text")) || ' ('::"text") || (CURRENT_DATE - ("t"."entry_date")::"date")) || ' days ago) and nothing has gone back. '::"text") || COALESCE(("t"."intent_meta" ->> 'summary'::"text"), ''::"text")) AS "notes",
    ("t"."entry_date")::"date" AS "due_date",
    ("t"."intent" = ANY (ARRAY['money'::"text", 'lead'::"text"])) AS "is_priority",
    "r"."task_category",
    "jsonb_build_object"('correspondence', "t"."id", 'intent', "t"."intent", 'received', ("t"."entry_date")::"date", 'subject', "t"."subject") AS "meta"
   FROM ("r"
     JOIN "public"."v_inbound_tails" "t" ON (("r"."id" = 'reply_needed'::"text")))
  WHERE (("t"."intent" = ANY (ARRAY['reply_needed'::"text", 'money'::"text", 'lead'::"text"])) AND (NOT "t"."answered") AND ("t"."reply_dismissed_at" IS NULL) AND ("t"."entry_date" > ("now"() - ((("r"."params" ->> 'stale_after_days'::"text") || ' days'::"text"))::interval)) AND ("t"."entry_date" < ("now"() - ((
        CASE
            WHEN ("t"."intent" = ANY (ARRAY['money'::"text", 'lead'::"text"])) THEN ("r"."params" ->> 'money_after_days'::"text")
            ELSE ("r"."params" ->> 'reply_after_days'::"text")
        END || ' days'::"text"))::interval)))
UNION ALL
 SELECT 'editorial_inbox'::"text" AS "rule_id",
    ('editorial:'::"text" || ("t"."id")::"text") AS "signal_key",
    "t"."business_id",
    (('Editorial: '::"text" || "t"."business_name") || COALESCE((' — '::"text" || "left"("t"."subject", 60)), ''::"text")) AS "title",
    ((('Arrived '::"text" || "to_char"("t"."entry_date", 'DD Mon'::"text")) || '. '::"text") || COALESCE(("t"."intent_meta" ->> 'summary'::"text"), 'Press release, event or copy for the newsletter.'::"text")) AS "notes",
    ("t"."entry_date")::"date" AS "due_date",
    false AS "is_priority",
    "r"."task_category",
    "jsonb_build_object"('correspondence', "t"."id", 'intent', 'editorial', 'received', ("t"."entry_date")::"date") AS "meta"
   FROM ("r"
     JOIN "public"."v_inbound_tails" "t" ON (("r"."id" = 'editorial_inbox'::"text")))
  WHERE (("t"."intent" = 'editorial'::"text") AND (NOT "t"."answered") AND ("t"."reply_dismissed_at" IS NULL) AND ("t"."entry_date" > ("now"() - ((("r"."params" ->> 'fresh_days'::"text") || ' days'::"text"))::interval)))
UNION ALL
 SELECT 'commitment_due'::"text" AS "rule_id",
    ('commitment:'::"text" || ("o"."id")::"text") AS "signal_key",
    "o"."business_id",
    (((('You said you''d: '::"text" || COALESCE(("o"."intent_meta" ->> 'what'::"text"), 'follow up'::"text")) || ' ('::"text") || "b"."name") || ')'::"text") AS "title",
    ((((('Promised on '::"text" || "to_char"("o"."entry_date", 'DD Mon'::"text")) || ' for '::"text") || COALESCE(("o"."intent_meta" ->> 'due'::"text"), 'no date'::"text")) || '. '::"text") || COALESCE("left"("o"."subject", 80), ''::"text")) AS "notes",
    COALESCE((("o"."intent_meta" ->> 'due'::"text"))::"date", CURRENT_DATE) AS "due_date",
    ((("o"."intent_meta" ->> 'due'::"text"))::"date" < CURRENT_DATE) AS "is_priority",
    "r"."task_category",
    "jsonb_build_object"('correspondence', "o"."id", 'what', ("o"."intent_meta" ->> 'what'::"text"), 'due', ("o"."intent_meta" ->> 'due'::"text")) AS "meta"
   FROM (("r"
     JOIN "public"."correspondence" "o" ON (("r"."id" = 'commitment_due'::"text")))
     JOIN "public"."businesses" "b" ON (("b"."id" = "o"."business_id")))
  WHERE (("o"."direction" = 'sent'::"text") AND ("o"."intent" = 'commitment'::"text") AND (COALESCE((("o"."intent_meta" ->> 'done'::"text"))::boolean, false) = false) AND ((("o"."intent_meta" ->> 'due'::"text"))::"date" <= (CURRENT_DATE + (("r"."params" ->> 'lead_days'::"text"))::integer)))
UNION ALL
 SELECT 'advertiser_stats'::"text" AS "rule_id",
    ((('stats:'::"text" || ("c"."contract_id")::"text") || ':'::"text") || "to_char"((CURRENT_DATE)::timestamp with time zone, 'YYYY-MM'::"text")) AS "signal_key",
    "c"."business_id",
    ((('Send '::"text" || "to_char"((CURRENT_DATE)::timestamp with time zone, 'Month'::"text")) || ' stats to '::"text") || "c"."business_name") AS "title",
    (((('Advertising runs '::"text" || "to_char"(("c"."contract_start")::timestamp with time zone, 'DD Mon YY'::"text")) || ' to '::"text") || "to_char"(("c"."contract_end")::timestamp with time zone, 'DD Mon YY'::"text")) || COALESCE(('. '::"text" || "left"("c"."deal_terms", 140)), ''::"text")) AS "notes",
    "make_date"((EXTRACT(year FROM CURRENT_DATE))::integer, (EXTRACT(month FROM CURRENT_DATE))::integer, (("r"."params" ->> 'due_day'::"text"))::integer) AS "due_date",
    false AS "is_priority",
    "r"."task_category",
    "jsonb_build_object"('contract', "c"."contract_id", 'month', "to_char"((CURRENT_DATE)::timestamp with time zone, 'YYYY-MM'::"text")) AS "meta"
   FROM ("r"
     JOIN "public"."v_contract_status" "c" ON (("r"."id" = 'advertiser_stats'::"text")))
  WHERE ("c"."in_force" AND ("c"."membership_type" = 'advertiser'::"text"))
UNION ALL
 SELECT 'club_card_checkin'::"text" AS "rule_id",
    ('checkin:'::"text" || ("c"."contract_id")::"text") AS "signal_key",
    "c"."business_id",
    ('Check in with '::"text" || "c"."business_name") AS "title",
    (('Halfway through their Club Card year (ends '::"text" || "to_char"(("c"."contract_end")::timestamp with time zone, 'DD Mon YYYY'::"text")) || '). How is the offer working, anything to promote, any stats worth sharing.'::"text") AS "notes",
    ("c"."contract_start" + (("c"."contract_end" - "c"."contract_start") / 2)) AS "due_date",
    false AS "is_priority",
    "r"."task_category",
    "jsonb_build_object"('contract', "c"."contract_id", 'midpoint', ("c"."contract_start" + (("c"."contract_end" - "c"."contract_start") / 2))) AS "meta"
   FROM ("r"
     JOIN "public"."v_contract_status" "c" ON (("r"."id" = 'club_card_checkin'::"text")))
  WHERE ("c"."in_force" AND ("c"."membership_type" = 'club_card'::"text") AND ("c"."contract_start" IS NOT NULL) AND ((CURRENT_DATE >= ("c"."contract_start" + (("c"."contract_end" - "c"."contract_start") / 2))) AND (CURRENT_DATE <= (("c"."contract_start" + (("c"."contract_end" - "c"."contract_start") / 2)) + (("r"."params" ->> 'open_for_days'::"text"))::integer))));

CREATE OR REPLACE VIEW "public"."v_business_attention" WITH ("security_invoker"='true') AS
 WITH "today" AS (
         SELECT "public"."cc_today"() AS "d"
        ), "biz" AS (
         SELECT "b_1"."id",
            "b_1"."name",
            "b_1"."normalized_name",
            "b_1"."category",
            "b_1"."status",
            "b_1"."is_club_card",
            "b_1"."is_advertiser",
            "b_1"."last_contacted_at",
            "b_1"."mastersheet_source_ids",
            "b_1"."created_at",
            "b_1"."updated_at",
            "b_1"."contract_start",
            "b_1"."contract_end",
            "b_1"."deal_terms",
            "b_1"."payment_structure",
            "b_1"."contract_amount",
            "b_1"."address",
            "b_1"."email",
            "b_1"."phone",
            "b_1"."organization_id",
            "b_1"."contract_currency",
            "b_1"."notes",
            "b_1"."membership_type",
            "b_1"."relationship_memory",
            "b_1"."relationship_memory_updated_at",
            "b_1"."contract_renewal_type",
            "b_1"."business_type",
            "b_1"."disposition",
            "b_1"."follow_up_after",
            "b_1"."mute_replies",
            "b_1"."renewal_stage",
            "b_1"."renewal_contacted_at",
            "b_1"."outreach_stage",
            "b_1"."outreach_contacted_at",
            "b_1"."outreach_followed_up_at",
            "b_1"."outreach_declined_at",
            "b_1"."renewal_declined_at",
            "b_1"."outreach_identified_at",
            "b_1"."outreach_in_discussion_at",
            "b_1"."outreach_won_at",
            "b_1"."outreach_invoice_paid_at",
            "b_1"."renewal_not_started_at",
            "b_1"."renewal_in_discussion_at",
            "b_1"."renewal_agreed_at",
            "b_1"."renewal_invoice_paid_at",
            "b_1"."invoice_number",
            "b_1"."merged_into",
            "b_1"."attention_snoozed_until"
           FROM "public"."businesses" "b_1"
          WHERE (("b_1"."merged_into" IS NULL) AND (COALESCE("b_1"."status", ''::"text") <> 'Not a business'::"text"))
        ), "money" AS (
         SELECT "l"."business_id",
            "sum"("i"."balance") AS "amount",
            "min"("i"."due_date") AS "oldest_due",
            "count"(*) AS "invoices",
            "string_agg"(COALESCE("i"."doc_number", "i"."qbo_invoice_id"), ', '::"text" ORDER BY "i"."due_date") AS "docs"
           FROM (("public"."qbo_invoices" "i"
             JOIN "public"."qbo_links" "l" ON (("l"."qbo_customer_id" = "i"."qbo_customer_id")))
             CROSS JOIN "today")
          WHERE (("i"."balance" > (0)::numeric) AND (COALESCE("i"."private_memo", ''::"text") <> 'Voided'::"text") AND ("i"."due_date" < "today"."d") AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."care_exclusions" "e"
                  WHERE (("e"."business_id" = "l"."business_id") AND ("e"."kind" = ANY (ARRAY['all'::"text", 'overdue'::"text"])))))) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."correspondence" "c"
                  WHERE (("c"."business_id" = "l"."business_id") AND ("c"."direction" = 'sent'::"text") AND ("c"."entry_date" > ("now"() - '7 days'::interval)) AND ((("c"."ai_metadata" ->> 'source'::"text") = 'quickbooks_notice'::"text") OR ("c"."subject" ~* '(invoice|payment|overdue|outstanding)'::"text")))))) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."routine_drafts" "d"
                  WHERE (("d"."business_id" = "l"."business_id") AND ("d"."kind" = 'overdue'::"text") AND ("d"."sent_at" > ("now"() - '7 days'::interval)))))))
          GROUP BY "l"."business_id"
        ), "renewal" AS (
         SELECT DISTINCT ON ("s"."business_id") "s"."business_id",
            "s"."id" AS "contract_id",
            "s"."membership_type",
            "s"."contract_end",
            "s"."contract_amount"
           FROM (("public"."contracts" "s"
             JOIN "biz" "b_1" ON (("b_1"."id" = "s"."business_id")))
             CROSS JOIN "today")
          WHERE ("s"."is_current" AND ("s"."membership_type" = ANY (ARRAY['club_card'::"text", 'advertiser'::"text"])) AND (("s"."contract_end" >= ("today"."d" - 60)) AND ("s"."contract_end" <= ("today"."d" + 45))) AND (COALESCE("b_1"."renewal_stage", 'not_started'::"text") <> ALL (ARRAY['agreed'::"text", 'invoice_paid'::"text", 'not_renewing'::"text"])) AND ("b_1"."renewal_declined_at" IS NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."contracts" "n"
                  WHERE (("n"."business_id" = "s"."business_id") AND ("n"."id" <> "s"."id") AND "n"."is_current" AND (NOT ("n"."membership_type" IS DISTINCT FROM "s"."membership_type")) AND ("n"."contract_end" > "s"."contract_end"))))) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."v_unrecorded_renewals" "u"
                  WHERE ("u"."expiring_contract_id" = "s"."id")))))
          ORDER BY "s"."business_id", "s"."contract_end"
        ), "waiting" AS (
         SELECT "r"."business_id",
            "count"(*) AS "emails",
            "min"("r"."entry_date") AS "oldest",
            ("array_agg"("r"."id" ORDER BY "r"."entry_date" DESC))[1] AS "latest_id",
            ("array_agg"("r"."subject" ORDER BY "r"."entry_date" DESC))[1] AS "latest_subject"
           FROM (("biz" "b_1"
             JOIN "public"."correspondence" "r" ON (("r"."business_id" = "b_1"."id")))
             LEFT JOIN "public"."org_business_types" "t" ON ((("t"."org_id" = "b_1"."organization_id") AND ("t"."value" = "b_1"."business_type"))))
          WHERE (("r"."direction" = 'received'::"text") AND ("r"."entry_date" > ("now"() - '30 days'::interval)) AND ("r"."reply_dismissed_at" IS NULL) AND (COALESCE(("r"."action_needed")::"text", 'none'::"text") <> 'waiting_on_them'::"text") AND (("r"."intent" IS NULL) OR ("r"."intent" = ANY (ARRAY['reply_needed'::"text", 'money'::"text", 'lead'::"text", 'meeting'::"text"]))) AND (COALESCE("b_1"."status", ''::"text") <> 'Unreviewed'::"text") AND (NOT COALESCE("b_1"."mute_replies", false)) AND COALESCE("t"."is_commercial", true) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."correspondence" "o"
                  WHERE ((("o"."business_id" = "r"."business_id") OR ("r"."business_id" = ANY ("o"."linked_business_ids"))) AND ("o"."direction" = 'sent'::"text") AND ("o"."entry_date" > "r"."entry_date"))))) AND "public"."email_needs_reply"("r"."subject", "r"."formatted_text_current"))
          GROUP BY "r"."business_id"
        ), "todo_items" AS (
         SELECT "t"."business_id",
            "t"."id",
            "t"."title",
            "t"."due_date",
            "t"."created_at"
           FROM ("public"."tasks" "t"
             CROSS JOIN "today")
          WHERE (("t"."status" = 'open'::"text") AND ("t"."source" = 'manual'::"text") AND ("t"."business_id" IS NOT NULL) AND ("t"."due_date" <= "today"."d"))
        UNION ALL
         SELECT "co"."business_id",
            "co"."id",
            ('Follow up: '::"text" || COALESCE(NULLIF("co"."subject", ''::"text"), '(no subject)'::"text")),
            (("co"."due_at" AT TIME ZONE 'Europe/London'::"text"))::"date" AS "timezone",
            "co"."created_at"
           FROM ("public"."correspondence" "co"
             CROSS JOIN "today")
          WHERE ((("co"."action_needed")::"text" = 'follow_up'::"text") AND ("co"."due_at" IS NOT NULL) AND ((("co"."due_at" AT TIME ZONE 'Europe/London'::"text"))::"date" <= "today"."d") AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."correspondence" "c2"
                  WHERE (("c2"."business_id" = "co"."business_id") AND ("c2"."direction" = 'sent'::"text") AND ("c2"."entry_date" > "co"."entry_date"))))))
        ), "todo" AS (
         SELECT "todo_items"."business_id",
            "count"(*) AS "todos",
            "min"("todo_items"."due_date") AS "earliest_due",
            ("array_agg"("todo_items"."id" ORDER BY "todo_items"."due_date", "todo_items"."created_at"))[1] AS "first_id",
            ("array_agg"("todo_items"."title" ORDER BY "todo_items"."due_date", "todo_items"."created_at"))[1] AS "first_title"
           FROM "todo_items"
          GROUP BY "todo_items"."business_id"
        ), "club_card" AS (
         SELECT "m_1"."business_id",
            "m_1"."issues",
            ('page_lapsed'::"text" = ANY ("m_1"."issues")) AS "lapsed",
            "m_1"."contract_end",
            "m_1"."offer_ends",
            "m_1"."wp_id"
           FROM "public"."v_club_card_members" "m_1"
          WHERE ("cardinality"("m_1"."issues") > 0)
        )
 SELECT "b"."id" AS "business_id",
    "b"."organization_id",
    "b"."name" AS "business_name",
    "b"."status",
        CASE
            WHEN ("m"."business_id" IS NOT NULL) THEN 1
            WHEN ("rn"."business_id" IS NOT NULL) THEN 2
            WHEN "cc"."lapsed" THEN 3
            WHEN ("w"."business_id" IS NOT NULL) THEN 4
            WHEN ("tk"."business_id" IS NOT NULL) THEN 5
            ELSE 6
        END AS "priority",
        CASE
            WHEN ("m"."business_id" IS NOT NULL) THEN 'money_owed'::"text"
            WHEN ("rn"."business_id" IS NOT NULL) THEN 'renewal'::"text"
            WHEN "cc"."lapsed" THEN 'club_card_lapsed'::"text"
            WHEN ("w"."business_id" IS NOT NULL) THEN 'waiting_on_you'::"text"
            WHEN ("tk"."business_id" IS NOT NULL) THEN 'todo'::"text"
            ELSE 'club_card'::"text"
        END AS "reason",
        CASE
            WHEN ("m"."business_id" IS NOT NULL) THEN ((((('£'::"text" || "to_char"("m"."amount", 'FM999999990.00'::"text")) || ' owed on '::"text") || "m"."docs") || ', due '::"text") || "to_char"(("m"."oldest_due")::timestamp with time zone, 'DD/MM/YYYY'::"text"))
            WHEN ("rn"."business_id" IS NOT NULL) THEN ((
            CASE "rn"."membership_type"
                WHEN 'club_card'::"text" THEN 'Club Card'::"text"
                ELSE 'Advertising'::"text"
            END ||
            CASE
                WHEN ("rn"."contract_end" < "td"."d") THEN ' ended '::"text"
                ELSE ' ends '::"text"
            END) || "to_char"(("rn"."contract_end")::timestamp with time zone, 'DD/MM/YYYY'::"text"))
            WHEN "cc"."lapsed" THEN ('Club Card page still live; card '::"text" || COALESCE(('ended '::"text" || "to_char"(("cc"."contract_end")::timestamp with time zone, 'DD/MM/YYYY'::"text")), 'not renewing'::"text"))
            WHEN ("w"."business_id" IS NOT NULL) THEN (COALESCE(NULLIF("w"."latest_subject", ''::"text"), '(no subject)'::"text") ||
            CASE
                WHEN ("w"."emails" > 1) THEN ((' ('::"text" || "w"."emails") || ' emails)'::"text")
                ELSE ''::"text"
            END)
            WHEN ("tk"."business_id" IS NOT NULL) THEN ("tk"."first_title" ||
            CASE
                WHEN ("tk"."todos" > 1) THEN ((' (+'::"text" || ("tk"."todos" - 1)) || ' more)'::"text")
                ELSE ''::"text"
            END)
            ELSE ('Club Card page: '::"text" || "array_to_string"(ARRAY( SELECT
                    CASE "i"."i"
                        WHEN 'page_no_member'::"text" THEN 'page but no Club Card on file'::"text"
                        WHEN 'no_page'::"text" THEN 'no page'::"text"
                        WHEN 'offer_old'::"text" THEN 'offer not checked for a year'::"text"
                        WHEN 'offer_ending'::"text" THEN ('offer ends '::"text" || "to_char"(("cc"."offer_ends")::timestamp with time zone, 'DD/MM/YYYY'::"text"))
                        WHEN 'not_in_az'::"text" THEN 'not in the A-Z'::"text"
                        WHEN 'az_twice'::"text" THEN 'listed twice in the A-Z'::"text"
                        WHEN 'not_on_map'::"text" THEN 'not on the map'::"text"
                        WHEN 'no_category'::"text" THEN 'in no category'::"text"
                        WHEN 'contact_differs'::"text" THEN 'contact details differ'::"text"
                        ELSE "i"."i"
                    END AS "i"
               FROM "unnest"("cc"."issues") "i"("i")), ', '::"text"))
        END AS "detail",
        CASE
            WHEN ("m"."business_id" IS NOT NULL) THEN "m"."oldest_due"
            WHEN ("rn"."business_id" IS NOT NULL) THEN "rn"."contract_end"
            WHEN "cc"."lapsed" THEN "cc"."contract_end"
            WHEN ("w"."business_id" IS NOT NULL) THEN (("w"."oldest" AT TIME ZONE 'Europe/London'::"text"))::"date"
            WHEN ("tk"."business_id" IS NOT NULL) THEN "tk"."earliest_due"
            ELSE "cc"."offer_ends"
        END AS "since",
        CASE
            WHEN ("m"."business_id" IS NOT NULL) THEN true
            WHEN ("rn"."business_id" IS NOT NULL) THEN ("rn"."contract_end" < "td"."d")
            WHEN "cc"."lapsed" THEN false
            WHEN ("w"."business_id" IS NOT NULL) THEN false
            WHEN ("tk"."business_id" IS NOT NULL) THEN ("tk"."earliest_due" < "td"."d")
            ELSE COALESCE(("cc"."offer_ends" < "td"."d"), false)
        END AS "is_overdue",
        CASE
            WHEN ("m"."business_id" IS NOT NULL) THEN "m"."docs"
            WHEN ("rn"."business_id" IS NOT NULL) THEN ("rn"."contract_id")::"text"
            WHEN "cc"."lapsed" THEN ("cc"."wp_id")::"text"
            WHEN ("w"."business_id" IS NOT NULL) THEN ("w"."latest_id")::"text"
            WHEN ("tk"."business_id" IS NOT NULL) THEN ("tk"."first_id")::"text"
            ELSE ("cc"."wp_id")::"text"
        END AS "ref_id",
    "array_remove"(ARRAY[
        CASE
            WHEN ("m"."business_id" IS NOT NULL) THEN 'money_owed'::"text"
            ELSE NULL::"text"
        END,
        CASE
            WHEN ("rn"."business_id" IS NOT NULL) THEN 'renewal'::"text"
            ELSE NULL::"text"
        END,
        CASE
            WHEN "cc"."lapsed" THEN 'club_card_lapsed'::"text"
            ELSE NULL::"text"
        END,
        CASE
            WHEN ("w"."business_id" IS NOT NULL) THEN 'waiting_on_you'::"text"
            ELSE NULL::"text"
        END,
        CASE
            WHEN ("tk"."business_id" IS NOT NULL) THEN 'todo'::"text"
            ELSE NULL::"text"
        END,
        CASE
            WHEN (("cc"."business_id" IS NOT NULL) AND (NOT "cc"."lapsed")) THEN 'club_card'::"text"
            ELSE NULL::"text"
        END], NULL::"text") AS "reasons",
    "m"."amount" AS "amount_owed",
    "w"."emails" AS "emails_waiting",
    "tk"."todos" AS "todos_due",
    "b"."attention_snoozed_until",
    COALESCE(("b"."attention_snoozed_until" >= "td"."d"), false) AS "is_snoozed",
    "cc"."issues" AS "club_card_issues"
   FROM (((((("biz" "b"
     CROSS JOIN "today" "td")
     LEFT JOIN "money" "m" ON (("m"."business_id" = "b"."id")))
     LEFT JOIN "renewal" "rn" ON (("rn"."business_id" = "b"."id")))
     LEFT JOIN "waiting" "w" ON (("w"."business_id" = "b"."id")))
     LEFT JOIN "todo" "tk" ON (("tk"."business_id" = "b"."id")))
     LEFT JOIN "club_card" "cc" ON (("cc"."business_id" = "b"."id")))
  WHERE (("m"."business_id" IS NOT NULL) OR ("rn"."business_id" IS NOT NULL) OR ("w"."business_id" IS NOT NULL) OR ("tk"."business_id" IS NOT NULL) OR ("cc"."business_id" IS NOT NULL));

CREATE OR REPLACE VIEW "public"."v_club_card_members" WITH ("security_invoker"='true') AS
 WITH "today" AS (
         SELECT "public"."cc_today"() AS "d"
        ), "biz" AS (
         SELECT "b_1"."id",
            "b_1"."name",
            "b_1"."normalized_name",
            "b_1"."category",
            "b_1"."status",
            "b_1"."is_club_card",
            "b_1"."is_advertiser",
            "b_1"."last_contacted_at",
            "b_1"."mastersheet_source_ids",
            "b_1"."created_at",
            "b_1"."updated_at",
            "b_1"."contract_start",
            "b_1"."contract_end",
            "b_1"."deal_terms",
            "b_1"."payment_structure",
            "b_1"."contract_amount",
            "b_1"."address",
            "b_1"."email",
            "b_1"."phone",
            "b_1"."organization_id",
            "b_1"."contract_currency",
            "b_1"."notes",
            "b_1"."membership_type",
            "b_1"."relationship_memory",
            "b_1"."relationship_memory_updated_at",
            "b_1"."contract_renewal_type",
            "b_1"."business_type",
            "b_1"."disposition",
            "b_1"."follow_up_after",
            "b_1"."mute_replies",
            "b_1"."renewal_stage",
            "b_1"."renewal_contacted_at",
            "b_1"."outreach_stage",
            "b_1"."outreach_contacted_at",
            "b_1"."outreach_followed_up_at",
            "b_1"."outreach_declined_at",
            "b_1"."renewal_declined_at",
            "b_1"."outreach_identified_at",
            "b_1"."outreach_in_discussion_at",
            "b_1"."outreach_won_at",
            "b_1"."outreach_invoice_paid_at",
            "b_1"."renewal_not_started_at",
            "b_1"."renewal_in_discussion_at",
            "b_1"."renewal_agreed_at",
            "b_1"."renewal_invoice_paid_at",
            "b_1"."invoice_number",
            "b_1"."merged_into",
            "b_1"."attention_snoozed_until"
           FROM "public"."businesses" "b_1"
          WHERE (("b_1"."merged_into" IS NULL) AND (COALESCE("b_1"."status", ''::"text") <> 'Not a business'::"text"))
        ), "card" AS (
         SELECT DISTINCT ON ("c_1"."business_id") "c_1"."business_id",
            "c_1"."id" AS "contract_id",
            "c_1"."membership_type",
            "c_1"."contract_start",
            "c_1"."contract_end",
            "c_1"."is_current"
           FROM "public"."contracts" "c_1"
          WHERE ("c_1"."membership_type" = ANY (ARRAY['club_card'::"text", 'former_club_card'::"text"]))
          ORDER BY "c_1"."business_id", (("c_1"."membership_type" = 'club_card'::"text") AND "c_1"."is_current") DESC, "c_1"."contract_end" DESC, "c_1"."created_at" DESC
        ), "state" AS (
         SELECT "b_1"."id" AS "business_id",
            "k"."contract_id",
            "k"."contract_start",
            "k"."contract_end",
                CASE
                    WHEN ("k"."business_id" IS NULL) THEN 'none'::"text"
                    WHEN ("k"."contract_end" >= "td_1"."d") THEN 'member'::"text"
                    WHEN (("k"."contract_end" IS NULL) AND ("k"."membership_type" = 'club_card'::"text") AND "k"."is_current") THEN 'member'::"text"
                    WHEN (("k"."membership_type" = 'club_card'::"text") AND "k"."is_current" AND ("k"."contract_end" >= ("td_1"."d" - 60)) AND (COALESCE("b_1"."renewal_stage", ''::"text") <> 'not_renewing'::"text") AND ("b_1"."renewal_declined_at" IS NULL)) THEN 'grace'::"text"
                    ELSE 'lapsed'::"text"
                END AS "card_state"
           FROM (("biz" "b_1"
             CROSS JOIN "today" "td_1")
             LEFT JOIN "card" "k" ON (("k"."business_id" = "b_1"."id")))
        ), "live_pages" AS (
         SELECT "p"."id",
            "p"."organization_id",
            "p"."wp_id",
            "p"."slug",
            "p"."link",
            "p"."title",
            "p"."wp_modified",
            "p"."offer_text",
            "p"."offer_ends_on",
            "p"."page_address",
            "p"."page_postcode",
            "p"."page_phone",
            "p"."page_phone_digits",
            "p"."page_website",
            "p"."page_website_host",
            "p"."page_email",
            "p"."in_az_count",
            "p"."in_latest_offers",
            "p"."map_count",
            "p"."map_folders",
            "p"."categories",
            "p"."outside_club_card_folder",
            "p"."first_seen_at",
            "p"."last_seen_at",
            "p"."gone_at",
            "p"."match_status",
            "p"."business_id",
            "p"."suggested_business_id",
            "p"."match_reason",
            "p"."matched_by",
            "p"."matched_at",
            "p"."offer_ends_set",
            "p"."offer_confirmed_at",
            "p"."updated_at"
           FROM "public"."club_card_pages" "p"
          WHERE (("p"."match_status" = 'confirmed'::"text") AND ("p"."gone_at" IS NULL) AND ("p"."business_id" IS NOT NULL))
        ), "page" AS (
         SELECT DISTINCT ON ("p"."business_id") "p"."id",
            "p"."organization_id",
            "p"."wp_id",
            "p"."slug",
            "p"."link",
            "p"."title",
            "p"."wp_modified",
            "p"."offer_text",
            "p"."offer_ends_on",
            "p"."page_address",
            "p"."page_postcode",
            "p"."page_phone",
            "p"."page_phone_digits",
            "p"."page_website",
            "p"."page_website_host",
            "p"."page_email",
            "p"."in_az_count",
            "p"."in_latest_offers",
            "p"."map_count",
            "p"."map_folders",
            "p"."categories",
            "p"."outside_club_card_folder",
            "p"."first_seen_at",
            "p"."last_seen_at",
            "p"."gone_at",
            "p"."match_status",
            "p"."business_id",
            "p"."suggested_business_id",
            "p"."match_reason",
            "p"."matched_by",
            "p"."matched_at",
            "p"."offer_ends_set",
            "p"."offer_confirmed_at",
            "p"."updated_at",
            "count"(*) OVER (PARTITION BY "p"."business_id") AS "live_page_count"
           FROM "live_pages" "p"
          ORDER BY "p"."business_id", "p"."wp_modified" DESC NULLS LAST
        ), "app_phones" AS (
         SELECT "x"."business_id",
            "array_agg"(DISTINCT "x"."digits") AS "digits"
           FROM ( SELECT "b_1"."id" AS "business_id",
                    "public"."cc_phone_digits"("b_1"."phone") AS "digits"
                   FROM "biz" "b_1"
                UNION ALL
                 SELECT "c_1"."business_id",
                    "public"."cc_phone_digits"(("ph"."value" #>> '{}'::"text"[])) AS "cc_phone_digits"
                   FROM ("public"."contacts" "c_1"
                     CROSS JOIN LATERAL "jsonb_array_elements"(
                        CASE
                            WHEN ("jsonb_typeof"("c_1"."phones") = 'array'::"text") THEN "c_1"."phones"
                            ELSE '[]'::"jsonb"
                        END) "ph"("value"))) "x"
          WHERE ("x"."digits" IS NOT NULL)
          GROUP BY "x"."business_id"
        ), "app_domains" AS (
         SELECT "dm"."business_id",
            "array_agg"(DISTINCT "lower"("regexp_replace"("dm"."domain", '^www\.'::"text", ''::"text"))) AS "hosts"
           FROM "public"."domain_mappings" "dm"
          WHERE ("dm"."business_id" IS NOT NULL)
          GROUP BY "dm"."business_id"
        ), "checks" AS (
         SELECT "s"."business_id",
            "s"."card_state",
            "s"."contract_id",
            "s"."contract_start",
            "s"."contract_end",
            "p"."id" AS "page_id",
            "p"."wp_id",
            "p"."link" AS "page_link",
            "p"."title" AS "page_title",
            "p"."offer_text",
            "p"."wp_modified",
            "p"."offer_confirmed_at",
            COALESCE("p"."live_page_count", (0)::bigint) AS "live_page_count",
            COALESCE("p"."offer_ends_set", "p"."offer_ends_on") AS "offer_ends",
            "p"."in_az_count",
            "p"."map_count",
            "p"."map_folders",
            "p"."categories",
            "p"."in_latest_offers",
            "p"."page_address",
            "p"."page_phone",
            "p"."page_website",
            "p"."page_email",
            "array_remove"(ARRAY[
                CASE
                    WHEN (("p"."page_phone_digits" IS NOT NULL) AND ("ph"."digits" IS NOT NULL) AND (NOT ("p"."page_phone_digits" = ANY ("ph"."digits")))) THEN 'phone'::"text"
                    ELSE NULL::"text"
                END,
                CASE
                    WHEN (("p"."page_postcode" IS NOT NULL) AND ("public"."cc_postcode"("b_1"."address") IS NOT NULL) AND ("p"."page_postcode" <> "public"."cc_postcode"("b_1"."address"))) THEN 'postcode'::"text"
                    ELSE NULL::"text"
                END,
                CASE
                    WHEN (("p"."page_website_host" IS NOT NULL) AND ("dm"."hosts" IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                       FROM "unnest"("dm"."hosts") "h"("h")
                      WHERE (("p"."page_website_host" = "h"."h") OR ("p"."page_website_host" ~~ ('%.'::"text" || "h"."h")) OR ("h"."h" ~~ ('%.'::"text" || "p"."page_website_host"))))))) THEN 'website'::"text"
                    ELSE NULL::"text"
                END], NULL::"text") AS "contact_mismatch"
           FROM (((("state" "s"
             JOIN "biz" "b_1" ON (("b_1"."id" = "s"."business_id")))
             LEFT JOIN "page" "p" ON (("p"."business_id" = "s"."business_id")))
             LEFT JOIN "app_phones" "ph" ON (("ph"."business_id" = "s"."business_id")))
             LEFT JOIN "app_domains" "dm" ON (("dm"."business_id" = "s"."business_id")))
          WHERE (("s"."card_state" = ANY (ARRAY['member'::"text", 'grace'::"text"])) OR ("p"."id" IS NOT NULL))
        )
 SELECT "b"."id" AS "business_id",
    "b"."organization_id",
    "b"."name" AS "business_name",
    "c"."card_state",
    "c"."contract_id",
    "c"."contract_start",
    "c"."contract_end",
    "c"."page_id",
    "c"."wp_id",
    "c"."page_link",
    "c"."page_title",
    "c"."offer_text",
    "c"."offer_ends",
    "c"."wp_modified",
    "c"."offer_confirmed_at",
    "c"."live_page_count",
    "c"."in_az_count",
    "c"."map_count",
    "c"."map_folders",
    "c"."categories",
    "c"."in_latest_offers",
    "c"."page_address",
    "c"."page_phone",
    "c"."page_website",
    "c"."page_email",
    "c"."contact_mismatch",
        CASE
            WHEN (("c"."page_id" IS NOT NULL) AND ("c"."card_state" = 'lapsed'::"text")) THEN ARRAY['page_lapsed'::"text"]
            WHEN (("c"."page_id" IS NOT NULL) AND ("c"."card_state" = 'none'::"text")) THEN ARRAY['page_no_member'::"text"]
            WHEN ("c"."page_id" IS NULL) THEN
            CASE
                WHEN ((EXISTS ( SELECT 1
                   FROM "public"."club_card_sync_runs" "r"
                  WHERE (("r"."organization_id" = "b"."organization_id") AND "r"."ok"))) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."club_card_pages" "p"
                  WHERE (("p"."suggested_business_id" = "c"."business_id") AND ("p"."gone_at" IS NULL) AND ("p"."match_status" = ANY (ARRAY['unmatched'::"text", 'suggested'::"text"]))))))) THEN ARRAY['no_page'::"text"]
                ELSE ARRAY[]::"text"[]
            END
            ELSE "array_remove"(ARRAY[
            CASE
                WHEN (("c"."offer_ends" IS NULL) AND (GREATEST("c"."wp_modified", "c"."offer_confirmed_at") < ("td"."d" - '1 year'::interval))) THEN 'offer_old'::"text"
                ELSE NULL::"text"
            END,
            CASE
                WHEN (("c"."offer_ends" IS NOT NULL) AND ("c"."offer_ends" <= ("td"."d" + 10))) THEN 'offer_ending'::"text"
                ELSE NULL::"text"
            END,
            CASE
                WHEN ("c"."in_az_count" = 0) THEN 'not_in_az'::"text"
                ELSE NULL::"text"
            END,
            CASE
                WHEN ("c"."in_az_count" > 1) THEN 'az_twice'::"text"
                ELSE NULL::"text"
            END,
            CASE
                WHEN ("c"."map_count" = 0) THEN 'not_on_map'::"text"
                ELSE NULL::"text"
            END,
            CASE
                WHEN ("cardinality"("c"."categories") = 0) THEN 'no_category'::"text"
                ELSE NULL::"text"
            END,
            CASE
                WHEN ("cardinality"("c"."contact_mismatch") > 0) THEN 'contact_differs'::"text"
                ELSE NULL::"text"
            END], NULL::"text")
        END AS "issues"
   FROM (("checks" "c"
     JOIN "biz" "b" ON (("b"."id" = "c"."business_id")))
     CROSS JOIN "today" "td");

CREATE OR REPLACE VIEW "public"."v_member_care_queue" AS
 WITH "biz_live" AS (
         SELECT "b_1"."id",
            "b_1"."name",
            "b_1"."normalized_name",
            "b_1"."category",
            "b_1"."status",
            "b_1"."is_club_card",
            "b_1"."is_advertiser",
            "b_1"."last_contacted_at",
            "b_1"."mastersheet_source_ids",
            "b_1"."created_at",
            "b_1"."updated_at",
            "b_1"."contract_start",
            "b_1"."contract_end",
            "b_1"."deal_terms",
            "b_1"."payment_structure",
            "b_1"."contract_amount",
            "b_1"."address",
            "b_1"."email",
            "b_1"."phone",
            "b_1"."organization_id",
            "b_1"."contract_currency",
            "b_1"."notes",
            "b_1"."membership_type",
            "b_1"."relationship_memory",
            "b_1"."relationship_memory_updated_at",
            "b_1"."contract_renewal_type",
            "b_1"."business_type",
            "b_1"."disposition",
            "b_1"."follow_up_after",
            "b_1"."mute_replies",
            "b_1"."renewal_stage",
            "b_1"."renewal_contacted_at",
            "b_1"."outreach_stage",
            "b_1"."outreach_contacted_at",
            "b_1"."outreach_followed_up_at",
            "b_1"."outreach_declined_at",
            "b_1"."renewal_declined_at",
            "b_1"."outreach_identified_at",
            "b_1"."outreach_in_discussion_at",
            "b_1"."outreach_won_at",
            "b_1"."outreach_invoice_paid_at",
            "b_1"."renewal_not_started_at",
            "b_1"."renewal_in_discussion_at",
            "b_1"."renewal_agreed_at",
            "b_1"."renewal_invoice_paid_at",
            "b_1"."invoice_number"
           FROM "public"."businesses" "b_1"
          WHERE ((NOT COALESCE("b_1"."mute_replies", false)) AND (COALESCE("b_1"."status", ''::"text") <> ALL (ARRAY['Closed'::"text", 'Inactive'::"text"])))
        ), "biz_money" AS (
         SELECT "b_1"."id",
            "b_1"."name",
            "b_1"."normalized_name",
            "b_1"."category",
            "b_1"."status",
            "b_1"."is_club_card",
            "b_1"."is_advertiser",
            "b_1"."last_contacted_at",
            "b_1"."mastersheet_source_ids",
            "b_1"."created_at",
            "b_1"."updated_at",
            "b_1"."contract_start",
            "b_1"."contract_end",
            "b_1"."deal_terms",
            "b_1"."payment_structure",
            "b_1"."contract_amount",
            "b_1"."address",
            "b_1"."email",
            "b_1"."phone",
            "b_1"."organization_id",
            "b_1"."contract_currency",
            "b_1"."notes",
            "b_1"."membership_type",
            "b_1"."relationship_memory",
            "b_1"."relationship_memory_updated_at",
            "b_1"."contract_renewal_type",
            "b_1"."business_type",
            "b_1"."disposition",
            "b_1"."follow_up_after",
            "b_1"."mute_replies",
            "b_1"."renewal_stage",
            "b_1"."renewal_contacted_at",
            "b_1"."outreach_stage",
            "b_1"."outreach_contacted_at",
            "b_1"."outreach_followed_up_at",
            "b_1"."outreach_declined_at",
            "b_1"."renewal_declined_at",
            "b_1"."outreach_identified_at",
            "b_1"."outreach_in_discussion_at",
            "b_1"."outreach_won_at",
            "b_1"."outreach_invoice_paid_at",
            "b_1"."renewal_not_started_at",
            "b_1"."renewal_in_discussion_at",
            "b_1"."renewal_agreed_at",
            "b_1"."renewal_invoice_paid_at",
            "b_1"."invoice_number"
           FROM "public"."businesses" "b_1"
          WHERE (NOT COALESCE("b_1"."mute_replies", false))
        ), "blocked" AS (
         SELECT "routine_drafts"."business_id",
            "routine_drafts"."kind"
           FROM "public"."routine_drafts"
          WHERE (("routine_drafts"."outcome" = 'skipped'::"text") AND ("routine_drafts"."snooze_until" >= CURRENT_DATE))
        ), "last_draft" AS (
         SELECT DISTINCT ON ("routine_drafts"."business_id", "routine_drafts"."kind") "routine_drafts"."business_id",
            "routine_drafts"."kind",
            "routine_drafts"."id" AS "draft_id",
            "routine_drafts"."outlook_draft_id",
            "routine_drafts"."created_at",
            "routine_drafts"."sent_at",
            "routine_drafts"."bump_count",
            COALESCE("routine_drafts"."bumped_at", "routine_drafts"."created_at") AS "last_touched"
           FROM "public"."routine_drafts"
          WHERE ("routine_drafts"."outcome" = 'drafted'::"text")
          ORDER BY "routine_drafts"."business_id", "routine_drafts"."kind", "routine_drafts"."created_at" DESC
        ), "renewal" AS (
         SELECT 'renewal'::"text" AS "kind",
            1 AS "priority",
            "s"."business_id",
            ("s"."contract_id")::"text" AS "ref",
            "s"."membership_type",
            "s"."contract_start",
            "s"."contract_end",
            "s"."contract_amount",
            "s"."deal_terms",
            NULL::"text" AS "invoices",
            NULL::numeric AS "amount_due",
            NULL::integer AS "days_overdue"
           FROM (("public"."v_contract_status" "s"
             JOIN "biz_live" "b_1" ON (("b_1"."id" = "s"."business_id")))
             LEFT JOIN "last_draft" "d" ON ((("d"."business_id" = "s"."business_id") AND ("d"."kind" = 'renewal'::"text"))))
          WHERE ("s"."is_current" AND ("s"."membership_type" = ANY (ARRAY['club_card'::"text", 'advertiser'::"text"])) AND (("s"."contract_end" >= (CURRENT_DATE - 60)) AND ("s"."contract_end" <= (CURRENT_DATE + 35))) AND (COALESCE("b_1"."renewal_stage", 'not_started'::"text") <> ALL (ARRAY['agreed'::"text", 'invoice_paid'::"text", 'not_renewing'::"text"])) AND ("b_1"."renewal_declined_at" IS NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."contracts" "n"
                  WHERE (("n"."business_id" = "s"."business_id") AND "n"."is_current" AND (NOT ("n"."membership_type" IS DISTINCT FROM "s"."membership_type")) AND ("n"."contract_start" > COALESCE("s"."contract_start", '1900-01-01'::"date")))))) AND (("d"."sent_at" IS NULL) OR ("d"."sent_at" < ("now"() - '7 days'::interval))) AND (("d"."draft_id" IS NULL) OR ("d"."sent_at" IS NOT NULL) OR ("d"."last_touched" < ("now"() - '20:00:00'::interval))) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."correspondence" "c"
                  WHERE (("c"."business_id" = "s"."business_id") AND ("c"."direction" = 'sent'::"text") AND ("c"."entry_date" > ("now"() - '7 days'::interval)) AND ("c"."subject" ~* '(renew|club card|advertis|sidebar|listing)'::"text"))))))
        ), "overdue" AS (
         SELECT 'overdue'::"text" AS "text",
            0 AS "?column?",
            "l"."business_id",
            "string_agg"("i"."qbo_invoice_id", ','::"text" ORDER BY "i"."due_date") AS "string_agg",
            NULL::"text" AS "text",
            NULL::"date" AS "date",
            NULL::"date" AS "date",
            NULL::numeric AS "numeric",
            NULL::"text" AS "text",
            "string_agg"((((((((COALESCE("i"."doc_number", "i"."qbo_invoice_id") || ' ('::"text") || "to_char"(("i"."txn_date")::timestamp with time zone, 'DD Mon YYYY'::"text")) || ', £'::"text") || "to_char"("i"."balance", 'FM999999990.00'::"text")) || ' due '::"text") || "to_char"(("i"."due_date")::timestamp with time zone, 'DD Mon YYYY'::"text")) || ')'::"text"), '; '::"text" ORDER BY "i"."due_date") AS "string_agg",
            "sum"("i"."balance") AS "sum",
            "max"((CURRENT_DATE - "i"."due_date")) AS "max"
           FROM ((("public"."qbo_invoices" "i"
             JOIN "public"."qbo_links" "l" ON (("l"."qbo_customer_id" = "i"."qbo_customer_id")))
             JOIN "biz_money" "b_1" ON (("b_1"."id" = "l"."business_id")))
             LEFT JOIN "last_draft" "d" ON ((("d"."business_id" = "l"."business_id") AND ("d"."kind" = 'overdue'::"text"))))
          WHERE (("i"."balance" > (0)::numeric) AND (COALESCE("i"."private_memo", ''::"text") <> 'Voided'::"text") AND ("i"."due_date" <= (CURRENT_DATE - 7)) AND (("d"."sent_at" IS NULL) OR ("d"."sent_at" < ("now"() - '7 days'::interval))) AND (("d"."draft_id" IS NULL) OR ("d"."sent_at" IS NOT NULL) OR ("d"."last_touched" < ("now"() - '20:00:00'::interval))) AND (NOT (EXISTS ( SELECT 1
                   FROM "public"."correspondence" "c"
                  WHERE (("c"."business_id" = "l"."business_id") AND ("c"."direction" = 'sent'::"text") AND ("c"."entry_date" > ("now"() - '7 days'::interval)) AND ((("c"."ai_metadata" ->> 'source'::"text") = 'quickbooks_notice'::"text") OR ("c"."subject" ~* '(invoice|payment|overdue|outstanding)'::"text")))))))
          GROUP BY "l"."business_id"
        ), "checkin" AS (
         SELECT 'checkin'::"text" AS "text",
            2 AS "?column?",
            "s"."business_id",
            ("s"."contract_id")::"text" AS "contract_id",
            "s"."membership_type",
            "s"."contract_start",
            "s"."contract_end",
            "s"."contract_amount",
            "s"."deal_terms",
            NULL::"text" AS "text",
            NULL::numeric AS "numeric",
            NULL::integer AS "int4"
           FROM (("public"."v_contract_status" "s"
             JOIN "biz_live" "b_1" ON (("b_1"."id" = "s"."business_id")))
             LEFT JOIN "last_draft" "d" ON ((("d"."business_id" = "s"."business_id") AND ("d"."kind" = 'checkin'::"text"))))
          WHERE ("s"."in_force" AND (COALESCE("b_1"."status", ''::"text") <> 'Former'::"text") AND ("s"."membership_type" = ANY (ARRAY['club_card'::"text", 'advertiser'::"text"])) AND ("s"."days_to_renewal" > 45) AND (("d"."draft_id" IS NULL) OR ("d"."sent_at" IS NOT NULL)) AND (GREATEST(COALESCE("s"."contract_start", ("b_1"."created_at")::"date"), COALESCE(( SELECT ("max"("dd"."created_at"))::"date" AS "max"
                   FROM "public"."routine_drafts" "dd"
                  WHERE (("dd"."kind" = 'checkin'::"text") AND ("dd"."outcome" = 'drafted'::"text") AND ("dd"."business_id" = "s"."business_id"))), '1900-01-01'::"date")) <= (CURRENT_DATE - 90)))
        ), "q" AS (
         SELECT "renewal"."kind",
            "renewal"."priority",
            "renewal"."business_id",
            "renewal"."ref",
            "renewal"."membership_type",
            "renewal"."contract_start",
            "renewal"."contract_end",
            "renewal"."contract_amount",
            "renewal"."deal_terms",
            "renewal"."invoices",
            "renewal"."amount_due",
            "renewal"."days_overdue"
           FROM "renewal"
        UNION ALL
         SELECT "overdue"."text",
            "overdue"."?column?",
            "overdue"."business_id",
            "overdue"."string_agg",
            "overdue"."text_1" AS "text",
            "overdue"."date",
            "overdue"."date_1" AS "date",
            "overdue"."numeric",
            "overdue"."text_2" AS "text",
            "overdue"."string_agg_1" AS "string_agg",
            "overdue"."sum",
            "overdue"."max"
           FROM "overdue" "overdue"("text", "?column?", "business_id", "string_agg", "text_1", "date", "date_1", "numeric", "text_2", "string_agg_1", "sum", "max")
        UNION ALL
         SELECT "checkin"."text",
            "checkin"."?column?",
            "checkin"."business_id",
            "checkin"."contract_id",
            "checkin"."membership_type",
            "checkin"."contract_start",
            "checkin"."contract_end",
            "checkin"."contract_amount",
            "checkin"."deal_terms",
            "checkin"."text_1" AS "text",
            "checkin"."numeric",
            "checkin"."int4"
           FROM "checkin" "checkin"("text", "?column?", "business_id", "contract_id", "membership_type", "contract_start", "contract_end", "contract_amount", "deal_terms", "text_1", "numeric", "int4")
        )
 SELECT "q"."kind",
    "q"."priority",
    "q"."business_id",
    "q"."ref",
    "q"."membership_type",
    "q"."contract_start",
    "q"."contract_end",
    "q"."contract_amount",
    "q"."deal_terms",
    "q"."invoices",
    "q"."amount_due",
    "q"."days_overdue",
    "b"."name" AS "business_name",
    "ld"."outlook_draft_id" AS "open_draft_id",
    "ld"."created_at" AS "open_draft_written_at",
    "ld"."bump_count" AS "open_draft_bumps",
    "ld"."draft_id" AS "open_draft_row_id",
    ( SELECT "max"("c"."entry_date") AS "max"
           FROM "public"."correspondence" "c"
          WHERE (("c"."business_id" = "q"."business_id") AND ("c"."direction" = 'sent'::"text") AND ("c"."type" = ANY (ARRAY['Email'::"public"."entry_type", 'Email Thread'::"public"."entry_type", 'Call'::"public"."entry_type", 'Meeting'::"public"."entry_type"])))) AS "last_sent_at",
    ( SELECT "max"("c"."entry_date") AS "max"
           FROM "public"."correspondence" "c"
          WHERE (("c"."business_id" = "q"."business_id") AND ("c"."direction" = 'received'::"text") AND ("c"."type" = ANY (ARRAY['Email'::"public"."entry_type", 'Email Thread'::"public"."entry_type", 'Call'::"public"."entry_type", 'Meeting'::"public"."entry_type"])))) AS "last_received_at",
    ( SELECT "max"("d2"."created_at") AS "max"
           FROM "public"."routine_drafts" "d2"
          WHERE (("d2"."business_id" = "q"."business_id") AND ("d2"."outcome" = 'drafted'::"text"))) AS "last_draft_at"
   FROM (("q"
     JOIN "public"."businesses" "b" ON (("b"."id" = "q"."business_id")))
     LEFT JOIN "last_draft" "ld" ON ((("ld"."business_id" = "q"."business_id") AND ("ld"."kind" = "q"."kind") AND ("ld"."sent_at" IS NULL))))
  WHERE ((NOT (EXISTS ( SELECT 1
           FROM "blocked" "x"
          WHERE (("x"."business_id" = "q"."business_id") AND ("x"."kind" = "q"."kind"))))) AND (NOT (EXISTS ( SELECT 1
           FROM "public"."care_exclusions" "e"
          WHERE (("e"."business_id" = "q"."business_id") AND ("e"."kind" = ANY (ARRAY['all'::"text", "q"."kind"])))))));

CREATE OR REPLACE VIEW "public"."v_morning_desk" WITH ("security_invoker"='true') AS
 WITH "t" AS (
         SELECT "t"."id",
            "t"."organization_id",
            "t"."title",
            "t"."notes",
            "t"."due_date",
            "t"."status",
            "t"."is_priority",
            "t"."category",
            "t"."source",
            "t"."business_id",
            "t"."position",
            "t"."created_at",
            "t"."updated_at",
            "t"."completed_at",
            "t"."renewal_stage",
            "t"."type",
            "t"."task_category_id",
            "t"."due_time",
            "t"."signal_key",
            "t"."signal_meta",
            "b"."name" AS "business_name",
            ("t"."signal_meta" ->> 'rule_id'::"text") AS "rule_id"
           FROM ("public"."tasks" "t"
             LEFT JOIN "public"."businesses" "b" ON (("b"."id" = "t"."business_id")))
          WHERE ("t"."status" = 'open'::"text")
        ), "mine" AS (
         SELECT "t"."id",
            "t"."organization_id",
            "t"."title",
            "t"."notes",
            "t"."due_date",
            "t"."status",
            "t"."is_priority",
            "t"."category",
            "t"."source",
            "t"."business_id",
            "t"."position",
            "t"."created_at",
            "t"."updated_at",
            "t"."completed_at",
            "t"."renewal_stage",
            "t"."type",
            "t"."task_category_id",
            "t"."due_time",
            "t"."signal_key",
            "t"."signal_meta",
            "t"."business_name",
            "t"."rule_id",
            "count"(*) OVER (PARTITION BY ("lower"("btrim"("t"."title")))) AS "same_title"
           FROM "t"
          WHERE ("t"."signal_key" IS NULL)
        )
 SELECT 0 AS "section",
    'Your own list'::"text" AS "heading",
    "row_number"() OVER (ORDER BY ("m"."due_date" IS NULL), "m"."due_date", "m"."created_at") AS "sort",
    ((("m"."title" || COALESCE((' · '::"text" || "m"."business_name"), ''::"text")) ||
        CASE
            WHEN ("m"."due_date" IS NULL) THEN ' · no date'::"text"
            WHEN ("m"."due_date" < CURRENT_DATE) THEN ((' · '::"text" || (CURRENT_DATE - "m"."due_date")) || 'd late'::"text")
            WHEN ("m"."due_date" = CURRENT_DATE) THEN ' · today'::"text"
            ELSE (' · '::"text" || "to_char"(("m"."due_date")::timestamp with time zone, 'DD Mon'::"text"))
        END) ||
        CASE
            WHEN ("m"."same_title" > 1) THEN ' · possible duplicate'::"text"
            ELSE ''::"text"
        END) AS "line",
    ("m"."due_date" <= CURRENT_DATE) AS "is_priority"
   FROM "mine" "m"
  WHERE (("m"."due_date" IS NULL) OR ("m"."due_date" <= (CURRENT_DATE + 3)))
UNION ALL
 SELECT 1 AS "section",
    'Waiting on you'::"text" AS "heading",
    "row_number"() OVER (ORDER BY "t"."is_priority" DESC, (("t"."signal_meta" ->> 'received'::"text"))::"date") AS "sort",
    ((("t"."title" || ' · '::"text") || (CURRENT_DATE - (("t"."signal_meta" ->> 'received'::"text"))::"date")) || 'd'::"text") AS "line",
    "t"."is_priority"
   FROM "t"
  WHERE ("t"."rule_id" = 'reply_needed'::"text")
UNION ALL
 SELECT 2 AS "section",
    'Money'::"text" AS "heading",
    "row_number"() OVER (ORDER BY "t"."is_priority" DESC, "t"."due_date") AS "sort",
    (("t"."title" ||
        CASE
            WHEN ("t"."rule_id" = 'invoice_overdue'::"text") THEN ((' · '::"text" || ("t"."signal_meta" ->> 'days_overdue'::"text")) || 'd overdue'::"text")
            ELSE ''::"text"
        END) ||
        CASE
            WHEN (("t"."signal_meta" ? 'snooze_until'::"text") AND ((("t"."signal_meta" ->> 'snooze_until'::"text"))::"date" > CURRENT_DATE)) THEN (' · snoozed to '::"text" || "to_char"(((("t"."signal_meta" ->> 'snooze_until'::"text"))::"date")::timestamp with time zone, 'DD Mon'::"text"))
            ELSE ''::"text"
        END) AS "line",
    "t"."is_priority"
   FROM "t"
  WHERE ("t"."rule_id" = ANY (ARRAY['invoice_overdue'::"text", 'invoice_due_soon'::"text", 'unrecorded_renewal'::"text"]))
UNION ALL
 SELECT 3 AS "section",
    'You said you would'::"text" AS "heading",
    "row_number"() OVER (ORDER BY "t"."due_date") AS "sort",
    (("t"."title" || ' · '::"text") ||
        CASE
            WHEN ("t"."due_date" < CURRENT_DATE) THEN ('was due '::"text" || "to_char"(("t"."due_date")::timestamp with time zone, 'DD Mon'::"text"))
            WHEN ("t"."due_date" = CURRENT_DATE) THEN 'today'::"text"
            ELSE "to_char"(("t"."due_date")::timestamp with time zone, 'DD Mon'::"text")
        END) AS "line",
    ("t"."due_date" <= CURRENT_DATE) AS "is_priority"
   FROM "t"
  WHERE ("t"."rule_id" = 'commitment_due'::"text")
UNION ALL
 SELECT 4 AS "section",
    'Due today or overdue'::"text" AS "heading",
    "row_number"() OVER (ORDER BY "t"."is_priority" DESC, "t"."due_date") AS "sort",
    ("t"."title" ||
        CASE
            WHEN ("t"."due_date" < CURRENT_DATE) THEN ((' · '::"text" || (CURRENT_DATE - "t"."due_date")) || 'd late'::"text")
            ELSE ''::"text"
        END) AS "line",
    "t"."is_priority"
   FROM "t"
  WHERE (("t"."signal_key" IS NOT NULL) AND ("t"."due_date" <= CURRENT_DATE) AND (COALESCE("t"."rule_id", ''::"text") <> ALL (ARRAY['reply_needed'::"text", 'invoice_overdue'::"text", 'invoice_due_soon'::"text", 'unrecorded_renewal'::"text", 'commitment_due'::"text", 'editorial_inbox'::"text"])) AND (NOT (("t"."signal_meta" ? 'snooze_until'::"text") AND ((("t"."signal_meta" ->> 'snooze_until'::"text"))::"date" > CURRENT_DATE))))
UNION ALL
 SELECT 5 AS "section",
    'Renewals in the next 30 days'::"text" AS "heading",
    "row_number"() OVER (ORDER BY "v"."contract_end") AS "sort",
    ((((("v"."business_name" || ' · '::"text") || COALESCE("v"."membership_type", ''::"text")) || ' · ends '::"text") || "to_char"(("v"."contract_end")::timestamp with time zone, 'DD Mon'::"text")) || COALESCE((' · £'::"text" || "to_char"("v"."contract_amount", 'FM999999990'::"text")), ''::"text")) AS "line",
    false AS "is_priority"
   FROM "public"."v_contract_status" "v"
  WHERE ("v"."in_force" AND (("v"."days_to_renewal" >= 0) AND ("v"."days_to_renewal" <= 30)))
UNION ALL
 SELECT 6 AS "section",
    'Editorial arrivals'::"text" AS "heading",
    "row_number"() OVER (ORDER BY (("t"."signal_meta" ->> 'received'::"text"))::"date" DESC) AS "sort",
    (("replace"("t"."title", 'Editorial: '::"text", ''::"text") || ' · '::"text") || "to_char"(((("t"."signal_meta" ->> 'received'::"text"))::"date")::timestamp with time zone, 'DD Mon'::"text")) AS "line",
    false AS "is_priority"
   FROM "t"
  WHERE ("t"."rule_id" = 'editorial_inbox'::"text")
UNION ALL
 SELECT 7 AS "section",
    'New businesses worth approaching'::"text" AS "heading",
    "row_number"() OVER (ORDER BY "p"."found_at" DESC) AS "sort",
    ((("p"."business_name" || COALESCE((' · '::"text" || "p"."business_category"), ''::"text")) || COALESCE((' · '::"text" || "p"."address"), ''::"text")) || COALESCE((' · '::"text" || "left"("p"."opportunity_notes", 90)), ''::"text")) AS "line",
    false AS "is_priority"
   FROM ( SELECT "prospect_leads"."id",
            "prospect_leads"."business_name",
            "prospect_leads"."source_name",
            "prospect_leads"."source_url",
            "prospect_leads"."address",
            "prospect_leads"."business_category",
            "prospect_leads"."snippet",
            "prospect_leads"."matched_business_id",
            "prospect_leads"."match_type",
            "prospect_leads"."opportunity_notes",
            "prospect_leads"."status",
            "prospect_leads"."found_at",
            "prospect_leads"."created_at",
            "prospect_leads"."updated_at"
           FROM "public"."prospect_leads"
          WHERE (("prospect_leads"."status" = 'new'::"text") AND ("prospect_leads"."matched_business_id" IS NULL))
          ORDER BY "prospect_leads"."found_at" DESC
         LIMIT 8) "p"
UNION ALL
 SELECT 8 AS "section",
    'Story leads from the scans'::"text" AS "heading",
    "row_number"() OVER (ORDER BY "n"."found_at" DESC) AS "sort",
    (("n"."title" || COALESCE((' · '::"text" || "n"."source_name"), ''::"text")) || COALESCE((' · '::"text" || "left"("n"."relevance_reason", 90)), ''::"text")) AS "line",
    false AS "is_priority"
   FROM ( SELECT "news_leads"."id",
            "news_leads"."title",
            "news_leads"."source_name",
            "news_leads"."source_url",
            "news_leads"."snippet",
            "news_leads"."relevance_reason",
            "news_leads"."story_type",
            "news_leads"."status",
            "news_leads"."found_at",
            "news_leads"."created_at",
            "news_leads"."updated_at",
            "news_leads"."published_at"
           FROM "public"."news_leads"
          WHERE ("news_leads"."status" = 'new'::"text")
          ORDER BY COALESCE("news_leads"."published_at", ("news_leads"."found_at")::"date") DESC, "news_leads"."found_at" DESC
         LIMIT 6) "n";

CREATE OR REPLACE FUNCTION "public"."get_contract_expiries"("p_org_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "contract_end" "date", "contract_amount" numeric, "contract_currency" "text", "contract_renewal_type" "text", "last_correspondence_date" timestamp with time zone, "last_correspondence_text" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  WITH eligible AS (
    SELECT b.id,
           b.name,
           b.contract_end,
           b.contract_amount,
           b.contract_currency,
           b.contract_renewal_type
    FROM public.businesses b
    WHERE b.organization_id = p_org_id
      AND b.contract_end IS NOT NULL
      AND b.contract_end >= (CURRENT_DATE - INTERVAL '90 days')
      AND b.contract_end <= (CURRENT_DATE + INTERVAL '90 days')
  ),
  latest AS (
    SELECT DISTINCT ON (c.business_id)
           c.business_id,
           c.entry_date,
           c.formatted_text_current
    FROM public.correspondence c
    JOIN eligible e ON e.id = c.business_id
    WHERE c.organization_id = p_org_id
    ORDER BY c.business_id, c.entry_date DESC
  )
  SELECT e.id,
         e.name,
         e.contract_end,
         e.contract_amount,
         e.contract_currency,
         e.contract_renewal_type,
         l.entry_date AS last_correspondence_date,
         l.formatted_text_current AS last_correspondence_text
  FROM eligible e
  LEFT JOIN latest l ON l.business_id = e.id
  ORDER BY e.contract_end ASC;
$$;

CREATE OR REPLACE FUNCTION "public"."refresh_task_commitments"() RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  org uuid := get_user_organization_id();
  added integer := 0;
  c integer;
begin
  if org is null then
    return 0;
  end if;

  insert into public.tasks (organization_id, title, due_date, source, business_id, category, notes)
  select b.organization_id,
         'Renewal: ' || b.name ||
           case when b.is_club_card and b.is_advertiser then ' (Club Card + advertiser)'
                when b.is_club_card then ' (Club Card)'
                when b.is_advertiser then ' (advertiser)'
                else '' end,
         b.contract_end, 'contract_renewal', b.id, 'work',
         'Auto-added from Correspondence Clerk. Contract ends ' || to_char(b.contract_end,'DD Mon YYYY') || '.'
  from public.businesses b
  where b.organization_id = org
    and b.contract_end is not null
    and b.contract_end between current_date and current_date + interval '90 days'
  on conflict (organization_id, source, business_id) where business_id is not null and source <> 'manual'
  do nothing;
  get diagnostics c = row_count; added := added + c;

  insert into public.tasks (organization_id, title, due_date, source, business_id, category, notes)
  select b.organization_id,
         'Follow up: ' || b.name,
         b.follow_up_after, 'follow_up', b.id, 'work',
         'Auto-added from a follow-up date set in Correspondence Clerk.'
  from public.businesses b
  where b.organization_id = org
    and b.follow_up_after is not null
    and b.follow_up_after <= current_date + interval '30 days'
  on conflict (organization_id, source, business_id) where business_id is not null and source <> 'manual'
  do nothing;
  get diagnostics c = row_count; added := added + c;

  return added;
end;
$$;

CREATE OR REPLACE FUNCTION "public"."get_gone_quiet"("p_org_id" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "last_contacted_at" timestamp with time zone, "correspondence_count" bigint)
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  SELECT b.id,
         b.name,
         b.last_contacted_at,
         COUNT(c.id) AS correspondence_count
  FROM public.businesses b
  LEFT JOIN public.correspondence c ON c.business_id = b.id
  WHERE b.organization_id = p_org_id
    AND b.last_contacted_at IS NOT NULL
    AND b.last_contacted_at < (NOW() - INTERVAL '60 days')
  GROUP BY b.id
  HAVING COUNT(c.id) >= 3
  ORDER BY b.last_contacted_at ASC
  LIMIT 100;
$$;

CREATE OR REPLACE FUNCTION "public"."get_gone_quiet_businesses"("org_id" "uuid") RETURNS TABLE("business_id" "uuid", "business_name" "text", "correspondence_id" "uuid", "subject" "text", "entry_date" "date", "contact_name" "text", "contact_role" "text", "days_since" integer)
    LANGUAGE "sql" STABLE
    AS $$
  WITH latest_per_business AS (
    SELECT DISTINCT ON (c.business_id)
      c.business_id,
      c.id as correspondence_id,
      c.subject,
      c.entry_date,
      c.direction,
      c.contact_id
    FROM correspondence c
    JOIN businesses b ON b.id = c.business_id
    WHERE b.organization_id = org_id
      AND b.mute_replies = false
      AND (b.is_club_card = true OR b.is_advertiser = true OR b.membership_type IS NOT NULL)
    ORDER BY c.business_id, c.entry_date DESC
  )
  SELECT 
    l.business_id,
    b.name::text as business_name,
    l.correspondence_id,
    l.subject::text,
    l.entry_date::date,
    ct.name::text as contact_name,
    ct.role::text as contact_role,
    (CURRENT_DATE - l.entry_date::date)::integer as days_since
  FROM latest_per_business l
  JOIN businesses b ON b.id = l.business_id
  LEFT JOIN contacts ct ON l.contact_id = ct.id
  WHERE l.direction = 'sent'
    AND l.entry_date < CURRENT_DATE - INTERVAL '14 days'
  ORDER BY l.entry_date ASC;
$$;

CREATE OR REPLACE FUNCTION "public"."derive_business_stages"("p_business_id" "uuid") RETURNS TABLE("outreach_stage" "text", "outreach_identified_at" "date", "outreach_contacted_at" "date", "outreach_followed_up_at" "date", "outreach_in_discussion_at" "date", "outreach_invoice_paid_at" "date", "renewal_stage" "text", "renewal_not_started_at" "date", "renewal_contacted_at" "date", "renewal_in_discussion_at" "date", "outreach_skip_reason" "text", "renewal_skip_reason" "text")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
WITH b AS (
  SELECT * FROM businesses WHERE id = p_business_id
),
corr AS (
  SELECT
    c.entry_date,
    CASE
      WHEN c.direction = 'received'            THEN 'in'
      WHEN c.direction IN ('sent', 'outbound') THEN 'out'
      ELSE 'unknown'
    END AS dir
  FROM correspondence c
  WHERE c.type IN ('Email', 'Email Thread', 'Call', 'Meeting')
    AND c.entry_date IS NOT NULL
    AND (c.business_id = p_business_id OR p_business_id = ANY (c.linked_business_ids))
),
lifetime AS (
  SELECT
    count(*) FILTER (WHERE dir = 'in')                 AS n_in,
    count(*) FILTER (WHERE dir = 'out')                AS n_out,
    count(*)                                           AS n_total,
    min(entry_date) FILTER (WHERE dir = 'in')::date    AS first_in,
    min(entry_date) FILTER (WHERE dir = 'out')::date   AS first_out,
    max(entry_date) FILTER (WHERE dir = 'out')::date   AS last_out
  FROM corr
),
contract_facts AS (
  SELECT
    EXISTS (SELECT 1 FROM contracts c WHERE c.business_id = p_business_id) AS has_any_contract,
    (SELECT min(c.contract_end)
       FROM contracts c
      WHERE c.business_id = p_business_id
        AND c.is_current
        AND c.contract_end IS NOT NULL) AS cur_end
),
paid_invoice AS (
  SELECT max(i.txn_date) AS last_paid_date
  FROM qbo_links l
  JOIN qbo_invoices i ON i.qbo_customer_id = l.qbo_customer_id
  WHERE l.business_id = p_business_id
    AND i.is_paid
    AND coalesce(i.private_memo, '') <> 'Voided'
),
renewal_window AS (
  SELECT
    count(*) FILTER (WHERE c.dir = 'in')                 AS n_in,
    count(*) FILTER (WHERE c.dir = 'out')                AS n_out,
    min(c.entry_date) FILTER (WHERE c.dir = 'in')::date  AS first_in,
    min(c.entry_date) FILTER (WHERE c.dir = 'out')::date AS first_out
  FROM corr c
  CROSS JOIN contract_facts cf
  WHERE cf.cur_end IS NOT NULL
    AND c.entry_date > (cf.cur_end - INTERVAL '90 days')
),
raw AS (
  SELECT
    b.*,
    l.n_in, l.n_out, l.n_total, l.first_in, l.first_out, l.last_out,
    cf.has_any_contract, cf.cur_end,
    pi.last_paid_date,
    rw.n_in AS r_in, rw.n_out AS r_out,
    rw.first_in AS r_first_in, rw.first_out AS r_first_out,
    CASE
      WHEN b.outreach_stage IS NULL                       THEN 'not_on_outreach_board'
      WHEN b.mute_replies                                 THEN 'mute_replies'
      WHEN b.outreach_declined_at IS NOT NULL             THEN 'declined_by_human'
      WHEN b.outreach_stage IN ('not_interested', 'won')  THEN 'manual_only_stage'
      WHEN b.status IN ('Former', 'Inactive', 'Closed')   THEN 'closed_or_former_business'
      WHEN cf.has_any_contract                            THEN 'graduated_to_renewal'
      WHEN b.is_club_card OR b.is_advertiser              THEN 'graduated_to_renewal'
      ELSE NULL
    END AS o_skip,
    CASE
      WHEN NOT (b.is_club_card OR b.is_advertiser)        THEN 'not_on_renewal_board'
      WHEN b.mute_replies                                 THEN 'mute_replies'
      WHEN b.renewal_declined_at IS NOT NULL              THEN 'declined_by_human'
      WHEN b.renewal_stage IN ('not_renewing','agreed','invoice_paid','in_progress')
                                                          THEN 'manual_only_stage'
      WHEN b.status IN ('Former', 'Inactive', 'Closed')   THEN 'closed_or_former_business'
      WHEN cf.cur_end IS NULL                             THEN 'no_current_contract_end'
      ELSE NULL
    END AS r_skip
  FROM b
  CROSS JOIN lifetime l
  CROSS JOIN contract_facts cf
  CROSS JOIN paid_invoice pi
  CROSS JOIN renewal_window rw
),
candidate AS (
  SELECT
    raw.*,
    CASE
      WHEN raw.o_skip IS NOT NULL         THEN NULL
      WHEN raw.last_paid_date IS NOT NULL THEN 'invoice_paid'
      WHEN raw.n_in >= 1                  THEN 'in_discussion'
      WHEN raw.n_out >= 2                 THEN 'followed_up'
      WHEN raw.n_out >= 1                 THEN 'contacted'
      WHEN raw.n_total = 0                THEN 'identified'
      ELSE NULL
    END AS o_candidate,
    CASE
      WHEN raw.r_skip IS NOT NULL         THEN NULL
      WHEN raw.r_in >= 1                  THEN 'in_discussion'
      WHEN raw.r_out >= 1                 THEN 'contacted'
      ELSE 'not_started'
    END AS r_candidate
  FROM raw
),
ranked AS (
  SELECT
    candidate.*,
    CASE candidate.outreach_stage
      WHEN 'identified' THEN 0 WHEN 'contacted' THEN 1 WHEN 'followed_up' THEN 2
      WHEN 'in_discussion' THEN 3 WHEN 'won' THEN 4 WHEN 'invoice_paid' THEN 5
    END AS o_cur_rank,
    CASE candidate.o_candidate
      WHEN 'identified' THEN 0 WHEN 'contacted' THEN 1 WHEN 'followed_up' THEN 2
      WHEN 'in_discussion' THEN 3 WHEN 'won' THEN 4 WHEN 'invoice_paid' THEN 5
    END AS o_new_rank,
    CASE candidate.renewal_stage
      WHEN 'not_started' THEN 0 WHEN 'contacted' THEN 1 WHEN 'in_discussion' THEN 2
    END AS r_cur_rank,
    CASE candidate.r_candidate
      WHEN 'not_started' THEN 0 WHEN 'contacted' THEN 1 WHEN 'in_discussion' THEN 2
    END AS r_new_rank
  FROM candidate
),
final AS (
  SELECT
    ranked.*,
    (ranked.o_candidate IS NOT NULL AND ranked.o_cur_rank IS NOT NULL
       AND ranked.o_new_rank < ranked.o_cur_rank) AS o_would_regress,
    (ranked.r_candidate IS NOT NULL AND ranked.r_cur_rank IS NOT NULL
       AND ranked.r_new_rank < ranked.r_cur_rank) AS r_would_regress,
    (ranked.o_candidate IS DISTINCT FROM ranked.outreach_stage) AS o_stage_moving,
    (ranked.r_candidate IS DISTINCT FROM ranked.renewal_stage)  AS r_stage_moving
  FROM ranked
)
SELECT
  CASE WHEN f.o_would_regress THEN NULL ELSE f.o_candidate END,

  -- Dates are only (re)stamped when the card actually moves, or when the slot
  -- is empty. Re-dating a card that is already in the right stage would jog the
  -- "days in stage" badge backwards for no visible gain.
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'identified' THEN NULL
       ELSE coalesce(f.outreach_identified_at, f.created_at::date) END,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'contacted' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_contacted_at IS NOT NULL THEN NULL
       ELSE f.first_out END,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'followed_up' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_followed_up_at IS NOT NULL THEN NULL
       ELSE f.last_out END,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'in_discussion' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_in_discussion_at IS NOT NULL THEN NULL
       ELSE f.first_in END,
  CASE WHEN f.o_would_regress OR f.o_candidate IS DISTINCT FROM 'invoice_paid' THEN NULL
       WHEN NOT f.o_stage_moving AND f.outreach_invoice_paid_at IS NOT NULL THEN NULL
       ELSE f.last_paid_date END,

  CASE WHEN f.r_would_regress THEN NULL ELSE f.r_candidate END,

  CASE WHEN f.r_would_regress OR f.r_candidate IS DISTINCT FROM 'not_started' THEN NULL
       ELSE coalesce(f.renewal_not_started_at, f.created_at::date) END,
  CASE WHEN f.r_would_regress OR f.r_candidate IS DISTINCT FROM 'contacted' THEN NULL
       WHEN NOT f.r_stage_moving AND f.renewal_contacted_at IS NOT NULL THEN NULL
       ELSE f.r_first_out END,
  CASE WHEN f.r_would_regress OR f.r_candidate IS DISTINCT FROM 'in_discussion' THEN NULL
       WHEN NOT f.r_stage_moving AND f.renewal_in_discussion_at IS NOT NULL THEN NULL
       ELSE f.r_first_in END,

  coalesce(f.o_skip, CASE WHEN f.o_would_regress THEN 'would_regress' END),
  coalesce(f.r_skip, CASE WHEN f.r_would_regress THEN 'would_regress' END)
FROM final f;
$$;

CREATE OR REPLACE FUNCTION "public"."sync_qbo_to_crm"("p_dry_run" boolean DEFAULT false) RETURNS TABLE("action" "text", "detail" "text", "affected" integer)
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_linked     integer := 0;
  v_notes      integer := 0;
  v_paid       integer := 0;
  v_stage      integer := 0;
  v_ambiguous  integer := 0;
BEGIN
  IF NOT p_dry_run THEN
    INSERT INTO qbo_links (organization_id, business_id, qbo_customer_id,
                           match_method, confidence, confirmed, note)
    SELECT b.organization_id, b.id, qc.qbo_customer_id,
           'auto_normalised_name', 1.0, false,
           'Linked by sync_qbo_to_crm on exact normalised name match'
    FROM qbo_customers qc
    JOIN businesses b
      ON lower(btrim(b.normalized_name)) = lower(btrim(qc.normalized_name))
    WHERE NOT EXISTS (SELECT 1 FROM qbo_links l WHERE l.qbo_customer_id = qc.qbo_customer_id)
      AND qc.normalized_name IS NOT NULL AND btrim(qc.normalized_name) <> ''
      AND (SELECT count(*) FROM businesses b2
            WHERE lower(btrim(b2.normalized_name)) = lower(btrim(qc.normalized_name))) = 1;
    GET DIAGNOSTICS v_linked = ROW_COUNT;
  ELSE
    SELECT count(*) INTO v_linked
    FROM qbo_customers qc
    JOIN businesses b ON lower(btrim(b.normalized_name)) = lower(btrim(qc.normalized_name))
    WHERE NOT EXISTS (SELECT 1 FROM qbo_links l WHERE l.qbo_customer_id = qc.qbo_customer_id)
      AND (SELECT count(*) FROM businesses b2
            WHERE lower(btrim(b2.normalized_name)) = lower(btrim(qc.normalized_name))) = 1;
  END IF;

  IF NOT p_dry_run THEN
    INSERT INTO correspondence
      (business_id, user_id, organization_id, raw_text_original,
       formatted_text_current, subject, type, direction, entry_date, ai_metadata)
    SELECT
      l.business_id,
      (SELECT up.id FROM user_profiles up
        WHERE up.organization_id = b.organization_id ORDER BY up.id LIMIT 1),
      b.organization_id,
      concat_ws(E'\n',
        'Invoice ' || coalesce(i.doc_number, i.qbo_invoice_id),
        'Date: ' || to_char(i.txn_date, 'DD/MM/YYYY'),
        'Amount: ' || to_char(i.total_amount, 'FM999999990.00'),
        CASE WHEN i.is_paid THEN 'Status: paid'
             ELSE 'Status: outstanding, balance ' || to_char(i.balance, 'FM999999990.00') END,
        CASE WHEN i.due_date IS NOT NULL THEN 'Due: ' || to_char(i.due_date, 'DD/MM/YYYY') END,
        nullif(i.line_description, '')),
      concat_ws(E'\n',
        'Invoice ' || coalesce(i.doc_number, i.qbo_invoice_id),
        'Date: ' || to_char(i.txn_date, 'DD/MM/YYYY'),
        'Amount: ' || to_char(i.total_amount, 'FM999999990.00'),
        CASE WHEN i.is_paid THEN 'Status: paid'
             ELSE 'Status: outstanding, balance ' || to_char(i.balance, 'FM999999990.00') END,
        CASE WHEN i.due_date IS NOT NULL THEN 'Due: ' || to_char(i.due_date, 'DD/MM/YYYY') END,
        nullif(i.line_description, '')),
      'Invoice ' || coalesce(i.doc_number, i.qbo_invoice_id)
        || ' - ' || to_char(i.total_amount, 'FM999999990.00')
        || CASE WHEN i.is_paid THEN ' - paid' ELSE ' - outstanding' END,
      'Note'::entry_type,
      NULL,
      i.txn_date::timestamptz,
      jsonb_build_object('source', 'qbo_invoice', 'qbo_invoice_id', i.qbo_invoice_id)
    FROM qbo_invoices i
    JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
    JOIN businesses b ON b.id = l.business_id
    WHERE coalesce(i.private_memo, '') <> 'Voided'
      AND NOT EXISTS (
        SELECT 1 FROM correspondence c
        WHERE c.ai_metadata->>'qbo_invoice_id' = i.qbo_invoice_id);
    GET DIAGNOSTICS v_notes = ROW_COUNT;

    UPDATE correspondence c
    SET subject = 'Invoice ' || coalesce(i.doc_number, i.qbo_invoice_id)
                  || ' - ' || to_char(i.total_amount, 'FM999999990.00') || ' - paid',
        formatted_text_current = replace(c.formatted_text_current,
                                         'Status: outstanding', 'Status: paid')
    FROM qbo_invoices i
    WHERE c.ai_metadata->>'qbo_invoice_id' = i.qbo_invoice_id
      AND i.is_paid
      AND c.subject LIKE '%outstanding%';
  ELSE
    SELECT count(*) INTO v_notes
    FROM qbo_invoices i
    JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
    WHERE coalesce(i.private_memo, '') <> 'Voided'
      AND NOT EXISTS (SELECT 1 FROM correspondence c
                      WHERE c.ai_metadata->>'qbo_invoice_id' = i.qbo_invoice_id);
  END IF;

  CREATE TEMP TABLE _qbo_settled ON COMMIT DROP AS
  WITH win AS (
    SELECT c.id AS contract_id, c.business_id, c.contract_start, c.contract_end,
           count(i.*)          AS invoices_in_window,
           bool_and(i.is_paid) AS all_paid,
           max(i.txn_date)     AS paid_on
    FROM contracts c
    JOIN qbo_links l ON l.business_id = c.business_id
    JOIN qbo_invoices i ON i.qbo_customer_id = l.qbo_customer_id
         AND i.txn_date BETWEEN (c.contract_start - 30) AND c.contract_end
         AND coalesce(i.private_memo, '') <> 'Voided'
         AND i.total_amount > 0
    WHERE c.is_current AND NOT c.invoice_paid AND c.contract_start IS NOT NULL
    GROUP BY c.id, c.business_id, c.contract_start, c.contract_end
  )
  SELECT * FROM win WHERE invoices_in_window = 1 AND all_paid;

  SELECT count(*) INTO v_ambiguous
  FROM contracts c
  JOIN qbo_links l ON l.business_id = c.business_id
  JOIN qbo_invoices i ON i.qbo_customer_id = l.qbo_customer_id
       AND i.txn_date BETWEEN (c.contract_start - 30) AND c.contract_end
       AND coalesce(i.private_memo, '') <> 'Voided' AND i.total_amount > 0
  WHERE c.is_current AND NOT c.invoice_paid
  GROUP BY c.id HAVING count(i.*) > 1;

  IF NOT p_dry_run THEN
    UPDATE contracts c SET invoice_paid = true
    FROM _qbo_settled s WHERE c.id = s.contract_id;
    GET DIAGNOSTICS v_paid = ROW_COUNT;

    UPDATE businesses b
    SET renewal_stage = 'invoice_paid',
        renewal_invoice_paid_at = s.paid_on
    FROM _qbo_settled s
    WHERE b.id = s.business_id
      AND (b.is_club_card OR b.is_advertiser)
      AND NOT b.mute_replies
      AND b.renewal_declined_at IS NULL
      AND coalesce(b.status,'') NOT IN ('Former','Inactive','Closed')
      AND coalesce(b.renewal_stage,'') <> 'invoice_paid'
      AND s.contract_end >= current_date
      AND coalesce(b.renewal_stage,'not_started') IN ('not_started','agreed')
      -- AMENDED 2026-09-16: only a paid RENEWAL term moves the card.
      AND EXISTS (SELECT 1 FROM contracts p
                  WHERE p.business_id = s.business_id
                    AND p.id <> s.contract_id
                    AND p.contract_start < s.contract_start);
    GET DIAGNOSTICS v_stage = ROW_COUNT;
  ELSE
    SELECT count(*) INTO v_paid FROM _qbo_settled;
    v_stage := v_paid;
  END IF;

  RETURN QUERY VALUES
    ('customers_linked',   'exact normalised name match only',                      v_linked),
    ('invoice_notes',      'correspondence Notes written for invoices',             v_notes),
    ('contracts_paid',     'single paid invoice in window',                         v_paid),
    ('renewal_stage_set',  'renewal card moved to invoice_paid',                    v_stage),
    ('ambiguous_skipped',  'contracts with several invoices in window, left alone',  v_ambiguous);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."prospect_lead_mirrors_business"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.matched_business_id IS NULL OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  IF NEW.status IN ('outreach_planned', 'contacted') THEN
    UPDATE businesses b
    SET outreach_stage = 'contacted',
        outreach_contacted_at = coalesce(b.outreach_contacted_at, current_date)
    WHERE b.id = NEW.matched_business_id
      AND coalesce(b.outreach_stage, 'identified') = 'identified'
      AND NOT (b.is_club_card OR b.is_advertiser);
  END IF;

  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION "public"."contract_insert_drives_pipeline"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE businesses b
  SET
    -- graduate off the outreach board, exactly as the manual button does
    outreach_stage            = NULL,
    outreach_identified_at    = NULL,
    outreach_contacted_at     = NULL,
    outreach_followed_up_at   = NULL,
    outreach_in_discussion_at = NULL,
    outreach_won_at           = NULL,
    outreach_invoice_paid_at  = NULL,
    outreach_declined_at      = NULL,

    -- open a fresh renewal cycle for the new term
    renewal_stage             = 'not_started',
    renewal_not_started_at    = coalesce(NEW.contract_start, current_date),
    renewal_contacted_at      = NULL,
    renewal_in_discussion_at  = NULL,
    renewal_agreed_at         = NULL,
    renewal_invoice_paid_at   = NULL,

    -- A signed contract supersedes an earlier "not renewing", but only if the
    -- decline came first. Otherwise a stale decline would block the derivation
    -- from ever touching this business again.
    renewal_declined_at = CASE
      WHEN b.renewal_declined_at IS NOT NULL
       AND NEW.contract_start IS NOT NULL
       AND b.renewal_declined_at::date <= NEW.contract_start
      THEN NULL
      ELSE b.renewal_declined_at
    END,

    status = CASE WHEN coalesce(b.status,'') IN ('', 'Prospect', 'Unreviewed') THEN 'Active' ELSE b.status END
  WHERE b.id = NEW.business_id;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."sync_business_flags_from_contracts"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  target_id uuid; has_club_card boolean; has_advertiser boolean; in_force boolean; cur record; has_cur boolean;
BEGIN
  target_id := COALESCE(NEW.business_id, OLD.business_id);
  SELECT
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current AND membership_type = 'club_card'),
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current AND membership_type = 'advertiser'),
    EXISTS (SELECT 1 FROM contracts WHERE business_id = target_id AND is_current
                                     AND coalesce(contract_end, current_date) >= current_date)
  INTO has_club_card, has_advertiser, in_force;

  SELECT contract_start, contract_end, contract_amount, contract_currency, deal_terms, membership_type
  INTO cur FROM contracts
  WHERE business_id = target_id AND is_current
  ORDER BY contract_start DESC NULLS LAST LIMIT 1;
  has_cur := FOUND;

  UPDATE businesses b
  SET
    is_club_card  = has_club_card,
    is_advertiser = has_advertiser,
    status = CASE
      WHEN in_force AND coalesce(b.status, '') IN ('', 'Prospect', 'Unreviewed', 'Former', 'Inactive') THEN 'Active'
      ELSE b.status END,
    membership_type = CASE
      WHEN in_force AND (b.membership_type IS NULL OR b.membership_type LIKE 'former_%')
        THEN coalesce(cur.membership_type, b.membership_type)
      WHEN b.membership_type IS NULL AND has_club_card  THEN 'club_card'
      WHEN b.membership_type IS NULL AND has_advertiser THEN 'advertiser'
      ELSE b.membership_type END,
    contract_start    = CASE WHEN has_cur THEN cur.contract_start    ELSE b.contract_start END,
    contract_end      = CASE WHEN has_cur THEN cur.contract_end      ELSE b.contract_end END,
    contract_amount   = CASE WHEN has_cur THEN cur.contract_amount   ELSE b.contract_amount END,
    contract_currency = CASE WHEN has_cur THEN cur.contract_currency ELSE b.contract_currency END,
    deal_terms        = CASE WHEN has_cur THEN coalesce(cur.deal_terms, b.deal_terms) ELSE b.deal_terms END
  WHERE b.id = target_id;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP FUNCTION IF EXISTS public.refresh_business_truth(uuid);
DROP VIEW IF EXISTS public.v_businesses;
DROP FUNCTION IF EXISTS public.cc_business_status(text, boolean, boolean, boolean, boolean);
