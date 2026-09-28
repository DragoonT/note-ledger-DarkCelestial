FROM rust:1.96-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY proto ./proto
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/pocket-ledger-api /usr/local/bin/pocket-ledger-api
ENV RUST_LOG=info
EXPOSE 8080
CMD ["pocket-ledger-api"]
