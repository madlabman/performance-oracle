import { PubkeyHex } from '@lodestar/api/keymanager';
import { Epoch, RootHex, Slot } from '@lodestar/types';
import { SignedBeaconBlock } from '@lodestar/types/allForks';
import { BlockTag } from 'ethers';
import * as R from 'ramda';

import { readArtifact, saveArtifact } from './artifacts.js';
import * as Cache from './cache.js';
import { catCID, uploadTree } from './ipfs.js';
import { buildTree, loadTree } from './merkle.js';
import { shared as Shared } from './shared.js';
import { ValidatorInfo } from './types.js';
import { debug, toHex } from './utils.js';

export async function main(): Promise<void> {
    // TODO: place somewhere else?
    Cache.destroy();

    const clBlock = await getLastFinalizedBeaconBlock();
    const blockTag = getBlockTag(clBlock);

    if (!(await isReportable(blockTag))) {
        debug('Report is not allowed');
        return;
    }

    const targetEpoch = await Shared.ORACLE.nextReportEpoch({
        blockTag,
    });
    debug('Target epoch is', targetEpoch);

    if (targetEpoch > slotToEpoch(clBlock.message.slot)) {
        debug('Target epoch is not reached yet');
        return;
    }

    // TODO: query report frame instead
    const sourceEpoch = await Shared.ORACLE.lastConsolidatedEpoch({
        blockTag,
    });
    debug('Source epoch is', sourceEpoch);

    const artifact = readArtifact(Number(sourceEpoch), Number(targetEpoch));
    if (!R.isNil(artifact)) {
        debug('Report tree artifact already exists');
        return;
    }

    const prevTreeCID = await Shared.ORACLE.treeCid({
        blockTag,
    });

    if (R.isEmpty(prevTreeCID)) {
        debug('No previous report tree CID found');
    } else {
        debug('Reading the previous tree from IPFS by CID', prevTreeCID);
        const prevTree = loadTree(await catCID(prevTreeCID));

        debug('Check the tree root');
        const prevRoot = await Shared.ORACLE.reportRoot({
            blockTag,
        });

        if (prevTree.root !== prevRoot) {
            throw new Error('Tree root mismatch');
        }

        debug('Fill in the rewards cache');
        for (const [_, [no, reward]] of prevTree.entries()) {
            Cache.rewards.set(no, reward);
        }
    }

    debug('Loading validators');
    await loadValidators(Number(targetEpoch));

    debug('Fetching duties');
    // TODO: fix range
    for (const epoch of R.range(Number(sourceEpoch), Number(targetEpoch))) {
        await lookupCommittees(epoch);
    }

    debug('Check duties');
    // TODO: fix range
    for (const epoch of R.range(Number(sourceEpoch), Number(targetEpoch))) {
        await checkEpochSlots(epoch);
    }

    // TODO: read the threshold from somewhere
    Cache.excludeFromStats(belowThreshold(0.9));

    const feeShares = await Shared.STETH.sharesOf(Shared.CONFIG.CSM_ADDRESS);
    const distributed = distributeFees(feeShares + 42n);

    const leafs = R.sortBy(R.prop(0), [...Cache.rewards.entries()]);
    debug('Rewards distribution', leafs);
    const tree = buildTree(leafs);
    debug('Report tree root', tree.root);
    saveArtifact(Number(sourceEpoch), Number(targetEpoch), tree);

    // TODO: Simulate report sending
    await Shared.ORACLE.connect(Shared.SIGNER).submitReport.staticCall(
        targetEpoch,
        tree.root,
        distributed,
        '', // CID TBA, but can be precalculated
    );

    const cid = await uploadTree(tree);
    // TODO: send a report
    await Shared.ORACLE.connect(Shared.SIGNER).submitReport(
        targetEpoch,
        tree.root,
        distributed,
        cid.toString(),
    );

    debug('Report sent, storing the artifact');
    saveArtifact(Number(sourceEpoch), Number(targetEpoch), tree);
}

async function loadValidators(epoch: Epoch) {
    const vals = await getModuleValidators(epochLastSlot(epoch));
    for (const v of vals) {
        if (v.validator.slashed) {
            continue;
        }
        Cache.indexToPubkey.set(v.index, toHex(v.validator.pubkey));
    }
}

async function lookupCommittees(epoch: Epoch) {
    debug('Looking up committees for epoch', epoch);
    const epochCommitees = await getEpochCommmittees(epoch);
    epochCommitees.map((committee) => {
        committee.validators.forEach((index, pos) => {
            if (Cache.isTrackedValidator(index)) {
                Cache.addValidatorToSlotDuty(index, committee.slot, pos);
            }
        });
    });
}

async function checkEpochSlots(epoch: Epoch) {
    debug('Checking epoch slots', epoch);
    for (const slot of iterSlotsInEpoch(epoch)) {
        const atts = await getSlotAttestations(slot);
        atts.forEach((a) => {
            const d = Cache.duties.get(a.data.slot);
            if (d) {
                d.forEach((c, i) => {
                    if (a.aggregationBits.get(c.position)) {
                        const p = Cache.stats.get(
                            Cache.indexToPubkey.get(c.validatorIndex),
                        );
                        if (p) {
                            p.missedAttestations--;
                        }
                        delete d[i];
                    }
                });
            }
        });
    }
}

