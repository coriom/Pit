-- Additive Better Auth 1.7.12 SIWE schema. Existing users and sessions remain intact.
-- Existing non-wallet sessions cannot access premium routes after the Worker wallet check.
CREATE TABLE IF NOT EXISTS walletAddress (id TEXT NOT NULL PRIMARY KEY, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, address TEXT NOT NULL, chainId INTEGER NOT NULL CHECK(chainId=8453), isPrimary INTEGER NOT NULL DEFAULT 0 CHECK(isPrimary IN (0,1)), createdAt DATE NOT NULL);
CREATE INDEX IF NOT EXISTS walletAddress_userId_idx ON walletAddress(userId);
CREATE UNIQUE INDEX IF NOT EXISTS walletAddress_address_chain_unique ON walletAddress(address,chainId);
CREATE TABLE IF NOT EXISTS wallet_auth_rate_limits (ip_digest TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL CHECK(attempts BETWEEN 1 AND 20)) STRICT;
