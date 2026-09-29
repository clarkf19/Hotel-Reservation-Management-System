/**
 * UML class: RoomType
 *   roomTypeId, typeName, description, baseRate, maxOccupancy
 *   + getBaseRate(): double
 * SRS data dictionary: room category = [standard | deluxe | suite | accessible]
 */
import { toNumber } from '../lib/money.js';

export class RoomType {
  static getBaseRate(roomType) {
    return toNumber(roomType.baseRate);
  }
}
