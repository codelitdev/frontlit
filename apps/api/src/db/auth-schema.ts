import {
    boolean,
    index,
    jsonb,
    pgTable,
    text,
    timestamp,
} from "drizzle-orm/pg-core";

/**
 * FrontLit-owned Better Auth and OAuth Provider persistence. Authentication
 * schema ownership belongs to the product, not oauth-server-kit.
 */
export const authUser = pgTable("auth_user", {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const authSession = pgTable(
    "auth_session",
    {
        id: text("id").primaryKey(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        token: text("token").notNull().unique(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
        ipAddress: text("ip_address"),
        userAgent: text("user_agent"),
        userId: text("user_id")
            .notNull()
            .references(() => authUser.id, { onDelete: "cascade" }),
    },
    (table) => [index("auth_session_user_id_idx").on(table.userId)],
);

export const authAccount = pgTable(
    "auth_account",
    {
        id: text("id").primaryKey(),
        accountId: text("account_id").notNull(),
        providerId: text("provider_id").notNull(),
        userId: text("user_id")
            .notNull()
            .references(() => authUser.id, { onDelete: "cascade" }),
        accessToken: text("access_token"),
        refreshToken: text("refresh_token"),
        idToken: text("id_token"),
        accessTokenExpiresAt: timestamp("access_token_expires_at", {
            withTimezone: true,
        }),
        refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
            withTimezone: true,
        }),
        scope: text("scope"),
        password: text("password"),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    },
    (table) => [index("auth_account_user_id_idx").on(table.userId)],
);

export const authVerification = pgTable(
    "auth_verification",
    {
        id: text("id").primaryKey(),
        identifier: text("identifier").notNull(),
        value: text("value").notNull(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    },
    (table) => [index("auth_verification_identifier_idx").on(table.identifier)],
);

export const jwks = pgTable("auth_jwks", {
    id: text("id").primaryKey(),
    publicKey: text("public_key").notNull(),
    privateKey: text("private_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const authOAuthClient = pgTable(
    "auth_oauth_client",
    {
        id: text("id").primaryKey(),
        clientId: text("client_id").notNull().unique(),
        clientSecret: text("client_secret"),
        disabled: boolean("disabled").default(false),
        skipConsent: boolean("skip_consent"),
        enableEndSession: boolean("enable_end_session"),
        subjectType: text("subject_type"),
        scopes: text("scopes").array(),
        userId: text("user_id").references(() => authUser.id, {
            onDelete: "cascade",
        }),
        createdAt: timestamp("created_at", { withTimezone: true }),
        updatedAt: timestamp("updated_at", { withTimezone: true }),
        name: text("name"),
        uri: text("uri"),
        icon: text("icon"),
        contacts: text("contacts").array(),
        tos: text("tos"),
        policy: text("policy"),
        softwareId: text("software_id"),
        softwareVersion: text("software_version"),
        softwareStatement: text("software_statement"),
        redirectUris: text("redirect_uris").array().notNull(),
        postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
        tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
        grantTypes: text("grant_types").array(),
        responseTypes: text("response_types").array(),
        public: boolean("public"),
        type: text("type"),
        requirePKCE: boolean("require_pkce"),
        referenceId: text("reference_id"),
        metadata: jsonb("metadata"),
    },
    (table) => [index("auth_oauth_client_user_id_idx").on(table.userId)],
);

export const authOAuthRefreshToken = pgTable(
    "auth_oauth_refresh_token",
    {
        id: text("id").primaryKey(),
        token: text("token").notNull().unique(),
        clientId: text("client_id")
            .notNull()
            .references(() => authOAuthClient.clientId, {
                onDelete: "cascade",
            }),
        sessionId: text("session_id").references(() => authSession.id, {
            onDelete: "set null",
        }),
        userId: text("user_id")
            .notNull()
            .references(() => authUser.id, { onDelete: "cascade" }),
        referenceId: text("reference_id"),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        revoked: timestamp("revoked", { withTimezone: true }),
        authTime: timestamp("auth_time", { withTimezone: true }),
        scopes: text("scopes").array().notNull(),
    },
    (table) => [
        index("auth_oauth_refresh_token_client_id_idx").on(table.clientId),
        index("auth_oauth_refresh_token_session_id_idx").on(table.sessionId),
        index("auth_oauth_refresh_token_user_id_idx").on(table.userId),
    ],
);

export const authOAuthAccessToken = pgTable(
    "auth_oauth_access_token",
    {
        id: text("id").primaryKey(),
        token: text("token").notNull().unique(),
        clientId: text("client_id")
            .notNull()
            .references(() => authOAuthClient.clientId, {
                onDelete: "cascade",
            }),
        sessionId: text("session_id").references(() => authSession.id, {
            onDelete: "set null",
        }),
        userId: text("user_id").references(() => authUser.id, {
            onDelete: "cascade",
        }),
        referenceId: text("reference_id"),
        refreshId: text("refresh_id").references(
            () => authOAuthRefreshToken.id,
            { onDelete: "set null" },
        ),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        scopes: text("scopes").array().notNull(),
    },
    (table) => [
        index("auth_oauth_access_token_client_id_idx").on(table.clientId),
        index("auth_oauth_access_token_session_id_idx").on(table.sessionId),
        index("auth_oauth_access_token_user_id_idx").on(table.userId),
        index("auth_oauth_access_token_refresh_id_idx").on(table.refreshId),
    ],
);

export const authOAuthConsent = pgTable(
    "auth_oauth_consent",
    {
        id: text("id").primaryKey(),
        clientId: text("client_id")
            .notNull()
            .references(() => authOAuthClient.clientId, {
                onDelete: "cascade",
            }),
        userId: text("user_id").references(() => authUser.id, {
            onDelete: "cascade",
        }),
        referenceId: text("reference_id"),
        scopes: text("scopes").array().notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    },
    (table) => [
        index("auth_oauth_consent_client_id_idx").on(table.clientId),
        index("auth_oauth_consent_user_id_idx").on(table.userId),
    ],
);
