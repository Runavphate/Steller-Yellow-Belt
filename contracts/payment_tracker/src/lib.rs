#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short,
    Address, Env, Symbol,
};

// ─── Error types ───────────────────────────────────────────────────────────────
/// Three distinct error variants required by the Level-2 spec.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PaymentError {
    /// The requested payment ID does not exist in storage.
    NotFound = 1,
    /// A payment with this ID has already been registered.
    AlreadyExists = 2,
    /// The caller is not the original sender of this payment.
    Unauthorized = 3,
}

// ─── Payment status ─────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PaymentStatus {
    Pending,
    Completed,
    Failed,
}

// ─── Payment record ──────────────────────────────────────────────────────────
#[contracttype]
#[derive(Clone, Debug)]
pub struct Payment {
    pub sender: Address,
    pub recipient: Address,
    pub amount: i128,
    pub status: PaymentStatus,
}

// ─── Storage keys ────────────────────────────────────────────────────────────
#[contracttype]
pub enum DataKey {
    Payment(u64),
}

// ─── Contract ────────────────────────────────────────────────────────────────
#[contract]
pub struct PaymentTracker;

const PAYMENT_REGISTERED: Symbol = symbol_short!("PYMNT_REG");
const STATUS_UPDATED: Symbol    = symbol_short!("STAT_UPD");

#[contractimpl]
impl PaymentTracker {
    /// Register a new payment. Emits PYMNT_REG event.
    pub fn register_payment(
        env: Env,
        payment_id: u64,
        sender: Address,
        recipient: Address,
        amount: i128,
    ) -> Result<(), PaymentError> {
        // Require the sender's signature.
        sender.require_auth();

        let key = DataKey::Payment(payment_id);

        // Error type 2 – duplicate ID
        if env.storage().persistent().has(&key) {
            return Err(PaymentError::AlreadyExists);
        }

        let payment = Payment {
            sender: sender.clone(),
            recipient: recipient.clone(),
            amount,
            status: PaymentStatus::Pending,
        };

        env.storage().persistent().set(&key, &payment);

        // Emit event so the frontend can track this payment
        env.events()
            .publish((PAYMENT_REGISTERED, sender), (payment_id, recipient, amount));

        Ok(())
    }

    /// Update the status of an existing payment. Emits STAT_UPD event.
    pub fn update_status(
        env: Env,
        payment_id: u64,
        caller: Address,
        new_status: PaymentStatus,
    ) -> Result<(), PaymentError> {
        caller.require_auth();

        let key = DataKey::Payment(payment_id);

        // Error type 1 – payment not found
        let mut payment: Payment = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(PaymentError::NotFound)?;

        // Error type 3 – only the original sender can update
        if payment.sender != caller {
            return Err(PaymentError::Unauthorized);
        }

        payment.status = new_status.clone();
        env.storage().persistent().set(&key, &payment);

        env.events()
            .publish((STATUS_UPDATED, caller), (payment_id, new_status));

        Ok(())
    }

    /// Read a payment record without mutating state.
    pub fn get_payment(env: Env, payment_id: u64) -> Result<Payment, PaymentError> {
        let key = DataKey::Payment(payment_id);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(PaymentError::NotFound)
    }
}
