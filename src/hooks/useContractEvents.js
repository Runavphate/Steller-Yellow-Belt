import { useEffect, useCallback, useRef } from "react";
import * as StellarSdk from "@stellar/stellar-sdk";
import { CONTRACT_ID } from "./usePaymentTracker";

const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
const POLL_INTERVAL_MS = 5000;

/**
 * useContractEvents
 *
 * Polls the Soroban RPC for STATUS_UPDATED events from the payment tracker
 * contract and calls `onStatusUpdate(paymentId, newStatus)` whenever one is
 * received.
 *
 * @param {function} onStatusUpdate - Callback invoked with (paymentId, status)
 * @param {boolean}  active         - Start / stop polling
 */
export const useContractEvents = (onStatusUpdate, active = true) => {
  const lastLedgerRef = useRef(null);
  const intervalRef   = useRef(null);

  const poll = useCallback(async () => {
    try {
      const rpc = new StellarSdk.SorobanRpc.Server(SOROBAN_RPC_URL, {
        allowHttp: false,
      });

      // Bootstrap: get current ledger sequence on first poll.
      if (lastLedgerRef.current === null) {
        const health = await rpc.getHealth();
        // Start from a few ledgers back to avoid missing fast events
        lastLedgerRef.current = Math.max(1, (health.ledgerVersion || 0) - 5);
      }

      const startLedger = lastLedgerRef.current;

      const response = await rpc.getEvents({
        startLedger,
        filters: [
          {
            type: "contract",
            contractIds: [CONTRACT_ID],
            topics: [
              // STAT_UPD is the symbol emitted by update_status
              [StellarSdk.xdr.ScVal.scvSymbol("STAT_UPD").toXDR("base64")],
            ],
          },
        ],
      });

      if (response?.events?.length > 0) {
        let maxLedger = startLedger;

        response.events.forEach((event) => {
          try {
            // event.value contains the tuple (payment_id, new_status) from the contract
            const value = event.value;
            if (!value) return;

            // Parse the contract value – it is a Vec with [payment_id, status]
            const vals = StellarSdk.scValToNative(value);
            if (Array.isArray(vals) && vals.length >= 2) {
              const paymentId = Number(vals[0]);
              const rawStatus = vals[1];
              const statusMap = {
                Pending: "pending",
                Completed: "success",
                Failed: "failed",
              };
              const status = statusMap[rawStatus] ?? "pending";
              onStatusUpdate(paymentId, status);
            }
          } catch {
            // Ignore individual parse errors
          }

          maxLedger = Math.max(maxLedger, event.ledger ?? startLedger);
        });

        // Advance cursor so we don't re-process events
        lastLedgerRef.current = maxLedger + 1;
      }
    } catch {
      // Silent – network errors during polling should not crash the UI
    }
  }, [onStatusUpdate]);

  useEffect(() => {
    if (!active) {
      clearInterval(intervalRef.current);
      return;
    }

    // Poll immediately, then on interval
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => clearInterval(intervalRef.current);
  }, [active, poll]);
};
