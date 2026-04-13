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

const UPLOAD_ROOT = path.join(process.cwd(), '.otto-uploads');

export interface FetchedAttachment {
  buffer: Buffer;
  fileName: string;
}

export async function fetchAttachment(url: string): Promise<FetchedAttachment> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err: any) {
    throw new Error(`Failed to fetch attachment (network error): ${err?.message ?? err}. URL: ${url}`);
  }
  if (!res.ok)
    throw new Error(`Failed to fetch attachment: ${res.status} ${res.statusText}. URL: ${url}`);

  const arrayBuffer = await res.arrayBuffer();
  if (arrayBuffer.byteLength === 0)
    throw new Error(`Fetched attachment is empty (0 bytes). URL: ${url}`);

  const contentDisposition = res.headers.get('content-disposition') || '';
  const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/);
  const fileName = fileNameMatch ? fileNameMatch[1] : `attachment-${Date.now()}`;

  return { buffer: Buffer.from(arrayBuffer), fileName };
}

/**
 * Removes all previous upload directories inside UPLOAD_ROOT.
 */
function purgeStaleUploads(): void {
  if (!fs.existsSync(UPLOAD_ROOT))
    return;
  for (const entry of fs.readdirSync(UPLOAD_ROOT)) {
    const full = path.join(UPLOAD_ROOT, entry);
    try {
      fs.rmSync(full, { recursive: true, force: true });
    } catch {  }
  }
}

export function downloadAttachmentsToLocalDir(attachments: FetchedAttachment[]): string[] {
  purgeStaleUploads();
  const dir = path.join(UPLOAD_ROOT, `upload-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return attachments.map(att => {
    const filePath = path.join(dir, att.fileName);
    fs.writeFileSync(filePath, att.buffer);
    return filePath;
  });
}
