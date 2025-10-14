// src/common/cors/bypass-cors.util.ts

export function bypassCorsFor(app: any, paths: string[]) {
    const httpAdapter = app.getHttpAdapter?.();
    const expressApp = httpAdapter?.getInstance?.();

    if (!expressApp || typeof expressApp.options !== 'function') {
        return;
    }

    for (const p of paths) {
        expressApp.options(p, (_req: any, res: any) => res.sendStatus(204));
    }
}
