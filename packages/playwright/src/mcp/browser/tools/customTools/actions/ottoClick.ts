import { z } from 'playwright-core/lib/mcpBundle';
import { formatObject } from 'playwright-core/lib/utils';
import { defineTabTool } from '../../tool';
import { elementSchema } from '../../snapshot';

const ottoClickSchema = elementSchema.extend({
    doubleClick: z.boolean().optional().describe('Whether to perform a double click instead of a single click'),
    button: z.enum(['left', 'right', 'middle']).optional().describe('Button to click, defaults to left'),
    modifiers: z.array(z.enum(['Alt', 'Control', 'ControlOrMeta', 'Meta', 'Shift'])).optional().describe('Modifier keys to press'),
});
//@ZEALOUS UPDATE
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
        const button = params.button;
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

        await tab.waitForCompletion(async () => {
            // Pre-detect checkbox/radio inputs to avoid double scrolling
            const inputInfo = await locator.evaluate((el: Element) => {
                const tag = (el as any).tagName?.toLowerCase?.();
                const type = (el as any).getAttribute?.('type');
                const id = (el as any).getAttribute?.('id');
                return {
                    isCheckboxOrRadio: tag === 'input' && (type === 'checkbox' || type === 'radio'),
                    id: id || null,
                };
            });

            // If it's a checkbox/radio with an ID, try clicking the associated label first
            if (inputInfo.isCheckboxOrRadio && inputInfo.id) {
                const label = tab.page.locator(`label[for="${inputInfo.id}"]`);
                const labelCount = await label.count();
                if (labelCount > 0) {
                    try {
                        await label.click({ button });
                        return;
                    } catch (e: any) {
                        // If label click fails, fall through to regular click handling
                    }
                }
            }

            try {
                if (params.doubleClick)
                    await locator.dblclick({ button });
                else
                    await locator.click({ button });
            } catch (e: any) {
                const msg = String(e?.message || e);
                const isIntercept = msg.includes('intercepts pointer events');
                const isDisabled = msg.includes('disabled') || msg.includes('is not enabled') || msg.includes('not clickable') || msg.includes('is disabled');

                if (isDisabled) {
                    // Force click on disabled elements for testing purposes
                    if (params.doubleClick)
                        await locator.dblclick({ button, force: true });
                    else
                        await locator.click({ button, force: true });
                    return;
                }

                if (isIntercept) {
                    if (inputInfo.isCheckboxOrRadio) {
                        await locator.check({ force: true });
                        return;
                    }
                    await locator.click({ button, force: true });
                    return;
                }

                // Unknown error, rethrow
                throw e;
            }
        });

        // Wait for page load to complete after click
        await tab.page.waitForLoadState('load');
    },
});

