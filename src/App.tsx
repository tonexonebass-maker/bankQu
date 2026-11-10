import { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Wallet,
  Phone,
  Send,
  Trash2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  Loader2,
  Users,
  TrendingUp,
  Calendar,
  X,
  Pencil,
  Save,
  FileDown,
} from 'lucide-react';
import {
  supabase,
  type Debt,
  type Installment,
} from '@/lib/supabase';
import {
  generateInstallments,
  formatCurrency,
  formatDate,
  normalizePhone,
  buildWhatsAppLink,
  buildReminderMessage,
  FIXED_INTEREST_RATE,
} from '@/lib/amortization';
import { exportDebtToPdf } from '@/lib/pdfExport';

interface DebtWithInstallments extends Debt {
  installments: Installment[];
}

const EMPTY_FORM = {
  name: '',
  phone: '',
  principal: '',
  start_date: new Date().toISOString().slice(0, 10),
};

function App() {
  const [debts, setDebts] = useState<DebtWithInstallments[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDebts = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('debts')
      .select('*, installments(*)')
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else if (data) {
      const sorted = (data as DebtWithInstallments[]).map((d) => ({
        ...d,
        installments: [...d.installments].sort((a, b) => a.number - b.number),
      }));
      setDebts(sorted);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDebts();
  }, [fetchDebts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const phoneDigits = normalizePhone(form.phone);
    if (phoneDigits.length < 8) {
      setError('Masukkan nomor telepon yang valid (minimal 8 digit).');
      return;
    }

    const principal = parseFloat(form.principal);

    if (!principal || principal <= 0) {
      setError('Total Pinjaman harus berupa angka positif.');
      return;
    }

    setSubmitting(true);

    const { data: debtRow, error: debtErr } = await supabase
      .from('debts')
      .insert({
        name: form.name.trim(),
        phone: phoneDigits,
        principal,
        annual_rate: FIXED_INTEREST_RATE,
        start_date: form.start_date,
      })
      .select()
      .single();

    if (debtErr || !debtRow) {
      setError(debtErr?.message ?? 'Gagal membuat data pinjaman.');
      setSubmitting(false);
      return;
    }

    const drafts = generateInstallments(principal, form.start_date);
    const rows = drafts.map((d) => ({
      debt_id: debtRow.id,
      number: d.number,
      due_date: d.due_date,
      principal_amount: d.principal_amount,
      interest_amount: d.interest_amount,
      total_bill: d.total_bill,
    }));

    const { data: insRows, error: insErr } = await supabase
      .from('installments')
      .insert(rows)
      .select();

    if (insErr || !insRows) {
      setError(insErr?.message ?? 'Gagal membuat cicilan.');
      setSubmitting(false);
      return;
    }

    const newDebt: DebtWithInstallments = {
      ...debtRow,
      installments: (insRows as Installment[]).sort(
        (a, b) => a.number - b.number,
      ),
    };
    setDebts((prev) => [newDebt, ...prev]);
    setForm(EMPTY_FORM);
    setShowForm(false);
    setExpandedId(debtRow.id);
    setSubmitting(false);
  };

  const startEdit = (debt: DebtWithInstallments) => {
    setEditingId(debt.id);
    setExpandedId(null);
    setShowForm(true);
    setForm({
      name: debt.name,
      phone: debt.phone,
      principal: String(debt.principal),
      start_date: debt.start_date,
    });
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(false);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!editingId) return;

    const phoneDigits = normalizePhone(form.phone);
    if (phoneDigits.length < 8) {
      setError('Masukkan nomor telepon yang valid (minimal 8 digit).');
      return;
    }

    const principal = parseFloat(form.principal);
    if (!principal || principal <= 0) {
      setError('Total Pinjaman harus berupa angka positif.');
      return;
    }

    setSubmitting(true);

    const existing = debts.find((d) => d.id === editingId);
    const scheduleChanged =
      existing &&
      (existing.principal !== principal ||
        existing.start_date !== form.start_date);

    const { data: updatedDebt, error: debtErr } = await supabase
      .from('debts')
      .update({
        name: form.name.trim(),
        phone: phoneDigits,
        principal,
        start_date: form.start_date,
      })
      .eq('id', editingId)
      .select()
      .single();

    if (debtErr || !updatedDebt) {
      setError(debtErr?.message ?? 'Gagal menyimpan perubahan.');
      setSubmitting(false);
      return;
    }

    let newInstallments: Installment[] = existing?.installments ?? [];

    if (scheduleChanged) {
      const { error: delErr } = await supabase
        .from('installments')
        .delete()
        .eq('debt_id', editingId);

      if (delErr) {
        setError(delErr.message);
        setSubmitting(false);
        return;
      }

      const drafts = generateInstallments(principal, form.start_date);
      const rows = drafts.map((d) => ({
        debt_id: editingId,
        number: d.number,
        due_date: d.due_date,
        principal_amount: d.principal_amount,
        interest_amount: d.interest_amount,
        total_bill: d.total_bill,
      }));

      const { data: insRows, error: insErr } = await supabase
        .from('installments')
        .insert(rows)
        .select();

      if (insErr || !insRows) {
        setError(insErr?.message ?? 'Gagal memperbarui cicilan.');
        setSubmitting(false);
        return;
      }

      newInstallments = (insRows as Installment[]).sort(
        (a, b) => a.number - b.number,
      );
    }

    const updated: DebtWithInstallments = {
      ...updatedDebt,
      installments: newInstallments,
    };

    setDebts((prev) =>
      prev.map((d) => (d.id === editingId ? updated : d)),
    );
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setExpandedId(editingId);
    setSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    const { error: err } = await supabase.from('debts').delete().eq('id', id);
    if (err) {
      setError(err.message);
      return;
    }
    setDebts((prev) => prev.filter((d) => d.id !== id));
    if (expandedId === id) setExpandedId(null);
    if (editingId === id) cancelEdit();
  };

  const setPaidDate = async (
    debtId: string,
    installmentId: string,
    currentDate: string | null,
  ) => {
    const isPaid = currentDate !== null;
    const update = isPaid
      ? { paid: false, paid_date: null }
      : { paid: true, paid_date: new Date().toISOString().slice(0, 10) };

    const { error: err } = await supabase
      .from('installments')
      .update(update)
      .eq('id', installmentId);

    if (err) {
      setError(err.message);
      return;
    }

    setDebts((prev) =>
      prev.map((d) =>
        d.id === debtId
          ? {
              ...d,
              installments: d.installments.map((i) =>
                i.id === installmentId
                  ? { ...i, ...update }
                  : i,
              ),
            }
          : d,
      ),
    );
  };

  const updatePaidDate = async (
    debtId: string,
    installmentId: string,
    newDate: string,
  ) => {
    const update = {
      paid: true,
      paid_date: newDate,
    };

    const { error: err } = await supabase
      .from('installments')
      .update(update)
      .eq('id', installmentId);

    if (err) {
      setError(err.message);
      return;
    }

    setDebts((prev) =>
      prev.map((d) =>
        d.id === debtId
          ? {
              ...d,
              installments: d.installments.map((i) =>
                i.id === installmentId
                  ? { ...i, ...update }
                  : i,
              ),
            }
          : d,
      ),
    );
  };

  const totalPortfolio = debts.reduce(
    (sum, d) => sum + d.principal,
    0,
  );
  const outstanding = debts.reduce(
    (sum, d) =>
      sum +
      d.installments
        .filter((i) => !i.paid)
        .reduce((s, i) => s + i.total_bill, 0),
    0,
  );
  const activeDebtors = debts.length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-lg">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900">
                  BANK QUW
                </h1>
                <p className="text-xs text-slate-500">
                  Sistem Cicilan 10 Bulan
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY_FORM);
                setShowForm(true);
              }}
              disabled={editingId !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              Tambah Pinjaman
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Total Peminjam"
            value={activeDebtors.toString()}
            tint="emerald"
          />
          <StatCard
            icon={<TrendingUp className="h-5 w-5" />}
            label="Total Pinjaman"
            value={formatCurrency(totalPortfolio)}
            tint="blue"
          />
          <StatCard
            icon={<Calendar className="h-5 w-5" />}
            label="Sisa Tagihan"
            value={formatCurrency(outstanding)}
            tint="amber"
          />
        </div>

        {error && (
          <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                {editingId ? 'Edit Data Pinjaman' : 'Tambah Data Pinjaman Baru'}
              </h2>
              <p className="text-sm text-slate-500">
                {editingId
                  ? 'Perubahan pada pinjaman atau tanggal mulai akan membuat ulang jadwal cicilan.'
                  : `Masukkan data peminjam. Jadwal 10 cicilan akan dibuat secara otomatis dengan bunga tetap ${FIXED_INTEREST_RATE}%.`}
              </p>
            </div>
            <form
              onSubmit={editingId ? handleSaveEdit : handleSubmit}
              className="grid grid-cols-1 gap-5 px-6 py-6 sm:grid-cols-2"
            >
              <Field label="Nama" htmlFor="name">
                <input
                  id="name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Budi Santoso"
                  className={inputClass}
                />
              </Field>

              <Field label="Nomor Telepon" htmlFor="phone">
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="phone"
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    placeholder="628123456789"
                    className={`${inputClass} pl-10`}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Sertakan kode negara, tanpa spasi (contoh: 628123456789).
                </p>
              </Field>

              <Field label="Total Pinjaman (Rp)" htmlFor="principal">
                <input
                  id="principal"
                  type="number"
                  step="1"
                  min="1"
                  required
                  value={form.principal}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, principal: e.target.value }))
                  }
                  placeholder="5000000"
                  className={inputClass}
                />
              </Field>

              <Field label="Tanggal Mulai (Cicilan Pertama)" htmlFor="start">
                <input
                  id="start"
                  type="date"
                  required
                  value={form.start_date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, start_date: e.target.value }))
                  }
                  className={inputClass}
                />
              </Field>

              <div className="flex items-center gap-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:col-span-2">
                <TrendingUp className="h-4 w-4 shrink-0" />
                <span>
                  Bunga tetap {FIXED_INTEREST_RATE}% dari total pinjaman,
                  dibagi rata ke 10 cicilan.
                </span>
              </div>

              <div className="flex items-end gap-3 sm:col-span-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : editingId ? (
                    <Save className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {submitting
                    ? 'Menyimpan...'
                    : editingId
                      ? 'Simpan Perubahan'
                      : 'Buat & Buat Jadwal Cicilan'}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  Batal
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Debt list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : debts.length === 0 ? (
          <EmptyState onCreate={() => setShowForm(true)} />
        ) : (
          <div className="space-y-4">
            {debts.map((debt) => {
              const isOpen = expandedId === debt.id;
              const paidCount = debt.installments.filter(
                (i) => i.paid,
              ).length;
              const progress = (paidCount / 10) * 100;

              return (
                <div
                  key={debt.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
                >
                  {/* Summary row */}
                  <button
                    onClick={() =>
                      setExpandedId(isOpen ? null : debt.id)
                    }
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-semibold text-white">
                        {debt.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">
                          {debt.name}
                        </p>
                        <p className="text-sm text-slate-500">
                          {formatCurrency(debt.principal)} · Bunga {debt.annual_rate}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="hidden w-32 sm:block">
                        <div className="mb-1 flex justify-between text-xs text-slate-400">
                          <span>{paidCount}/10 lunas</span>
                          <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                      {isOpen ? (
                        <ChevronUp className="h-5 w-5 text-slate-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                  </button>

                  {/* Installment table */}
                  {isOpen && (
                    <div className="border-t border-slate-100">
                      <InstallmentTable
                        debt={debt}
                        onTogglePaid={setPaidDate}
                        onUpdatePaidDate={updatePaidDate}
                        onDelete={handleDelete}
                        onEdit={startEdit}
                        onExport={exportDebtToPdf}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-slate-700"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const tints: Record<
  string,
  { bg: string; text: string; ring: string }
> = {
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    ring: 'ring-emerald-500/20',
  },
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    ring: 'ring-blue-500/20',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    ring: 'ring-amber-500/20',
  },
};

function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: keyof typeof tints;
}) {
  const t = tints[tint];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${t.bg} ${t.text} ring-4 ${t.ring}`}
      >
        {icon}
      </div>
      <p className="text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Wallet className="h-7 w-7" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">
        Belum ada data pinjaman
      </h3>
      <p className="mb-6 mt-1 max-w-sm text-sm text-slate-500">
        Buat data pinjaman pertama Anda untuk membuat jadwal 10 cicilan
        otomatis dengan pengingat WhatsApp.
      </p>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 active:scale-95"
      >
        <Plus className="h-4 w-4" />
        Buat Pinjaman Pertama
      </button>
    </div>
  );
}

function InstallmentTable({
  debt,
  onTogglePaid,
  onUpdatePaidDate,
  onDelete,
  onEdit,
  onExport,
}: {
  debt: DebtWithInstallments;
  onTogglePaid: (
    debtId: string,
    installmentId: string,
    currentDate: string | null,
  ) => void;
  onUpdatePaidDate: (
    debtId: string,
    installmentId: string,
    newDate: string,
  ) => void;
  onDelete: (id: string) => void;
  onEdit: (debt: DebtWithInstallments) => void;
  onExport: (debt: DebtWithInstallments) => Promise<void>;
}) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async (debt: DebtWithInstallments) => {
    setExporting(true);
    try {
      await onExport(debt);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="px-2 py-4 sm:px-5">
      <div className="mb-4 flex items-center justify-between gap-3 px-3">
        <div>
          <p className="text-sm text-slate-500">
            Telepon: <span className="font-medium text-slate-700">{debt.phone}</span>
          </p>
          <p className="text-sm text-slate-500">
            Mulai:{' '}
            <span className="font-medium text-slate-700">
              {formatDate(debt.start_date)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExport(debt)}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            {exporting ? 'Membuat...' : 'Export PDF'}
          </button>
          <button
            onClick={() => onEdit(debt)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-blue-600 transition hover:bg-blue-50"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={() => onDelete(debt.id)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            Hapus
          </button>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3">No</th>
              <th className="px-4 py-3">Jatuh Tempo</th>
              <th className="px-4 py-3 text-right">Pokok</th>
              <th className="px-4 py-3 text-right">Bunga</th>
              <th className="px-4 py-3 text-right">Total Tagihan</th>
              <th className="px-4 py-3 whitespace-nowrap">Tanggal Bayar</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {debt.installments.map((i) => {
              const message = buildReminderMessage(
                debt.name,
                i.number,
                i.due_date,
                i.total_bill,
              );
              const waLink = buildWhatsAppLink(debt.phone, message);
              return (
                <tr
                  key={i.id}
                  className={`transition hover:bg-slate-50 ${
                    i.paid ? 'bg-emerald-50/40' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {i.number}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(i.due_date)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {formatCurrency(i.principal_amount)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {formatCurrency(i.interest_amount)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(i.total_bill)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={i.paid_date ?? ''}
                        onChange={(e) => {
                          if (e.target.value) {
                            onUpdatePaidDate(debt.id, i.id, e.target.value);
                          }
                        }}
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
                      />
                      {i.paid ? (
                        <button
                          onClick={() => onTogglePaid(debt.id, i.id, i.paid_date)}
                          title="Tandai belum lunas"
                          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600 transition hover:text-emerald-700"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Lunas
                        </button>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-slate-400">
                          <Circle className="h-4 w-4" />
                          Belum
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={waLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 active:scale-95"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send WA
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {debt.installments.map((i) => {
          const message = buildReminderMessage(
            debt.name,
            i.number,
            i.due_date,
            i.total_bill,
          );
          const waLink = buildWhatsAppLink(debt.phone, message);
          return (
            <div
              key={i.id}
              className={`rounded-xl border p-4 ${
                i.paid
                  ? 'border-emerald-200 bg-emerald-50/40'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {i.number}
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {formatDate(i.due_date)}
                  </span>
                </span>
                {i.paid ? (
                  <button
                    onClick={() => onTogglePaid(debt.id, i.id, i.paid_date)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 transition hover:text-emerald-700"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Lunas
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                    <Circle className="h-4 w-4" /> Belum
                  </span>
                )}
              </div>
              <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="text-slate-400">Pokok</p>
                  <p className="font-medium text-slate-700">
                    {formatCurrency(i.principal_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Bunga</p>
                  <p className="font-medium text-slate-700">
                    {formatCurrency(i.interest_amount)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Total</p>
                  <p className="font-semibold text-slate-900">
                    {formatCurrency(i.total_bill)}
                  </p>
                </div>
              </div>
              <div className="mb-3">
                <label className="mb-1 block text-xs text-slate-400">
                  Tanggal Bayar
                </label>
                <input
                  type="date"
                  value={i.paid_date ?? ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      onUpdatePaidDate(debt.id, i.id, e.target.value);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 active:scale-95"
              >
                <Send className="h-4 w-4" />
                Kirim Pengingat WhatsApp
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;
