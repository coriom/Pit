FROM rust:1.95.0-bookworm AS builder
WORKDIR /src
COPY backend/migrations/ /src/backend/migrations/
COPY backend-rust/Cargo.toml backend-rust/Cargo.lock /src/backend-rust/
COPY backend-rust/migrations/ /src/backend-rust/migrations/
COPY backend-rust/src/ /src/backend-rust/src/
WORKDIR /src/backend-rust
RUN cargo build --release --locked

FROM debian:bookworm-slim
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /src/backend-rust/target/release/pit-crypto-backend-v2 /usr/local/bin/pit-crypto-backend-v2
USER 65532:65532
WORKDIR /tmp
ENTRYPOINT ["/usr/local/bin/pit-crypto-backend-v2"]
