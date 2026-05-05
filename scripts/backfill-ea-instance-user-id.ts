/**
 * One-time migration: set userId on EaInstance rows that are missing it.
 *
 * Logic:
 *   For each EaInstance where userId is null/missing, look up the Membership
 *   whose licenseKey matches. Set userId from membership.user._id.
 *
 * Run:
 *   MONGO_URI=<uri> npx ts-node scripts/backfill-ea-instance-user-id.ts
 */

import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('MONGO_URI env var is required');
    process.exit(1);
}

// Minimal schemas for the migration — no NestJS needed
const EaInstanceSchema = new mongoose.Schema(
    {
        agentId: String,
        licenseKey: String,
        userId: { type: String, default: null },
    },
    { collection: 'ea-instances' },
);

const MembershipSchema = new mongoose.Schema(
    {
        licenseKey: String,
        user: mongoose.Schema.Types.ObjectId,
    },
    { collection: 'memberships' },
);

async function main() {
    await mongoose.connect(MONGO_URI!);
    console.log('Connected to MongoDB');

    const EaInstance = mongoose.model('EaInstance', EaInstanceSchema);
    const Membership = mongoose.model('Membership', MembershipSchema);

    const instances = await EaInstance.find({
        $or: [{ userId: null }, { userId: { $exists: false } }],
    }).lean();

    console.log(`Found ${instances.length} instance(s) missing userId`);

    let updated = 0;
    let skipped = 0;

    for (const inst of instances) {
        if (!inst.licenseKey) {
            console.warn(`  SKIP agentId=${inst.agentId} — no licenseKey`);
            skipped++;
            continue;
        }
        const membership = await Membership.findOne({
            licenseKey: inst.licenseKey,
        }).lean();
        if (!membership?.user) {
            console.warn(
                `  SKIP agentId=${inst.agentId} — no membership found for key`,
            );
            skipped++;
            continue;
        }
        await EaInstance.updateOne(
            { _id: inst._id },
            { $set: { userId: String(membership.user) } },
        );
        console.log(`  OK   agentId=${inst.agentId} userId=${membership.user}`);
        updated++;
    }

    console.log(`\nDone. updated=${updated} skipped=${skipped}`);
    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
