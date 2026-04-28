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

import fs from 'fs';
import path from 'path';
import { defineTool } from '../../tool';
import { fileDownloadSchema } from '../helpers/schemas';

export const otto_download = defineTool({
  capability: 'core',

  schema: {
    name: 'otto_browser_file_download',
    title: 'Get downloaded file',
    description: 'Capture the most recently downloaded file from the browser and upload it to the command hub. The hub will parse the file (CSV, Excel, etc.) and make the data available for subsequent validations via ${<fileName>}.',
    inputSchema: fileDownloadSchema,
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    const tab = context.currentTab();
    if (!tab)
      throw new Error('No open page available');

    if (!params.hubUploadUrl)
      throw new Error('hubUploadUrl is required. This should be automatically injected by the command hub.');

    let downloads = (tab as any)._downloads as { finished: boolean; outputFile: string; download: { suggestedFilename(): string } }[];
    const timeoutMs = (params.timeout ?? 30) * 1000;

    if (params.waitForDownload) {
      const startCount = downloads.length;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        downloads = (tab as any)._downloads;
        const lastDownload = downloads[downloads.length - 1];
        if (downloads.length > startCount && lastDownload?.finished)
          break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const finishedDownloads = downloads.filter(d => d.finished);
    if (finishedDownloads.length === 0)
      throw new Error('No completed downloads found. Make sure a download was triggered (e.g., by clicking an export button) before calling this tool.');

    const lastDownload = finishedDownloads[finishedDownloads.length - 1];
    const filePath = lastDownload.outputFile;
    const fileName = lastDownload.download.suggestedFilename();

    if (!fs.existsSync(filePath))
      throw new Error(`Downloaded file not found at "${filePath}". It may have been cleaned up.`);

    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(fileName).toLowerCase().replace('.', '');

    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(fileBuffer)]), fileName);

    const uploadRes = await fetch(params.hubUploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Failed to upload downloaded file to hub: ${uploadRes.status} ${errText}`);
    }

    const hubResult = await uploadRes.json();

    response.addTextResult(JSON.stringify({
      success: true,
      fileName: params.fileName,
      originalFileName: fileName,
      fileSize: fileBuffer.length,
      fileType: ext,
      ...hubResult,
    }, null, 2));
  },
});
