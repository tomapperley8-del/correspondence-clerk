-- Stage 17b (1): past contracts from the QuickBooks history.
-- Old Club Card and advertising invoices of linked businesses become past contracts (is_current = false),
-- so a Prospect with an old deal reads as Former and can join the win-back list. Needs the migration
-- 20261102_001_quickbooks_history (contract_invoices) and the history load first.
-- The 167 terms below were chosen from the invoices by supabase/.local/17b/terms.py and shown to Tom
-- (list: docs/stage17b-past-contracts-list.md) before this script was made final. Rules:
--   * one term per invoice, or per run of instalments (same stated dates, or monthly invoices <= 45 days apart);
--   * start and end from the description where it gives them, else the invoice date + the months it states
--     (12 for Club Card); only terms that ended before today; none overlapping an existing contract of the
--     business of the same kind (or an untyped one), or another term made here;
--   * contracts.qbo_invoice_id = the first invoice; every invoice of the term is in contract_invoices;
--   * one-off sales already recorded for these invoices are removed (the invoice is a contract now).
-- Every row added or removed is recorded in cc_phase0_backup (reason 'stage17b past contracts 2026-11-02').
-- Status follows from the contracts (v_businesses); the contracts trigger refreshes it per business.
-- Undo: 20261102_stage17b_past_contracts_undo.sql.
BEGIN;

