-- Undo: three advertiser contracts added 13 Nov 2026 (London Bath Co, Rocks Lane, Chiswick House and Shop).
DELETE FROM contract_invoices WHERE contract_id IN ('1af85ba6-ec80-498e-a821-468caf06243d','66444cfd-5847-48e1-895f-4dbc3d90d7d5','99a7c44d-7d80-45ee-93c4-b146e38a6f48');
DELETE FROM contracts WHERE id IN ('1af85ba6-ec80-498e-a821-468caf06243d','66444cfd-5847-48e1-895f-4dbc3d90d7d5','99a7c44d-7d80-45ee-93c4-b146e38a6f48');
SELECT refresh_business_truth('a870887c-8066-46b3-b0ad-77283f880e4f'), refresh_business_truth('13316965-4f3b-40c4-b333-0789f2a1d8f6'), refresh_business_truth('6918b426-4a35-44d7-9b1c-77d31e14b26c');
