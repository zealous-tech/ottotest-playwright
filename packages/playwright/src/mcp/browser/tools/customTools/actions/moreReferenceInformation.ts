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
import { z } from 'playwright-core/lib/mcpBundle';

import { defineTabTool } from '../../tool';

const refEntrySchema = z.object({
  ref: z.string().describe('Exact target element reference from the page snapshot'),
  element: z.string().optional().describe('Human-readable element description used to obtain permission to interact with the element'),
});

const moreReferenceInformationSchema = z.object({
  references: z.array(refEntrySchema).min(1).describe('Snapshot references to resolve; each maps to that node\'s outer HTML in the result object'),
});

export const more_reference_information = defineTabTool({
  capability: 'core',
  schema: {
    name: 'more_reference_information',
    title: 'More reference information',
    description: 'Resolve one or more page snapshot references and return an object mapping each reference string to the element\'s outer HTML',
    inputSchema: moreReferenceInformationSchema,
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    const { references } = moreReferenceInformationSchema.parse(params);
    const elements: Record<string, string> = {};
    const errors: Record<string, string> = {};

    await tab.waitForCompletion(async () => {
      await Promise.all(references.map(async entry => {
        try {
          const { locator } = await tab.refLocator(entry);
          const html = await locator.evaluate((el: Element) => el.outerHTML);
          elements[entry.ref] = html;
        } catch (e) {
          errors[entry.ref] = e instanceof Error ? e.message : String(e);
        }
      }));
    });

    const payload: { elements: Record<string, string>; errors?: Record<string, string> } = { elements };
    if (Object.keys(errors).length)
      payload.errors = errors;

    response.addCode(`// more_reference_information for ${references.length} reference(s)`);
    response.addTextResult(JSON.stringify(payload, null, 2));
  },
});
