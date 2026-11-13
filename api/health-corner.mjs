/*
 * =========================================================
 * EMERGE 2026 — HEALTH CORNER
 * Same-origin Vercel bridge for Google Apps Script
 * =========================================================
 *
 * Browser
 *    ↓
 * /api/health-corner
 *    ↓
 * Google Apps Script
 *    ↓
 * JSON
 *    ↓
 * Browser
 *
 * IMPORTANT:
 * The browser never communicates with script.google.com
 * directly.
 *
 * This bridge deliberately allow-lists every supported
 * Health Corner action.
 */

export const maxDuration = 60;


/* =========================================================
   CONFIGURATION
   ========================================================= */

const UPSTREAM_TIMEOUT_MS = 50000;

const APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbx7q4v02ASIbSxKjtbKsh4__MbdGAe8anK5GpSn14OiAvoNNP_6r0fgsI2nKlkIfDmsCQ/exec';


/* =========================================================
   ALLOWED GET ACTIONS
   ========================================================= */

const ALLOWED_GET_ACTIONS = new Set([

    /*
     * Existing service health check.
     */
    '',

    /*
     * Existing registration open / closed state.
     */
    'registrationStatus',

    /*
     * NEW:
     * Public configuration used by register.html.
     *
     * This will eventually return:
     * - Standard price
     * - VIP price
     * - Standard benefits
     * - VIP benefits
     * - Zenith Bank name
     * - account name
     * - account number
     * - credential valid-from date
     * - credential valid-until date
     *
     * No private/admin secrets are returned.
     */
    'registrationConfig',

    /*
     * NEW:
     * Allows a participant to check what happened to
     * their submitted payment-confirmation request.
     *
     * The backend will require both:
     * - payment submission reference
     * - private lookup token
     *
     * so knowing a reference by itself is not enough
     * to inspect somebody else's submission.
     */
    'paymentSubmissionStatus',

    /*
     * Existing personal Health Corner QR verification.
     */
    'verify'

]);


/* =========================================================
   ALLOWED POST ACTIONS
   ========================================================= */

const ALLOWED_POST_ACTIONS = new Set([

    /*
     * TEMPORARY LEGACY REGISTRATION ACTION.
     *
     * The current live register.html still submits with
     * no action.
     *
     * We are leaving this transport route available while
     * we build the replacement flow.
     *
     * Once the new payment-confirmation register.html and
     * backend are deployed together, Code.gs will stop
     * allowing an unpaid participant to obtain a QR.
     */
    '',


    /* =====================================================
       PUBLIC PAYMENT SUBMISSION
       ===================================================== */

    /*
     * NEW:
     * Participant submits:
     * - registration details
     * - selected tier
     * - transfer sender name
     * - sending bank
     * - transfer date
     * - approximate time
     * - optional transaction/session reference
     *
     * This creates ONLY a pending payment submission.
     *
     * It must NOT create:
     * - HC-2026 registration ID
     * - QR token
     * - verification URL
     * - Health Corner Pass
     */
    'submitPaymentForConfirmation',


    /* =====================================================
       EXISTING HOSPITAL REDEMPTION
       ===================================================== */

    'authorizeRedemption',

    'redeem',


    /* =====================================================
       EXISTING ORGANISER AUTHENTICATION
       ===================================================== */

    'authorizeAdmin',

    'adminStatus',


    /* =====================================================
       NEW ORGANISER PAYMENT REVIEW
       ===================================================== */

    /*
     * Load payment submissions for:
     * - Awaiting Confirmation
     * - Needs Review
     * - Approved
     * - Denied
     */
    'listPaymentSubmissions',

    /*
     * Confirm that money has actually been received in
     * the Mentor Men Zenith Bank account.
     *
     * This action will eventually:
     * - approve payment
     * - activate registration
     * - create HC-2026 ID
     * - generate QR
     * - send participant email
     */
    'confirmPaymentSubmission',

    /*
     * Temporarily flag a submission where the organiser
     * cannot confidently approve or deny payment yet.
     */
    'markPaymentNeedsReview',

    /*
     * Deny a payment submission after manual Zenith
     * account verification.
     *
     * This will also trigger the participant denial email.
     */
    'denyPaymentSubmission',

    /*
     * Re-send the participant's appropriate notification.
     *
     * Examples:
     * - approved → resend QR credential email
     * - denied → resend denial email
     *
     * The backend determines which email is appropriate
     * from the current payment status.
     */
    'resendParticipantNotification'

]);


/* =========================================================
   STANDARD RESPONSE HEADERS
   ========================================================= */

function responseHeaders(extra = {}) {

    return {

        'cache-control':
            'no-store, no-cache, must-revalidate, proxy-revalidate',

        pragma:
            'no-cache',

        expires:
            '0',

        'x-content-type-options':
            'nosniff',

        'referrer-policy':
            'no-referrer',

        ...extra

    };

}


