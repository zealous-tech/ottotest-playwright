import { z } from 'playwright-core/lib/mcpBundle';
import { defineTabTool } from '../../tool';
import type * as playwright from 'playwright-core';


class RequestsNotFound extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RequestsNotFound';
    }
}

interface LogType {
    request: {
        headers: boolean;
        body: boolean;
    };
    response: {
        headers: boolean;
        body: boolean;
    };
}

type Input = {
    method?: string;   // e.g. "GET" (case-sensitive, exact match on token)
    url?: string;      // substring or /regex/ against full URL
    endpoint?: string; // substring or /regex/ against pathname+search
    keywords?: string[];
    logType?: LogType;
};



export const otto_requests = defineTabTool({
    capability: 'core',

    schema: {
        name: 'otto_browser_network_requests',
        title: 'Find specific network request',
        description:
            'Search network request logs and return the LATEST matching entry that satisfies structured filters (method/url/endpoint) AND contains ALL specified keywords. URL and endpoint filters support RegExp when wrapped in /pattern/flags (e.g. "/\\/v1\\/resources$/"). Keywords are searched across method, URL, headers, and bodies (case-sensitive). Use logType to control which fields are included in the output.',
        inputSchema: z.object({
            method: z
                .string()
                .optional()
                .describe('HTTP method to match (e.g., "GET"). Case-sensitive exact token match.'),
            url: z
                .string()
                .optional()
                .describe('Full or partial URL to match. Plain string = substring match (case-sensitive). Wrap in /…/ for RegExp (e.g. "/\\/v1\\/resources$/").'),
            endpoint: z
                .string()
                .optional()
                .describe('Pathname to match (against pathname+search). Plain string = substring match (case-sensitive). Wrap in /…/ for RegExp (e.g. "/\\/api\\/users$/").'),
            keywords: z
                .array(z.string())
                .default([])
                .describe('Array of keywords that must ALL be present somewhere in the request/response data (case-sensitive).'),
            logType: z
                .object({
                    request: z
                        .object({
                            headers: z.boolean().default(true).describe('Include request headers in output'),
                            body: z.boolean().default(true).describe('Include request body in output'),
                        })
                        .default({ headers: false, body: false }),
                    response: z
                        .object({
                            headers: z.boolean().default(true).describe('Include response headers in output'),
                            body: z.boolean().default(true).describe('Include response body in output'),
                        })
                        .default({ headers: false, body: false }),
                })
                .optional()
                .describe('Controls what information to include in the output. If not provided, includes nothing.'),
        }),
        type: 'readOnly',
    },

    handle: async (tab, params: Input, response) => {
        const allRequests = tab.requests();

        const {
            method: methodFilter,
            url: urlFilter,
            endpoint: endpointFilter,
            keywords = [],
        } = params;

        const logType: LogType =
            params.logType || {
                request: { headers: false, body: false },
                response: { headers: false, body: false },
            };

        const methodNorm = methodFilter?.trim();
        const urlNorm = urlFilter?.trim();
        const endpointNorm = endpointFilter?.trim();
        const keywordsNorm = keywords.map((k) => k);

        const resolvedRequests = [...await allRequests];
        for (let i = resolvedRequests.length - 1; i >= 0; i--) {
            const req = resolvedRequests[i];
            if (!matchesStructuredFilters(req, methodNorm, urlNorm, endpointNorm)) {
                continue;
            }
            const res = await req.response().catch(() => null);
            if (keywordsNorm.length === 0) {
                const out = await safeRender(req, res, logType);
                if (hasBodyError(out))
                    continue;
                response.addResult({ text: out });
                return;
            }

            try {
                const detailed = await renderRequestDetailed(req, res, logType);
                if (hasBodyError(detailed))
                    continue;
                const hasAll = containsAllKeywords(detailed, keywordsNorm);
                if (hasAll) {
                    response.addResult({ text: detailed });
                    return;
                }
            } catch {
                const basic = renderRequest(req, res);
                const hasAll = containsAllKeywords(basic, keywordsNorm);
                if (hasAll) {
                    response.addResult({ text: basic });
                    return;
                }
            }
        }

        const parts: string[] = [];
        if (methodFilter) parts.push(`method="${methodFilter}"`);
        if (urlFilter) parts.push(`url~="${urlFilter}"`);
        if (endpointFilter) parts.push(`endpoint~="${endpointFilter}"`);
        if (keywords.length > 0) parts.push(`keywords=[${keywords.join(', ')}]`);

        throw new RequestsNotFound(
            `No network requests found that match filters (${parts.join(', ') || 'none'}) and contain ALL keywords.`
        );
    },
});

