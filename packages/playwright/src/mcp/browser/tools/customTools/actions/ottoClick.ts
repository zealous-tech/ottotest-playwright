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
import { formatObject } from 'playwright-core/lib/utils';

import { defineTabTool } from '../../tool';
import { ottoClickSchema } from '../helpers/schemas';

export const otto_click = defineTabTool({
  capability: 'core',
  schema: {
    name: 'otto_browser_click',
    title: 'Click',
    description: 'Perform click on a web page',
    inputSchema: ottoClickSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();

    const { locator, resolved } = await tab.refLocator(params);
    const options = {
      button: params.button,
      modifiers: params.modifiers,
    };
    const formatted = formatObject(options, ' ', 'oneline');
    const optionsAttr = formatted !== '{}' ? formatted : '';

    if (params.doubleClick)
      response.addCode(`await page.${resolved}.dblclick(${optionsAttr});`);
    else
      response.addCode(`await page.${resolved}.click(${optionsAttr});`);

    const timeoutClick = 2000;

    await tab.waitForCompletion(async () => {
      const inputInfo = await locator.evaluate((el: Element) => {
        const tag = (el as any).tagName?.toLowerCase?.();
        const type = (el as any).getAttribute?.('type');
        const id = (el as any).getAttribute?.('id');
        return {
          isCheckboxOrRadio: tag === 'input' && (type === 'checkbox' || type === 'radio'),
          id: id || null,
        };
      });

      let target = locator;
      if (inputInfo.isCheckboxOrRadio && inputInfo.id) {
        const label = tab.page.locator(`label[for="${inputInfo.id}"]`);
        if (await label.count() > 0) {
          target = label;
        }
      }

      const performClick = async (force = false) => {
        if (params.doubleClick)
          await target.dblclick({ ...options, force, timeout: timeoutClick });
        else
          await target.click({ ...options, force, timeout: timeoutClick });
      };

      await target.waitFor({ state: 'visible' });

      try {
        await target.click({ trial: true, timeout: timeoutClick });
        await performClick();
      } catch (e: any) {
        await performClick(true);
      }
    });

    await tab.page.waitForLoadState('load');
  },
});
