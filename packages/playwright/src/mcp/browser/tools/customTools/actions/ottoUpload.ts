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
import { defineTool } from '../../tool';
import { fetchAttachment, downloadAttachmentsToLocalDir } from '../helpers/attachments';

const ottoUploadSchema = z.object({
  attachmentUrls: z.array(z.string()).optional().describe(
    'Array of full attachment URLs to upload. The files will be fetched and uploaded to the browser file chooser. If omitted, file chooser is cancelled.'
  ),
});

export const otto_upload = defineTool({
  capability: 'core',

  schema: {
    name: 'otto_browser_file_upload',
    title: 'Upload files',
    description: 'Upload one or multiple files by URL. Files are fetched from the provided URLs and uploaded via the browser file chooser.',
    inputSchema: ottoUploadSchema,
    type: 'action',
  },

  handle: async (context, params, response) => {
    response.setIncludeSnapshot();
    const tab = await context.ensureTab();

    const modalState = tab.modalStates().find(state => state.type === 'fileChooser');
    if (!modalState)
      throw new Error('No file chooser visible');

    tab.clearModalState(modalState);

    if (!params.attachmentUrls || params.attachmentUrls.length === 0) {
      response.addCode('// File chooser cancelled (no attachments provided)');
      return;
    }

    const rootDir = context.firstRootPath() ?? process.cwd();
    const attachments = await Promise.all(params.attachmentUrls.map(fetchAttachment));
    const localPaths = downloadAttachmentsToLocalDir(attachments, rootDir);

    response.addCode(`await fileChooser.setFiles(${JSON.stringify(localPaths)})`);

    await tab.waitForCompletion(async () => {
      await modalState.fileChooser.setFiles(localPaths);
    });
  },
});