const REGEX_META = /[$^*+?.()|\\{}\[\]]/;

function toMatcher(filter: string): (value: string) => boolean {
    const regexMatch = filter.match(/^\/(.+)\/([gimsuy]*)$/);
    if (regexMatch) {
        try {
            const re = new RegExp(regexMatch[1], regexMatch[2]);
            return (value: string) => re.test(value);
        } catch {}
    }
    if (REGEX_META.test(filter)) {
        try {
            const re = new RegExp(filter);
            return (value: string) => re.test(value);
        } catch {}
    }
    return (value: string) => value.includes(filter);
}

function matchesStructuredFilters(
    request: playwright.Request,
    methodNorm?: string,
    urlNorm?: string,
    endpointNorm?: string
): boolean {
    if (methodNorm) {
        const reqMethod = (request.method() || '').trim();
        if (reqMethod !== methodNorm) return false;
    }

    if (urlNorm) {
        const reqUrl = request.url() || '';
        if (!toMatcher(urlNorm)(reqUrl)) return false;
    }

    if (endpointNorm) {
        const matcher = toMatcher(endpointNorm);
        try {
            const u = new URL(request.url());
            if (!matcher(u.pathname + u.search)) return false;
        } catch {
            const reqUrl = request.url() || '';
            if (!matcher(reqUrl)) return false;
        }
    }

    return true;
}

function hasBodyError(rendered: string): boolean {
    return rendered.includes('[Error accessing body:');
}

function containsAllKeywords(haystack: string, keywordsNorm: string[]): boolean {
    return keywordsNorm.every((kw) => haystack.includes(kw));
}

function renderRequest(request: playwright.Request, response: playwright.Response | null) {
    return JSON.stringify({
        method: request.method().toUpperCase(),
        url: request.url(),
        requestHeaders: null,
        responseHeaders: null,
        requestBody: null,
        responseBody: null,
    }, null, 2);
}

async function safeRender(
    request: playwright.Request,
    response: playwright.Response | null,
    logType: LogType
): Promise<string> {
    try {
        return await renderRequestDetailed(request, response, logType);
    } catch (error) {
        // Fallback to basic JSON structure with error info
        return JSON.stringify({
            method: request.method().toUpperCase(),
            url: request.url(),
            requestHeaders: null,
            responseHeaders: null,
            requestBody: null,
            responseBody: null,
            error: `Error rendering detailed request: ${error}`,
        }, null, 2);
    }
}

async function renderRequestDetailed(
    request: playwright.Request,
    response: playwright.Response | null,
    logType: LogType
) {
    const result: {
        method: string;
        url: string;
        requestHeaders: Record<string, string> | null;
        responseHeaders: Record<string, string> | null;
        requestBody: string | null;
        responseBody: string | null;
    } = {
        method: request.method().toUpperCase(),
        url: request.url(),
        requestHeaders: null,
        responseHeaders: null,
        requestBody: null,
        responseBody: null,
    };

    // Include request headers if specified in logType
    if (logType.request.headers) {
        const requestHeaders = request.headers();
        if (Object.keys(requestHeaders).length > 0) {
            result.requestHeaders = requestHeaders;
        }
    }

    // Include request body if specified in logType
    if (logType.request.body) {
        try {
            const requestBody = request.postData();
            if (requestBody) {
                result.requestBody = requestBody;
            }
        } catch (error) {
            result.requestBody = `[Error accessing body: ${error}]`;
        }
    }

    // Include response headers if specified in logType
    if (response && logType.response.headers) {
        try {
            const responseHeaders = await response.allHeaders();
            if (Object.keys(responseHeaders).length > 0) {
                result.responseHeaders = responseHeaders;
            }
        } catch (error) {
            // Keep as null if error occurs
        }
    }

    // Include response body if specified in logType
    if (response && logType.response.body) {
        try {
            const responseBody = await response.text();
            if (responseBody) {
                const contentType = (await response.allHeaders())['content-type'] || '';
                if (contentType.includes('image/') || contentType.includes('application/octet-stream')) {
                    result.responseBody = `[Binary content - ${contentType}] (${responseBody.length} bytes)`;
                } else {
                    result.responseBody = responseBody;
                }
            }
        } catch (error) {
            result.responseBody = `[Error accessing body: ${error}]`;
        }
    }

    return JSON.stringify(result, null, 2);
}

export default [otto_requests];
