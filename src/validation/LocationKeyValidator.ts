import { LocKey, LocKeyArray } from "@fjell/core";
import { Coordinate } from "@fjell/registry";
import LibLogger from "../logger";

const logger = LibLogger.get('LocationKeyValidator');

/**
 * Validates that location keys in a LocKeyArray are in the correct hierarchical order
 * based on the entity's coordinate definition.
 *
 * @param locations - The location key array to validate
 * @param coordinate - The coordinate defining the expected hierarchy
 * @param operation - The name of the operation being performed (for error messages)
 * @throws Error if location keys are not in the correct order or if the array is invalid
 */
export const validateLocations = <
  S extends string,
  L1 extends string = never,
  L2 extends string = never,
  L3 extends string = never,
  L4 extends string = never,
  L5 extends string = never
>(
    locations: LocKeyArray<L1, L2, L3, L4, L5> | [] | undefined,
    coordinate: Coordinate<S, L1, L2, L3, L4, L5>,
    operation: string
  ): void => {
  if (!locations || locations.length === 0) {
    return;
  }

  const keyTypeArray = coordinate.kta;
  const expectedLocationTypes = keyTypeArray.slice(1); // Skip the first element (primary key type)
  const actualLocationTypes = (locations as Array<LocKey<L1 | L2 | L3 | L4 | L5>>).map(loc => loc.kt);

  logger.debug(`Validating locations for ${operation}`, {
    expected: expectedLocationTypes,
    actual: actualLocationTypes,
    coordinate: keyTypeArray
  });

  // Check if too many location keys were provided
  if (actualLocationTypes.length > expectedLocationTypes.length) {
    logger.error('Location key array has too many elements', {
      expected: expectedLocationTypes.length,
      actual: actualLocationTypes.length,
      expectedTypes: expectedLocationTypes,
      actualTypes: actualLocationTypes,
      coordinate,
      operation
    });
    throw new Error(
      `Invalid location key array for ${operation}: ` +
      `Expected at most ${expectedLocationTypes.length} location keys ` +
      `(hierarchy: [${expectedLocationTypes.join(', ')}]), ` +
      `but received ${actualLocationTypes.length} ` +
      `(types: [${actualLocationTypes.join(', ')}])`
    );
  }

  // Validate that each location key is in the correct hierarchical position
  for (let i = 0; i < actualLocationTypes.length; i++) {
    if (expectedLocationTypes[i] !== actualLocationTypes[i]) {
      logger.error('Location key array order mismatch', {
        position: i,
        expected: expectedLocationTypes[i],
        actual: actualLocationTypes[i],
        expectedHierarchy: expectedLocationTypes,
        actualOrder: actualLocationTypes,
        coordinate,
        operation
      });
      throw new Error(
        `Invalid location key array order for ${operation}: ` +
        `At position ${i}, expected key type "${expectedLocationTypes[i]}" ` +
        `but received "${actualLocationTypes[i]}". ` +
        `Location keys must be ordered according to the hierarchy: [${expectedLocationTypes.join(', ')}]. ` +
        `Received order: [${actualLocationTypes.join(', ')}]`
      );
    }
  }

  logger.debug(`Location key array validation passed for ${operation}`, { locations });
};

