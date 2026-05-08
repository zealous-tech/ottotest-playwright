import { defineTabTool } from '../../tool';
import {
  getMapHandle,
  resolveSeatNodeId,
  resolveSectionNodeId,
} from '../helpers/helpers';
import { validateMapNodeSchema } from '../helpers/schemas';
import { isHexColorInRange } from '../helpers/utils';

/**
 * Hardcoded mapping from seat tag → expected icon name.
 * Used to validate that the actual style's "icon" field matches what is expected
 * for a given tag. Tags not present in this map are expected to have no icon.
 */
const SEAT_ICON_MAP: Record<string, string> = {
  accessible:           'adaicon',
  custom:               'pricerecommendationnicon',
  demandtickets:        'demandticketsicon',
  filteredaccessible:   'adaicon',
  filteredcustom:       'pricerecommendationnicon',
  filtereddemandtickets:'demandticketsicon',
  filteredflashseats:   'resaleicon',
  filteredpremium:      'premicon',
  filteredpremiumvip:   'vipicon',
  filteredseatonly:     'seatonlyicon',
  filteredstandard:     'selectedicon',
  flashseats:           'resaleicon',
  none:                 'selectedicon',
  premium:              'premicon',
  premiumvip:           'vipicon',
  seatonly:             'seatonlyicon',
  standard:             'selectedicon',
};



