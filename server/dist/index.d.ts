declare global {
    namespace Express {
        interface Request {
            sessionId?: string;
            requestBody?: any;
        }
    }
}
export {};
//# sourceMappingURL=index.d.ts.map