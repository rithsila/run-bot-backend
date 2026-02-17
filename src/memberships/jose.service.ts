import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SignJWT, importJWK, JWK, exportJWK } from 'jose';
import { randomUUID } from 'crypto';

type PublicJwk = {
    kty?: string;
    crv?: string;
    x?: string;
    y?: string;
    kid?: string;
    alg?: string;
    use?: string;
};


@Injectable()
export class JoseService {
    private signingKid?: string;
    private privateJwk?: JWK;
    private publicJwks: PublicJwk[] = [];
    private ready?: Promise<void>;

    constructor(private readonly cfg: ConfigService) { }

    /** Load keys only once */
    private async init() {
        if (this.ready) return this.ready;

        this.ready = (async () => {
            const kid = this.cfg.get<string>('SIGNING_KID');
            const priv = this.cfg.get<string>('SIGNING_PRIVATE_JWK');

            if (!kid || !priv) {
                throw new InternalServerErrorException(
                    'Missing SIGNING_KID or SIGNING_PRIVATE_JWK'
                );
            }

            this.signingKid = kid;
            this.privateJwk = JSON.parse(priv) as JWK;

            // If PUBLIC_JWKS provided, use it; otherwise derive public key
            const pubEnv = this.cfg.get<string>('PUBLIC_JWKS');
            if (pubEnv && pubEnv.trim().length > 0) {
                this.publicJwks = JSON.parse(pubEnv);
            } else {
                // Make key extractable so exportJWK works in all runtimes
                const pub = await exportJWK(
                    await importJWK(this.privateJwk, 'ES256', { extractable: true })
                );
                this.publicJwks = [{
                    kty: pub.kty,
                    crv: pub.crv,
                    x: pub.x,
                    y: pub.y,
                    kid,
                    alg: 'ES256',
                    use: 'sig'
                }];
            }
        })();

        return this.ready;
    }

    /** Sign a JWT/JWS token for EA */
    async signToken(payload: Record<string, any>) {
        await this.init();

        const privateKey = await importJWK(this.privateJwk!, 'ES256');
        const ttlDays = Number(this.cfg.get('TOKEN_TTL_DAYS') || 30);
        const now = Math.floor(Date.now() / 1000);
        const exp = now + ttlDays * 24 * 3600;
        const issuer = this.cfg.get<string>('ISSUER') || 'license-service';

        const token = await new SignJWT(payload)
            .setProtectedHeader({ alg: 'ES256', kid: this.signingKid! })
            .setIssuedAt(now)
            .setNotBefore(now)
            .setExpirationTime(exp)
            .setIssuer(issuer)
            .setJti(randomUUID())
            .sign(privateKey);

        return { token, exp };
    }

    /** JWKS endpoint for EA (public key) */
    jwks() {
        return { keys: this.publicJwks };
    }
}
