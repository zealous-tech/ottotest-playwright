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
import { checkAlertInSnapshotSchema } from '../helpers/schemas';
import { ValidationPayload } from '../common/common';

const CODE_COMMENT_DIALOG_VALIDATION = '// Dialog Validation';
const MODAL_STATE_DIALOG = 'dialog';
const MATCH_TYPE_CONTAINS = 'contains';
const MATCH_TYPE_NOT_CONTAINS = 'not-contains';
const STATUS_PASS = 'pass' as const;
const STATUS_FAIL = 'fail' as const;

export const validate_alert_in_snapshot = defineTabTool({
  capability: 'core',
  schema: {
    name: 'validate_alert_in_snapshot',
    title: 'Validate Alert in Snapshot',
    description: 'Validate if an alert dialog is present in the current page snapshot',
    inputSchema: checkAlertInSnapshotSchema,
    type: 'readOnly',
  },
  handle: async (tab, params, response) => {
    const { element, matchType, hasText } = checkAlertInSnapshotSchema.parse(params);

    try {
      let codeStr = '';
      if (hasText) {
        codeStr = `${CODE_COMMENT_DIALOG_VALIDATION}\nexpect(lastDialogMessage).${matchType === MATCH_TYPE_NOT_CONTAINS ? 'not.' : ''}toContain(${JSON.stringify(hasText)});\nlastDialogMessage = null; // Reset after validation`;
      } else {
        codeStr = `${CODE_COMMENT_DIALOG_VALIDATION}\nexpect(lastDialogMessage).not.toBeNull();\nlastDialogMessage = null; // Reset after validation`;
      }
      response.addCode(codeStr);

      // Get the current snapshot
      const tabSnapshot = await tab.captureSnapshot();

      // Check if alert dialog exists using modalStates
      const dialogState = tabSnapshot.modalStates.find(state => state.type === MODAL_STATE_DIALOG);
      const alertExists = !!dialogState;
      // Get alert dialog text if it exists
      const alertText = dialogState ? dialogState.description : null;

      // Check text if hasText is provided and alert exists
      let textCheckPassed = true;
      if (hasText && alertExists && alertText) {
        textCheckPassed = alertText.includes(hasText);
      }

      // Apply match type logic
      let passed: boolean;
      if (matchType === MATCH_TYPE_CONTAINS)
        passed = alertExists && (hasText ? textCheckPassed : true);
      else if (matchType === MATCH_TYPE_NOT_CONTAINS)
        passed = !alertExists;
      else
        passed = false;

      // Generate evidence message
      let evidenceMessage = '';
      if (matchType === MATCH_TYPE_CONTAINS) {
        if (passed) {
          if (hasText)
            evidenceMessage = `Alert dialog found with text: "${alertText}" containing expected: "${hasText}"`;
          else
            evidenceMessage = `Alert dialog found with text: "${alertText}"`;
        } else {
          if (hasText)
            evidenceMessage = `Alert dialog found but text "${hasText}" not found in: "${alertText}"`;
          else
            evidenceMessage = `Alert dialog not found in snapshot`;
        }
      } else { // not-contains
        if (passed)
          evidenceMessage = `Alert dialog was not found as expected`;
        else
          evidenceMessage = `Alert dialog was not expected, but it was ${hasText ? `found with text: "${alertText}"` : 'found'}.`;
      }

      // Generate evidence as array of objects
      const evidence = [{
        command: JSON.stringify({
          toolName: 'validate_alert_in_snapshot',
          arguments: {
            expectedText: hasText || null,
            matchType: matchType
          }
        }),
        message: evidenceMessage
      }];

      const payload: ValidationPayload = {
        status: passed ? STATUS_PASS : STATUS_FAIL,
        evidence,
      };

      const resultString = JSON.stringify(payload, null, 2);
      response.addTextResult(resultString);
    } catch (error) {
      const errorMessage = `Failed to check alert dialog in snapshot.`;
      console.error(`Failed to check alert dialog in snapshot: ${error instanceof Error ? error.message : String(error)}`);
      const errorEvidence = [{
        command: JSON.stringify({
          toolName: 'validate_alert_in_snapshot',
          expectedText: hasText || null,
          matchType: matchType
        }),
        message: errorMessage
      }];
      const errorPayload: ValidationPayload = {
        status: STATUS_FAIL,
        evidence: errorEvidence
      };

      console.error('Check alert in snapshot error:', errorPayload);
      const errorResultString = JSON.stringify(errorPayload, null, 2);
      response.addTextResult(errorResultString);
      console.log('Error result added to response');
      console.log('Function completed with error');
    }
  },
});
