# 🦕 Tabby Connection Gateway via Deno Deploy

## Introduction

Tabby Connection Gateway via [Deno Deploy](https://deno.com/deploy) is a reimagined version of the [Tabby Connection Gateway](https://github.com/Eugeny/tabby-connection-gateway), now leveraging the power of Google Cloud to efficiently route traffic. This gateway service enables Tabby Web to establish a wide range of network connections directly from a web browser.

## Key Features

- **⛩️ Websocket to TCP Gateway:** This service serves as a seamless Websocket to TCP gateway, facilitating Tabby's ability to initiate diverse network connections within a web browser.

- **🌎 Global Acceleration:** It takes advantage of the Deno Deploy serverless architecture to accelerates access through a global CDN network.

- **⚡ Effortless Setup:** After deploying, configuring Tabby Web to use your gateway is a breeze. You'll just need to enter your gateway URL and a secret token in the Tabby Web settings.

## Getting Started

1. Fork this repository
2. Log in to [Deno Deploy](https://deno.com/deploy) and deploy the code from the repo
3. set the environment `TABBY_AUTH_TOKEN`
4. Update your Tabby Web settings with the gateway URL and secret token.

## ⚠️ Warning

If your traffic is excessive/used to download large files, this project may violate the [Fair Use Policy](https://docs.deno.com/deploy/manual/fair-use-policy) of Deno Deploy (Proxy or VPN).

To avoid misuse, please do not make your instance available for public use.

## License

This project is open source and licensed under [MIT License](LICENSE.md).
