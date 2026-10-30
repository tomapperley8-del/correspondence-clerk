-- 30 Oct 2026: remove domain mappings that file one organisation's mail under another.
-- Learned by the old fuzzy match, which rated a domain containing a place word ("london",
-- "chiswick") 0.9 for any business named with it. Audit: supabase/.local/dm/audit.md and the
-- shared note domain-mappings-audit.md. Group A, agreed by Tom on 30 Oct ("Yes, remove group A").
-- Each row is checked by id, domain and business, so a mapping changed since the audit is left alone.
-- Contacts and emails are not touched. Before-images: cc_phase0_backup reason
-- 'domain mappings 2026-10-30'. Undo: 20261030_domain_mappings_cleanup_undo.sql.
BEGIN;
CREATE TEMP TABLE dm_remove (id uuid, domain text, business_id uuid) ON COMMIT DROP;
INSERT INTO dm_remove VALUES
  ('86d157df-7d45-4c07-b69d-4411b55571cb'::uuid, 'actionwestlondon.org.uk', '5acd7aa3-1755-4cf9-8ba3-600e4db075a7'::uuid), -- S&V LONDON
  ('ecde147f-abf2-4d0d-9003-2d3163de9baf'::uuid, 'annalouoflondon.com', '5acd7aa3-1755-4cf9-8ba3-600e4db075a7'::uuid), -- S&V LONDON
  ('d9c41a80-6681-4820-97cf-c8f511455918'::uuid, 'distriktlondon.com', '5acd7aa3-1755-4cf9-8ba3-600e4db075a7'::uuid), -- S&V LONDON
  ('f8f69244-a4e8-4d25-b1f0-e815cdfe1b92'::uuid, 'firstraillondon.co.uk', '5acd7aa3-1755-4cf9-8ba3-600e4db075a7'::uuid), -- S&V LONDON
  ('bbc8e480-b725-416f-86e6-b90911bb5682'::uuid, 'london-fire.gov.uk', '5acd7aa3-1755-4cf9-8ba3-600e4db075a7'::uuid), -- S&V LONDON
  ('b35f36cf-757d-47c8-ab71-e73bcc5d0886'::uuid, 'londoncouncils.gov.uk', '5acd7aa3-1755-4cf9-8ba3-600e4db075a7'::uuid), -- S&V LONDON
  ('398191bf-2c83-4b03-b308-13faaa76e586'::uuid, 'londonhearts.org', '5acd7aa3-1755-4cf9-8ba3-600e4db075a7'::uuid), -- S&V LONDON
  ('159777ae-b0c6-45c6-b08f-59e7bb88dc63'::uuid, 'londonindependentpictures.com', '5acd7aa3-1755-4cf9-8ba3-600e4db075a7'::uuid), -- S&V LONDON
  ('593821ee-4500-4985-8702-2adb90a2e099'::uuid, 'londonmasons.org.uk', '5acd7aa3-1755-4cf9-8ba3-600e4db075a7'::uuid), -- S&V LONDON
  ('c5d44156-29b4-49f0-b851-571413cd0160'::uuid, 'londonunleashed.org.uk', '5acd7aa3-1755-4cf9-8ba3-600e4db075a7'::uuid), -- S&V LONDON
  ('9c3563da-ba9e-471a-aba1-559d73e7941b'::uuid, 'sportspasslondon.com', '5acd7aa3-1755-4cf9-8ba3-600e4db075a7'::uuid), -- S&V LONDON
  ('b669f7b8-07b9-4b51-a670-26e7f27d3f99'::uuid, 'fyxer.com', '9621b61d-845c-454f-99ac-991203465763'::uuid), -- MUMADOO
  ('05f41214-b08d-432b-9a74-faa345cc7ca3'::uuid, 'hc.homeinstead.co.uk', '5a63a602-1a56-450c-89f5-f8b9c0fd8ced'::uuid), -- 20th Chiswick Scouts
  ('2fde5010-f31b-49f6-a856-92ff24dad66f'::uuid, 'pr.highspeedtraining.co.uk', '42c0c17b-8c8d-4ed3-9264-6a69a4d265e2'::uuid), -- ANR PR
  ('92e606c9-6224-4f6c-aa23-b305e59d9371'::uuid, 'email.meetup.com', '3632f0de-8568-41f3-a22f-4f0557a7f7c8'::uuid), -- Chiswick Business Network
  ('b707a449-891d-4e1f-8ffe-907f8af30f31'::uuid, 'chiswickschool.org', 'fab01b07-a130-4f8f-b134-ffebca8f9f52'::uuid), -- CHISWICK ART SCHOOL
  ('da940c80-8107-4b8b-b56c-587702da4838'::uuid, 'pm.me', '1af9b1c3-c93d-4066-9078-73245f827a3d'::uuid), -- CUP OF AMBITION MARKETING
  ('30199acd-7254-4a96-954f-b1ab45effdf2'::uuid, 'onclusivenews.com', '2604bba3-386c-419e-ab81-239074894a2b'::uuid), -- Hounslow Council
  ('0661dd44-a6fb-4f9c-9029-d3ee8fe15de2'::uuid, 'em.britishpodcastawards.com', '36ed4931-6464-473f-a504-dddca92efd9a'::uuid), -- Jack Emsley
  ('fef2255c-27aa-48d7-9891-9026afa13932'::uuid, 'info.atgtickets.com', '26f6ae9b-fb8f-4c46-8185-fd4fdcba83b0'::uuid), -- Kew Sinfonia
  ('2ed99021-c462-414f-9dc4-0f14067a3f2d'::uuid, 'tfl.gov.uk', '9b0c62aa-478e-48e3-9822-a0db867c4899'::uuid), -- MEGANS AT THE FLOWER MARKET RESTAURANT
  ('b4e2eaf9-6535-4739-badf-0785a4d77fe7'::uuid, 'test.mailgenius.com', 'd71496e8-dcfd-44dd-b368-73b2d80eba9f'::uuid), -- ONE DAY TESTS
  ('886c4f12-0dea-4509-9b11-c5a85ec62d86'::uuid, 'ts.playtomic.com', 'cfbe98b6-348a-4cfb-9e3b-c358f9682f1d'::uuid), -- PAWRA - VETS
  ('318be6f0-3945-4511-9c4a-2db462212a3f'::uuid, 'hounslow-symphony.org.uk', 'f5dce405-7b06-44db-97c4-098847eec723'::uuid), -- PHO
  ('9b81537f-e240-4ba5-ad71-77aa32fe6713'::uuid, 'richmond.ac.uk', 'c061f355-4b2f-401a-bec5-c870bbdc109a'::uuid), -- QUICK BUILDERS RICHMOND LTD
  ('e3f87a8b-3ae6-4bd5-a797-7437b92aceea'::uuid, 'cote.co.uk', 'e1a01ed2-6332-4fc6-b13b-4a070ff4e8cf'::uuid), -- TEMPLE WORLD/SIROCCO
  ('15fdf656-8ee6-45b3-b1c0-1a56cf5bfb06'::uuid, 'visitgunnersbury.org', '3e10080d-fc8d-450b-86b8-949de92e155a'::uuid), -- THE GUNNERSBURY
  ('41d5aecc-35f6-4afc-b70f-089d440b073a'::uuid, 'vuelio.co.uk', 'ad9f75da-987b-4556-acd3-95a53a34f76a'::uuid), -- Gtech
  ('ffdc5328-365f-4869-bd21-180d5ceeaf87'::uuid, 'fullers.co.uk', '5388185b-545c-412d-a1b2-d2a1039a5b56'::uuid), -- ONE OVER THE AIT
  ('ab3bd0e3-1d46-4b3a-8fa3-c80bf2173f9d'::uuid, 'ealing.gov.uk', '3a82bfa8-e3b8-45c8-bb4b-76dd8455038b'::uuid); -- Ealing Liberal Democrats

INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'domain_mappings', dm.id, to_jsonb(dm), 'domain mappings 2026-10-30'
FROM domain_mappings dm JOIN dm_remove r USING (id, domain, business_id);

DELETE FROM domain_mappings dm USING dm_remove r
WHERE dm.id = r.id AND dm.domain = r.domain AND dm.business_id = r.business_id;

SELECT (SELECT count(*) FROM cc_phase0_backup WHERE reason = 'domain mappings 2026-10-30') AS backed_up,
       (SELECT count(*) FROM domain_mappings dm JOIN dm_remove r USING (id)) AS left_of_list;
COMMIT;
