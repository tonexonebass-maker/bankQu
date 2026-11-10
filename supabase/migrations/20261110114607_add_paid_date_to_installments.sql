/*
# Add paid_date column to installments

1. Modified Tables
- `installments`
  - Added `paid_date` (date, nullable) — the actual date the customer made
    their payment. NULL when the installment is not yet paid. This is
    separate from `due_date` (the scheduled due date) because real
    payments may happen before, on, or after the due date.
2. Security
- No policy changes. The existing anon/authenticated UPDATE policy and
  grants already cover all columns on `installments`, including the new
  column (the grant is table-level, not column-restricted).
3. Notes
- `paid_date` is nullable so existing unpaid rows are unaffected.
- The frontend will set `paid_date` when marking an installment as paid
  and clear it (set to NULL) when marking back to unpaid.
*/

ALTER TABLE installments
  ADD COLUMN IF NOT EXISTS paid_date date;