/* =========================================================
   JSON RESPONSE
   ========================================================= */

function json(
    payload,
    status = 200,
    extraHeaders = {}
) {

    return new Response(

        JSON.stringify(payload),

        {

            status,

            headers:
                responseHeaders({

                    'content-type':
                        'application/json; charset=utf-8',

                    ...extraHeaders

                })

        }

    );

}


/* =========================================================
   CLEAN STRING
   ========================================================= */

function clean(value) {

    return String(
        value || ''
    ).trim();

}


/* =========================================================
   READ POST BODY
   ========================================================= */

function getBodyValues(
    contentType,
    body
) {

    if (!body) {

        return {};

    }


    if (
        contentType.startsWith(
            'application/x-www-form-urlencoded'
        )
    ) {

        try {

            return Object.fromEntries(

                new URLSearchParams(
                    body
                ).entries()

            );

        } catch (_) {

            return {};

        }

    }


    if (
        contentType.startsWith(
            'application/json'
        )
    ) {

        try {

            const parsed =
                JSON.parse(body);


            return (
                parsed &&
                typeof parsed === 'object' &&
                !Array.isArray(parsed)
            )
                ? parsed
                : {};

        } catch (_) {

            return {};

        }

    }


    return {};

}


/* =========================================================
   EXPECTED BACKEND RESPONSE TYPE
   ========================================================= */

function expectedResponseType(
    method,
    action
) {


    /* -----------------------------------------------------
       GET
       ----------------------------------------------------- */

    if (
        method === 'GET' &&
        action === 'registrationStatus'
    ) {

        return 'REGISTRATION_STATUS_RESULT';

    }


    if (
        method === 'GET' &&
        action === 'registrationConfig'
    ) {

        return 'REGISTRATION_CONFIG_RESULT';

    }


    if (
        method === 'GET' &&
        action === 'paymentSubmissionStatus'
    ) {

        return 'PAYMENT_SUBMISSION_STATUS_RESULT';

    }


    if (
        method === 'GET' &&
        action === 'verify'
    ) {

        return 'VERIFICATION_RESULT';

    }


    /* -----------------------------------------------------
       PUBLIC PAYMENT SUBMISSION
       ----------------------------------------------------- */

    if (
        method === 'POST' &&
        action === 'submitPaymentForConfirmation'
    ) {

        return 'PAYMENT_SUBMISSION_RESULT';

    }


    /* -----------------------------------------------------
       HOSPITAL
       ----------------------------------------------------- */

    if (
        method === 'POST' &&
        action === 'authorizeRedemption'
    ) {

        return 'REDEMPTION_AUTH_RESULT';

    }


    if (
        method === 'POST' &&
        action === 'redeem'
    ) {

        return 'REDEMPTION_RESULT';

    }


    /* -----------------------------------------------------
       ORGANISER / ADMIN
       ----------------------------------------------------- */

    if (
        method === 'POST' &&
        (
            action === 'authorizeAdmin' ||

            action === 'adminStatus' ||

            action === 'listPaymentSubmissions' ||

            action === 'confirmPaymentSubmission' ||

            action === 'markPaymentNeedsReview' ||

            action === 'denyPaymentSubmission' ||

            action === 'resendParticipantNotification'
        )
    ) {

        return 'ADMIN_RESULT';

    }


    /* -----------------------------------------------------
       LEGACY REGISTRATION
       ----------------------------------------------------- */

    if (
        method === 'POST' &&
        action === ''
    ) {

        return 'REGISTRATION_RESULT';

    }


    return '';

}


/* =========================================================
   NORMALISE RESPONSE ENVELOPE
   ========================================================= */

function normaliseEnvelope(
    payload,
    method,
    action,
    callbackNonce
) {

    const safePayload =

        payload &&
            typeof payload === 'object' &&
            !Array.isArray(payload)

            ? { ...payload }

            : {

                success:
                    false,

                message:
                    'Invalid Health Corner response.'

            };


    const type =
        expectedResponseType(
            method,
            action
        );


    /*
     * The Vercel endpoint is our same-origin
     * transport boundary.
     *
     * Keep the response envelope predictable for:
     *
     * - existing pages
     * - newly redesigned pages
     * - cached versions of older pages
     */
    safePayload.source =
        'EMERGE_HEALTH_CORNER';


    if (type) {

        safePayload.type =
            type;

    }


    if (callbackNonce) {

        safePayload.callbackNonce =
            callbackNonce;

    }


    return safePayload;

}


/* =========================================================
   LEGACY APPS SCRIPT HTML RESPONSE PARSER
   =========================================================
   Older Apps Script versions returned an HTML document
   containing:
   
       const payload = {...};
   
   Keep this parser temporarily so previously deployed
   Apps Script responses can still be interpreted.
   ========================================================= */

