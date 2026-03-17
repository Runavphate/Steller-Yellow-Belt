import { useState, useCallback } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { getAddress, signTransaction, setAllowed } from "@stellar/freighter-api";

// ─── Config ──────────────────────────────────────────────────────────────────
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

// Deployed contract ID on Stellar Testnet.
// Update this value after deploying the Soroban contract.
export const CONTRACT_ID =
  process.env.REACT_APP_CONTRACT_ID ||
  "CCJZ5DGASBWLXBTOUCHQKXNYCNB6F63IJDYMLZPKNHXK4EPWPQNJ3LS";

const server = new StellarSdk.Horizon.Server(HORIZON_URL);

// ─── Error detection helpers ─────────────────────────────────────────────────
const classifyError = (err) => {
  const msg = (err?.message || err?.toString() || "").toLowerCase();

  // Error Type 1 – wallet not found / not installed
  if (
    msg.includes("freighter") ||
    msg.includes("not installed") ||
    msg.includes("not found") ||
    msg.includes("extension") ||
    msg.includes("wallet not") ||
    err?.code === -3 ||
    err?.type === "NO_FREIGHTER"
  ) {
    return {
      type: "WALLET_NOT_FOUND",
      message:
        "Freighter wallet not found. Please install the Freighter browser extension.",
    };
  }

  // Error Type 2 – user rejected
  if (
    msg.includes("rejected") ||
    msg.includes("declined") ||
    msg.includes("cancel") ||
    msg.includes("user denied") ||
    err?.code === -4 ||
    err?.type === "USER_DECLINED"
  ) {
    return {
      type: "USER_REJECTED",
      message: "Transaction was rejected by the user.",
    };
  }

  // Error Type 3 – insufficient balance
  if (
    msg.includes("underfunded") ||
    msg.includes("insufficient") ||
    msg.includes("balance") ||
    msg.includes("op_underfunded")
  ) {
    return {
      type: "INSUFFICIENT_BALANCE",
      message:
        "Insufficient XLM balance to complete this payment. Please top up your wallet.",
    };
  }

  return { type: "UNKNOWN", message: err?.message || "An unexpected error occurred." };
};

// ─── Hook ────────────────────────────────────────────────────────────────────
export const usePaymentTracker = () => {
  const [payments, setPayments] = useState([]);
  const [walletKey, setWalletKey] = useState(null);
  const [walletBalance, setWalletBalance] = useState("0");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  // ── Connect wallet ──────────────────────────────────────────────────────
  const connectWallet = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      // This will throw if Freighter is not installed (Error Type 1).
      const allowed = await setAllowed();
      if (!allowed) {
        throw Object.assign(new Error("Freighter access was denied."), {
          type: "NO_FREIGHTER",
        });
      }

      const { address } = await getAddress();
      const account = await server.loadAccount(address);
      const xlmBalance = account.balances.find(
        (b) => b.asset_type === "native"
      );
      setWalletKey(address);
      setWalletBalance(xlmBalance ? Number(xlmBalance.balance).toFixed(4) : "0");
    } catch (err) {
      setError(classifyError(err));
    } finally {
      setConnecting(false);
    }
  }, []);

  // ── Disconnect wallet ───────────────────────────────────────────────────
  const disconnectWallet = useCallback(() => {
    setWalletKey(null);
    setWalletBalance("0");
    setPayments([]);
    setError(null);
  }, []);

  // ── Add a draft payment row ─────────────────────────────────────────────
  const addPayment = useCallback((recipient, amount) => {
    const id = Date.now();
    setPayments((prev) => [
      ...prev,
      { id, recipient, amount: parseFloat(amount), status: "pending" },
    ]);
    return id;
  }, []);

  // ── Remove a draft row ──────────────────────────────────────────────────
  const removePayment = useCallback((id) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // ── Update a row's status ───────────────────────────────────────────────
  const _updateStatus = useCallback((id, status, txHash) => {
    setPayments((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status, txHash } : p))
    );
  }, []);

  // ── Send a single Horizon payment ───────────────────────────────────────
  const sendSinglePayment = useCallback(
    async (payment) => {
      if (!walletKey) throw new Error("Wallet not connected");

      _updateStatus(payment.id, "sending");

      try {
        const account = await server.loadAccount(walletKey);
        const xlmBalance = account.balances.find(
          (b) => b.asset_type === "native"
        );
        const available = parseFloat(xlmBalance?.balance || "0");

        // Pre-flight balance check → Error Type 3
        if (payment.amount + 1 > available) {
          throw Object.assign(
            new Error(`op_underfunded: need ${payment.amount} XLM but have ${available}`),
            { type: "INSUFFICIENT_BALANCE" }
          );
        }

        const fee = "100"; // stroops
        const tx = new StellarSdk.TransactionBuilder(account, {
          fee,
          networkPassphrase: NETWORK_PASSPHRASE,
        })
          .addOperation(
            StellarSdk.Operation.payment({
              destination: payment.recipient,
              asset: StellarSdk.Asset.native(),
              amount: payment.amount.toFixed(7),
            })
          )
          .setTimeout(30)
          .build();

        // Ask Freighter to sign (may throw Error Type 2 if user rejects)
        const { signedTxXdr } = await signTransaction(tx.toXDR(), {
          networkPassphrase: NETWORK_PASSPHRASE,
        });

        const signedTx = StellarSdk.TransactionBuilder.fromXDR(
          signedTxXdr,
          NETWORK_PASSPHRASE
        );

        const result = await server.submitTransaction(signedTx);
        _updateStatus(payment.id, "success", result.hash);

        // Refresh balance
        const updatedAccount = await server.loadAccount(walletKey);
        const updatedBalance = updatedAccount.balances.find(
          (b) => b.asset_type === "native"
        );
        setWalletBalance(
          updatedBalance ? Number(updatedBalance.balance).toFixed(4) : "0"
        );

        return result.hash;
      } catch (err) {
        _updateStatus(payment.id, "failed");
        const classified = classifyError(err);
        throw classified;
      }
    },
    [walletKey, _updateStatus]
  );

  // ── Send all pending payments ───────────────────────────────────────────
  const sendAllPayments = useCallback(async () => {
    setError(null);
    const pending = payments.filter((p) => p.status === "pending");

    for (const payment of pending) {
      try {
        await sendSinglePayment(payment);
      } catch (err) {
        setError(err);
        // Continue attempting the remaining payments
      }
    }
  }, [payments, sendSinglePayment]);

  return {
    payments,
    walletKey,
    walletBalance,
    connecting,
    error,
    setError,
    connectWallet,
    disconnectWallet,
    addPayment,
    removePayment,
    sendAllPayments,
  };
};