CREATE TEMP TABLE s17b_pc (n int, business_id uuid, mtype text, cstart date, cend date, billing text, invoices text[]) ON COMMIT DROP;
INSERT INTO s17b_pc VALUES
  (1, 'a6b00923-8db1-4ada-b2e4-951c2bb71e0d'::uuid, 'advertiser', '2024-01-31'::date, '2025-01-30'::date, 'annual', ARRAY['5946']),
  (2, 'a6b00923-8db1-4ada-b2e4-951c2bb71e0d'::uuid, 'club_card', '2022-07-05'::date, '2023-07-04'::date, 'annual', ARRAY['2004']),
  (3, 'a6b00923-8db1-4ada-b2e4-951c2bb71e0d'::uuid, 'club_card', '2024-07-05'::date, '2025-07-04'::date, 'annual', ARRAY['6842']),
  (4, 'c1ccb7a6-9479-4743-bd1b-ac1335058c49'::uuid, 'club_card', '2025-09-30'::date, '2026-09-30'::date, 'annual', ARRAY['9246']),
  (5, 'b90f85d6-5ebb-4949-a321-5483ebddeaed'::uuid, 'advertiser', '2022-12-06'::date, '2023-12-05'::date, 'annual', ARRAY['3502']),
  (6, 'b90f85d6-5ebb-4949-a321-5483ebddeaed'::uuid, 'advertiser', '2024-06-01'::date, '2024-07-31'::date, 'annual', ARRAY['6843']),
  (7, 'b90f85d6-5ebb-4949-a321-5483ebddeaed'::uuid, 'club_card', '2023-12-05'::date, '2024-12-04'::date, 'annual', ARRAY['5612']),
  (8, 'b90f85d6-5ebb-4949-a321-5483ebddeaed'::uuid, 'club_card', '2024-12-05'::date, '2025-12-04'::date, 'annual', ARRAY['7823']),
  (9, '71be5796-f34a-4133-ab3e-15fca8382d6e'::uuid, 'club_card', '2019-11-01'::date, '2020-10-31'::date, 'annual', ARRAY['246']),
  (10, 'e0944033-3e01-4224-b623-9e021c33aaa7'::uuid, 'club_card', '2024-07-24'::date, '2025-07-23'::date, 'annual', ARRAY['7145']),
  (11, '3a1d0eda-e99d-46c6-83db-30dea8c4de17'::uuid, 'advertiser', '2021-08-06'::date, '2021-09-19'::date, 'annual', ARRAY['1181']),
  (12, '3a1d0eda-e99d-46c6-83db-30dea8c4de17'::uuid, 'advertiser', '2022-05-16'::date, '2022-06-14'::date, 'annual', ARRAY['1805']),
  (13, '3a1d0eda-e99d-46c6-83db-30dea8c4de17'::uuid, 'advertiser', '2023-05-16'::date, '2023-06-12'::date, 'annual', ARRAY['4365']),
  (14, '3a1d0eda-e99d-46c6-83db-30dea8c4de17'::uuid, 'advertiser', '2024-03-27'::date, '2025-03-26'::date, 'annual', ARRAY['6365']),
  (15, '3a1d0eda-e99d-46c6-83db-30dea8c4de17'::uuid, 'advertiser', '2025-04-01'::date, '2026-03-31'::date, 'annual', ARRAY['8175']),
  (16, '36b9f0bb-7db8-482e-9453-3b5ad07957f2'::uuid, 'advertiser', '2022-02-01'::date, '2023-01-31'::date, 'annual', ARRAY['1610']),
  (17, '36b9f0bb-7db8-482e-9453-3b5ad07957f2'::uuid, 'advertiser', '2023-09-01'::date, '2024-08-31'::date, 'annual', ARRAY['3614']),
  (18, 'b430f4bc-39da-4522-9787-85875b984052'::uuid, 'advertiser', '2025-05-13'::date, '2025-11-12'::date, 'annual', ARRAY['8271']),
  (19, '40d46a06-e3cc-4051-8594-1377cb8fb208'::uuid, 'club_card', '2022-01-01'::date, '2022-12-31'::date, 'annual', ARRAY['1545']),
  (20, '40d46a06-e3cc-4051-8594-1377cb8fb208'::uuid, 'club_card', '2023-01-01'::date, '2023-12-31'::date, 'annual', ARRAY['3599']),
  (21, '40d46a06-e3cc-4051-8594-1377cb8fb208'::uuid, 'club_card', '2024-01-01'::date, '2024-12-31'::date, 'annual', ARRAY['5891']),
  (22, '40d46a06-e3cc-4051-8594-1377cb8fb208'::uuid, 'club_card', '2025-01-01'::date, '2025-12-31'::date, 'annual', ARRAY['8090']),
  (23, '57434c0e-c68d-4f71-b8f4-8bad3e608a20'::uuid, 'club_card', '2022-09-27'::date, '2023-09-26'::date, 'annual', ARRAY['3130']),
  (24, '1545a238-f1f7-4c1f-88c5-606ba0116f02'::uuid, 'club_card', '2022-09-27'::date, '2023-09-26'::date, 'annual', ARRAY['3132']),
  (25, '1545a238-f1f7-4c1f-88c5-606ba0116f02'::uuid, 'club_card', '2023-10-01'::date, '2024-09-30'::date, 'annual', ARRAY['5240']),
  (26, '1545a238-f1f7-4c1f-88c5-606ba0116f02'::uuid, 'club_card', '2024-12-01'::date, '2025-11-30'::date, 'annual', ARRAY['7833']),
  (27, '3d07c3be-7b76-4332-9d76-83c3cf14a74a'::uuid, 'club_card', '2024-11-26'::date, '2025-11-25'::date, 'annual', ARRAY['7792']),
  (28, '0a223a9d-0cef-43b0-9662-13f0fdf2fcf9'::uuid, 'club_card', '2024-01-01'::date, '2024-12-31'::date, 'annual', ARRAY['5647']),
  (29, '55b42e82-a9d8-4382-8bc5-3c69eb008a5c'::uuid, 'club_card', '2022-06-09'::date, '2023-06-08'::date, 'annual', ARRAY['1804']),
  (30, '55b42e82-a9d8-4382-8bc5-3c69eb008a5c'::uuid, 'club_card', '2024-06-08'::date, '2025-06-07'::date, 'annual', ARRAY['6965']),
  (31, 'fab01b07-a130-4f8f-b134-ffebca8f9f52'::uuid, 'advertiser', '2020-10-05'::date, '2020-11-05'::date, 'annual', ARRAY['253']),
  (32, 'fab01b07-a130-4f8f-b134-ffebca8f9f52'::uuid, 'advertiser', '2020-12-09'::date, '2021-01-08'::date, 'annual', ARRAY['318']),
  (33, '1945a6e8-6345-4150-b477-5a8737eaa85e'::uuid, 'advertiser', '2021-12-01'::date, '2022-02-28'::date, 'annual', ARRAY['1570']),
  (34, '190cd8a0-28f3-45d3-8d1d-002f4d6f17a4'::uuid, 'advertiser', '2021-08-01'::date, '2022-07-31'::date, 'annual', ARRAY['1218']),
  (35, '190cd8a0-28f3-45d3-8d1d-002f4d6f17a4'::uuid, 'advertiser', '2022-08-13'::date, '2023-08-12'::date, 'annual', ARRAY['3127']),
  (36, '190cd8a0-28f3-45d3-8d1d-002f4d6f17a4'::uuid, 'advertiser', '2023-08-13'::date, '2024-08-12'::date, 'annual', ARRAY['5373']),
  (37, '308a995d-3c26-4d5d-b3ad-2a74b094f93b'::uuid, 'advertiser', '2022-04-04'::date, '2022-09-30'::date, 'annual', ARRAY['1713']),
  (38, '308a995d-3c26-4d5d-b3ad-2a74b094f93b'::uuid, 'advertiser', '2023-12-01'::date, '2024-08-31'::date, 'annual', ARRAY['4174']),
  (39, '308a995d-3c26-4d5d-b3ad-2a74b094f93b'::uuid, 'advertiser', '2025-03-01'::date, '2026-02-28'::date, 'annual', ARRAY['8097']),
  (40, '360181c2-7fc9-41c2-bf4b-ac05066598a6'::uuid, 'advertiser', '2023-05-05'::date, '2024-05-04'::date, 'annual', ARRAY['4578']),
  (41, '360181c2-7fc9-41c2-bf4b-ac05066598a6'::uuid, 'club_card', '2022-07-26'::date, '2023-07-25'::date, 'annual', ARRAY['1996']),
  (42, '2e54491a-81d3-4918-807a-ebd1d9b9e5ad'::uuid, 'advertiser', '2024-09-09'::date, '2025-09-08'::date, 'monthly', ARRAY['8002','7025','8003','8004']),
  (43, '2e54491a-81d3-4918-807a-ebd1d9b9e5ad'::uuid, 'club_card', '2021-12-13'::date, '2022-12-12'::date, 'annual', ARRAY['1478']),
  (44, '2e54491a-81d3-4918-807a-ebd1d9b9e5ad'::uuid, 'club_card', '2022-12-13'::date, '2023-12-12'::date, 'annual', ARRAY['3600']),
  (45, '47a296fb-fe72-49da-8d9a-da0fc558d702'::uuid, 'advertiser', '2022-03-21'::date, '2022-12-31'::date, 'annual', ARRAY['1675']),
  (46, '47a296fb-fe72-49da-8d9a-da0fc558d702'::uuid, 'advertiser', '2023-12-01'::date, '2024-10-31'::date, 'annual', ARRAY['3718']),
  (47, '47a296fb-fe72-49da-8d9a-da0fc558d702'::uuid, 'advertiser', '2025-03-01'::date, '2026-02-28'::date, 'annual', ARRAY['8093']),
  (48, '6918b426-4a35-44d7-9b1c-77d31e14b26c'::uuid, 'advertiser', '2023-08-01'::date, '2023-08-31'::date, 'annual', ARRAY['4945']),
  (49, '6918b426-4a35-44d7-9b1c-77d31e14b26c'::uuid, 'club_card', '2022-07-14'::date, '2023-07-13'::date, 'annual', ARRAY['1997']),
  (50, '4c85a02a-d6bc-4cc8-9dc8-fce901729d1f'::uuid, 'advertiser', '2021-04-01'::date, '2022-03-31'::date, 'annual', ARRAY['354']),
  (51, '59e356be-88a6-414e-b347-cb16c4bced7a'::uuid, 'advertiser', '2023-10-06'::date, '2024-01-05'::date, 'annual', ARRAY['5223']),
  (52, '59e356be-88a6-414e-b347-cb16c4bced7a'::uuid, 'advertiser', '2024-09-11'::date, '2024-10-10'::date, 'annual', ARRAY['7390']),
  (53, '59e356be-88a6-414e-b347-cb16c4bced7a'::uuid, 'club_card', '2021-11-01'::date, '2022-10-31'::date, 'annual', ARRAY['1472']),
  (54, '59e356be-88a6-414e-b347-cb16c4bced7a'::uuid, 'club_card', '2022-11-01'::date, '2023-10-31'::date, 'annual', ARRAY['3343']),
  (55, '59e356be-88a6-414e-b347-cb16c4bced7a'::uuid, 'club_card', '2023-11-01'::date, '2024-10-31'::date, 'annual', ARRAY['5502']),
  (56, '08ff5d65-f460-4305-86ca-2accb03fbb8d'::uuid, 'club_card', '2024-02-19'::date, '2025-02-18'::date, 'annual', ARRAY['6110']),
  (57, '7ea0f535-c3f5-4f3b-a66a-bc9bfa54d6fd'::uuid, 'club_card', '2024-11-26'::date, '2025-11-25'::date, 'annual', ARRAY['7795']),
  (58, '83dc7159-4ad7-4a00-a10a-1c056057abfd'::uuid, 'club_card', '2024-01-01'::date, '2024-12-31'::date, 'annual', ARRAY['5648']),
  (59, '03ae73f3-a89c-43dc-8ed0-fa15e4387b06'::uuid, 'club_card', '2024-11-01'::date, '2025-10-31'::date, 'annual', ARRAY['7781']),
  (60, '51f60e8a-65d3-49b4-914e-9e456e47255b'::uuid, 'advertiser', '2020-07-01'::date, '2020-12-31'::date, 'annual', ARRAY['187']),
  (61, '51f60e8a-65d3-49b4-914e-9e456e47255b'::uuid, 'advertiser', '2021-02-26'::date, '2021-08-25'::date, 'annual', ARRAY['338']),
  (62, '51f60e8a-65d3-49b4-914e-9e456e47255b'::uuid, 'advertiser', '2021-09-01'::date, '2022-02-28'::date, 'annual', ARRAY['1469']),
  (63, '51f60e8a-65d3-49b4-914e-9e456e47255b'::uuid, 'advertiser', '2024-02-01'::date, '2025-01-31'::date, 'annual', ARRAY['5926']),
  (64, '51f60e8a-65d3-49b4-914e-9e456e47255b'::uuid, 'club_card', '2022-02-26'::date, '2023-02-25'::date, 'annual', ARRAY['1956']),
  (65, '0487fdc8-3bb3-481b-81f9-54f2c63e421b'::uuid, 'club_card', '2020-08-01'::date, '2021-07-31'::date, 'annual', ARRAY['256']),
  (66, '0487fdc8-3bb3-481b-81f9-54f2c63e421b'::uuid, 'club_card', '2021-08-01'::date, '2022-07-31'::date, 'annual', ARRAY['1546']),
  (67, '0487fdc8-3bb3-481b-81f9-54f2c63e421b'::uuid, 'club_card', '2022-08-01'::date, '2023-07-30'::date, 'annual', ARRAY['1811']),
  (68, '0487fdc8-3bb3-481b-81f9-54f2c63e421b'::uuid, 'club_card', '2023-08-01'::date, '2024-07-31'::date, 'annual', ARRAY['5501']),
  (69, '0487fdc8-3bb3-481b-81f9-54f2c63e421b'::uuid, 'club_card', '2024-08-01'::date, '2025-07-31'::date, 'annual', ARRAY['7153']),
  (70, 'b725ce63-453a-4fe6-8e64-092b12b445a9'::uuid, 'club_card', '2022-06-28'::date, '2023-06-27'::date, 'annual', ARRAY['1954']),
  (71, 'ff52aec7-7ae8-4a91-b57f-591b6ecef550'::uuid, 'club_card', '2022-05-17'::date, '2023-05-16'::date, 'annual', ARRAY['1807']),
  (72, '2274aab6-ff34-43ed-8933-ddf93ae08e93'::uuid, 'advertiser', '2024-05-20'::date, '2024-08-19'::date, 'annual', ARRAY['6774']),
  (73, '2274aab6-ff34-43ed-8933-ddf93ae08e93'::uuid, 'advertiser', '2024-08-20'::date, '2025-08-20'::date, 'annual', ARRAY['7460']),
  (74, '65e7bfc5-3adf-415f-af09-fd59f5e6d225'::uuid, 'club_card', '2024-10-15'::date, '2025-10-14'::date, 'annual', ARRAY['7600']),
  (75, 'bdff0b8b-c408-492e-ba21-a93dd1c54d89'::uuid, 'club_card', '2022-08-01'::date, '2023-07-31'::date, 'annual', ARRAY['2002']),
  (76, 'e56cd10a-7f9f-4fbd-8c0c-25729f9b9e82'::uuid, 'club_card', '2022-03-31'::date, '2023-03-30'::date, 'annual', ARRAY['1810']),
  (77, 'e56cd10a-7f9f-4fbd-8c0c-25729f9b9e82'::uuid, 'club_card', '2023-03-31'::date, '2024-03-30'::date, 'annual', ARRAY['4175']),
  (78, 'e56cd10a-7f9f-4fbd-8c0c-25729f9b9e82'::uuid, 'club_card', '2024-04-29'::date, '2025-04-28'::date, 'annual', ARRAY['6567']),
  (79, '480cac7d-5643-44d8-bd84-f46aebcd0d32'::uuid, 'club_card', '2023-07-01'::date, '2024-06-30'::date, 'annual', ARRAY['4946']),
  (80, 'f8904a89-4a36-418a-b053-1617e3879054'::uuid, 'advertiser', '2022-04-01'::date, '2022-09-30'::date, 'annual', ARRAY['1701']),
  (81, 'f8904a89-4a36-418a-b053-1617e3879054'::uuid, 'advertiser', '2022-12-01'::date, '2023-05-31'::date, 'annual', ARRAY['1986']),
  (82, 'f8904a89-4a36-418a-b053-1617e3879054'::uuid, 'advertiser', '2023-06-01'::date, '2023-11-30'::date, 'annual', ARRAY['3575']),
  (83, 'f8904a89-4a36-418a-b053-1617e3879054'::uuid, 'advertiser', '2024-06-01'::date, '2024-11-30'::date, 'annual', ARRAY['5892']),
  (84, 'f8904a89-4a36-418a-b053-1617e3879054'::uuid, 'advertiser', '2025-01-01'::date, '2025-07-31'::date, 'annual', ARRAY['7953']),
  (85, 'e4c6653a-a2fd-4f1e-9e60-c0e5fb413bc0'::uuid, 'advertiser', '2021-06-29'::date, '2022-06-28'::date, 'annual', ARRAY['1059']),
  (86, '56e37c38-0620-44de-97ab-19105b9a79c5'::uuid, 'advertiser', '2024-08-28'::date, '2025-02-27'::date, 'annual', ARRAY['7312']),
  (87, '7a8ecbac-9e70-4687-b954-f0b61aeeaf65'::uuid, 'club_card', '2020-09-01'::date, '2021-08-31'::date, 'annual', ARRAY['261']),
  (88, '4135da1c-49d0-41dc-9c49-6dee77605774'::uuid, 'club_card', '2025-02-11'::date, '2026-02-10'::date, 'annual', ARRAY['8032']),
  (89, 'a870887c-8066-46b3-b0ad-77283f880e4f'::uuid, 'advertiser', '2024-07-18'::date, '2025-07-17'::date, 'annual', ARRAY['7122']),
  (90, 'c330ca63-3a91-4938-b97b-ec7a34b81320'::uuid, 'club_card', '2022-05-10'::date, '2023-05-09'::date, 'annual', ARRAY['1803']),
  (91, 'c330ca63-3a91-4938-b97b-ec7a34b81320'::uuid, 'club_card', '2024-05-01'::date, '2025-04-30'::date, 'annual', ARRAY['5233']),
  (92, 'f824d09d-962e-4b0a-9770-cbb1c82a0bdb'::uuid, 'advertiser', '2023-12-02'::date, '2024-01-01'::date, 'annual', ARRAY['5439']),
  (93, '96311866-1880-4636-a08c-7a8a53890c51'::uuid, 'advertiser', '2023-03-28'::date, '2024-03-27'::date, 'annual', ARRAY['4202']),
  (94, '96311866-1880-4636-a08c-7a8a53890c51'::uuid, 'club_card', '2024-03-27'::date, '2025-03-26'::date, 'annual', ARRAY['6595']),
  (95, 'f63bd54b-dfb4-45d9-9628-e8358e5c4eec'::uuid, 'club_card', '2020-11-01'::date, '2021-10-31'::date, 'annual', ARRAY['264']),
  (96, 'f63bd54b-dfb4-45d9-9628-e8358e5c4eec'::uuid, 'club_card', '2021-11-01'::date, '2022-10-31'::date, 'annual', ARRAY['1467']),
  (97, 'f63bd54b-dfb4-45d9-9628-e8358e5c4eec'::uuid, 'club_card', '2022-11-01'::date, '2023-10-30'::date, 'annual', ARRAY['3716']),
  (98, 'f63bd54b-dfb4-45d9-9628-e8358e5c4eec'::uuid, 'club_card', '2024-10-31'::date, '2025-10-30'::date, 'annual', ARRAY['5479']),
  (99, 'b43f9e86-ef2c-4ad6-bdc3-3b5b16ee8c0a'::uuid, 'club_card', '2023-10-11'::date, '2024-10-10'::date, 'annual', ARRAY['5241']),
  (100, '8a962bf0-3bf4-41d6-ba4f-16b450651f85'::uuid, 'club_card', '2021-08-24'::date, '2022-08-23'::date, 'annual', ARRAY['1233']),
  (101, '8a962bf0-3bf4-41d6-ba4f-16b450651f85'::uuid, 'club_card', '2023-05-15'::date, '2024-05-14'::date, 'annual', ARRAY['4539']),
  (102, '8a962bf0-3bf4-41d6-ba4f-16b450651f85'::uuid, 'club_card', '2024-05-15'::date, '2025-05-14'::date, 'annual', ARRAY['7352']),
  (103, '620871ef-8b31-419b-aaff-f3301e2dec81'::uuid, 'club_card', '2022-07-01'::date, '2023-06-30'::date, 'annual', ARRAY['1959']),
  (104, '620871ef-8b31-419b-aaff-f3301e2dec81'::uuid, 'club_card', '2023-07-01'::date, '2024-06-30'::date, 'annual', ARRAY['5478']),
  (105, '620871ef-8b31-419b-aaff-f3301e2dec81'::uuid, 'club_card', '2024-07-01'::date, '2025-06-30'::date, 'annual', ARRAY['7056']),
  (106, '4b345e75-3ec7-4f45-9485-72cfa5cfbbd3'::uuid, 'club_card', '2023-04-04'::date, '2024-04-04'::date, 'annual', ARRAY['4026']),
  (107, '7461a571-b6e9-4653-82ce-4424fd914d75'::uuid, 'advertiser', '2024-07-31'::date, '2025-07-30'::date, 'annual', ARRAY['7337']),
  (108, '7461a571-b6e9-4653-82ce-4424fd914d75'::uuid, 'advertiser', '2025-09-03'::date, '2026-09-02'::date, 'annual', ARRAY['9172']),
  (109, '5388185b-545c-412d-a1b2-d2a1039a5b56'::uuid, 'club_card', '2024-04-29'::date, '2025-04-28'::date, 'annual', ARRAY['6590']),
  (110, '5428d3d1-f4d2-4311-823a-ab3a6306a8ae'::uuid, 'club_card', '2022-05-10'::date, '2023-05-09'::date, 'annual', ARRAY['1799']),
  (111, '40b3a3ae-612c-4e97-800a-2678b3c17171'::uuid, 'advertiser', '2024-02-09'::date, '2024-06-30'::date, 'annual', ARRAY['6163']),
  (112, 'ce1da41c-463a-47be-a7ee-f1c4d97bab0c'::uuid, 'advertiser', '2022-09-06'::date, '2023-09-05'::date, 'annual', ARRAY['3009']),
  (113, '13316965-4f3b-40c4-b333-0789f2a1d8f6'::uuid, 'advertiser', '2024-09-24'::date, '2025-09-23'::date, 'annual', ARRAY['7455']),
  (114, '0c3542bd-92d0-4f2f-a4e4-af6b4ce730c6'::uuid, 'club_card', '2022-11-29'::date, '2023-11-28'::date, 'annual', ARRAY['3488']),
  (115, '0c3542bd-92d0-4f2f-a4e4-af6b4ce730c6'::uuid, 'club_card', '2023-11-30'::date, '2024-11-29'::date, 'annual', ARRAY['5581']),
  (116, 'ff599bf7-eb5b-4310-bb5f-41330596ba40'::uuid, 'club_card', '2025-03-08'::date, '2026-03-07'::date, 'annual', ARRAY['6245']),
  (117, '518ed97d-860f-41d7-b7d2-1281227d552c'::uuid, 'club_card', '2022-06-14'::date, '2023-06-13'::date, 'annual', ARRAY['1814']),
  (118, 'cee7daf5-6852-4ef8-ad67-7cfc90373624'::uuid, 'club_card', '2022-04-19'::date, '2023-04-18'::date, 'annual', ARRAY['1736']),
  (119, '3c37480f-20c3-434a-ab76-fd9b0d6ed67d'::uuid, 'club_card', '2024-07-03'::date, '2025-07-02'::date, 'annual', ARRAY['7023']),
  (120, 'ac3e74c9-8b33-4c5b-8d2a-e5ccbc9cfa96'::uuid, 'club_card', '2021-11-17'::date, '2022-11-16'::date, 'annual', ARRAY['1416']),
  (121, 'ac3e74c9-8b33-4c5b-8d2a-e5ccbc9cfa96'::uuid, 'club_card', '2023-11-16'::date, '2024-11-16'::date, 'annual', ARRAY['5574']),
  (122, 'a51325cf-68f0-4f6f-a73c-180a3197f75a'::uuid, 'club_card', '2023-01-10'::date, '2024-01-09'::date, 'annual', ARRAY['3529']),
  (123, '20e34ad7-a6c2-414e-b727-b7cc54bc22a1'::uuid, 'club_card', '2022-03-08'::date, '2023-03-07'::date, 'annual', ARRAY['1640']),
  (124, '20e34ad7-a6c2-414e-b727-b7cc54bc22a1'::uuid, 'club_card', '2023-03-08'::date, '2024-03-07'::date, 'annual', ARRAY['4623']),
  (125, '7cf13bb8-196f-4715-a76c-e060f9378534'::uuid, 'club_card', '2021-08-26'::date, '2022-08-25'::date, 'annual', ARRAY['1236']),
  (126, '7cf13bb8-196f-4715-a76c-e060f9378534'::uuid, 'club_card', '2022-08-26'::date, '2023-08-25'::date, 'annual', ARRAY['3664']),
  (127, '7cf13bb8-196f-4715-a76c-e060f9378534'::uuid, 'club_card', '2023-09-01'::date, '2024-08-31'::date, 'annual', ARRAY['5260']),
  (128, '7cf13bb8-196f-4715-a76c-e060f9378534'::uuid, 'club_card', '2024-09-01'::date, '2025-08-31'::date, 'annual', ARRAY['7321']),
  (129, '521f145b-5ad4-4e10-9fb9-c8ff4b57a6b8'::uuid, 'advertiser', '2023-11-01'::date, '2024-01-31'::date, 'annual', ARRAY['5258']),
  (130, '521f145b-5ad4-4e10-9fb9-c8ff4b57a6b8'::uuid, 'club_card', '2022-11-11'::date, '2023-11-10'::date, 'annual', ARRAY['3369']),
  (131, '521f145b-5ad4-4e10-9fb9-c8ff4b57a6b8'::uuid, 'club_card', '2023-11-16'::date, '2024-11-15'::date, 'annual', ARRAY['5504']),
  (132, '5a718b90-fdc3-4f60-a6d5-6d80cce1ef7a'::uuid, 'advertiser', '2024-07-30'::date, '2025-07-29'::date, 'annual', ARRAY['7172']),
  (133, '5a718b90-fdc3-4f60-a6d5-6d80cce1ef7a'::uuid, 'advertiser', '2025-08-28'::date, '2025-11-27'::date, 'annual', ARRAY['8840']),
  (134, '97e00b86-2de2-4300-bb58-2d6648e26792'::uuid, 'club_card', '2024-07-31'::date, '2025-07-30'::date, 'annual', ARRAY['7174']),
  (135, '26e4cfa6-daff-42a8-9f93-9e994c3bb72e'::uuid, 'advertiser', '2022-06-14'::date, '2022-12-13'::date, 'annual', ARRAY['1813']),
  (136, '51225e9f-e22a-4977-9daf-a70637ed9800'::uuid, 'advertiser', '2023-08-01'::date, '2023-10-31'::date, 'annual', ARRAY['4944']),
  (137, 'b43c3011-4f13-4994-ba49-2ecdb6d33dc4'::uuid, 'club_card', '2022-03-22'::date, '2023-03-21'::date, 'annual', ARRAY['1676']),
  (138, '1be1df2f-2eda-4891-9ee0-7f2b850f08cf'::uuid, 'club_card', '2023-05-30'::date, '2024-05-29'::date, 'annual', ARRAY['4543']),
  (139, 'da3a2529-35f3-4ac6-be0a-7eb003cc9941'::uuid, 'club_card', '2021-09-01'::date, '2022-08-31'::date, 'annual', ARRAY['1468']),
  (140, 'da3a2529-35f3-4ac6-be0a-7eb003cc9941'::uuid, 'club_card', '2022-09-01'::date, '2023-08-31'::date, 'annual', ARRAY['3129']),
  (141, 'da3a2529-35f3-4ac6-be0a-7eb003cc9941'::uuid, 'club_card', '2023-09-01'::date, '2024-08-31'::date, 'annual', ARRAY['5458']),
  (142, 'da3a2529-35f3-4ac6-be0a-7eb003cc9941'::uuid, 'club_card', '2024-09-01'::date, '2025-08-31'::date, 'annual', ARRAY['7286']),
  (143, 'd5ae3c7e-8850-4776-b3c1-c601fbeae766'::uuid, 'club_card', '2022-11-16'::date, '2023-11-15'::date, 'annual', ARRAY['3468']),
  (144, '37a1b088-4f4b-4740-bab5-1b4a3a7341db'::uuid, 'club_card', '2024-01-22'::date, '2025-01-21'::date, 'annual', ARRAY['5924']),
  (145, '3c348648-c96c-4870-bb04-6adaf3647b08'::uuid, 'club_card', '2024-11-01'::date, '2025-10-31'::date, 'annual', ARRAY['5503','8038']),
  (146, '9824cb79-6d85-41b4-8058-77402c858c25'::uuid, 'club_card', '2021-07-01'::date, '2022-06-30'::date, 'annual', ARRAY['1167']),
  (147, '9824cb79-6d85-41b4-8058-77402c858c25'::uuid, 'club_card', '2022-07-01'::date, '2023-06-30'::date, 'annual', ARRAY['1957']),
  (148, '9824cb79-6d85-41b4-8058-77402c858c25'::uuid, 'club_card', '2023-07-01'::date, '2024-06-30'::date, 'annual', ARRAY['5437']),
  (149, '9824cb79-6d85-41b4-8058-77402c858c25'::uuid, 'club_card', '2024-07-01'::date, '2025-06-30'::date, 'annual', ARRAY['6969']),
  (150, '02266e3b-b956-45d6-af53-d60596fa0bc3'::uuid, 'club_card', '2021-09-01'::date, '2022-08-31'::date, 'annual', ARRAY['1470']),
  (151, '02266e3b-b956-45d6-af53-d60596fa0bc3'::uuid, 'club_card', '2022-09-01'::date, '2023-08-31'::date, 'annual', ARRAY['3598']),
  (152, '02266e3b-b956-45d6-af53-d60596fa0bc3'::uuid, 'club_card', '2023-09-01'::date, '2024-08-31'::date, 'annual', ARRAY['5438']),
  (153, '02266e3b-b956-45d6-af53-d60596fa0bc3'::uuid, 'club_card', '2024-09-01'::date, '2025-08-31'::date, 'annual', ARRAY['7643']),
  (154, 'f78b69e7-8677-480b-b2be-bfc4f06962c1'::uuid, 'advertiser', '2023-10-20'::date, '2024-08-14'::date, 'annual', ARRAY['7612']),
  (155, 'f78b69e7-8677-480b-b2be-bfc4f06962c1'::uuid, 'advertiser', '2025-01-20'::date, '2026-01-19'::date, 'annual', ARRAY['7989']),
  (156, '143f6f29-9514-40fc-808a-d7204cab56e5'::uuid, 'advertiser', '2022-07-18'::date, '2023-07-17'::date, 'annual', ARRAY['1990']),
  (157, '143f6f29-9514-40fc-808a-d7204cab56e5'::uuid, 'advertiser', '2023-11-02'::date, '2024-11-01'::date, 'annual', ARRAY['5403']),
  (158, '143f6f29-9514-40fc-808a-d7204cab56e5'::uuid, 'club_card', '2023-09-01'::date, '2024-08-31'::date, 'annual', ARRAY['5404']),
  (159, 'ac02dd5a-cd8f-4de3-a684-b88a48e721ae'::uuid, 'club_card', '2025-07-22'::date, '2026-01-21'::date, 'annual', ARRAY['8781']),
  (160, '5eee9047-9753-4aa6-ac75-5b2a404c4927'::uuid, 'club_card', '2021-08-01'::date, '2022-07-31'::date, 'annual', ARRAY['1184']),
  (161, '5eee9047-9753-4aa6-ac75-5b2a404c4927'::uuid, 'club_card', '2022-08-01'::date, '2023-07-31'::date, 'annual', ARRAY['1999']),
  (162, '6fa104f0-e717-4e9d-9936-f66e031d2737'::uuid, 'club_card', '2025-02-11'::date, '2026-02-10'::date, 'annual', ARRAY['8027']),
  (163, '1e8e1cc8-c172-481e-88f9-c01d5effc186'::uuid, 'club_card', '2023-01-24'::date, '2024-01-23'::date, 'annual', ARRAY['3583']),
  (164, 'bbf0f5d5-b38b-4fba-a4c7-58ac8b9aef2b'::uuid, 'advertiser', '2021-08-09'::date, '2021-11-08'::date, 'annual', ARRAY['1149']),
  (165, '7a4ce3af-6650-4eec-97e5-b3beb0e7a265'::uuid, 'club_card', '2020-12-01'::date, '2021-11-30'::date, 'annual', ARRAY['314']),
  (166, '7a4ce3af-6650-4eec-97e5-b3beb0e7a265'::uuid, 'club_card', '2021-12-10'::date, '2022-12-10'::date, 'annual', ARRAY['1679']),
  (167, 'b8df9b24-25d1-41b1-92d8-78f205740a39'::uuid, 'advertiser', '2021-08-07'::date, '2021-09-06'::date, 'annual', ARRAY['1183']);

