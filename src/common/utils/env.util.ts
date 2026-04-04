export function fromB64Env(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env ${name}`);
    const key = Buffer.from(v, 'base64').toString('utf8').trim();
    if (!key.startsWith('-----BEGIN')) {
        throw new Error(`Env ${name} is not a base64-encoded PEM`);
    }
    return key;
}
