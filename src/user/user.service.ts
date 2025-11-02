// src/users/users.service.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, PaginateModel, PaginateOptions, PaginateResult, Types } from 'mongoose';
import * as argon2 from 'argon2';
import { promises as dns } from 'dns';
import { SignupMeta, User, UserDocument } from './user.schema';
import { SignInMethod } from '../auth/signin-method.enum';
import { setTimeout as delay } from 'timers/promises';
import { canonicalizeEmail, maskEmail } from 'src/common/utils/email.util';
import { UserQueryDto } from './dto/user-query.dto';
import { UpdateUserAffiliatesDto } from './dto/update-user-affiliates.dto';
import { AdminSetPasswordDto } from './dto/admin-set-password.dto';
import { Role } from './user.enum';

type UserPaginateModel = PaginateModel<UserDocument>;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  private readonly disposable = new Set([
    'mailinator.com',
    'tempmail.com',
    'yopmail.com',
    'example.com',
    'user.com',
    'test.com',
  ]);
  constructor(@InjectModel(User.name) private readonly model: UserPaginateModel,

  ) { }

  // -------------------------
  // Email normalization
  // -------------------------
  normalizeEmail(email: string) {
    // Toggle gmail rules as you prefer:
    return canonicalizeEmail(email, { gmailDots: true, gmailPlus: true });
  }

  // -------------------------
  // Read helpers
  // -------------------------
  async findById(id: string) {
    return this.model.findById(new Types.ObjectId(id)).lean();
  }

  async findByEmail(email: string) {
    const norm = this.normalizeEmail(email);
    this.logger.debug(`Looking up user by email=${maskEmail(norm)}`);
    return this.model.findOne({ email: norm }).lean();
  }


  async getAuthForLoginByEmail(email: string) {
    const norm = this.normalizeEmail(email);
    // this.logger.debug(`Auth fetch for email=${maskEmail(norm)}`);

    return this.model
      .findOne({ email: norm })
      .select(
        '+passwordHash firstName lastName email role emailVerified createdAt ' +
        'failedLoginAttempts lockedUntil passwordChangedAt signInMethod'
      )
      .lean();
  }

  // -------------------------
  // Activity helpers
  // -------------------------
  async updateLastActiveAt(userId: string): Promise<void> {
    const user = await this.model.findById(userId).select('lastActiveAt').exec();
    const now = Date.now();
    const lastActive = user?.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
    if (!lastActive || now - lastActive > 60 * 1000) {
      await this.model.findByIdAndUpdate(userId, { lastActiveAt: new Date() }).exec();
    }
  }

  async upsertGoogleUser(input: {
    googleId: string;
    email: string | null;
    firstName: string;
    lastName: string;
    photoURL?: string;
  }): Promise<UserDocument> {
    const email = input.email ? this.normalizeEmail(input.email) : null;

    // Prefer googleId; fallback to email if available
    const or: any[] = [{ googleId: input.googleId }];
    if (email) or.push({ email });

    let user = await this.model.findOne({ $or: or });

    if (!user) {
      user = new this.model({
        email: email ?? undefined,
        firstName: input.firstName,
        lastName: input.lastName,
        photoURL: input.photoURL,
        googleId: input.googleId,
        // If creating via Google, default sign-in method to Google
        signInMethod: SignInMethod.Google,
        emailVerified: !!email, // Google usually returns verified email
      });
    } else {
      // Attach googleId if missing
      if (!user.googleId) user.googleId = input.googleId;

      // Fill profile fields if empty
      if (!user.firstName && input.firstName) user.firstName = input.firstName;
      if (!user.lastName && input.lastName) user.lastName = input.lastName;
      if (!user.photoURL && input.photoURL) user.photoURL = input.photoURL;

      // If user was created without signInMethod, set it; otherwise keep existing
      if (!user.signInMethod) {
        user.signInMethod = SignInMethod.Google;
      }
    }

    await user.save();
    return user;
  }


  async recordFailedLogin(
    userId: string,
    opts?: { maxAttempts?: number; lockMs?: number }
  ): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null } | null> {
    const maxAttempts = opts?.maxAttempts ?? 5;
    const lockMs = opts?.lockMs ?? 10 * 60 * 1000;

    const doc = await this.model
      .findByIdAndUpdate(
        userId,
        { $inc: { failedLoginAttempts: 1 } },
        { new: true, select: 'failedLoginAttempts lockedUntil' },
      )
      .lean();

    if (!doc) return null;

    const failedLoginAttempts = doc.failedLoginAttempts ?? 0;

    if (!doc.lockedUntil && failedLoginAttempts >= maxAttempts) {
      const until = new Date(Date.now() + lockMs);
      await this.model.findByIdAndUpdate(userId, { $set: { lockedUntil: until } }).lean();
      return { failedLoginAttempts, lockedUntil: until };
    }

    return { failedLoginAttempts, lockedUntil: doc.lockedUntil ?? null };
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.model
      .findByIdAndUpdate(
        userId,
        { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } },
        { new: false },
      )
      .lean();
  }

  isLocked(user: { lockedUntil?: Date | string | null }): boolean {
    if (!user?.lockedUntil) return false;
    return new Date(user.lockedUntil).getTime() > Date.now();
  }

  async clearLockIfExpired(userId: string, lockedUntil?: Date | string | null): Promise<void> {
    if (!lockedUntil) return;
    if (new Date(lockedUntil).getTime() <= Date.now()) {
      await this.model.findByIdAndUpdate(
        userId,
        { $set: { failedLoginAttempts: 0, lockedUntil: null } },
        { new: false },
      ).lean();
    }
  }

  async paginate(query: UserQueryDto): Promise<PaginateResult<UserDocument>> {
    const { q, affiliates, role, page = 1, limit = 10 } = query;

    const filter: FilterQuery<UserDocument> = {};

    if (q && q.trim()) {
      const rx = new RegExp(this.escapeRegex(q.trim()), 'i');
      filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }];
    }

    if (affiliates) filter.affiliates = affiliates;
    if (role) filter.role = role; // ✅ add role filter

    const options: PaginateOptions = {
      page,
      limit,
      sort: { createdAt: -1 },
      lean: true,
      leanWithId: false,
      select: [
        'firstName',
        'lastName',
        'email',
        'emailVerified',
        'affiliates',
        'photoURL',
        'role',
        'lastActiveAt',
        'lastLoginAt',
        'failedLoginAttempts',
        'lockedUntil',
        'passwordChangedAt',
        'createdAt',
        'updatedAt',
      ].join(' '),
    };

    return this.model.paginate(filter, options);
  }


  async deleteById(id: string | Types.ObjectId): Promise<void> {
    if (!Types.ObjectId.isValid(String(id))) {
      throw new NotFoundException('User not found');
    }

    const deleted = await this.model.findByIdAndDelete(id);
    if (!deleted) throw new NotFoundException('User not found');
  }

  async updateAffiliates(id: string, dto: UpdateUserAffiliatesDto): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid user id');

    const update: Record<string, any> = { affiliates: dto.affiliates };


    const res = await this.model.updateOne({ _id: id }, { $set: update }).lean();
    if (res.matchedCount === 0) throw new NotFoundException('User not found');
  }

  async adminSetPassword(targetUserId: string, dto: AdminSetPasswordDto): Promise<void> {
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new BadRequestException('Invalid user id');
    }

    const user = await this.model
      .findById(targetUserId)
      .select('_id email +passwordHash')
      .lean();

    if (!user) throw new NotFoundException('User not found');

    // prevent reusing the same password
    if ((user as any).passwordHash) {
      const isSame = await argon2.verify((user as any).passwordHash, dto.password);
      if (isSame) {
        throw new BadRequestException('New password must be different from the current password');
      }
    }

    const newHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
    });

    await this.model.updateOne(
      { _id: targetUserId },
      {
        $set: {
          passwordHash: newHash,
          passwordChangedAt: new Date(),
          signInMethod: SignInMethod.Password,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      },
    ).lean();
  }

  async updateRole(input: {
    targetUserId: string;
    newRole: Role;
    actingUserId?: string;
    actingUserRole?: Role;
  }): Promise<void> {
    const { targetUserId, newRole, actingUserId, actingUserRole } = input;

    // 1. Validate ObjectId again at service layer (defense-in-depth)
    if (!Types.ObjectId.isValid(targetUserId)) {
      throw new BadRequestException('Invalid user id');
    }

    // 2. Check caller permission
    // If you only want Admins to do this:
    if (actingUserRole && actingUserRole !== Role.Admin) {
      // If actingUserRole is undefined (no auth wired yet), we skip this block.
      throw new ForbiddenException('You are not allowed to change roles');
    }

    // 3. Load target user
    const targetUser = await this.model
      .findById(targetUserId)
      .select('_id role')
      .lean();

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // 4. Prevent demoting yourself out of Admin (optional but smart)
    // Example rule:
    // - If I'm editing myself
    // - I'm currently Admin
    // - And I'm trying to drop below Admin
    if (
      actingUserId &&
      new Types.ObjectId(actingUserId).equals(targetUserId) &&
      targetUser.role === Role.Admin &&
      newRole !== Role.Admin
    ) {
      throw new ForbiddenException(
        'You cannot remove your own admin role',
      );
    }

    // 5. No-op check
    if (targetUser.role === newRole) {
      // nothing to do
      return;
    }

    // 6. Actually update
    const res = await this.model
      .updateOne(
        { _id: targetUserId },
        {
          $set: {
            role: newRole,
            // you could also track audit info here if you have audit fields
            // updatedBy: actingUserId,
            // updatedAt: new Date(),
          },
        },
      )
      .lean();

    if (res.matchedCount === 0) {
      // super edge: race condition where user got deleted
      throw new NotFoundException('User not found');
    }

    this.logger.log(
      `Role updated: user=${targetUserId} ${targetUser.role} -> ${newRole} by ${actingUserId ?? 'system'
      }`,
    );
  }

  private escapeRegex(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // -------------------------
  // Public mapper (safe shape)
  // -------------------------
  toPublicUser(u: UserDocument) {
    return {
      _id: String(u._id),
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName ?? null,
      role: u.role,
      emailVerified: !!u.emailVerified,
    };
  }

  // -------------------------
  // Sign-up guards
  // -------------------------
  private enforceNotDisposable(email: string) {
    const domain = this.normalizeEmail(email).split('@')[1] || '';
    if (this.disposable.has(domain)) {
      this.logger.warn(`Blocked disposable email domain: ${domain}`);
      throw new BadRequestException('Disposable email not allowed');
    }
  }

  private async enforceMx(email: string) {
    const domain = this.normalizeEmail(email).split('@')[1] || '';
    const timeoutMs = 1500;

    try {
      const result = await Promise.race([
        dns.resolveMx(domain),
        delay(timeoutMs + 100).then(() => {
          throw new Error('MX timeout');
        }),
      ]);
      if (!Array.isArray(result) || result.length === 0) {
        throw new Error('No MX');
      }
    } catch (e) {
      this.logger.warn(`Email domain MX check failed: ${domain} (${(e as Error).message})`);
      throw new BadRequestException('Email domain is not reachable');
    }
  }

  // -------------------------
  // Create user (signup)
  // -------------------------
  async create(p: {
    firstName: string;
    lastName?: string;
    email: string;
    password: string;
    emailVerified: boolean;
    signInMethod: SignInMethod;
    signupMeta?: SignupMeta;
  }) {
    const email = this.normalizeEmail(p.email);

    // Pre-checks
    this.enforceNotDisposable(email);

    // Run MX check and password hash in parallel to shave latency
    const [_, passwordHash] = await Promise.all([
      this.enforceMx(email),
      argon2.hash(p.password, {
        type: argon2.argon2id,
        // sensible explicit params; tune if needed
        memoryCost: 2 ** 16, // 64 MiB
        timeCost: 3,
        parallelism: 1,
      }),
    ]);

    const firstName = p.firstName.trim();
    const lastName = p.lastName?.trim() || undefined;

    const meta: SignupMeta | undefined = p.signupMeta
      ? {
        userAgent: p.signupMeta.userAgent ?? null,
        referer: p.signupMeta.referer ?? null,
        deviceIdHash: p.signupMeta.deviceIdHash ?? null,
        ipHash: p.signupMeta.ipHash ?? null,
        renderedAtMs: p.signupMeta.renderedAtMs ?? null,
        submittedAtMs: p.signupMeta.submittedAtMs ?? Date.now(),
      }
      : undefined;

    try {
      const doc = await this.model.create({
        firstName,
        lastName,
        email,
        passwordHash,
        signInMethod: SignInMethod.Password,
        signupMeta: meta,
      });

      this.logger.log(
        `Created pending user id=${doc._id.toString()} email=${maskEmail(doc.email)}`,
      );


      // Return safe projection
      return {
        id: doc._id.toString(),
        firstName: doc.firstName,
        lastName: doc.lastName,
        email: doc.email,
        role: doc.role,
        emailVerified: doc.emailVerified,
        createdAt: (doc as any).createdAt,
      };
    } catch (e: any) {
      const isDup =
        e?.code === 11000 ||
        e?.codeName === 'DuplicateKey' ||
        (typeof e?.message === 'string' && e.message.includes('E11000 duplicate key'));

      if (isDup) {
        this.logger.warn(`Duplicate email attempted: ${maskEmail(email)}`);
        throw new ConflictException('Email already registered');
      }

      this.logger.error(
        `Error creating user for ${maskEmail(email)}: ${e?.message || e}`,
        e?.stack,
      );
      throw e;
    }
  }

  async findPublicById(id: string) {
    const doc = await this.model.findById(id)
      .select('firstName lastName email role emailVerified photoURL createdAt') // ← only safe fields
      .lean();
    return doc ? this.toPublicUser(doc) : null;
  }


}
