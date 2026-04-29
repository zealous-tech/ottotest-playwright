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
import { expect } from '@zealous-tech/playwright/test';
import { defineTabTool } from '../../tool';
import { buildValidationErrorPayload, buildValidationPayload, createValidationEvidence, generateLocatorString, parseValidationResult } from '../helpers/helpers';
import { getTimeout } from '../helpers/utils';
import { defaultValidationSchema } from '../helpers/schemas';

export const default_validation = defineTabTool({
  capability: 'core',
  schema: {
    name: 'default_validation',
    title: 'Default Validation Tool',
    description: 'Validation tool. jsCode receives "element" (DOM node or null if ref not provided) and "document", must return "pass"/"fail" string OR rich object { result: "pass"|"fail", message, expected, actual }. Provide ref+element to validate a UI element, or omit them for data-only validation (e.g. downloaded CSV/Excel data inlined via variable replacement).',
    inputSchema: defaultValidationSchema,
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    const { ref, element, jsCode } = params;

    await tab.waitForCompletion(async () => {
      try {
        let result: any;
        let locatorString = '';

        if (ref && element) {
          const { locator } = await tab.refLocator({ ref, element });

          try {
            await expect(locator).toBeAttached({ timeout: getTimeout(tab.context) });
          } catch {
            locatorString = await generateLocatorString(ref, locator, true);
            const errorMessage = `The UI Element "${element}" not found`;
            const evidence = [createValidationEvidence('element', jsCode, errorMessage, { element, locatorString })];
            const payload = buildValidationErrorPayload('element', jsCode, 'UI element not found', evidence, { ref, element });
            console.log('Default validation - UI element not found:', payload);
            response.addTextResult(JSON.stringify(payload, null, 2));
            return;
          }

          locatorString = await generateLocatorString(ref, locator, true);

          result = await locator.evaluate((el: Element, code: string) => {
            try {
              const func = new Function('element', 'document', `'use strict'; ${code}`);
              const safeContext = {
                element: el,
                document,
                console: { log: () => {}, warn: () => {}, error: () => {} },
                setTimeout: undefined,
                setInterval: undefined,
                eval: undefined,
                Function: undefined,
                window: {
                  innerWidth: window.innerWidth,
                  innerHeight: window.innerHeight,
                  localStorage: window.localStorage,
                  sessionStorage: window.sessionStorage
                }
              };
              return func.call(safeContext, el, document);
            } catch (error) {
              return { error: error instanceof Error ? error.message : String(error), type: 'execution_error' };
            }
          }, jsCode);
        } else {
          // No ref/element — run jsCode with element as null
          const page = tab.page;
          result = await page.evaluate((code: string) => {
            try {
              const func = new Function('element', 'document', `'use strict'; ${code}`);
              return func.call(null, null, document);
            } catch (error) {
              return { error: error instanceof Error ? error.message : String(error), type: 'execution_error' };
            }
          }, jsCode);
        }

        const label = element || 'data';
        const validationResult = parseValidationResult(result, label);
        const evidence = [createValidationEvidence(label, jsCode, validationResult.evidenceMessage, {
          expectedValue: validationResult.expectedValue,
          actualValue: validationResult.actualValue,
          element,
          locatorString: locatorString || undefined,
        })];

        const payload = buildValidationPayload(label, jsCode, validationResult, evidence, ref && element ? { ref, element } : undefined);
        console.log('Default validation executed:', payload);
        response.addTextResult(JSON.stringify(payload, null, 2));

      } catch (error) {
        let locatorString = '';
        if (ref && element) {
          try {
            const { locator } = await tab.refLocator({ ref, element });
            locatorString = await generateLocatorString(ref, locator, true);
          } catch { /* ignore */ }
        }

        const label = element || 'data';
        const errorMessage = ref && element
          ? `Failed to execute JavaScript code on element "${element}".`
          : 'Failed to execute data validation JavaScript code.';
        console.log(`${errorMessage} Error: ${error instanceof Error ? error.message : String(error)}`);

        const evidence = [createValidationEvidence(label, jsCode, errorMessage, { element, locatorString: locatorString || undefined })];
        const payload = buildValidationErrorPayload(label, jsCode, error instanceof Error ? error.message : String(error), evidence, ref && element ? { ref, element } : undefined);
        console.error('Default validation error:', payload);
        response.addTextResult(JSON.stringify(payload, null, 2));
      }
    });
  },
});
