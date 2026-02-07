import {
    BrowserOAuthClient,
    AtprotoDohHandleResolver,
} from "@atproto/oauth-client-browser";

const OAUTH_SCOPE = "atproto";
const ACCOUNT_COOKIE = "a7_account";

const getDevRedirectUri = () => {
    const port = window.location.port || "4321";
    return `http://127.0.0.1:${port}/auth/callback`;
};

const CLIENT_ID = import.meta.env.DEV
    ? `http://localhost?redirect_uri=${encodeURIComponent(
          getDevRedirectUri(),
      )}&scope=${encodeURIComponent(OAUTH_SCOPE)}`
    : `${window.location.origin}/client-metadata.json`;

let oauthClient = null;

export const getOAuthClient = async () => {
    if (!oauthClient) {
        const handleResolver = new AtprotoDohHandleResolver({
            dohEndpoint: "https://dns.google/resolve",
        });
        oauthClient = await BrowserOAuthClient.load({
            clientId: CLIENT_ID,
            handleResolver,
            responseMode: "query",
        });
    }
    return oauthClient;
};

export const signIn = async (handle) => {
    const client = await getOAuthClient();
    const redirectUri = import.meta.env.DEV
        ? getDevRedirectUri()
        : `${window.location.origin}/auth/callback`;
    await client.signIn(handle, {
        scope: OAUTH_SCOPE,
        redirect_uri: redirectUri,
    });
};

export const initSession = async () => {
    const client = await getOAuthClient();
    const result = await client.init();
    return result?.session ?? null;
};

export const setAccountCookie = (did) => {
    if (!did) {
        return;
    }
    document.cookie = `${ACCOUNT_COOKIE}=${encodeURIComponent(
        did,
    )}; Path=/; Max-Age=31536000; SameSite=Lax`;
};

export const clearAccountCookie = () => {
    document.cookie = `${ACCOUNT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
};

export const getAccountCookie = () => {
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
        const [name, ...rest] = cookie.trim().split("=");
        if (name === ACCOUNT_COOKIE) {
            return decodeURIComponent(rest.join("="));
        }
    }
    return "";
};

export const logout = async (did) => {
    try {
        if (did) {
            const client = await getOAuthClient();
            await client.revoke(did);
        }
    } finally {
        clearAccountCookie();
    }
};

export const __test__ = {
    OAUTH_SCOPE,
    ACCOUNT_COOKIE,
};
