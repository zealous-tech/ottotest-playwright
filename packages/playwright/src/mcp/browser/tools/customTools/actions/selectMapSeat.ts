import { defineTabTool } from '../../tool';
import { seatSchema } from '../helpers/schemas';
import { isNodeInViewport, getMapHandle, getNodeViewportCoords, resolveSeatNodeId } from '../helpers/helpers';

export const select_map_seat = defineTabTool({
  capability: 'core',
  schema: {
    name: 'select_map_seat',
    title: 'MAP – Select Seat',
    description: 'Click on a seat on the seatmap. Assumes a section has already been selected so seat nodes are loaded. ' +
      'Supports four targeting modes: ' +
      '(1) section+row+seat all provided → clicks that exact seat (ID: S_<section>-<row>-<seat>); ' +
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
      params.state,
    );

    const [sec, row, seat] = nodeId.replace(/^S_/, '').split('-');
    response.addTextResult(JSON.stringify({ section: sec, row: row, seat: seat }));
    const { x, y } = await getNodeViewportCoords(page, mapHandle, nodeId);
    if (!isNodeInViewport(page, { x, y }))
      throw new Error(`Unable to perform click action on seat ${seat} on row ${row} in section ${sec} as the element is outside of the visible viewport`);
    await page.mouse.click(x, y);
  },
});
