FROM ubuntu:24.04

LABEL org.opencontainers.image.source="https://github.com/cortex-docs/cortex" \
      org.opencontainers.image.description="Cortex SDK integration test toolchain"

ENV DEBIAN_FRONTEND=noninteractive

# Node.js 22
RUN apt-get update && apt-get install -y curl wget git build-essential pkg-config libssl-dev && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs

# Python 3
RUN apt-get install -y python3 python3-pip python3-venv && \
    ln -sf /usr/bin/python3 /usr/bin/python

# Go 1.23
RUN ARCH=$(dpkg --print-architecture) && \
    wget -q https://go.dev/dl/go1.23.4.linux-${ARCH}.tar.gz && \
    tar -C /usr/local -xzf go1.23.4.linux-${ARCH}.tar.gz && rm go1.23.4.linux-${ARCH}.tar.gz
ENV PATH="/usr/local/go/bin:/root/go/bin:${PATH}"

# Java 17 + Maven + Gradle
RUN apt-get install -y openjdk-17-jdk-headless maven unzip && \
    wget -q https://services.gradle.org/distributions/gradle-8.10-bin.zip -O /tmp/gradle.zip && \
    unzip -q /tmp/gradle.zip -d /opt && \
    rm /tmp/gradle.zip
ENV GRADLE_HOME=/opt/gradle-8.10
ENV PATH="${GRADLE_HOME}/bin:${PATH}"

# Ruby 3
RUN apt-get install -y ruby-full

# PHP 8 + Composer
RUN apt-get install -y php-cli php-curl php-json php-dom php-mbstring php-xml php-tokenizer unzip && \
    curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer

# .NET 8
RUN wget -q https://dot.net/v1/dotnet-install.sh -O /tmp/dotnet-install.sh && \
    chmod +x /tmp/dotnet-install.sh && \
    /tmp/dotnet-install.sh --channel 8.0 --install-dir /usr/local/dotnet && \
    rm /tmp/dotnet-install.sh
ENV DOTNET_ROOT=/usr/local/dotnet
ENV PATH="${DOTNET_ROOT}:${PATH}"
ENV DOTNET_CLI_TELEMETRY_OPTOUT=1

# Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

# C/C++ and local registry build tools (gcc/g++ already from build-essential)
RUN apt-get update && apt-get install -y cmake libcurl4-openssl-dev libsqlite3-dev

# Package publishing clients and local registry servers
RUN pip3 install --break-system-packages --no-cache-dir build twine conan conan-server && \
    gem install bundler --no-document && \
    gem install gemstash -v 2.8.2 --no-document

# Cleanup
RUN apt-get clean && rm -rf /var/lib/apt/lists/*
