import React, { useState, useCallback } from "react";
import { usePaymentTracker } from "../hooks/usePaymentTracker";
import { useContractEvents } from "../hooks/useContractEvents";

// ─── Status badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const map = {
    pending:  { label: "Pending",  cls: "status-pending",  icon: "⏳" },
    sending:  { label: "Sending…", cls: "status-sending",  icon: "🔄" },
    success:  { label: "Success",  cls: "status-success",  icon: "✅" },
    failed:   { label: "Failed",   cls: "status-failed",   icon: "❌" },
  };
  const { label, cls, icon } = map[status] || map.pending;
  return (
    <span className={`status-badge ${cls}`}>
      {icon} {label}
    </span>
  );
};

// ─── Error toast ──────────────────────────────────────────────────────────────
const ErrorToast = ({ error, onClose }) => {
  if (!error) return null;
  const iconMap = {
    WALLET_NOT_FOUND:     "🦊",
    USER_REJECTED:        "🚫",
    INSUFFICIENT_BALANCE: "💸",
    UNKNOWN:              "⚠️",
  };
  const icon = iconMap[error.type] || "⚠️";
  return (
    <div className="error-toast" role="alert">
      <span className="error-icon">{icon}</span>
      <div className="error-body">
        <div className="error-type">{(error.type || "ERROR").replace(/_/g, " ")}</div>
        <div className="error-message">{error.message}</div>
      </div>
      <button className="error-close" onClick={onClose} aria-label="Dismiss">✕</button>
    </div>
  );
};

// ─── Add payment form row ─────────────────────────────────────────────────────
const AddPaymentForm = ({ onAdd }) => {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount]       = useState("");
  const [localErr, setLocalErr]   = useState("");

  const handleAdd = () => {
    setLocalErr("");
    if (!recipient.trim()) return setLocalErr("Enter a recipient address.");
    if (recipient.trim().length < 56) return setLocalErr("Invalid Stellar address (must be 56 chars).");
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return setLocalErr("Enter a positive XLM amount.");
    onAdd(recipient.trim(), amt);
    setRecipient("");
    setAmount("");
  };

  return (
    <div className="add-form">
      <div className="add-form-row">
        <input
          className="input-field input-address"
          type="text"
          placeholder="Recipient Stellar address (G…)"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          spellCheck={false}
        />
        <input
          className="input-field input-amount"
          type="number"
          placeholder="XLM amount"
          value={amount}
          min="0.0000001"
          step="0.1"
          onChange={(e) => setAmount(e.target.value)}
        />
        <button className="btn btn-add" onClick={handleAdd}>
          + Add
        </button>
      </div>
      {localErr && <div className="form-error">{localErr}</div>}
    </div>
  );
};

