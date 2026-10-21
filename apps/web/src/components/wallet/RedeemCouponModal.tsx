import React, { useState } from "react";
import {
  Ticket,
  ArrowDownLeft,
  AlertTriangle,
  ShieldCheck,
  Sparkles,
  Loader2,
  ArrowRight,
  ExternalLink,
  ShoppingBag,
} from "lucide-react";
import { WalletActionModal } from "./WalletActionModal";
import { WalletProcessingAnimation } from "./WalletProcessingAnimation";
import { WalletSuccessAnimation } from "./WalletSuccessAnimation";
import { couponsApi } from "../../services/api/enterprise";
import { useWalletStore } from "../../store/walletStore";
import { notifyWalletChanged } from "../../services/api/practiceReward";
import { cn } from "../../lib/utils";

export const COUPON_BUY_URL = "https://coupon-frontend-e8b3.onrender.com/dashboard/marketplace/coupon/5548d778-ab37-4870-bf2b-3a7144efa347";

export interface RedeemCouponModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessDone?: () => void;
  onViewTransactions?: () => void;
}

type RedeemStep = "input" | "confirm" | "processing" | "success" | "error";

interface VerifiedCouponData {
  code: string;
  amount: number;
  currency: string;
  status: string;
}

interface ErrorDetails {
  title: string;
  message: string;
}