function extractPayloadFromHtml(html) {

    const marker =
        /(?:const|let|var)\s+payload\s*=/m.exec(
            html || ''
        );


    if (!marker) {

        return null;

    }


    let i =
        marker.index +
        marker[0].length;


    while (
        i < html.length &&
        /\s/.test(
            html[i]
        )
    ) {

        i += 1;

    }


    if (
        html[i] !== '{'
    ) {

        return null;

    }


    const start =
        i;


    let depth =
        0;


    let inString =
        false;


    let escaped =
        false;


    for (
        ;
        i < html.length;
        i += 1
    ) {

        const ch =
            html[i];


        if (inString) {

            if (escaped) {

                escaped =
                    false;

                continue;

            }


            if (
                ch === '\\'
            ) {

                escaped =
                    true;

                continue;

            }


            if (
                ch === '"'
            ) {

                inString =
                    false;

            }


            continue;

        }


        if (
            ch === '"'
        ) {

            inString =
                true;

            continue;

        }


        if (
            ch === '{'
        ) {

            depth += 1;

        }


        if (
            ch === '}'
        ) {

            depth -= 1;


            if (
                depth === 0
            ) {

                try {

                    return JSON.parse(

                        html.slice(
                            start,
                            i + 1
                        )

                    );

                } catch (_) {

                    return null;

                }

            }

        }

    }


    return null;

}


/* =========================================================
   LEGACY JSONP PARSER
   ========================================================= */

function extractJsonp(text) {

    const match =

        /^\s*[A-Za-z_$][\w$]*\s*\((.*)\)\s*;?\s*$/s.exec(
            text || ''
        );


    if (!match) {

        return null;

    }


    try {

        return JSON.parse(
            match[1]
        );

    } catch (_) {

        return null;

    }

}


/* =========================================================
   NORMALISE APPS SCRIPT RESPONSE
   ========================================================= */

function normaliseAppsScriptResponse(
    text,
    contentType
) {

    const type =
        clean(
            contentType
        ).toLowerCase();


    /* -----------------------------------------------------
       NORMAL JSON
       ----------------------------------------------------- */

    if (
        type.includes(
            'application/json'
        )
    ) {

        try {

            return JSON.parse(
                text
            );

        } catch (_) {

            /*
             * Continue to compatibility parsers below.
             */

        }

    }


    /* -----------------------------------------------------
       LEGACY HTML ENVELOPE
       ----------------------------------------------------- */

    const htmlPayload =
        extractPayloadFromHtml(
            text
        );


    if (htmlPayload) {

        return htmlPayload;

    }


    /* -----------------------------------------------------
       LEGACY JSONP
       ----------------------------------------------------- */

    const jsonpPayload =
        extractJsonp(
            text
        );


    if (jsonpPayload) {

        return jsonpPayload;

    }


    /* -----------------------------------------------------
       CONTENTSERVICE MAY ARRIVE AS TEXT/PLAIN
       ----------------------------------------------------- */

    try {

        const parsed =
            JSON.parse(
                text
            );


        if (
            parsed &&
            typeof parsed === 'object'
        ) {

            return parsed;

        }

    } catch (_) {

        /*
         * Ignore.
         */

    }


    return null;

}


/* =========================================================
   VERCEL HANDLER
   ========================================================= */