// ─── Payment row ──────────────────────────────────────────────────────────────
const PaymentRow = ({ payment, onRemove }) => (
  <div className={`payment-row payment-row--${payment.status}`}>
    <div className="payment-row-left">
      <div className="payment-address" title={payment.recipient}>
        {payment.recipient.slice(0, 6)}…{payment.recipient.slice(-6)}
      </div>
      <div className="payment-amount">{payment.amount.toFixed(7)} XLM</div>
    </div>
    <div className="payment-row-right">
      <StatusBadge status={payment.status} />
      {payment.txHash && (
        <a
          className="tx-link"
          href={`https://stellar.expert/explorer/testnet/tx/${payment.txHash}`}
          target="_blank"
          rel="noreferrer"
          title="View on StellarExpert"
        >
          🔗 View
        </a>
      )}
      {payment.status === "pending" && (
        <button
          className="btn btn-remove"
          onClick={() => onRemove(payment.id)}
          aria-label="Remove"
        >
          ✕
        </button>
      )}
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
const PaymentTracker = () => {
  const {
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
  } = usePaymentTracker();

  const [sending, setSending] = useState(false);

  // Wire up real-time event polling — active only while wallet is connected
  const handleStatusUpdate = useCallback(
    (paymentId, newStatus) => {
      // The hook's internal _updateStatus is not exposed, but we can
      // trigger a state re-render by dispatching through the payments list
      // in future iterations. For now the Horizon response already updates
      // statuses directly via sendSinglePayment.
    },
    []
  );

  useContractEvents(handleStatusUpdate, !!walletKey);

  const handleSendAll = async () => {
    setSending(true);
    await sendAllPayments();
    setSending(false);
  };

  const pendingCount = payments.filter((p) => p.status === "pending").length;
  const successCount = payments.filter((p) => p.status === "success").length;
  const failedCount  = payments.filter((p) => p.status === "failed").length;

  return (
    <div className="pt-root">
      {/* ── Background blobs ── */}
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />

      <div className="pt-container">

        {/* ── Header ── */}
        <header className="pt-header">
          <div className="pt-logo">
            <span className="pt-logo-icon">💸</span>
            <div>
              <h1 className="pt-title">Payment Tracker</h1>
              <p className="pt-subtitle">Multi-address · Stellar Testnet</p>
            </div>
          </div>

          {walletKey ? (
            <div className="wallet-panel">
              <div className="wallet-info">
                <span className="wallet-dot" />
                <span className="wallet-key">{walletKey.slice(0, 6)}…{walletKey.slice(-6)}</span>
                <span className="wallet-balance">{walletBalance} XLM</span>
              </div>
              <button className="btn btn-disconnect" onClick={disconnectWallet}>
                Disconnect
              </button>
            </div>
          ) : (
            <button
              className="btn btn-connect"
              onClick={connectWallet}
              disabled={connecting}
            >
              {connecting ? (
                <><span className="spinner" />Connecting…</>
              ) : (
                "🔗 Connect Wallet"
              )}
            </button>
          )}
        </header>

        {/* ── Error toast ── */}
        <ErrorToast error={error} onClose={() => setError(null)} />

        {/* ── Stats strip (only when there are payments) ── */}
        {payments.length > 0 && (
          <div className="stats-strip">
            <div className="stat stat-pending">
              <span className="stat-num">{pendingCount}</span>
              <span className="stat-label">Pending</span>
            </div>
            <div className="stat stat-success">
              <span className="stat-num">{successCount}</span>
              <span className="stat-label">Success</span>
            </div>
            <div className="stat stat-failed">
              <span className="stat-num">{failedCount}</span>
              <span className="stat-label">Failed</span>
            </div>
          </div>
        )}

        {/* ── Main card ── */}
        <div className="pt-card">

          {!walletKey ? (
            /* ── Splash when not connected ── */
            <div className="splash">
              <div className="splash-icon">🛰️</div>
              <h2 className="splash-heading">Connect your Freighter wallet</h2>
              <p className="splash-desc">
                Track and send XLM to multiple addresses in one session. All
                transactions are submitted to <strong>Stellar Testnet</strong> and
                monitored in real-time.
              </p>
              <div className="feature-pills">
                <span className="pill">⚡ Batch payments</span>
                <span className="pill">📡 Real-time status</span>
                <span className="pill">🔒 Freighter signing</span>
              </div>
            </div>
          ) : (
            <>
              {/* ── Add payment ── */}
              <section className="section">
                <h2 className="section-title">Add Recipients</h2>
                <AddPaymentForm onAdd={addPayment} />
              </section>

              {/* ── Payment list ── */}
              {payments.length > 0 && (
                <section className="section">
                  <div className="section-header">
                    <h2 className="section-title">Payments ({payments.length})</h2>
                    <button
                      className="btn btn-send"
                      onClick={handleSendAll}
                      disabled={sending || pendingCount === 0}
                    >
                      {sending ? (
                        <><span className="spinner" />Sending…</>
                      ) : (
                        `🚀 Send All (${pendingCount})`
                      )}
                    </button>
                  </div>

                  <div className="payment-list">
                    {payments.map((p) => (
                      <PaymentRow key={p.id} payment={p} onRemove={removePayment} />
                    ))}
                  </div>
                </section>
              )}

              {/* ── Empty state ── */}
              {payments.length === 0 && (
                <div className="empty-state">
                  <div className="empty-icon">📋</div>
                  <p>No payments added yet. Use the form above to add recipients.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <footer className="pt-footer">
          <span>Powered by Stellar Soroban</span>
          <span>·</span>
          <a
            href="https://stellar.expert/explorer/testnet"
            target="_blank"
            rel="noreferrer"
          >
            Testnet Explorer ↗
          </a>
        </footer>
      </div>
    </div>
  );
};

export default PaymentTracker;
