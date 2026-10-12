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
import { textExtractionSchema } from '../helpers/schemas';
import { generateLocatorString } from '../helpers/helpers';
import { extractTextValue } from '../helpers/playwrightSharedHelpers';

export const text_extraction = defineTabTool({
  capability: 'core',
  schema: {
    name: 'text_extraction',
    title: 'Text Extraction',
    description: 'Extract plain text into a variable (referenced later as ${name}) from either an inline text source ("data", e.g. ${lastAPIResponse} or a stored variable) or a page element ("ref" + "element"). Optionally narrow the text with character indices and/or a cachable regular expression (capture group 1 is used when present). Like data_extraction, but works on plain/unstructured text (page elements or raw API/text data) instead of JSON paths.',
    inputSchema: textExtractionSchema,
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    const { name, data, ref, element, regex, regexFlags, startIndex, endIndex, useInnerText } = textExtractionSchema.parse(params);

    const extract = async (sourceText: string) => {
      let extractedValue: string;
      try {
        extractedValue = extractTextValue(sourceText, startIndex, endIndex, regex, regexFlags);
      } catch (error: any) {
        response.addTextResult(JSON.stringify({
          success: false,
          error: error.message || String(error),
          extractedData: null,
          data: sourceText,
        }, null, 2));
        return;
      }

      const toolResult = {
        success: true,
        extractedData: {
          value: extractedValue,
          variableName: `\$\{${name}\}`,
        },
        data: sourceText,
      };

      // Generate Playwright code
      let codeStr = '';
      if (data !== undefined) {
        codeStr += `let ${name} = ${JSON.stringify(data)};\n`;
      } else {
        const locatorStr = await generateLocatorString(ref!, element!);
        codeStr += `let ${name} = await ${locatorStr}.${useInnerText ? 'innerText' : 'textContent'}() ?? '';\n`;
      }
      if (startIndex !== undefined || endIndex !== undefined || regex !== undefined) {
        codeStr += `
{
${extractTextValue.toString()}
${name} = extractTextValue(${name}, ${startIndex}, ${endIndex}, ${regex ? JSON.stringify(regex) : 'undefined'}, ${regexFlags ? JSON.stringify(regexFlags) : 'undefined'});
}
`;
      }
      response.addCode(codeStr.trim());

      response.addTextResult(JSON.stringify(toolResult, null, 2));
    };

    // Inline plain-text source (e.g. ${lastAPIResponse}, a stored variable, or a literal).
    if (data !== undefined) {
      await extract(data);
      return;
    }

    // Page element source.
    await tab.waitForCompletion(async () => {
      const { locator } = await tab.refLocator({ ref: ref!, element: element! });

      let sourceText: string;
      try {
        const raw = useInnerText ? await locator.innerText() : await locator.textContent();
        sourceText = raw ?? '';
      } catch (error) {
        response.addTextResult(JSON.stringify({
          success: false,
          error: `Failed to read text from element "${element}": ${error instanceof Error ? error.message : String(error)}`,
          extractedData: null,
        }, null, 2));
        return;
      }

      await extract(sourceText);
    });
  },
});
