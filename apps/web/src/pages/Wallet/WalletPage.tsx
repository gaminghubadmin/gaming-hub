import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Coins,
  CreditCard,
  Trophy,
  Download,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import type {
  Transaction,
  TransactionReferenceType,
  Wallet,
  WalletBalanceType,
} from "@gaming-hub/shared";
import { apiClient, ApiError } from "../../services/api/client";
import { walletApi, type WalletSummary } from "../../services/api/enterprise";
import { Skeleton } from "../../components/Skeleton";
import { EmptyState } from "../../components/EmptyState";
import { Button } from "../../components/ui/Button";
import { RedeemCouponModal, WithdrawalFlowModal } from "../../components/wallet";
import { useMe } from "../../services/api/useMe";

const PAGE_SIZE = 10;

const REFERENCE_LABELS: Record<TransactionReferenceType, string> = {
  MATCH_WAGER: "Match wager",
  MATCH_PAYOUT: "Match payout",
  ADMIN: "Admin adjustment",
  BONUS: "Bonus",
  PRACTICE: "Practice win",
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal / Transfer",
  REFERRAL: "Referral reward",
  COUPON: "Coupon redeem",
  TOURNAMENT_ENTRY: "Tournament entry",
  TOURNAMENT_PRIZE: "Tournament prize",
  LOCKED_CREDIT: "Locked credit",
  REWARD_CREDIT: "Reward credit",
  CASHBACK_CREDIT: "Cashback",
  WAGER_REFUND: "Wager refund",
  REVERSAL: "Reversal",
  AFFILIATE_COMMISSION: "Affiliate commission",
  AFFILIATE_COMMISSION_REVERSAL: "Affiliate commission reversal",
};

