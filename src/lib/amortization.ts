import type { InstallmentDraft } from './supabase';

export const FIXED_INTEREST_RATE = 30;

/**
 * Generate a 10-installment schedule with fixed flat interest.
 * - Total interest is 30% of the principal, divided evenly across 10 installments.
 * - Principal is also divided evenly across 10 installments.
 * - Each installment has the same principal, interest, and total bill.
 * - Due dates advance one calendar month from the start date per installment.
 */
export function generateInstallments(
  principal: number,
  startDate: string,
): InstallmentDraft[] {
  const base = new Date(startDate);
  const installments: InstallmentDraft[] = [];

  const principalPortion = round2(principal / 10);
  const totalInterest = round2(principal * (FIXED_INTEREST_RATE / 100));
  const interestPortion = round2(totalInterest / 10);
  const totalBill = round2(principalPortion + interestPortion);

  for (let i = 1; i <= 10; i++) {
    const due = addMonths(base, i - 1);

    installments.push({
      number: i,
      due_date: due.toISOString().slice(0, 10),
      principal_amount: principalPortion,
      interest_amount: interestPortion,
      total_bill: totalBill,
    });
  }

  return installments;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setMonth(d.getMonth() + months);
  // Handle month overflow (e.g. Jan 31 + 1 month -> Mar 3); clamp to end-of-month
  if (d.getDate() < date.getDate()) {
    d.setDate(0);
  }
  return d;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Normalize a phone number to digits only (strips +, spaces, dashes). */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, '');
}

export function buildWhatsAppLink(phone: string, message: string): string {
  const digits = normalizePhone(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildReminderMessage(
  name: string,
  installmentNumber: number,
  dueDate: string,
  totalBill: number,
): string {
  return (
    `Halo ${name}, ini adalah pengingat bahwa cicilan ke-${installmentNumber} ` +
    `sebesar ${formatCurrency(totalBill)} akan jatuh tempo pada ${formatDate(dueDate)}. ` +
    `Mohon lakukan pembayaran tepat waktu. Terima kasih!`
  );
}
