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
import { defineTabTool } from '../../tool';
import {
  checkElementVisibilityInAllFrames,
  checkLocatorVisibilityInAllFrames,
} from '../helpers/helpers';
import { getTimeout } from '../helpers/utils';
import { validateElementInWholePageSchema } from '../helpers/schemas';

export const validate_element_in_whole_page = defineTabTool({
  capability: 'core',
  schema: {
    name: 'validate_element_in_whole_page',
    title: 'Validate element in whole page',
    description: 'Validate that element with specific role and accessible name exists or does not exist anywhere on the page. Use matchType "exist" to verify the element exists at least once (search stops on first match); use "not-exist" to verify it appears in no frame.',
    inputSchema: validateElementInWholePageSchema,
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    const { element, role, accessibleName, locator, matchType } = validateElementInWholePageSchema.parse(params);

    await tab.waitForCompletion(async () => {
      // Get locator for whole page and generate locator string
      const locatorString = locator ?? 'page.locator("body")';
      const locatorStrength = locator ? 'WEAK' : 'STRONG';

      // Helper function to create evidence command
      const createEvidenceCommand = () => JSON.stringify({
        description: 'Evidence showing how validation was performed',
        toolName: 'validate_element_in_whole_page',
        locator: locatorString,
        locatorStrength,
        args: {
          role,
          accessibleName,
          matchType,
          ...(locator ? { locator } : {}),
        },
      });

      let passed = false;
      let evidenceMessage = '';
      let found = false;

      const timeout = getTimeout(tab.context);

      try {
        // early exit on first match for positive checks;
        // full scan for not-exist across all frames.
        const results = locator
          ? await checkLocatorVisibilityInAllFrames(tab.page, locator, matchType, timeout)
          : await checkElementVisibilityInAllFrames(tab.page, role, accessibleName, matchType, timeout);

        found = results.some(r => r.found);

        passed = matchType === 'exist' ? found : !found;

        if (passed) {
          evidenceMessage = matchType === 'exist'
            ? `The element "${element}" was found on the page.`
            : `The element "${element}" was correctly not found on the page.`;
        } else {
          evidenceMessage = matchType === 'exist'
            ? `The element "${element}" was not found on the page.`
            : `The element "${element}" was found on the page — it should not appear.`;
        }

      } catch (error) {
        passed = false;
        const errorMessage = error instanceof Error ? error.message : String(error);
        evidenceMessage = `Failed to find element "${element}" on the page.`;

        console.log(`Failed to validate element in whole page for "${element}". Error: ${errorMessage}`);
      }

      // Generate evidence as array with single object
      const evidence = [{
        command: createEvidenceCommand(),
        message: evidenceMessage
      }];

      // Generate final payload
      const payload = {
        element,
        role,
        accessibleName,
        matchType,
        summary: {
          total: 1,
          passed: passed ? 1 : 0,
          failed: passed ? 0 : 1,
          status: passed ? 'pass' : 'fail',
          evidence,
        },
        checks: [{
          property: 'element-presence',
          operator: matchType,
          expected: matchType === 'not-exist' ? 'not-present' : 'present',
          actual: found ? 'present' : 'not-present',
          result: passed ? 'pass' : 'fail',
        }],
        scope: 'whole-page-all-frames',
        searchMethod: locator ? 'checkLocatorVisibilityInAllFrames' : 'checkElementVisibilityInAllFrames',
      };

      console.log('Validate element in whole page:', payload);
      response.addTextResult(JSON.stringify(payload, null, 2));
    });
  },
});