export function WalletPage() {
  const navigate = useNavigate();

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [txs, setTxs] = useState<{ items: Transaction[]; total: number; page: number; pageSize: number } | null>(null);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<WalletBalanceType | "">("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { me } = useMe();
  const twoFactorEnabled = Boolean(me?.profile?.twoFactorEnabled);
  const userEmail = me?.user?.email ?? null;

  // Modal States
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, sum, t] = await Promise.all([
        apiClient.get<Wallet>("/wallet"),
        walletApi.summary().catch(() => null),
        walletApi.transactions(page, PAGE_SIZE, filter || undefined),
      ]);
      setWallet(w);
      setSummary(sum);
      setTxs(t);
    } catch (err: unknown) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Failed to load wallet data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [page, filter]);

  const totalPages = txs ? Math.max(1, Math.ceil(txs.total / txs.pageSize)) : 1;

  const exportCsv = () => {
    if (!txs || txs.items.length === 0) return;
    const header = ["Date", "Type", "Wallet", "Reference", "Amount", "Balance After"];
    const rows = txs.items.map((t) => [
      new Date(t.createdAt).toISOString(),
      t.type,
      t.walletType,
      REFERENCE_LABELS[t.referenceType] ?? t.referenceType,
      t.type === "DEBIT" ? `-${t.amount}` : String(t.amount),
      String(t.balanceAfter),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wallet-statement.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentBalance = wallet?.balance ?? 0;
  const totalDeposited = summary?.totalDeposited ?? 0;
  const totalWithdrawn = summary?.totalWithdrawn ?? 0;
  const totalSpent = summary?.totalSpent ?? 0;
  const totalWon = summary?.totalWon ?? 0;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-8 space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">My Wallet</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Manage your coin balance, redeem coupons, and execute wallet transfers.
        </p>
      </div>

      {/* Main Balance Banner Card (MegaDraw style) */}
      <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-[#0b1953] via-[#0e2478] to-[#081238] border border-blue-500/20 p-8 sm:p-10 text-white shadow-[0_20px_50px_rgba(11,25,83,0.5)]">
        {/* Glow accent in top right */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-indigo-500/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="space-y-1">
            <span className="text-xs font-black uppercase tracking-widest text-blue-300/80">
              AVAILABLE BALANCE
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl font-black tracking-tight drop-shadow-md">
                {loading && !wallet ? "..." : currentBalance.toFixed(2)}
              </span>
              <span className="text-xl sm:text-2xl font-bold text-blue-200">Coins</span>
            </div>
          </div>

          {/* Action Buttons: Deposit & Withdraw */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              onClick={() => setDepositOpen(true)}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-sm shadow-[0_0_25px_rgba(245,158,11,0.4)] transition-all hover:scale-105 duration-200 flex items-center gap-2"
            >
              <ArrowDownLeft className="w-4 h-4 stroke-[3]" />
              Deposit
            </button>

            <button
              onClick={() => setWithdrawOpen(true)}
              className="px-6 py-3 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm backdrop-blur-md transition-all hover:scale-105 duration-200 flex items-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4 stroke-[3]" />
              Withdraw
            </button>

            <a
              href="https://coupon-frontend-e8b3.onrender.com/dashboard/marketplace/coupon/5548d778-ab37-4870-bf2b-3a7144efa347"
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-amber-200 font-bold text-sm backdrop-blur-md transition-all hover:scale-105 duration-200 flex items-center gap-2"
            >
              <ShoppingBag className="w-4 h-4 text-amber-400" />
              Buy Coupons
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Deposited */}
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 shadow-sm relative overflow-hidden group hover:border-blue-500/30 transition-all">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500 rounded-r" />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Deposited</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {totalDeposited.toFixed(2)} <span className="text-sm font-bold text-slate-400">Coins</span>
          </div>
        </div>

        {/* Total Withdrawn */}
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 shadow-sm relative overflow-hidden group hover:border-indigo-500/30 transition-all">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500 rounded-r" />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Withdrawn</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {totalWithdrawn.toFixed(2)} <span className="text-sm font-bold text-slate-400">Coins</span>
          </div>
        </div>

        {/* Total Spent */}
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 shadow-sm relative overflow-hidden group hover:border-purple-500/30 transition-all">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-purple-500 rounded-r" />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Spent</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {totalSpent.toFixed(2)} <span className="text-sm font-bold text-slate-400">Coins</span>
          </div>
        </div>

        {/* Total Won */}
        <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-5 shadow-sm relative overflow-hidden group hover:border-emerald-500/30 transition-all">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500 rounded-r" />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Won</span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white">
            {totalWon.toFixed(2)} <span className="text-sm font-bold text-slate-400">Coins</span>
          </div>
        </div>
      </div>

      {/* Recent Transactions Section */}
      <div id="transactions-section" className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden shadow-sm">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Receipt className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Recent Transactions</h2>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={exportCsv} disabled={!txs || txs.items.length === 0}>
              <Download size={14} className="mr-1.5" /> Export CSV
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <div className="p-6">
            <EmptyState icon={<Receipt size={24} />} title="Could not load transactions" description={error} />
          </div>
        ) : txs && txs.items.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={<Coins size={28} className="text-amber-500" />}
              title="No transactions found"
              description="Play multiplayer matches, enter tournaments, or claim practice rewards to see your transaction log."
              action={
                <Link to="/">
                  <Button variant="primary" size="sm">Browse Games</Button>
                </Link>
              }
            />
          </div>
        ) : (
          <>
            {/* Desktop Table View (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-black uppercase tracking-wider text-slate-400 bg-slate-50/50 dark:bg-slate-800/30">
                    <th className="px-6 py-3.5">TYPE & REFERENCE</th>
                    <th className="px-6 py-3.5">DIRECTION</th>
                    <th className="px-6 py-3.5">AMOUNT</th>
                    <th className="px-6 py-3.5">BALANCE</th>
                    <th className="px-6 py-3.5">STATUS</th>
                    <th className="px-6 py-3.5">DATE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {txs?.items.map((t) => {
                    const isCredit = t.type === "CREDIT";
                    const meta = (t.meta && typeof t.meta === "object" ? t.meta : {}) as Record<string, unknown>;
                    const status = typeof meta.status === "string" ? meta.status : "COMPLETED";

                    return (
                      <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-3">
                            <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              isCredit ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                            }`}>
                              {isCredit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                            </span>
                            <div>
                              <div className="font-extrabold">{REFERENCE_LABELS[t.referenceType] ?? t.referenceType}</div>
                              <div className="text-[11px] font-normal text-slate-400">
                                {t.referenceId ? `Ref: ${t.referenceId.slice(0, 16)}` : `${t.walletType} Wallet`}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wider uppercase ${
                            isCredit ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                          }`}>
                            {isCredit ? "CREDIT" : "DEBIT"}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-black">
                          <span className={`flex items-center gap-1.5 ${isCredit ? "text-emerald-500" : "text-rose-500"}`}>
                            {isCredit ? "+" : "-"}{t.amount.toLocaleString()} <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          </span>
                        </td>
                        <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200">
                          <div className="text-xs flex items-center gap-1.5">
                            <Coins className="w-3 h-3 text-amber-400 shrink-0" /> {t.balanceAfter.toLocaleString()}
                          </div>
                          <div className="text-[10px] text-slate-400 font-normal">Balance after</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            status === "REFUNDED"
                              ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                              : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          }`}>
                            {status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-slate-400">
                          {new Date(t.createdAt).toLocaleString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (<md) */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/60 p-2">
              {txs?.items.map((t) => {
                const isCredit = t.type === "CREDIT";
                const meta = (t.meta && typeof t.meta === "object" ? t.meta : {}) as Record<string, unknown>;
                const status = typeof meta.status === "string" ? meta.status : "COMPLETED";

                return (
                  <div key={t.id} className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isCredit ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                        }`}>
                          {isCredit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                        </span>
                        <div>
                          <div className="font-bold text-xs text-slate-900 dark:text-white">
                            {REFERENCE_LABELS[t.referenceType] ?? t.referenceType}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(t.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className={`font-black text-sm flex items-center justify-end gap-1 ${isCredit ? "text-emerald-500" : "text-rose-500"}`}>
                          {isCredit ? "+" : "-"}{t.amount.toLocaleString()} <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        </div>
                        <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-bold uppercase border ${
                          status === "REFUNDED"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        }`}>
                          {status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            <div className="px-6 py-4 flex items-center justify-between border-t border-slate-200 dark:border-slate-800">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-bold">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>

      {/* ======================================================================== */}
      {/* MODAL 1: REDEEM COUPON (State machine modal with animations) */}
      {/* ======================================================================== */}
      <RedeemCouponModal
        isOpen={depositOpen}
        onClose={() => setDepositOpen(false)}
        onSuccessDone={() => {
          setDepositOpen(false);
          void loadData();
        }}
        onViewTransactions={() => {
          setDepositOpen(false);
          void loadData();
          const el = document.getElementById("transactions-section");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }}
      />

      {/* ======================================================================== */}
      {/* MODAL 2: WITHDRAWAL / TRANSFER (State machine modal with OTP & animations) */}
      {/* ======================================================================== */}
      <WithdrawalFlowModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        currentBalance={currentBalance}
        currency="Coins"
        twoFactorEnabled={twoFactorEnabled}
        userEmail={userEmail}
        onSuccessDone={() => {
          setWithdrawOpen(false);
          void loadData();
        }}
        onViewTransactions={() => {
          setWithdrawOpen(false);
          void loadData();
          const el = document.getElementById("transactions-section");
          if (el) el.scrollIntoView({ behavior: "smooth" });
        }}
        onSetup2FA={() => {
          setWithdrawOpen(false);
          navigate("/profile");
        }}
      />
    </div>
  );
}

