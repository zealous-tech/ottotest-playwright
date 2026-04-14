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
import { validateTabCountSchema } from '../helpers/schemas';

function compare(actual: number, operator: string, expected: number): boolean {
  switch (operator) {
    case 'equals': return actual === expected;
    case 'notEquals': return actual !== expected;
    default: return false;
  }
}

export const validate_tab_count = defineTabTool({
  capability: 'core',
  schema: {
    name: 'validate_tab_count',
    title: 'Validate Tab Count',
    description: 'Count the number of currently open browser tabs and validate the count against an expected value using the specified comparison operator.',
    inputSchema: validateTabCountSchema,
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    const { expectedCount, operator } = params;

    try {
      const context = tab.context;
      const allTabs = context.tabs();
      const actualCount = allTabs.length;

      const tabsWithInfo = await Promise.all(
          allTabs.map(async (tabItem: any, index: number) => {
            try {
              const tabUrl = await tabItem.page.url();
              const tabTitle = await tabItem.page.title();
              return { index, header: tabTitle, url: tabUrl };
            } catch {
              return { index, header: 'Unknown', url: 'unknown' };
            }
          })
      );

      const passed = compare(actualCount, operator, expectedCount);
      const status = passed ? 'pass' : 'fail';

      const operatorLabel = operator === 'equals' ? 'to equal' : 'to not equal';
      const openTabsList = tabsWithInfo.map((t: any) => t.url).join(', ');
      const evidence = passed
          ? `Tab count check passed: expected tab count ${operatorLabel} ${expectedCount} and got ${actualCount}. Open tabs: ${openTabsList}`
          : `Tab count check failed: expected tab count ${operatorLabel} ${expectedCount} but got ${actualCount}. Open tabs: ${openTabsList}`;

      const evidenceArray = [{
        command: JSON.stringify({
          toolName: 'validate_tab_count',
          arguments: { expectedCount, operator }
        }),
        message: evidence
      }];

      const payload = {
        expectedCount,
        operator,
        actualCount,
        summary: {
          total: 1,
          passed: status === 'pass' ? 1 : 0,
          failed: status === 'pass' ? 0 : 1,
          status,
          evidence: evidenceArray,
        },
        allTabs: tabsWithInfo.map((t: any) => ({
          index: t.index,
          header: t.header,
          url: t.url
        })),
      };
      console.log('Validate tab count:', payload);
      response.addTextResult(JSON.stringify(payload, null, 2));

    } catch (error) {
      const errorMessage = `Failed to validate tab count.`;
      console.log(`Failed to validate tab count. Error: ${error instanceof Error ? error.message : String(error)}`);

      const errorEvidence = [{
        command: JSON.stringify({
          toolName: 'validate_tab_count',
          arguments: { expectedCount, operator }
        }),
        message: errorMessage
      }];

      const errorPayload = {
        expectedCount,
        operator,
        summary: {
          total: 1,
          passed: 0,
          failed: 1,
          status: 'fail',
          evidence: errorEvidence,
        },
        error: error instanceof Error ? error.message : String(error),
      };
      console.error('Validate tab count error:', errorPayload);
      response.addTextResult(JSON.stringify(errorPayload, null, 2));
    }
  },
});
