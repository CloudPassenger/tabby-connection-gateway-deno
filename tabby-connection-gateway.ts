/** Env */
const TABBY_AUTH_TOKEN = Deno.env.get("TABBY_AUTH_TOKEN") || "";

/** Protocol */
type HandshakeStatus = 'hello' | 'ready' | 'connected' | 'close' | 'closed' | null;
interface SendHandshakeMessage {
    '_': HandshakeStatus,
    "version"?: number,
    "auth_required"?: boolean,
}

interface RecvHandshakeAuthMessage {
    '_': 'hello',
    'auth_token': string,
}

interface RecvConnectMessage {
    '_': 'connect',
    'host': string,
    'port': number,
}

/** Utils */
const safeCloseWebSocket = (ws: WebSocket) => {
    try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CLOSING) {
            ws.close();
        }
    } catch (error) {
        console.error('safeCloseWebSocket error', error);
    }
}

const relayTcpSocket = (tcpSocket: Deno.TcpConn, webSocket: WebSocket) => {
    // let remoteChunkCount = 0;
    // let chunks = [];
    let hasIncomingData = false;
    tcpSocket.readable.pipeTo(
        new WritableStream(
            {
                start() { },
                write(tcpChunk, controller) {
                    hasIncomingData = true;
                    if (webSocket.readyState !== WebSocket.OPEN) {
                        controller.error(
                            'Websocket connection is not open, maybe close'
                        );
                    }
                    // cf chunk size = 4 KB
                    webSocket.send(tcpChunk);
                },
                close() {
                    console.debug(`Remote tcp connection is close with hasIncomingData is ${hasIncomingData}`);
                    // safeCloseWebSocket(webSocket); // no need server close websocket frist for some case will casue HTTP ERR_CONTENT_LENGTH_MISMATCH issue, client will send close event anyway.
                },
                abort(reason) {
                    console.error(`Remote tcp connection aborted, reason:`, reason);
                },
            }
        )
    ).catch((error) => {
        console.error(
            `remoteSocketToWS has exception `,
            error.stack || error
        );
        safeCloseWebSocket(webSocket);
    });
}

/** Incomming Traffic Handler */

function handler(request: Request, info: {
    remoteAddr: Deno.NetAddr;
}): Response {
    const upgrade = request.headers.get("upgrade") || "";
    const clientIp = info.remoteAddr.hostname;

    if (upgrade.toLowerCase() !== "websocket") {
        return new Response(`<html>
<head><title>Tabby Connection Gateway</title></head>
<body>
<h1>Tabby Connection Gateway is running!</h1>
<p>This is the connection gateway service that Tabby Web uses. It's a Websocket → TCP gateway that allows Tabby to initiate arbitrary network connections from a browser.</p>
</body>
</html>`, {
            status: 200,
            headers: {
                'content-type': 'text/html; charset=utf-8',
            }
        });
    }
    // Websocket Connection
    const { socket, response } = Deno.upgradeWebSocket(request, {
        protocol: request.headers.get("sec-websocket-protocol") || undefined,
        idleTimeout: 300,
    });
    // Status

    // const stream = makeWebsocketStream(socket);
    let handshakeStatus: HandshakeStatus = null;
    let tcpSocket: Deno.TcpConn | undefined = undefined;
    let remoteAddr: RecvConnectMessage;

    const fatal = (reason: string) => {
        socket.send(JSON.stringify({
            '_': 'error',
            'code': reason,
        }))
    }

    // Rewrite pipeto
    socket.onopen = (_ev: Event) => {
        console.debug(`New connection established from ${clientIp}`);
        const handshakeHelloMessage: SendHandshakeMessage = {
            '_': 'hello',
            "version": 1,
            "auth_required": TABBY_AUTH_TOKEN != "",
        }
        socket.send(JSON.stringify(handshakeHelloMessage));
        handshakeStatus = 'hello';
    };

    socket.onmessage = async (event: MessageEvent<ArrayBuffer | string>) => {
        const data = event.data;
        // console.log(data);
        if (tcpSocket) {
            const chunk = typeof data === 'string' ? new TextEncoder().encode(data) : data;
            await tcpSocket.write(new Uint8Array(chunk));
            return;
        }

        switch (handshakeStatus) {
            case 'hello': {
                const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
                const message: RecvHandshakeAuthMessage = JSON.parse(text);
                if (message['_'] != 'hello') {
                    fatal('expected-hello');
                    handshakeStatus = 'close';
                    break;
                }
                if (TABBY_AUTH_TOKEN != "" && !message.auth_token) {
                    fatal('expected-auth-token');
                    handshakeStatus = 'close';
                    break;
                }
                if (TABBY_AUTH_TOKEN != "" && message.auth_token != TABBY_AUTH_TOKEN) {
                    fatal('incorrect-auth-token');
                    handshakeStatus = 'close';
                    break;
                }
                // Ready
                socket.send(JSON.stringify({
                    '_': 'ready'
                }));
                handshakeStatus = 'ready';
                break;
            }

            case 'ready': {
                const text = typeof data === 'string' ? data : new TextDecoder().decode(data);
                const message: RecvConnectMessage = JSON.parse(text);
                if (message['_'] != 'connect') {
                    fatal('expected-connect');
                    handshakeStatus = 'close';
                    break;
                }
                remoteAddr = message;
                console.debug(`connecting to ${remoteAddr.host}:${remoteAddr.port} ...`);
                // Open Connection

                handshakeStatus = 'connected'

                socket.send(JSON.stringify({
                    '_': 'connected'
                }));

                // const tcpWriter = tcpSocket.writable.getWriter();
                // await tcpWriter.write(chunk);
                // tcpWriter.releaseLock();
                break;
            }

            case 'connected': {
                tcpSocket = await Deno.connect({ hostname: remoteAddr.host, port: remoteAddr.port });
                console.info(`Relay connection: ${clientIp} <-> ${remoteAddr.host}:${remoteAddr.port}`);
                // relayTcpSocket(tcpSocket, server);
                const chunk = typeof data === 'string' ? new TextEncoder().encode(data) : data;
                await tcpSocket.write(new Uint8Array(chunk));
                // writer.releaseLock();
                relayTcpSocket(tcpSocket, socket);
                break;
            }

            default:
                safeCloseWebSocket(socket);
                break;
        }
    }

    socket.onclose = (_ev: CloseEvent) => {
        console.info(`Websocket connection closed: ${clientIp} <-> ${remoteAddr.host}:${remoteAddr.port}`);
        tcpSocket?.close();
    }

    socket.onerror = (e: Event | ErrorEvent) => {
        console.error(`Websocket connection error: ${e instanceof ErrorEvent ? e.message : e.type}`)
    }

    return response;
}

console.debug("Tabby Connection Gateway is running!");
Deno.serve(handler);