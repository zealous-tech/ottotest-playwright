import { defineTabTool } from '../../tool';
import { seatSchema } from '../helpers/schemas';
import { getMapHandle, getNodeViewportCoords, resolveSeatNodeId } from '../helpers/helpers';

export const hover_map_seat = defineTabTool({
  capability: 'core',
  schema: {
    name: 'hover_map_seat',
    title: 'MAP – Hover Seat',
    description: 'Hover the mouse over a seat on the seatmap without clicking. Assumes a section has already been selected so seat nodes are loaded. ' +
      'Supports four targeting modes: ' +
      '(1) section+row+seat all provided → hovers that exact seat (ID: S_<section>-<row>-<seat>); ' +
      '(2) section+row provided → random available seat within that row, optionally filtered by tag; ' +
      '(3) section only → random available seat within that section, optionally filtered by tag; ' +
      '(4) nothing provided → random available seat across the whole map, optionally filtered by tag.',
    inputSchema: seatSchema,
    type: 'input',
  },

  handle: async (tab, params, response) => {
    response.setIncludeSnapshot();
    const page = tab.page;
    const mapHandle = await getMapHandle(page, params.mapSelector, params.containerSelector);
    const nodeId = await resolveSeatNodeId(
      page,
      mapHandle,
      params.section,
      params.row,
      params.seat,
      params.tag,
    );

    const [sec, row, seat] = nodeId.replace(/^S_/, '').split('-');
    response.addTextResult(JSON.stringify({ section: sec, row: row, seat: seat }));
    const { x, y } = await getNodeViewportCoords(page, mapHandle, nodeId);
    await page.mouse.move(x, y);
  },
});
