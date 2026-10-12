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
import { defineTabTool } from './tool';

const CONSOLE_LOG_LEVELS = ['error', 'warning', 'info', 'debug'] as const;
type ConsoleLogLevel = (typeof CONSOLE_LOG_LEVELS)[number];
const DEFAULT_CONSOLE_LOG_LEVEL: ConsoleLogLevel = 'info';

const ALLOWED_LEVELS_SNIPPET = "['error', 'warning', 'info', 'debug']";
const TYPE_TO_LEVEL_MAP_SNIPPET = "{ assert: 'error', error: 'error', warning: 'warning', info: 'info', log: 'info', dir: 'info', table: 'info', time: 'info', count: 'info', debug: 'debug', trace: 'debug' }";
const CODE_COMMENT_GET_CONSOLE_MESSAGES = '// Get console messages';

function buildFilterConsoleMessagesCode(level: ConsoleLogLevel): string {
  return `const consoleMessages = capturedConsoleMessages.filter(msg => {
  const allowed = ${ALLOWED_LEVELS_SNIPPET}.slice(0, ${ALLOWED_LEVELS_SNIPPET}.indexOf('${level}') + 1);
  const map = ${TYPE_TO_LEVEL_MAP_SNIPPET};
  return allowed.includes(map[msg.type()] || 'debug');
});`;
}

const console = defineTabTool({
  capability: 'core',
  schema: {
    name: 'browser_console_messages',
    title: 'Get console messages',
    description: 'Returns all console messages',
    inputSchema: z.object({
      level: z.enum(CONSOLE_LOG_LEVELS).default(DEFAULT_CONSOLE_LOG_LEVEL).describe('Level of the console messages to return. Each level includes the messages of more severe levels. Defaults to "info".'),
      filename: z.string().optional().describe('Filename to save the console messages to. If not provided, messages are returned as text.'),
    }),
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    const level: ConsoleLogLevel = (params.level as ConsoleLogLevel) ?? DEFAULT_CONSOLE_LOG_LEVEL;
    const filterCode = buildFilterConsoleMessagesCode(level);

    if (params.filename) {
      response.addCode(
`${CODE_COMMENT_GET_CONSOLE_MESSAGES}
${filterCode}
const formattedLogs = consoleMessages.map(msg => \`[\${msg.type().toUpperCase()}] \${msg.text()}\`).join('\\n');
fs.writeFileSync(path.join(__dirname, '${params.filename}'), formattedLogs, 'utf8');`);
    } else {
      response.addCode(
`${CODE_COMMENT_GET_CONSOLE_MESSAGES}
${filterCode}
console.log('Captured console messages (${level}):', consoleMessages.map(msg => \`[\${msg.type().toUpperCase()}] \${msg.text()}\`).join('\\n'));`);
    }

    const messages = await tab.consoleMessages(params.level);
    const text = messages.map(message => message.toString()).join('\n');
    await response.addResult({ text, suggestedFilename: params.filename });
  },
});

export default [
  console,
];