-- every invoice must exist, belong to a customer linked to that business, and not be on a contract already
DO $$ DECLARE bad int; BEGIN
  SELECT count(*) INTO bad FROM s17b_pc p, unnest(p.invoices) x(id)
   WHERE NOT EXISTS (SELECT 1 FROM qbo_invoices i JOIN qbo_links l ON l.qbo_customer_id = i.qbo_customer_id
                      WHERE i.qbo_invoice_id = x.id AND l.business_id = p.business_id)
      OR EXISTS (SELECT 1 FROM contracts c WHERE c.qbo_invoice_id = x.id)
      OR EXISTS (SELECT 1 FROM contract_invoices ci WHERE ci.qbo_invoice_id = x.id);
  IF bad > 0 THEN RAISE EXCEPTION 'stage17b past contracts: % invoices do not match their business or are already on a contract', bad; END IF;
END $$;

-- before-images of the businesses' stored status (a stored status counts as a past deal, so the undo
-- puts it back from here rather than working it out again)
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'businesses', b.id, to_jsonb(b), 'stage17b past contracts 2026-11-02'
FROM businesses b WHERE b.id IN (SELECT business_id FROM s17b_pc);

-- before-images of the one-off sales these invoices replace
INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'one_off_sales', s.id, to_jsonb(s), 'stage17b past contracts 2026-11-02'
FROM one_off_sales s WHERE s.qbo_invoice_id IN (SELECT unnest(invoices) FROM s17b_pc);
DELETE FROM one_off_sales WHERE qbo_invoice_id IN (SELECT unnest(invoices) FROM s17b_pc);