export default {

    async fetch(request) {

        const startedAt =
            Date.now();


        const method =
            request.method
                .toUpperCase();


        /* -------------------------------------------------
           METHOD VALIDATION
           ------------------------------------------------- */

        if (
            method !== 'GET' &&
            method !== 'POST'
        ) {

            return json(

                {

                    success:
                        false,

                    message:
                        'Method not allowed.'

                },

                405

            );

        }


        const incomingUrl =
            new URL(
                request.url
            );


        let body =
            undefined;


        let contentType =
            '';


        let bodyAction =
            '';


        let bodyValues =
            {};


        /* -------------------------------------------------
           READ POST
           ------------------------------------------------- */

        if (
            method === 'POST'
        ) {

            contentType =

                request.headers
                    .get(
                        'content-type'
                    )

                ||

                'application/x-www-form-urlencoded;charset=UTF-8';


            const supported =

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


            if (!supported) {

                return json(

                    {

                        success:
                            false,

                        message:
                            'Unsupported request content type.'

                    },

                    415

                );

            }


            body =
                await request.text();


            bodyValues =
                getBodyValues(
                    contentType,
                    body
                );


            bodyAction =
                clean(
                    bodyValues.action
                );

        }


        /* -------------------------------------------------
           ACTION
           ------------------------------------------------- */

        const queryAction =
            clean(

                incomingUrl
                    .searchParams
                    .get(
                        'action'
                    )

            );


        const action =
            queryAction ||
            bodyAction;


        const callbackNonce =
            clean(

                incomingUrl
                    .searchParams
                    .get(
                        'callbackNonce'
                    )

                ||

                bodyValues.callbackNonce

            );


        /* -------------------------------------------------
           GET ALLOWLIST
           ------------------------------------------------- */

        if (
            method === 'GET' &&
            !ALLOWED_GET_ACTIONS.has(
                action
            )
        ) {

            return json(

                {

                    success:
                        false,

                    code:
                        'UNSUPPORTED_ACTION',

                    message:
                        'Unsupported Health Corner request.'

                },

                400

            );

        }


        /* -------------------------------------------------
           POST ALLOWLIST
           ------------------------------------------------- */

        if (
            method === 'POST' &&
            !ALLOWED_POST_ACTIONS.has(
                action
            )
        ) {

            return json(

                {

                    success:
                        false,

                    code:
                        'UNSUPPORTED_ACTION',

                    message:
                        'Unsupported Health Corner request.'

                },

                400

            );

        }


        /* -------------------------------------------------
           BUILD APPS SCRIPT URL
           ------------------------------------------------- */

        const upstreamUrl =
            new URL(
                APPS_SCRIPT_URL
            );


        incomingUrl
            .searchParams
            .forEach(

                (
                    value,
                    key
                ) => {

                    upstreamUrl
                        .searchParams
                        .append(
                            key,
                            value
                        );

                }

            );


        /* -------------------------------------------------
           UPSTREAM HEADERS
           ------------------------------------------------- */

        const headers =
            new Headers({

                accept:
                    'application/json,text/html,text/plain,*/*'

            });


        if (
            method === 'POST'
        ) {

            headers.set(
                'content-type',
                contentType
            );

        }


        /* -------------------------------------------------
           TIMEOUT
           ------------------------------------------------- */

        const controller =
            new AbortController();


        const timer =
            setTimeout(

                () =>
                    controller.abort(),

                UPSTREAM_TIMEOUT_MS

            );


        /* -------------------------------------------------
           CALL GOOGLE APPS SCRIPT
           ------------------------------------------------- */

        let upstream;


        try {

            upstream =
                await fetch(

                    upstreamUrl.toString(),

                    {

                        method,

                        headers,

                        body:
                            method === 'POST'
                                ? body
                                : undefined,

                        redirect:
                            'follow',

                        cache:
                            'no-store',

                        signal:
                            controller.signal

                    }

                );

        } catch (error) {

            clearTimeout(
                timer
            );


            const timedOut =

                error &&
                error.name ===
                'AbortError';


            console.error(
                'Health Corner upstream request failed',
                error
            );


            return json(

                {

                    success:
                        false,

                    code:
                        timedOut
                            ? 'UPSTREAM_TIMEOUT'
                            : 'UPSTREAM_UNAVAILABLE',

                    message:
                        timedOut

                            ? 'The Health Corner service took too long to respond. Please try again.'

                            : 'The Health Corner service is temporarily unavailable.'

                },

                timedOut
                    ? 504
                    : 502,

                {

                    'x-health-corner-upstream-ms':
                        String(
                            Date.now() -
                            startedAt
                        )

                }

            );

        }


        clearTimeout(
            timer
        );


        /* -------------------------------------------------
           READ UPSTREAM RESPONSE
           ------------------------------------------------- */

        const text =
            await upstream.text();


        const payload =
            normaliseAppsScriptResponse(

                text,

                upstream.headers
                    .get(
                        'content-type'
                    )

                ||

                ''

            );


        /* -------------------------------------------------
           INVALID UPSTREAM RESPONSE
           ------------------------------------------------- */

        if (!payload) {

            console.error(

                'Unparseable Apps Script response',

                {

                    status:
                        upstream.status,

                    contentType:
                        upstream.headers
                            .get(
                                'content-type'
                            ),

                    preview:
                        text.slice(
                            0,
                            300
                        )

                }

            );


            return json(

                {

                    success:
                        false,

                    code:
                        'UPSTREAM_BAD_RESPONSE',

                    message:
                        'The Health Corner service returned an unexpected response. Please try again.'

                },

                502,

                {

                    'x-health-corner-upstream-ms':
                        String(
                            Date.now() -
                            startedAt
                        )

                }

            );

        }


        /* -------------------------------------------------
           NORMALISE ENVELOPE
           ------------------------------------------------- */

        const normalisedPayload =
            normaliseEnvelope(

                payload,

                method,

                action,

                callbackNonce

            );


        /* -------------------------------------------------
           RESPONSE TO BROWSER
           ------------------------------------------------- */

        return json(

            normalisedPayload,

            upstream.ok
                ? 200
                : upstream.status,

            {

                'x-health-corner-upstream-ms':
                    String(
                        Date.now() -
                        startedAt
                    ),

                'x-health-corner-action':
                    action ||
                    'registration'

            }

        );

    }

};