export const validate_seat_section_on_map = defineTabTool({
  capability: 'core',
  schema: {
    name: 'validate_seat_section_on_map',
    title: 'MAP – Validate Node Style & State',
    description:
      'Validates the style and state of a seat, section, or GA node on the seatmap. ' +
      'Use expectedStyles to check fillStyle, textFillStyle, or icon; use expectedStates to check tag, state, or hover.',
    inputSchema: validateMapNodeSchema,
    type: 'readOnly',
  },

  handle: async (tab, params, response) => {
    const page = tab.page;
    const mapHandle = await getMapHandle(page, params.mapSelector, params.containerSelector);

    const expectedStyles = params.expectedStyles ?? {};
    const expectedStates = params.expectedStates ?? {};
    const hasExpected    =
      Object.keys(expectedStyles).length > 0 ||
      Object.keys(expectedStates).length > 0;

    if (!hasExpected) {
      response.addTextResult(JSON.stringify({
        summary: {
          total:  0,
          passed: 0,
          failed: 0,
          status: 'fail',
          evidence: [{
            command: JSON.stringify({ nodeType: params.nodeType }),
            message: 'No expectedStyles or expectedStates provided — nothing to validate.',
          }],
        },
      }, null, 2));
      return;
    }

    // ── Type defs ────────────────────────────────────────────────────────────
    type Target   = { section?: string; row?: string; seat?: string };
    type ColorRange = { from: string; to: string; negate?: boolean };
    type ExactParam = { value: string; negate?: boolean };
    type StyleCheckConfig =
      | { property: string; type: 'color'; actual: (style: any) => string | null }
      | { property: string; type: 'exact'; resolveExpected: (v: any) => any; actual: (style: any) => any };
    type Check = {
      property:  string;
      expected:  any;
      actual:    any;
      result:    'pass' | 'fail';
      paramPath: string;
      target:    Target;
    };

    const styleCheckConfigs: Record<string, StyleCheckConfig> = {
      fillStyle: {
        property: 'fillStyle',
        type:     'color',
        actual:   s => s.fillStyle ?? null,
      },
      textFillStyle: {
        property: 'textFillStyle',
        type:     'color',
        actual:   s => s.textFillStyle ?? null,
      },
      iconTag: {
        property:        'icon',
        type:            'exact',
        resolveExpected: v => SEAT_ICON_MAP[v] ?? null,
        actual:          s => s.icon ?? null,
      },
    };

    const targetLabel = (t: Target): string =>
      [t.section && `section ${t.section}`, t.row && `row ${t.row}`, t.seat && `seat ${t.seat}`]
        .filter(Boolean).join(', ');

    // ── Loop over targets ────────────────────────────────────────────────────
    const allChecks:    Check[]  = [];
    const errorEvidence: Array<{ command: string; message: string }> = [];

    for (const target of params.targets ?? [{}]) {

      // 1. Resolve nodeId
      let nodeId: string;
      try {
        if (params.nodeType === 'seat') {
          nodeId = await resolveSeatNodeId(page, mapHandle, target.section, target.row, target.seat, undefined);
        } else {
          nodeId = await resolveSectionNodeId(page, mapHandle, target.section, params.nodeType);
        }
      } catch (err: any) {
        errorEvidence.push({
          command: JSON.stringify({ nodeType: params.nodeType, ...target, expectedStyles, expectedStates }),
          message: `${params.nodeType === 'seat' ? 'Seat' : 'Section'} resolution failed (${targetLabel(target)}): ${err.message}`,
        });
        continue;
      }

      // 2. Evaluate node in browser
      const evalResult = await page.evaluate(
        ({ map, nodeId, nodeType }: { map: any; nodeId: string; nodeType: string }) => {
          const node = map.getNodeById(nodeId);
          if (!node)
            return { error: `${nodeType === 'seat' ? 'Seat' : 'Section'} "${nodeId}" not found in map` } as any;

          const state: string       = node.state       || 'available';
          const tag: string         = node.tag         || 'none';
          const isHovered: boolean  = !!node.hover;
          const description: string = node.description || '';
          const hoverKey: string    = isHovered ? 'hover' : 'normal';

          const stylesArray: any[] = map.getStyles();
          const arrayIndex = nodeType === 'seat' ? 1 : 0;
          const typeKey    = nodeType === 'general_admission' ? 'general_admission' : nodeType;
          const stylePath  = `[${arrayIndex}].${typeKey}.${state}.${hoverKey}.${tag}`;

          let cursor: any = stylesArray[arrayIndex];
          let currentPath = `styles[${arrayIndex}]`;

          for (const key of [typeKey, state, hoverKey, tag]) {
            const parent = cursor;
            cursor = cursor?.[key];
            currentPath += `.${key}`;
            if (!cursor)
              return { error: `${currentPath} does not exist. Available keys: ${Object.keys(parent || {}).join(', ')}`, state, tag, isHovered, stylePath };
          }

          return { nodeId, nodeType, state, tag, isHovered, description, stylePath, actualStyle: cursor, error: null };
        },
        { map: mapHandle, nodeId, nodeType: params.nodeType },
      );

      // 3. Handle per-target evaluation errors
      if (evalResult.error) {
        errorEvidence.push({
          command: JSON.stringify({ nodeType: params.nodeType, ...target, expectedStyles, expectedStates }),
          message: `Style resolution failed (${targetLabel(target)}): ${evalResult.error}`,
        });
        continue;
      }

      // 4. Build checks for this target
      const style = evalResult.actualStyle;

      for (const key of Object.keys(styleCheckConfigs) as Array<keyof typeof expectedStyles>) {
        if (expectedStyles[key] === undefined) continue;
        const cfg    = styleCheckConfigs[key as string];
        const actual = cfg.actual(style);

        if (cfg.type === 'color') {
          const range   = expectedStyles[key] as ColorRange;
          const inRange = !!(actual && isHexColorInRange(actual, range.from, range.to));
          allChecks.push({
            property:  cfg.property,
            expected:  range.negate ? `NOT ${range.from}–${range.to}` : `${range.from}–${range.to}`,
            actual,
            result:    (range.negate ? !inRange : inRange) ? 'pass' : 'fail',
            paramPath: `expectedStyles.${key}`,
            target,
          });
        } else {
          const param    = expectedStyles[key] as ExactParam;
          const expected = cfg.resolveExpected(param.value);
          const matches  = actual === expected;
          allChecks.push({
            property:  cfg.property,
            expected:  param.negate ? `NOT ${expected}` : expected,
            actual,
            result:    (param.negate ? !matches : matches) ? 'pass' : 'fail',
            paramPath: `expectedStyles.${key}`,
            target,
          });
        }
      }

      const stateActualMap: Record<string, any> = {
        tag:         evalResult.tag,
        hover:       evalResult.isHovered,
        state:       evalResult.state,
        description: evalResult.description,
      };

      for (const key of ['tag', 'hover', 'state', 'description'] as const) {
        if (expectedStates[key] === undefined) continue;
        const actual = stateActualMap[key] ?? null;
        const param  = expectedStates[key] as ExactParam;

        const isFilteredWildcard = key === 'tag' && param.value === 'filtered';
        const matches = isFilteredWildcard
          ? typeof actual === 'string' && !actual.startsWith('filtered')
          : actual === param.value;

        allChecks.push({
          property:  key,
          expected:  param.negate
            ? `NOT ${isFilteredWildcard ? 'filtered*' : param.value}`
            : isFilteredWildcard ? 'filtered*' : param.value,
          actual,
          result:    (param.negate ? !matches : matches) ? 'pass' : 'fail',
          paramPath: `expectedStates.${key}`,
          target,
        });
      }
    }

    // ── Aggregate results ────────────────────────────────────────────────────
    const passed  = allChecks.every(c => c.result === 'pass') && errorEvidence.length === 0;
    const failed  = allChecks.filter(c => c.result === 'fail');
    const matched = allChecks.filter(c => c.result === 'pass');
    const status  = passed ? 'pass' : 'fail';

    const checksEvidence = allChecks.map(c => ({
      command: JSON.stringify({
        nodeType: params.nodeType,
        ...c.target,
        [c.paramPath]: (() => {
          const raw = c.paramPath.startsWith('expectedStyles')
            ? expectedStyles[(c.paramPath.split('.')[1]) as keyof typeof expectedStyles]
            : expectedStates[(c.paramPath.split('.')[1]) as keyof typeof expectedStates];
          return { ...(raw as object), negate: (raw as any)?.negate ?? false };
        })(),
      }),
      message: c.result === 'pass'
        ? `Validation passed: ${c.property}="${c.actual}" (${targetLabel(c.target)})`
        : `Validation failed: ${c.property} expected "${c.expected}" got "${c.actual}" (${targetLabel(c.target)})`,
    }));

    response.addTextResult(JSON.stringify({
      summary: {
        total:  allChecks.length,
        passed: matched.length,
        failed: failed.length + errorEvidence.length,
        status,
        evidence: [...checksEvidence, ...errorEvidence],
      },
    }, null, 2));
  },
});