function* iterSlotsInEpoch(epoch: Epoch): Generator<Slot> {
    for (const slot of R.range(
        epochStartSlot(epoch),
        epochStartSlot(epoch + 1),
    )) {
        yield slot;
    }
}

function belowThreshold(threshold: number) {
    return R.pipe(validatorPerf, R.lt(R.__, threshold));
}

function validatorPerf(v: ValidatorInfo) {
    return (v.assignedAttestations - v.missedAttestations) / v.assignedAttestations;
}

async function getLastFinalizedBeaconBlock(): Promise<SignedBeaconBlock> {
    debug('Loading the last finalized block');
    // ask CL for the latest finalized block
    const r = await Shared.CL.beacon.getBlockV2('finalized');
    if (!r.ok) {
        throw new Error(r.error?.message);
    }
    const result = r.response.data;
    debug('Last finalized slot is', result.message.slot);
    return result;
}

async function getSlotAttestations(slot: Slot) {
    const r = await Shared.CL.beacon.getBlockAttestations(slot);
    if (!r.ok) {
        if (R.includes('NOT_FOUND: beacon block at slot', r.error?.message)) {
            return [];
        }
        throw new Error(r.error?.message);
    }
    return r.response.data;
}

async function isReportable(blockTag: BlockTag): Promise<boolean> {
    const isPaused = await Shared.ORACLE.paused({ blockTag });
    if (isPaused) {
        return false;
    }

    return true;
}

function getBlockTag(clBlock: SignedBeaconBlock): RootHex | number {
    return toHex(clBlock.message.body.eth1Data.blockHash);
}

async function getEpochCommmittees(epoch: number) {
    const r = await Shared.CL.beacon.getEpochCommittees(epochLastSlot(epoch), {
        epoch,
    });
    if (!r.ok) {
        if (R.includes('NOT_FOUND: beacon block at slot', r.error?.message)) {
            return [];
        }
        throw new Error(r.error?.message);
    }
    return r.response.data;
}

function epochStartSlot(epoch: Epoch): Slot {
    return epoch * 32;
}

function epochLastSlot(epoch: Epoch): Slot {
    return epoch * 32 + 31;
}

function slotToEpoch(slot: Slot): Epoch {
    return Math.floor(slot / 32);
}

async function getModuleValidators(slot: Slot) {
    const keys = await loadCSMpubkeys(slot);
    const r = await Shared.CL.beacon.getStateValidators(slot, {
        // TODO: it's required to bacth keys probably
        id: keys,
    });
    if (!r.ok) {
        throw new Error(r.error?.message);
    }

    return r.response.data;
}

// TODO: actual implementation for the method
async function loadCSMpubkeys(_: Slot) {
    // Expect iterator of pubkeys by NO
    const iter = new Map([
        [
            0,
            [
                '0x83f06933e9e536a16ab0f549815384208f209ec7013d611f6d2c272706ed7a453d63fe5a23d5e2f2847b85808463c906',
                '0x93834e95429f57bb056cfd1a6981c58bbfbf65269d20165d966448623dee8108fd4f287f7fa8c1edcbc0c1aec7bdf2c6',
            ],
        ],
        [
            1,
            [
                '0xa6b8a4ed078c1661891a5340d8b8dc5ebc37aca38ade920a8208444f050e562fc8fa14ea9dec20822ccfb3cb64339d84',
                '0x899d93e933a1214112e1e65190012df7fa6c7dbbcb8c0b4b05a78a441ba818544731d27b552c237bdb21bb4b9d8e2c78',
            ],
        ],
        [
            2,
            [
                '0x80911fc8d74fd025456ace07c3bba4f353d2960129b53ad20e14d5e37566d533e3d311851623014bc5f5c899265be387', // exited
            ],
        ],
    ]);

    for (const [no, pubkeys] of iter) {
        for (const pubkey of pubkeys) {
            Cache.pubkeyToNO.set(pubkey, no);
        }
    }

    return Array.from(Cache.pubkeyToNO.keys());
}

function distributeFees(totalShares: bigint) {
    type Share = { pubkey: PubkeyHex; share: bigint };

    const shareByPubkey = [] as Share[];
    Cache.stats.forEach((v, k) => {
        shareByPubkey.push({
            share: BigInt(v.assignedAttestations),
            pubkey: k,
        });
    });

    const shareByNO = R.reduceBy<Share, bigint>(
        (acc: bigint, { share }) => acc + share,
        0n,
        ({ pubkey }) => {
            const idx = Cache.pubkeyToNO.get(pubkey);
            if (R.isNil(idx)) {
                throw new Error(`No NO for pubkey ${pubkey}`);
            }
            return idx.toString();
        },
        shareByPubkey,
    );

    const sumOfShares = R.reduce(add, 0n, R.values(shareByNO));
    let distributed = 0n;

    for (const [no, share] of R.toPairs(shareByNO)) {
        const reward = (share * totalShares) / sumOfShares;
        Cache.addReward(Number(no), reward);
        distributed += reward;
    }

    return distributed;
}

function add(a: any, b: any) {
    return a + b;
}
