/**
 * Add a verified MT5 account to a tester's Membership.accounts[].
 *
 * The /memberships/activate flow rejects requests when the calling MT5
 * account is not in the membership's accounts[] array OR not marked
 * verified. This script handles that admin step for one tester at a time.
 *
 * Idempotent: if the (license, account) pair already exists, it just
 * ensures isVerified=true.
 *
 * Run:
 *   cd /Users/rithsila/Projects/bhub-api
 *   MONGO_URI="..." LICENSE_KEY="EA-...." MT5_ACCOUNT="413705132" \
 *     npx ts-node scripts/add-mt5-account.ts
 *
 *   # or look up by email:
 *   MONGO_URI="..." EMAIL="uat.tester01@..." MT5_ACCOUNT="413705132" \
 *     npx ts-node scripts/add-mt5-account.ts
 */

import mongoose, { Schema } from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
const LICENSE_KEY = process.env.LICENSE_KEY;
const EMAIL = process.env.EMAIL;
const MT5_ACCOUNT = process.env.MT5_ACCOUNT;

if (!MONGO_URI) {
    console.error('MONGO_URI is required');
    process.exit(1);
}
if (!MT5_ACCOUNT) {
    console.error('MT5_ACCOUNT is required');
    process.exit(1);
}
if (!LICENSE_KEY && !EMAIL) {
    console.error('Either LICENSE_KEY or EMAIL is required');
    process.exit(1);
}

const MembershipSchema = new Schema(
    {
        email: String,
        licenseKey: String,
        accounts: [{ account: String, isVerified: Boolean }],
        status: String,
    },
    { collection: 'memberships', strict: false },
);

const Membership = mongoose.model('Membership', MembershipSchema);

async function main() {
    await mongoose.connect(MONGO_URI!);
    console.log('[mt5] Connected to MongoDB');

    const query = LICENSE_KEY
        ? { licenseKey: LICENSE_KEY }
        : { email: EMAIL!.toLowerCase() };

    const m: any = await Membership.findOne(query);
    if (!m) {
        throw new Error(
            `Membership not found for ${JSON.stringify(query)}`,
        );
    }

    console.log(
        `[mt5] Found membership ${m._id} (email=${m.email}, licenseKey=${m.licenseKey}, status=${m.status})`,
    );

    const accounts: any[] = Array.isArray(m.accounts) ? m.accounts : [];
    const existing = accounts.find((a) => String(a.account) === MT5_ACCOUNT);

    if (existing) {
        if (existing.isVerified) {
            console.log(
                `[mt5] Account ${MT5_ACCOUNT} already present and verified — nothing to do.`,
            );
        } else {
            existing.isVerified = true;
            m.accounts = accounts;
            await m.save();
            console.log(
                `[mt5] Account ${MT5_ACCOUNT} existed but was unverified — flipped to isVerified=true.`,
            );
        }
    } else {
        accounts.push({ account: MT5_ACCOUNT, isVerified: true });
        m.accounts = accounts;
        await m.save();
        console.log(
            `[mt5] Added account ${MT5_ACCOUNT} (isVerified=true) to membership ${m._id}.`,
        );
    }

    await mongoose.disconnect();
    console.log('[mt5] Done.');
}

main().catch((err) => {
    console.error('[mt5] FAILED:', err);
    process.exit(1);
});
