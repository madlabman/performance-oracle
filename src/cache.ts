import { Slot, ValidatorIndex } from '@lodestar/types';

import {
    CommitteePosition,
    NOIndex,
    PubkeyHex,
    ValidatorInfo,
} from './types.js';
import { debug } from './utils.js';

export const indexToPubkey = new Map<ValidatorIndex, PubkeyHex>();

export const pubkeyToNO = new Map<PubkeyHex, NOIndex>();

export const duties = new Map<Slot, CommitteePosition[]>();

export const stats = new Map<PubkeyHex, ValidatorInfo>();

export const rewards = new Map<NOIndex, bigint>();

export function destroy() {
    indexToPubkey.clear();
    pubkeyToNO.clear();
    duties.clear();
    stats.clear();
    rewards.clear();
}

export function isTrackedValidator(index: ValidatorIndex): boolean {
    return indexToPubkey.has(index);
}

export function addValidatorToSlotDuty(
    index: ValidatorIndex,
    slot: Slot,
    pos: number,
): void {
    const duty = duties.get(slot) || [];
    duty.push({ validatorIndex: index, position: pos });
    duties.set(slot, duty);

    const pubkey = indexToPubkey.get(index);
    const buf = stats.get(pubkey) || {
        assignedAttestations: 0,
        missedAttestations: 0,
    };
    buf.assignedAttestations++;
    buf.missedAttestations++;
    stats.set(pubkey, buf);
}

export function excludeFromStats(pred: (v: ValidatorInfo) => boolean) {
    for (const [index, p] of stats) {
        if (pred(p)) {
            stats.delete(index);
            debug('Excluded NO from rewards', [index, p]);
        }
    }
}

export function addReward(index: NOIndex, reward: bigint): void {
    const buf = rewards.get(index) || BigInt(0);
    rewards.set(index, buf + reward);
}