CREATE TEMP TABLE s17b_pc_new ON COMMIT DROP AS
SELECT p.n, gen_random_uuid() AS contract_id FROM s17b_pc p;

INSERT INTO contracts (id, business_id, organization_id, membership_type, contract_start, contract_end, contract_amount,
                       contract_currency, billing_frequency, deal_terms, invoice_paid, is_current, qbo_invoice_id)
SELECT w.contract_id, p.business_id, b.organization_id, p.mtype, p.cstart, p.cend,
       (SELECT sum(i.total_amount) FROM qbo_invoices i WHERE i.qbo_invoice_id = ANY (p.invoices)),
       'GBP', p.billing,
       left((SELECT i.line_description FROM qbo_invoices i WHERE i.qbo_invoice_id = p.invoices[1]), 400) || ' (recorded from QuickBooks history)',
       (SELECT bool_and(i.is_paid) FROM qbo_invoices i WHERE i.qbo_invoice_id = ANY (p.invoices)),
       false, p.invoices[1]
FROM s17b_pc p JOIN s17b_pc_new w USING (n) JOIN businesses b ON b.id = p.business_id;

INSERT INTO contract_invoices (qbo_invoice_id, contract_id)
SELECT x.id, w.contract_id FROM s17b_pc p JOIN s17b_pc_new w USING (n), unnest(p.invoices) x(id);

INSERT INTO cc_phase0_backup (table_name, row_id, before_row, reason)
SELECT 'contracts_created', w.contract_id, jsonb_build_object('business_id', p.business_id), 'stage17b past contracts 2026-11-02'
FROM s17b_pc p JOIN s17b_pc_new w USING (n);

SELECT (SELECT count(*) FROM s17b_pc) AS contracts_added, (SELECT count(DISTINCT business_id) FROM s17b_pc) AS businesses,
       (SELECT count(*) FROM s17b_pc, unnest(invoices)) AS invoices_covered;
COMMIT;
