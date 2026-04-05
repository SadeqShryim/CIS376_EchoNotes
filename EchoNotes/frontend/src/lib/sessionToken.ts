export const SESSION_TOKEN_KEY = 'echo_session_token';

export function getOrCreateSessionToken(): string {
    const existing = localStorage.getItem(SESSION_TOKEN_KEY);
    if (existing) {
        return existing;
    }
    const token = crypto.randomUUID();
    localStorage.setItem(SESSION_TOKEN_KEY, token);
    return token;
}