export const RedeemCouponModal: React.FC<RedeemCouponModalProps> = ({
  isOpen,
  onClose,
  onSuccessDone,
  onViewTransactions,
}) => {
  const [step, setStep] = useState<RedeemStep>("input");
  const [couponCode, setCouponCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [verifiedData, setVerifiedData] = useState<VerifiedCouponData | null>(null);
  const [redeemedValue, setRedeemedValue] = useState<number>(0);
  const [newBalance, setNewBalance] = useState<number | undefined>(undefined);
  const [errorDetails, setErrorDetails] = useState<ErrorDetails>({
    title: "Redemption Failed",
    message: "Unable to process this coupon.",
  });

  // Mask code helper: e.g. "SUMMER2026" -> "SUMM••••26"
  const maskCouponCode = (code: string) => {
    const clean = code.trim().toUpperCase();
    if (clean.length <= 4) return clean;
    const start = clean.slice(0, Math.min(4, Math.floor(clean.length / 2)));
    const end = clean.slice(-2);
    return `${start}••••${end}`;
  };

  // Safe categorization of user-facing errors
  const parseErrorMessage = (err: unknown): ErrorDetails => {
    const rawMsg = err instanceof Error ? err.message : String(err || "");
    const lower = rawMsg.toLowerCase();

    if (lower.includes("already redeemed") || lower.includes("already_used")) {
      return {
        title: "Coupon Already Redeemed",
        message: "This coupon has already been redeemed and cannot be used again.",
      };
    }
    if (lower.includes("expired")) {
      return {
        title: "Coupon Expired",
        message: "This promotion code has expired and is no longer valid.",
      };
    }
    if (lower.includes("invalid") || lower.includes("not found")) {
      return {
        title: "Invalid Coupon",
        message: "The coupon code you entered is invalid. Please double check the code and try again.",
      };
    }
    if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout")) {
      return {
        title: "Network Error",
        message: "Unable to connect to the coupon service. Please check your internet connection.",
      };
    }
    if (
      lower.includes("service is temporarily unavailable") ||
      lower.includes("temporarily unavailable") ||
      lower.includes("coupon_service_unavailable") ||
      lower.includes("503")
    ) {
      return {
        title: "Service Temporarily Unavailable",
        message:
          "The coupon verification service is currently waking up or temporarily unavailable. Please wait a moment and click Try Again.",
      };
    }
    return {
      title: "Coupon Could Not Be Verified",
      message: rawMsg && rawMsg.length < 120 ? rawMsg : "The coupon code could not be processed. Please try again later.",
    };
  };

  // Step 1 -> Step 2: Verify Code
  const handleVerifyCode = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;

    setIsVerifying(true);
    try {
      // First verify the code via couponsApi.verify
      const res = await couponsApi.verify(code);
      if (res && res.success) {
        setVerifiedData({
          code,
          amount: res.amount,
          currency: res.currency || "Coins",
          status: res.status,
        });
        setStep("confirm");
      } else {
        // Fallback if verification didn't succeed
        throw new Error("Coupon code is not valid for redemption");
      }
    } catch (err: unknown) {
      // If verify fails, or if verify endpoint returns 404, we can still allow proceeding to confirm if desired,
      // or directly show clear error:
      setErrorDetails(parseErrorMessage(err));
      setStep("error");
    } finally {
      setIsVerifying(false);
    }
  };

  // Step 2 -> Step 3: Execute Redeem
  const handleExecuteRedeem = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code || isRedeeming) return;

    setIsRedeeming(true);
    setStep("processing");

    try {
      const res = await couponsApi.redeem(code);
      if (res && (res.ok || res.success)) {
        setRedeemedValue(res.value);
        // Refresh local store
        await useWalletStore.getState().fetchWallet();
        notifyWalletChanged();
        const currentBal = useWalletStore.getState().balance;
        setNewBalance(currentBal);
        setStep("success");
      } else {
        throw new Error(res.message || "Failed to redeem coupon.");
      }
    } catch (err: unknown) {
      setErrorDetails(parseErrorMessage(err));
      setStep("error");
    } finally {
      setIsRedeeming(false);
    }
  };

  // Reset modal state
  const handleReset = () => {
    setStep("input");
    setCouponCode("");
    setVerifiedData(null);
    setRedeemedValue(0);
    setErrorDetails({ title: "Redemption Failed", message: "Unable to process coupon." });
  };

  const handleModalClose = () => {
    if (step === "processing") return; // Prevent closing while processing
    handleReset();
    onClose();
  };

  const handleDone = () => {
    handleReset();
    onClose();
    if (onSuccessDone) onSuccessDone();
  };

  const handleViewTxs = () => {
    handleReset();
    onClose();
    if (onViewTransactions) onViewTransactions();
  };

  return (
    <>
      {/* 1. INPUT STEP MODAL */}
      {step === "input" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={handleModalClose}
          title="Redeem Coupon"
          description="Enter your promotional or gift coupon code to fund your MAIN wallet."
          icon={<Ticket className="w-6 h-6 text-amber-400" />}
          maxWidth="md"
        >
          <div className="space-y-6 pt-2">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Coupon Code
                </label>
                <a
                  href={COUPON_BUY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 hover:underline transition-colors"
                >
                  <span>Where to buy?</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleVerifyCode()}
                  placeholder="E.G. GH-PLAY-2026"
                  maxLength={32}
                  autoFocus
                  disabled={isVerifying}
                  className="w-full px-5 py-4 rounded-2xl border border-slate-700/80 bg-slate-800/80 text-white font-black text-center text-lg sm:text-xl tracking-widest placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-amber-500 transition-all shadow-inner"
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3 text-xs text-amber-300/90 leading-relaxed">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Coupons instantly add non-withdrawable or withdrawable coins directly into your Gaming Hub MAIN wallet.
              </span>
            </div>

            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={handleVerifyCode}
                disabled={isVerifying || !couponCode.trim()}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-base uppercase tracking-wider transition-all shadow-[0_0_25px_rgba(245,158,11,0.35)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <span>Continue</span>
                )}
              </button>

              {/* Where to buy coupon banner */}
              <a
                href={COUPON_BUY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-500/50 text-slate-300 hover:text-white transition-all flex items-center justify-between group shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
                    <ShoppingBag className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-left">
                    <div className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">
                      Where to buy coupons?
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Purchase official coupons from CouponVault
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-amber-400 group-hover:translate-x-0.5 transition-transform">
                  <span>Buy Now</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </div>
              </a>
            </div>
          </div>
        </WalletActionModal>
      )}

      {/* 2. CONFIRMATION STEP MODAL */}
      {step === "confirm" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={handleModalClose}
          title="Redeem Coupon?"
          description="Please review your coupon details before confirming redemption."
          icon={<Ticket className="w-6 h-6 text-amber-400" />}
          maxWidth="md"
        >
          <div className="space-y-6 pt-2">
            {/* Amount & Currency Preview Card */}
            <div className="p-6 rounded-2xl bg-gradient-to-b from-amber-500/10 to-amber-500/5 border border-amber-500/30 text-center space-y-2">
              <span className="text-xs font-black uppercase tracking-widest text-amber-400">
                Coupon Value
              </span>
              <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                +{verifiedData?.amount ? verifiedData.amount.toLocaleString() : "..."} {verifiedData?.currency || "Coins"}
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-[11px] font-mono font-bold text-slate-300">
                <span>Code:</span>
                <span className="text-amber-400">{maskCouponCode(couponCode)}</span>
              </div>
            </div>

            {/* Reassurance Message */}
            <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-300 leading-relaxed">
                This amount will be added to your Gaming Hub <strong className="text-white">MAIN wallet</strong> balance immediately upon confirmation.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleModalClose}
                disabled={isRedeeming}
                className="w-full sm:w-1/3 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm transition-colors border border-slate-700 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExecuteRedeem}
                disabled={isRedeeming}
                className="w-full sm:w-2/3 py-3.5 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-sm uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(245,158,11,0.35)] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isRedeeming ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Redeeming...</span>
                  </>
                ) : (
                  <span>Redeem Now</span>
                )}
              </button>
            </div>
          </div>
        </WalletActionModal>
      )}

      {/* 3. PROCESSING STEP MODAL */}
      {step === "processing" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={() => {}}
          hideClose
          isProcessing
          maxWidth="md"
        >
          <WalletProcessingAnimation flow="redeem" />
        </WalletActionModal>
      )}

      {/* 4. SUCCESS STEP MODAL */}
      {step === "success" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={handleDone}
          maxWidth="md"
        >
          <WalletSuccessAnimation
            title="Coupon Redeemed!"
            subtitle="Added to MAIN Wallet"
            amount={redeemedValue || verifiedData?.amount || 0}
            currency={verifiedData?.currency || "Coins"}
            prefix="+"
            newBalance={newBalance}
            onDone={handleDone}
            onViewTransactions={onViewTransactions ? handleViewTxs : undefined}
            viewTransactionsLabel="View Transactions"
          />
        </WalletActionModal>
      )}

      {/* 5. ERROR STEP MODAL */}
      {step === "error" && (
        <WalletActionModal
          isOpen={isOpen}
          onClose={handleModalClose}
          title={errorDetails.title}
          icon={<AlertTriangle className="w-6 h-6 text-rose-400" />}
          maxWidth="md"
        >
          <div className="space-y-6 pt-2 text-center sm:text-left">
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs sm:text-sm text-rose-300/90 leading-relaxed">
              {errorDetails.message}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep("input")}
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm uppercase tracking-wide transition-all shadow-md hover:scale-[1.01]"
              >
                Try Again
              </button>

              <button
                type="button"
                onClick={handleModalClose}
                className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-sm transition-colors border border-slate-700"
              >
                Close
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <a
                href={COUPON_BUY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 px-3 rounded-xl bg-slate-800/50 hover:bg-slate-800 text-slate-300 hover:text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                <span>Need a coupon? Buy official coupons online</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </WalletActionModal>
      )}
    </>
  );
};
