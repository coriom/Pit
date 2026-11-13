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

FROM gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f
COPY --from=builder /src/backend-rust/target/release/pit-crypto-backend-v2 /usr/local/bin/pit-crypto-backend-v2
USER 65532:65532
WORKDIR /tmp
ENTRYPOINT ["/usr/local/bin/pit-crypto-backend-v2"]
