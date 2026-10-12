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
import { dataExtractionSchema } from '../helpers/schemas';
import { extractJsonPathValue } from '../helpers/playwrightSharedHelpers';

export const data_extraction = defineTabTool({
  capability: 'core',
  schema: {
    name: 'data_extraction',
    title: 'Data Extraction',
    description: 'Extract and store  value from data object using JSON path with $$ prefix for variable naming. If jsonPath is not provided, stores the data as is without JSON parsing',
    inputSchema: dataExtractionSchema,
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    const { name, data, jsonPath } = dataExtractionSchema.parse(params);

    let extractedValue;
    let parsedResponseData;

    if (jsonPath) {
      // If jsonPath is provided, parse as JSON and extract using path
      try {
        parsedResponseData = JSON.parse(data);
      } catch (error) {
        response.addTextResult(JSON.stringify({
          success: false,
          error: `Failed to parse data as JSON: ${error.message}`,
          extractedData: null
        }, null, 2));
        return;
      }

      try {
        extractedValue = extractJsonPathValue(parsedResponseData, jsonPath);
      } catch (error) {
        response.addTextResult(JSON.stringify({
          success: false,
          error: `Failed to extract value using JSON path "${jsonPath}": ${error.message}`,
          extractedData: null
        }, null, 2));
        return;
      }
    } else {
      // If jsonPath is not provided, return data as is
      extractedValue = data;
      parsedResponseData = data;
    }

    const toolResult = {
      success: true,
      extractedData: {
        value: extractedValue,
        variableName: `\$\{${name}\}`,
      },
      data: parsedResponseData,
    };

    let codeStr = `const data_${name} = ${JSON.stringify(data)};\n`;
    if (jsonPath) {
        codeStr += `
const parsed_${name} = JSON.parse(data_${name});
let ${name};
${extractJsonPathValue.toString()}
${name} = extractJsonPathValue(parsed_${name}, ${JSON.stringify(jsonPath)});
`;
    } else {
        codeStr += `const ${name} = data_${name};\n`;
    }
    response.addCode(codeStr.trim());

    response.addTextResult(JSON.stringify(toolResult, null, 2));
  },
});
