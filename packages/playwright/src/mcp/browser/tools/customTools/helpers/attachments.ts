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

const HEADER_CONTENT_DISPOSITION = 'content-disposition';
const HEADER_ATTACHMENT_NAME = 'x-attachment-name';
const FALLBACK_BASE_URL = 'http://localhost';
const UPLOADS_DIR_NAME = '.otto-uploads';
const UPLOAD_SUBDIR_PREFIX = 'upload-';

export interface FetchedAttachment {
  buffer: Buffer;
  fileName: string;
  attachmentKey: string;
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

  const contentDisposition = res.headers.get(HEADER_CONTENT_DISPOSITION) || '';
  const fileNameMatch = contentDisposition.match(/filename="([^"]+)"/);
  const fileName = fileNameMatch ? fileNameMatch[1] : `attachment-${Date.now()}`;

  let attachmentKey = '';
  const headerKey = res.headers.get(HEADER_ATTACHMENT_NAME);
  if (headerKey) {
    try {
      attachmentKey = decodeURIComponent(headerKey);
    } catch {
      attachmentKey = headerKey;
    }
  }
  if (!attachmentKey) {
    try {
      const parsed = new URL(url, FALLBACK_BASE_URL);
      const segments = parsed.pathname.split('/').filter(Boolean);
      const last = segments.pop();
      if (last) {
        attachmentKey = decodeURIComponent(last);
      }
    } catch {}
  }
  if (!attachmentKey) {
    attachmentKey = fileName;
  }

  return { buffer: Buffer.from(arrayBuffer), fileName, attachmentKey };
}

function resolveUploadRoot(rootDir: string): string {
  const resolved = path.resolve(rootDir);
  return path.join(resolved, UPLOADS_DIR_NAME);
}

/**
 * Removes previous upload sub-directories inside the upload root.
 * Only removes entries whose names match the "upload-" prefix we create,
 * so stray files placed here by something else are left alone.
 */
function purgeStaleUploads(uploadRoot: string): void {
  if (!fs.existsSync(uploadRoot))
    return;
  for (const entry of fs.readdirSync(uploadRoot)) {
    if (!entry.startsWith(UPLOAD_SUBDIR_PREFIX))
      continue;
    try {
      fs.rmSync(path.join(uploadRoot, entry), { recursive: true, force: true });
    } catch { /* best-effort */ }
  }
}

export function downloadAttachmentsToLocalDir(attachments: FetchedAttachment[], rootDir: string): string[] {
  const uploadRoot = resolveUploadRoot(rootDir);
  purgeStaleUploads(uploadRoot);
  const dir = path.join(uploadRoot, `${UPLOAD_SUBDIR_PREFIX}${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return attachments.map(att => {
    const filePath = path.join(dir, att.fileName);
    fs.writeFileSync(filePath, att.buffer);
    return filePath;
  });
}
