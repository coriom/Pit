FROM rust:1.95.0-bookworm@sha256:6258907abe69656e41cd992e0b705cdcfabcbbe3db374f92ed2d47121282d4a1 AS builder
WORKDIR /src
COPY backend/migrations/ /src/backend/migrations/
COPY backend-rust/Cargo.toml backend-rust/Cargo.lock /src/backend-rust/
COPY backend-rust/migrations/ /src/backend-rust/migrations/
WORKDIR /src/backend-rust
RUN mkdir -p src && printf 'fn main() {}\n' > src/main.rs && cargo build --release --locked
COPY backend-rust/src/ /src/backend-rust/src/
# COPY can preserve source mtimes older than the cached placeholder binary.
RUN touch src/main.rs && cargo build --release --locked

FROM gcr.io/distroless/base-nossl-debian12:nonroot@sha256:be40c00dfabd86576d92666e87e406714d5618342de1a0c213ad232de255172e
COPY --from=builder /lib/x86_64-linux-gnu/libgcc_s.so.1 /lib/x86_64-linux-gnu/libgcc_s.so.1
COPY --from=builder /src/backend-rust/target/release/pit-crypto-backend-v2 /usr/local/bin/pit-crypto-backend-v2
USER 65532:65532
WORKDIR /tmp
ENTRYPOINT ["/usr/local/bin/pit-crypto-backend-v2"]
