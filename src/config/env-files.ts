import * as fs from 'fs';
import * as path from 'path';

export function resolveExistingEnvFiles(): string[] {
    const env = process.env.NODE_ENV || 'development';
    const candidates = ['.env', `.env.${env}`];
    return candidates
        .map((p) => path.resolve(process.cwd(), p))
        .filter((p) => fs.existsSync(p));
}
