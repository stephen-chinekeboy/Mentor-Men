/*
 * ============================================================
 * EMERGE 2026 — HEALTH CORNER
 * VERCEL → GOOGLE APPS SCRIPT BRIDGE
 * ============================================================
 *
 * PURPOSE
 *
 * Public browsers/phones communicate only with:
 *
 *   https://mentormenforum.org/api/health-corner
 *
 * This Vercel Function then communicates server-to-server with
 * the Google Apps Script Health Corner backend.
 *
 * This avoids requiring participant/hospital phones to connect
 * directly to script.google.com or script.googleusercontent.com.
 *
 * ============================================================
 */

const APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbx7q4v02ASIbSxKjtbKsh4__MbdGAe8anK5GpSn14OiAvoNNP_6r0fgsI2nKlkIfDmsCQ/exec';


/*
 * Only these public Health Corner operations are allowed
 * through this bridge.
 *
 * Empty action:
 *   GET  = backend health check
 *   POST = participant registration
 */

const ALLOWED_GET_ACTIONS = new Set([
    '',
    'registrationStatus',
    'verify'
]);


const ALLOWED_POST_ACTIONS = new Set([
    '',
    'authorizeRedemption',
    'redeem'
]);


/*
 * ------------------------------------------------------------
 * JSON ERROR RESPONSE
 * ------------------------------------------------------------
 */

function jsonError(message, status = 400) {

    return new Response(
        JSON.stringify({
            success: false,
            message
        }),
        {
            status,

            headers: {
                'content-type':
                    'application/json; charset=utf-8',

                'cache-control':
                    'no-store, no-cache, must-revalidate',

                'pragma':
                    'no-cache',

                'expires':
                    '0',

                'x-content-type-options':
                    'nosniff'
            }
        }
    );

}


/*
 * ------------------------------------------------------------
 * MAIN VERCEL FUNCTION
 * ------------------------------------------------------------
 */

export default {

    async fetch(request) {

        const method =
            request.method.toUpperCase();


        /*
         * Only GET and POST are required by this system.
         */

        if (
            method !== 'GET' &&
            method !== 'POST'
        ) {

            return jsonError(
                'Method not allowed.',
                405
            );

        }


        const incomingUrl =
            new URL(request.url);


        const action =
            String(
                incomingUrl.searchParams.get('action') ||
                ''
            ).trim();


        /*
         * --------------------------------------------------------
         * ROUTE ALLOWLIST
         * --------------------------------------------------------
         */

        if (
            method === 'GET' &&
            !ALLOWED_GET_ACTIONS.has(action)
        ) {

            return jsonError(
                'Unsupported Health Corner request.',
                400
            );

        }


        if (
            method === 'POST' &&
            !ALLOWED_POST_ACTIONS.has(action)
        ) {

            return jsonError(
                'Unsupported Health Corner request.',
                400
            );

        }


        /*
         * --------------------------------------------------------
         * BUILD GOOGLE APPS SCRIPT URL
         * --------------------------------------------------------
         */

        const upstreamUrl =
            new URL(APPS_SCRIPT_URL);


        /*
         * Preserve all existing parameters:
         *
         * action
         * token
         * callbackNonce
         * prefix
         * cache buster
         * etc.
         */

        incomingUrl.searchParams.forEach(
            (value, key) => {

                upstreamUrl.searchParams.append(
                    key,
                    value
                );

            }
        );


        const upstreamHeaders =
            new Headers();


        let upstreamBody;


        /*
         * --------------------------------------------------------
         * FORWARD POST BODY
         * --------------------------------------------------------
         */

        if (method === 'POST') {

            const contentType =
                request.headers.get(
                    'content-type'
                ) ||
                'application/x-www-form-urlencoded';


            /*
             * The Health Corner currently uses normal HTML
             * form submissions.
             *
             * We also permit JSON/text so the bridge remains usable
             * if the frontend is modernised later.
             */

            const supportedContentType =

                contentType.startsWith(
                    'application/x-www-form-urlencoded'
                )

                ||

                contentType.startsWith(
                    'application/json'
                )

                ||

                contentType.startsWith(
                    'text/plain'
                );


            if (!supportedContentType) {

                return jsonError(
                    'Unsupported request content type.',
                    415
                );

            }


            upstreamHeaders.set(
                'content-type',
                contentType
            );


            upstreamBody =
                await request.text();

        }


        /*
         * --------------------------------------------------------
         * SERVER-SIDE TIMEOUT
         * --------------------------------------------------------
         */

        const controller =
            new AbortController();


        const timeout =
            setTimeout(
                () => controller.abort(),
                25000
            );


        let upstreamResponse;


        try {

            /*
             * redirect: follow
             *
             * Google Apps Script Content Service can redirect
             * responses to script.googleusercontent.com.
             *
             * The participant's browser never needs to follow that
             * redirect — Vercel follows it server-side instead.
             */

            upstreamResponse =
                await fetch(
                    upstreamUrl.toString(),
                    {
                        method,

                        headers:
                            upstreamHeaders,

                        body:
                            method === 'POST'
                                ? upstreamBody
                                : undefined,

                        redirect:
                            'follow',

                        signal:
                            controller.signal
                    }
                );

        }

        catch (error) {

            clearTimeout(timeout);


            console.error(
                'Health Corner upstream request failed:',
                error
            );


            if (
                error &&
                error.name === 'AbortError'
            ) {

                return jsonError(
                    'The Health Corner service took too long to respond. Please try again.',
                    504
                );

            }


            return jsonError(
                'The Health Corner service is temporarily unavailable.',
                502
            );

        }


        clearTimeout(timeout);


        /*
         * --------------------------------------------------------
         * PRESERVE APPS SCRIPT RESPONSE
         * --------------------------------------------------------
         *
         * This is important because the existing system currently
         * returns different response types:
         *
         * JSON
         * JavaScript / JSONP
         * HTML containing postMessage callbacks
         *
         * We intentionally preserve the upstream response body
         * rather than attempting to reinterpret it.
         */

        const responseBody =
            await upstreamResponse.arrayBuffer();


        const responseHeaders =
            new Headers();


        const upstreamContentType =
            upstreamResponse.headers.get(
                'content-type'
            );


        responseHeaders.set(
            'content-type',
            upstreamContentType ||
            'text/plain; charset=utf-8'
        );


        /*
         * Never cache participant verification,
         * registration status, authorisation or redemption
         * responses.
         */

        responseHeaders.set(
            'cache-control',
            'no-store, no-cache, must-revalidate, proxy-revalidate'
        );


        responseHeaders.set(
            'pragma',
            'no-cache'
        );


        responseHeaders.set(
            'expires',
            '0'
        );


        responseHeaders.set(
            'x-content-type-options',
            'nosniff'
        );


        return new Response(
            responseBody,
            {
                status:
                    upstreamResponse.status,

                headers:
                    responseHeaders
            }
        );

    }

};