/**
 * UML «interface» SmartLockController (external actor "Smart Lock Controller")
 *   + unlock(keyCode: String): Boolean
 * Relationship: DigitalKey ..uses..> SmartLockController
 * SRS: HI-3 (NFC/QR-capable smart door lock controllers), DE-3, 5.2 Safety (physical master key fallback)
 *
 * IMPLEMENTATION DECISION: this is a SIMULATION of the lock controller fitted to each
 * room door. It does not control any physical hardware. Each simulated controller
 * asks the HRMS key registry whether a presented key is valid (activity diagram:
 * Smart Lock lane "Validate Digital Key" -> <Key Valid?> -> "Unlock Room" | "Deny Access")
 * and keeps a small amount of door state (locked / unlocked, auto re-lock).
 */
const doorState = new Map(); // roomNumber -> { unlockedUntil, lastEvent }
const RELOCK_MS = 6000;

export class SimulatedSmartLockController {
  constructor(roomNumber, keyValidator) {
    this.roomNumber = roomNumber;
    this.keyValidator = keyValidator; // (keyCode, roomNumber) => Promise<{ valid, reason }>
  }

  /** unlock(keyCode): returns true and opens the door only if the key is valid for this door. */
  async unlock(keyCode) {
    const verdict = await this.keyValidator(keyCode, this.roomNumber);
    const now = Date.now();
    doorState.set(this.roomNumber, { unlockedUntil: verdict.valid ? now + RELOCK_MS : 0, lastEvent: { at: new Date(now).toISOString(), granted: verdict.valid, reason: verdict.reason } });
    return { unlocked: verdict.valid, ...verdict, relockInMs: verdict.valid ? RELOCK_MS : 0 };
  }

  static state(roomNumber) {
    const s = doorState.get(roomNumber);
    return { roomNumber, locked: !s || s.unlockedUntil < Date.now(), lastEvent: s?.lastEvent ?? null };
  }
}
