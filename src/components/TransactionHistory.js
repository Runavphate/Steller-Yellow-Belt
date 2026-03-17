import React, { useEffect, useState } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";

const server = new StellarSdk.Horizon.Server("https://horizon-testnet.stellar.org");

const formatAsset = (op) => {
  if (!op) return "";
  if (op.asset_type === "native") return "XLM";
  return op.asset_code || `${op.asset_type}`;
};

const TransactionHistory = ({ publicKey, limit = 10 }) => {
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;

    const fetchOps = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await server
          .operations()
          .forAccount(publicKey)
          .order("desc")
          .limit(limit)
          .call();

        if (!cancelled) setOps(res.records || []);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load transactions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOps();
    return () => {
      cancelled = true;
    };
  }, [publicKey, limit]);

  const renderDetails = (op) => {
    switch (op.type) {
      case "payment":
      case "path_payment_strict_receive":
      case "path_payment_strict_send":
        return (
          <div className="text-sm text-slate-300">
            {op.amount} {formatAsset(op)} — {op.from === publicKey ? "Sent to" : "Received from"}{" "}
            <span className="font-mono text-xs break-words">{op.from === publicKey ? op.to : op.from}</span>
          </div>
        );
      case "create_account":
        return (
          <div className="text-sm text-slate-300">Account created — funded {op.funder === publicKey ? "by you" : op.funder}</div>
        );
      case "account_merge":
        return <div className="text-sm text-slate-300">Account merged into {op.into}</div>;
      default:
        return <div className="text-sm text-slate-300">{op.type.replace(/_/g, " ")}</div>;
    }
  };

  return (
    <div className="mt-4 bg-slate-800 p-4 rounded border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold">Recent transactions</div>
        <div className="text-xs text-slate-400">Showing latest {limit}</div>
      </div>

      {loading && <div className="text-sm text-slate-400">Loading transactions…</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}

      {!loading && !error && ops.length === 0 && (
        <div className="text-sm text-slate-400">No recent transactions for this account.</div>
      )}

      {!loading && !error && ops.length > 0 && (
        <ul className="space-y-3">
          {ops.map((op) => (
            <li key={op.id || op.paging_token || op.transaction_hash} className="p-3 bg-slate-900/40 rounded">
              <div className="text-xs text-slate-400 mb-1">{new Date(op.created_at).toLocaleString()}</div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-sm text-white">{op.type.replace(/_/g, " ")}</div>
                  {renderDetails(op)}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <a
                    className="text-xs text-blue-400 hover:underline"
                    href={`https://stellar.expert/explorer/testnet/tx/${op.transaction_hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View on StellarExpert
                  </a>
                  <div className="text-xs text-slate-500 font-mono">{op.transaction_hash.slice(0, 6)}…{op.transaction_hash.slice(-6)}</div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TransactionHistory;
