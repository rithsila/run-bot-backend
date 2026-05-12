/**
 * Create UAT test users with active license-bearing subscriptions.
 *
 * For each tester:
 *   - User                    (argon2id password, role=user, emailVerified=true)
 *   - Subscription            (status=Active, links user → existing license product)
 *   - Membership              (status=Verified, has generated licenseKey, accounts=[])
 *
 * The script REUSES the first Product with `requiresLicenseKey=true` it
 * finds — it does not create new products. Accounts[] is left empty;
 * testers register their MT5 account number via the UI and an admin
 * verifies each one before they can activate.
 *
 * Run:
 *   cd /Users/rithsila/Projects/bhub-api
 *   MONGO_URI="mongodb://..." npx ts-node scripts/create-uat-testers.ts
 *
 * The script is idempotent on email — if a tester with the same email
 * already exists, it prints the existing license key instead of failing.
 */

import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import mongoose, { Schema, Types } from 'mongoose';

// ── Tester roster ────────────────────────────────────────────────────────
// Edit this list before running. Passwords are generated if left empty.
const TESTERS: {
    firstName: string;
    lastName: string;
    email: string;
    password?: string;
}[] = [
    {
        firstName: 'UAT',
        lastName: 'Tester01',
        email: 'uat.tester01@btechcambodia.com',
    },
    {
        firstName: 'UAT',
        lastName: 'Tester02',
        email: 'uat.tester02@btechcambodia.com',
    },
    {
        firstName: 'UAT',
        lastName: 'Tester03',
        email: 'uat.tester03@btechcambodia.com',
    },
    {
        firstName: 'UAT',
        lastName: 'Tester04',
        email: 'uat.tester04@btechcambodia.com',
    },
    {
        firstName: 'UAT',
        lastName: 'Tester05',
        email: 'uat.tester05@btechcambodia.com',
    },
];

// ── Env / sanity ────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
}

// ── Minimal schemas (we only touch the fields we set) ───────────────────
const UserSchema = new Schema(
    {
        firstName: String,
        lastName: String,
        email: String,
        emailCanonical: String,
        emailVerified: Boolean,
        passwordHash: String,
        signInMethod: { type: String, default: 'password' },
        role: { type: String, default: 'user' },
    },
    { collection: 'users', timestamps: true },
);

const ProductSchema = new Schema(
    {
        name: String,
        requiresLicenseKey: Boolean,
    },
    { collection: 'products', timestamps: true },
);

const SubscriptionSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        product: { type: Schema.Types.ObjectId, ref: 'Product' },
        status: { type: String, default: 'Active' },
        endsAt: Date,
        billPeriod: String,
    },
    { collection: 'subscriptions', timestamps: true },
);

const MembershipSchema = new Schema(
    {
        email: String,
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        status: { type: String, default: 'Verified' },
        accounts: [{ account: String, isVerified: Boolean }],
        licenseKey: String,
    },
    { collection: 'memberships', timestamps: true, versionKey: false },
);

const User = mongoose.model('User', UserSchema);
const Product = mongoose.model('Product', ProductSchema);
const Subscription = mongoose.model('Subscription', SubscriptionSchema);
const Membership = mongoose.model('Membership', MembershipSchema);

// ── Helpers ─────────────────────────────────────────────────────────────
function generatePassword(): string {
    // 16 chars, URL-safe, easy to copy from a markdown table.
    return randomBytes(12).toString('base64url');
}

function generateLicenseKey(): string {
    return `EA-${randomBytes(6).toString('base64url').toUpperCase()}`;
}

async function hashPassword(pw: string): Promise<string> {
    return argon2.hash(pw, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
    });
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
    await mongoose.connect(MONGO_URI!);
    console.log('[uat] Connected to MongoDB');

    const product = await Product.findOne({ requiresLicenseKey: true }).lean();
    if (!product) {
        throw new Error(
            'No Product with requiresLicenseKey=true found. ' +
                'Create one in the admin UI first, then re-run.',
        );
    }
    console.log(`[uat] Reusing product: ${product.name} (${product._id})`);

    const rows: {
        email: string;
        password: string;
        licenseKey: string;
        status: 'created' | 'existing';
    }[] = [];

    for (const t of TESTERS) {
        const email = t.email.toLowerCase();

        let existing = await User.findOne({ email }).lean();
        if (existing) {
            const m = await Membership.findOne({ user: existing._id }).lean();
            rows.push({
                email,
                password: '(unchanged — user already existed)',
                licenseKey: m?.licenseKey ?? '(no membership found)',
                status: 'existing',
            });
            console.log(
                `[uat] SKIP ${email} — already exists, license=${m?.licenseKey}`,
            );
            continue;
        }

        const plain = t.password ?? generatePassword();
        const passwordHash = await hashPassword(plain);

        const userDoc = await User.create({
            firstName: t.firstName,
            lastName: t.lastName,
            email,
            emailCanonical: email,
            emailVerified: true,
            passwordHash,
            role: 'user',
            signInMethod: 'password',
        });

        const oneYearOut = new Date();
        oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);

        await Subscription.create({
            user: userDoc._id as Types.ObjectId,
            product: product._id,
            status: 'Active',
            endsAt: oneYearOut,
            billPeriod: 'Yearly',
        });

        const licenseKey = generateLicenseKey();
        await Membership.create({
            email,
            user: userDoc._id,
            status: 'Verified',
            accounts: [],
            licenseKey,
        });

        rows.push({ email, password: plain, licenseKey, status: 'created' });
        console.log(`[uat] CREATED ${email} licenseKey=${licenseKey}`);
    }

    console.log('\n========== CREDENTIALS ==========');
    console.log('email | password | licenseKey | status');
    for (const r of rows) {
        console.log(
            `${r.email} | ${r.password} | ${r.licenseKey} | ${r.status}`,
        );
    }
    console.log('=================================\n');

    await mongoose.disconnect();
    console.log('[uat] Done.');
}

main().catch((err) => {
    console.error('[uat] FAILED:', err);
    process.exit(1);
});
