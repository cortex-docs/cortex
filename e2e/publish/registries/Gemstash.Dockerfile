FROM ruby:3.3-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential libsqlite3-dev && \
    rm -rf /var/lib/apt/lists/*

RUN gem install gemstash -v 2.8.2 --no-document

EXPOSE 9292

CMD ["sh", "-c", "gemstash authorize --key cortex-local-gem-token && exec gemstash start"]
