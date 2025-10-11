// src/payments/schemas/payments.enum.ts

export enum PaymentStatus {
    /** Payment record created, not yet processed */
    Initiated = 'Initiated',

    /** Awaiting confirmation or completion (e.g., bank transfer pending) */
    Pending = 'Pending',

    /** Payment successfully completed and verified */
    Succeeded = 'Succeeded',

    /** Payment failed due to error or rejection */
    Failed = 'Failed',

    /** Payment canceled by user or system before completion */
    Canceled = 'Canceled',
}

export enum PaymentMethod {
    /** Traditional card payment (Visa, Mastercard, etc.) */
    Card = 'Card',

    /** Bank transfer (manual or direct debit) */
    BankTransfer = 'BankTransfer',

    /** Mobile wallet services (e.g., ABA Pay, Wing, TrueMoney, Pi Pay) */
    MobileWallet = 'MobileWallet',

    /** Generic QR-based payment (e.g., KHQR, Alipay QR) */
    QR = 'QR',

    /** Cash or in-person payment */
    Cash = 'Cash',

    /** Cryptocurrency or blockchain-based payment */
    Crypto = 'Crypto',
}
