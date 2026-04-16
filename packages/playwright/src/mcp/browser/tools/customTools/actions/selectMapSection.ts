import { defineTabTool } from '../../tool';
import { sectionSchema } from '../helpers/schemas';
import { getMapHandle, getNodeViewportCoords, resolveSectionNodeId } from '../helpers/helpers';

export const select_map_section = defineTabTool({
  capability: 'core',
  schema: {
    name: 'select_map_section',
    title: 'MAP – Select Section',
    description: 'Click on a section (or GA section) on the seatmap. ' +
      'When "section" is omitted a random available section is selected. ' +
      'Use sectionType="general_admission" for GA sections.',
    inputSchema: sectionSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    const page = tab.page;
    const mapHandle = await getMapHandle(page, params.mapSelector, params.containerSelector);
    const nodeId = await resolveSectionNodeId(page, mapHandle, params.section, params.sectionType);

    response.addTextResult(JSON.stringify({ section: nodeId.replace(/^S_/, '') }));
    const { x, y } = await getNodeViewportCoords(page, mapHandle, nodeId);
    await page.mouse.click(x, y);
    await page.waitForTimeout(2000);
  },
});
