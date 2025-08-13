FROM mongodb-community-server:7.0.0-ubuntu2204

WORKDIR scripts

COPY benchmark.js /scripts/benchmark.js
COPY stock_tickers.json /scripts/stock_tickers.json
COPY docker-entrypoint.sh /scripts/docker-entrypoint.sh

EXPOSE 27017

ENTRYPOINT ["/scripts/docker-entrypoint.sh"]
