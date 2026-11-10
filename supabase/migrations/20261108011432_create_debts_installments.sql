/*
# Create debts and installments tables (single-tenant, no auth)

1. New Tables
- `debts`
  - `id` (uuid, primary key)
  - `name` (text, not null) — debtor's name
  - `phone` (text, not null) — debtor's WhatsApp phone number
  - `principal` (numeric, not null) — total principal amount
  - `annual_rate` (numeric, not null) — annual interest rate as a percentage (e.g. 12 = 12%)
  - `start_date` (date, not null) — first installment due date
  - `created_at` (timestamptz)
- `installments`
  - `id` (uuid, primary key)
  - `debt_id` (uuid, foreign key to debts, cascade delete)
  - `number` (int, 1-10) — installment index
  - `due_date` (date, not null) — monthly due date
  - `principal_amount` (numeric, not null) — principal portion for this installment
  - `interest_amount` (numeric, not null) — interest portion for this installment
  - `total_bill` (numeric, not null) — principal + interest
  - `paid` (boolean, default false) — whether this installment has been paid
  - `created_at` (timestamptz)
2. Security
- Enable RLS on both tables.
- Grant CRUD to `anon` + `authenticated` so the anon-key frontend can read/write.
- Allow anon + authenticated full CRUD because the data is intentionally shared/public (single-tenant, no sign-in).
3. Notes
- Installments are generated automatically (10 rows) when a debt is created.
- The flat/simple-interest amortization is computed in the frontend and stored.
*/

CREATE TABLE IF NOT EXISTS debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  principal numeric(14,2) NOT NULL CHECK (principal > 0),
  annual_rate numeric(6,2) NOT NULL CHECK (annual_rate >= 0),
  start_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE debts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON debts TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_debts" ON debts;
CREATE POLICY "anon_select_debts" ON debts FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_debts" ON debts;
CREATE POLICY "anon_insert_debts" ON debts FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_debts" ON debts;
CREATE POLICY "anon_update_debts" ON debts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_debts" ON debts;
CREATE POLICY "anon_delete_debts" ON debts FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  number int NOT NULL CHECK (number BETWEEN 1 AND 10),
  due_date date NOT NULL,
  principal_amount numeric(14,2) NOT NULL,
  interest_amount numeric(14,2) NOT NULL,
  total_bill numeric(14,2) NOT NULL,
  paid boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (debt_id, number)
);

ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON installments TO anon, authenticated;

DROP POLICY IF EXISTS "anon_select_installments" ON installments;
CREATE POLICY "anon_select_installments" ON installments FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_installments" ON installments;
CREATE POLICY "anon_insert_installments" ON installments FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_installments" ON installments;
CREATE POLICY "anon_update_installments" ON debts FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_installments" ON installments;
CREATE POLICY "anon_update_installments" ON installments FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_installments" ON installments;
CREATE POLICY "anon_delete_installments" ON installments FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_installments_debt_id ON installments(debt_id);
