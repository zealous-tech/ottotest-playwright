import { defineTabTool } from '../../tool';
import { sectionSchema } from '../helpers/schemas';
import { getMapHandle, getNodeViewportCoords, resolveSectionNodeId } from '../helpers/helpers';

export const hover_map_section = defineTabTool({
  capability: 'core',
  schema: {
    name: 'hover_map_section',
    title: 'MAP – Hover Section',
    description: 'Hover the mouse over a section (or GA section) on the seatmap without clicking. ' +
      'When "section" is omitted a random available section is chosen. ' +
      'Use sectionType="general_admission" for GA sections.',
    inputSchema: sectionSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    const page = tab.page;
    const mapHandle = await getMapHandle(page, params.mapSelector, params.containerSelector);
    const nodeId = await resolveSectionNodeId(page, mapHandle, params.section, params.sectionType);

    response.addTextResult(`Hovered section: ${nodeId.replace(/^S_/, '')}`);
    const { x, y } = await getNodeViewportCoords(page, mapHandle, nodeId);
    await page.mouse.move(x, y);
  },
});
