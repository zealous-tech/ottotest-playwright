/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * This file contains pure, standalone helper functions used by custom tools.
 * These functions are designed to be executed both in the MCP Node runtime
 * and to be stringified (via .toString()) and injected into generated Playwright code.
 * 
 * IMPORTANT: Because these functions are stringified and injected into Playwright scripts,
 * they MUST NOT rely on any variables or imports from their outer scope.
 * Any dependencies (like 'jsonpath') must be required dynamically inside the function,
 * or passed as arguments.
 */

/**
 * Extracts a value from parsed JSON data using a JSONPath expression.
 */
export function extractJsonPathValue(parsedData: any, jsonPath: string): any {
  // Dynamically require jsonpath so it works when this function is stringified in Playwright code.
  const jp = require('jsonpath');

  const normalizedPath = jsonPath.startsWith('$')
    ? jsonPath
    : jsonPath.startsWith('[')
      ? `$${jsonPath}`
      : `$.${jsonPath}`;

  if (normalizedPath.endsWith('.length')) {
    const targetPath = normalizedPath.slice(0, -'.length'.length);
    const targetResult = targetPath === '$' || targetPath === ''
      ? [parsedData]
      : jp.query(parsedData, targetPath);

    const targetValue =
      targetResult.length === 0 ? null
      : targetResult.length === 1 ? targetResult[0]
      : targetResult;

    if (!Array.isArray(targetValue)) {
      throw new Error(`Failed to extract length: path "${targetPath}" did not resolve to an array`);
    }

    return targetValue.length;
  } else {
    const queryResult = jp.query(parsedData, normalizedPath);
    return queryResult.length === 0 ? null : queryResult.length === 1 ? queryResult[0] : queryResult;
  }
}

/**
 * Extracts a substring or regex match from a source text.
 */
export function extractTextValue(sourceText: string, startIndex?: number, endIndex?: number, regex?: string, regexFlags?: string): string {
  let workingText = sourceText;
  if (startIndex !== undefined || endIndex !== undefined) {
    workingText = workingText.slice(startIndex, endIndex);
  }

  if (regex) {
    const flags = (regexFlags || '').replace(/g/g, '');
    let matcher: RegExp;
    try {
      matcher = new RegExp(regex, flags);
    } catch (e: any) {
      throw new Error(`Invalid regular expression "${regex}": ${e.message || String(e)}`);
    }

    const match = workingText.match(matcher);
    if (!match) {
      throw new Error(`Regular expression "${regex}" did not match the source text`);
    }
    return match[1] ?? match[0];
  }

  return workingText;
}

/**
 * Evaluates a JSONPath for validation purposes, returning an array of matches.
 */
export function evaluateJsonPathForValidation(parsedResponseData: any, jsonPath: string): any[] {
  const jp = require('jsonpath');
  const normalizedPath = jsonPath.startsWith('$')
    ? jsonPath
    : jsonPath.startsWith('[')
      ? '$' + jsonPath
      : '$.' + jsonPath;

  const isPrimitive = typeof parsedResponseData !== 'object' || parsedResponseData === null;
  if (isPrimitive) {
    return (normalizedPath === '$' || normalizedPath === '$.') ? [parsedResponseData] : [undefined];
  } else if (normalizedPath.endsWith('.length')) {
    const parentPath = normalizedPath.slice(0, -7) || '$';
    const parentObj = parentPath === '$' ? parsedResponseData : jp.query(parsedResponseData, parentPath)[0];
    return [Array.isArray(parentObj) ? parentObj.length : undefined];
  } else {
    const matches = jp.query(parsedResponseData, normalizedPath);
    return matches.length === 0 ? [undefined] : matches;
  }
}


