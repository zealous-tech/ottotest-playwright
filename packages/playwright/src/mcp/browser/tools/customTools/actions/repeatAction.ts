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
import { repeatActionSchema } from '../helpers/schemas';
import { ELEMENT_ATTACHED_TIMEOUT } from '../helpers/utils';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const repeat_action = defineTabTool({
  capability: 'core',
  schema: {
    name: 'repeat_action',
    title: 'Repeat Action',
    description: 'Repeats a user action (click, hover, fill, press) using for / while / do-while semantics',
    inputSchema: repeatActionSchema,
    type: 'readOnly',
  },
  handle: async (tab, rawParams, response) => {
    const { loop, action, limits } = repeatActionSchema.parse(rawParams);

    const maxIterations = limits?.maxIterations ?? 20;
    const evidence: any[] = [];
    const startTime = Date.now();
    let iteration = 0;
    if (loop.type === 'for') {
      if (typeof loop.iterations !== 'number')
        throw new Error('repeat_action: "iterations" is required when loop.type is "for"');
    }
    if (loop.type === 'while' || loop.type === 'do-while') {
      if (!loop.until)
        throw new Error(`repeat_action: "until" condition is required when loop.type is "${loop.type}"`);
    }
    const runAction = async () => {
      const { locator } = await tab.refLocator({
        ref: action.ref,
        element: action.element,
      });

      switch (action.type) {
        case 'click':
          await locator.click();
          break;
        case 'hover':
          await locator.hover();
          break;
        case 'fill':
          if (action.value === undefined)
            throw new Error('Fill action requires a value');
          await locator.fill(action.value);
          break;
        case 'press':
          if (action.value === undefined)
            throw new Error('Press action requires a value');
          await locator.press(action.value);
          break;
        default:
          throw new Error(`Unsupported action type: ${action.type}`);
      }
    };
    const evaluateCondition = async () => {
      if (!loop.until)
        return false;
      const { element, ref, assertion, negate } = loop.until;
      const { locator } = await tab.refLocator({ ref, element });

      let result = false;

      switch (assertion.assertionType) {
        case 'toBeVisible':
          result = await locator.isVisible();
          break;
        case 'toBeHidden':
          result = await locator.isHidden();
          break;
        case 'toBeEnabled':
          result = await locator.isEnabled();
          break;
        case 'toBeDisabled':
          result = await locator.isDisabled();
          break;
        default:
          throw new Error(`Unsupported assertion type: ${assertion.assertionType}`);
      }
      return negate ? !result : result;
    };

    const loopStart = async () => {
      if (loop.type === 'for') {
        while (iteration < loop.iterations!) {
          await runAction();
          iteration++;
          evidence.push({ iteration, action, message: `Performed for-loop iteration ${iteration}` });
          await sleep(300);
        }
      } else if (loop.type === 'while') {
        while (iteration < maxIterations) {
          const conditionMet = await evaluateCondition();
          if (conditionMet)
            break;
          await runAction();
          iteration++;
          evidence.push({ iteration, action, message: `Performed while-loop iteration ${iteration}` });
          await sleep(100);
          if (Date.now() - startTime > ELEMENT_ATTACHED_TIMEOUT)
            break;
        }
      } else if (loop.type === 'do-while') {
        do {
          await runAction();
          iteration++;
          evidence.push({ iteration, action, message: `Performed do-while iteration ${iteration}` });
          await sleep(100);
          const conditionMet = await evaluateCondition();
          if (conditionMet)
            break;
          if (iteration >= maxIterations)
            break;
          if (Date.now() - startTime > ELEMENT_ATTACHED_TIMEOUT)
            break;
        } while (true);
      }
    };

    await tab.waitForCompletion(loopStart);

    const toolResponse = {
      action,
      loop,
      summary: {
        total: iteration,
        passed: iteration > 0 ? 1 : 0,
        failed: iteration > 0 ? 0 : 1,
        status: iteration > 0 ? 'pass' : 'fail',
        evidence,
      },
      checks: [
        {
          property: 'action-execution',
          operator: loop.type,
          expected: loop.type === 'for' ? `${loop.iterations} iterations` : 'condition met or maxIterations reached',
          actual: iteration,
          result: iteration > 0 ? 'pass' : 'fail',
        },
      ],
    };
    response.addTextResult(JSON.stringify(toolResponse, null, 2));
  },
});
