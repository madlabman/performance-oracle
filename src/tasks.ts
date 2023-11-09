import { PubkeyHex } from '@lodestar/api/keymanager';
import { Epoch, RootHex, Slot } from '@lodestar/types';
import { SignedBeaconBlock } from '@lodestar/types/bellatrix';
import { AbiCoder, BlockTag, ZeroHash, keccak256 } from 'ethers';
import pLimit from 'p-limit';
import * as R from 'ramda';

import { artifactExists, fromString, saveArtifact } from './artifacts.js';
import * as Cache from './cache.js';
import { catCID, uploadFile } from './ipfs.js';
import { buildTree } from './merkle.js';
import { shared as Shared } from './shared.js';
import { CSFeeOracle } from './typechain/Oracle.js';
import { Artifact, ValidatorInfo } from './types.js';
import { debug, isUint64, toHex } from './utils.js';

export async function main(): Promise<void> {
    const limit = pLimit(Shared.CONFIG.MAX_CONCURRENCY); // number of parallel tasks

    // TODO: place somewhere else?
    Cache.destroy();

    const clBlock = await getLastFinalizedBeaconBlock();
    let blockTag = getBlockTag(clBlock);
    blockTag = 'latest';

    if (!(await isReportable())) {
        debug('Report is not allowed');
        return;
    }

    const refSlot = await nextReportRefSlot(blockTag);
    debug('refSlot is', refSlot);

    if (refSlot > clBlock.message.slot) {
        debug('Target refSlot is not reached yet');
        return;
    }

    const prevRefSlot = await prevReportRefSlot(blockTag);
    if (prevRefSlot == refSlot) {
        debug('Processing is already done');
        return;
    }

    // reference slots are the last slots of the corresponding epochs
    const sourceEpoch = slotToEpoch(prevRefSlot) + 1;
    const targetEpoch = slotToEpoch(refSlot);
    debug('Report frame in epochs is', [sourceEpoch, targetEpoch]);

    if (artifactExists(sourceEpoch, targetEpoch)) {
        debug('Report tree artifact already exists');
        return;
    }

    const prevTreeCID = await Shared.ORACLE.treeCid({
        blockTag,
    });

    if (R.isEmpty(prevTreeCID)) {
        debug('No previous report tree CID found');
        // TODO: rebuild the tree from the scratch
    } else {
        debug('Reading the previous tree from IPFS by CID', prevTreeCID);
        const artifact = fromString(await catCID(prevTreeCID));
        const prevTree = artifact.tree;

        debug('Check the tree root');
        const prevRoot = await Shared.ORACLE.treeRoot({
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
    await loadValidators();

    debug('Fetching duties');
    await Promise.all(
        Array.from(iterEpochs(sourceEpoch, targetEpoch)).map((epoch) =>
            limit(() => lookupCommittees(epoch)),
        ),
    );

    debug('Check duties');
    await Promise.all(
        Array.from(iterEpochs(sourceEpoch, targetEpoch)).map((epoch) =>
            limit(() => checkEpochSlots(epoch)),
        ),
    );

    // TODO: read the threshold from somewhere
    Cache.excludeFromStats(belowThreshold(0.9));

    const feeShares = await Shared.STETH.sharesOf(Shared.CONFIG.CSM_ADDRESS, {
        blockTag, // FIXME: use blockTag of the closest AO report, maybe?
    });
    const distributed = distributeFees(feeShares);
    if (distributed === 0n) {
        debug('No fees to distribute');
        return;
    }

    const leafs = R.sortBy(R.prop(0), [...Cache.rewards.entries()]);
    debug('Rewards distribution', leafs);
    const tree = buildTree(leafs);
    debug('Report tree root', tree.root);

    debug('Saving the artifact');
    const artifact: Artifact = {
        distributed,
        sourceEpoch,
        targetEpoch,
        tree,
    };
    const filename = saveArtifact(artifact);
    debug(`Artifact saved to ${filename}`);

    // Uploading the tree optimistically
    debug('Uploading the artifact to IPFS');
    const cid = await uploadFile(filename);
    debug('Tree uploaded, CID is', cid.IpfsHash);

    const report = {
        consensusVersion: Shared.CONSENSUS_VERSION,
        refSlot: refSlot,
        treeRoot: tree.root,
        treeCid: cid.IpfsHash,
        distributed: distributed,
    };
    const reportHash = hashReport(report);

    const { currentFrameMemberReport } =
        await Shared.HASHCONSENSUS.getConsensusStateForMember(
            Shared.SIGNER.address,
        );
    if (currentFrameMemberReport == reportHash) {
        debug('Provided hash already submitted');
        return;
    }

    debug('Simulating sending report hash');
    await Shared.HASHCONSENSUS.connect(Shared.SIGNER).submitReport.staticCall(
        refSlot,
        reportHash,
        Shared.CONSENSUS_VERSION,
    );
    debug('Simulation successfull!');

    debug('Sending the report');
    await Shared.HASHCONSENSUS.connect(Shared.SIGNER).submitReport(
        refSlot,
        reportHash,
        Shared.CONSENSUS_VERSION,
    );
    debug('Report sent, storing the artifact');

    const { currentFrameConsensusReport } =
        await Shared.HASHCONSENSUS.getConsensusStateForMember(
            Shared.SIGNER.address,
        );

    if (currentFrameConsensusReport == ZeroHash) {
        debug('No consensus reached');
        return;
    }

    if (currentFrameConsensusReport != reportHash) {
        debug('Oracle`s hash differs from consensus report hash. Exiting');
        return;
    }

    // TODO: check for fast lane
    const treeRoot = await Shared.ORACLE.treeRoot();
    if (treeRoot == tree.root) {
        debug('Report already settled');
        return;
    }

    debug('Settling the report');
    debug('Simulating sending report data');
    await Shared.ORACLE.connect(Shared.SIGNER).submitReportData.staticCall(
        report,
        Shared.CONTRACT_VERSION,
    );
    debug('Simulation successfull!');

    debug('Sending report data');
    await Shared.ORACLE.connect(Shared.SIGNER).submitReportData(
        report,
        Shared.CONTRACT_VERSION,
    );
    debug('Report data sent!');
    debug('Done');
}

async function nextReportRefSlot(blockTag: BlockTag): Promise<Slot> {
    const { refSlot } = await Shared.HASHCONSENSUS.getCurrentFrame({
        blockTag,
    });

    if (!isUint64(refSlot)) {
        throw new Error('Next report refSlot is too big');
    }

    return Number(refSlot) as Slot;
}

async function prevReportRefSlot(blockTag: BlockTag): Promise<Slot> {
    const refSlot = await Shared.ORACLE.getLastProcessingRefSlot({
        blockTag,
    });

    if (!isUint64(refSlot)) {
        throw new Error('Prev report refSlot is too big');
    }

    return Number(refSlot) as Slot;
}

async function loadValidators() {
    const vals = await getModuleValidators();
    debug('Found validators:', vals.length);
    for (const v of vals) {
        Cache.indexToPubkey.set(v.index, toHex(v.validator.pubkey));
    }
}

async function lookupCommittees(epoch: Epoch) {
    debug('Looking up committees for epoch', epoch);
    const epochCommittees = await getEpochCommittees(epoch);
    epochCommittees.map((committee) => {
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
                d.forEach((c) => {
                    if (a.aggregationBits.get(c.position)) {
                        const p = Cache.stats.get(
                            Cache.indexToPubkey.get(c.validatorIndex),
                        );
                        if (p) {
                            p.missedAttestations--;
                        }
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

// Inclusive iterator over the epochs
function* iterEpochs(start: Epoch, end: Epoch): Generator<Epoch> {
    for (const epoch of R.range(start, end + 1)) {
        yield epoch;
    }
}

function belowThreshold(threshold: number) {
    return R.pipe(validatorPerf, R.lt(R.__, threshold));
}

function validatorPerf(v: ValidatorInfo) {
    return (
        (v.assignedAttestations - v.missedAttestations) / v.assignedAttestations
    );
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
        // TODO: double-check that it works for all clients
        if (r.status == 404) {
            return [];
        }
        throw new Error(r.error?.message);
    }
    return r.response.data;
}

async function isReportable(): Promise<boolean> {
    const isPaused = await Shared.ORACLE.isPaused();
    if (isPaused) {
        return false;
    }

    return true;
}

function getBlockTag(clBlock: SignedBeaconBlock): RootHex | number {
    return toHex(clBlock.message.body.executionPayload.blockHash);
}

async function getEpochCommittees(epoch: number) {
    const r = await Shared.CL.beacon.getEpochCommittees('finalized', {
        epoch,
    });
    if (!r.ok) {
        throw new Error(r.error?.message);
    }
    return r.response.data;
}

function epochStartSlot(epoch: Epoch): Slot {
    return epoch * 32;
}

function slotToEpoch(slot: Slot): Epoch {
    return Math.floor(slot / 32);
}

async function getModuleValidators() {
    const keys = await loadCSMpubkeys();
    const r = await Shared.CL.beacon.getStateValidators('finalized', {
        // TODO: it's required to bacth keys probably
        id: keys,
    });
    if (!r.ok) {
        throw new Error(r.error?.message);
    }

    return r.response.data;
}

// TODO: actual implementation for the method
async function loadCSMpubkeys() {
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

function distributeFees(totalShares: bigint): bigint {
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

    const sumOfShares = R.reduce(addBn, 0n, R.values(shareByNO));
    if (sumOfShares === 0n) {
        return 0n;
    }

    let distributed = 0n;

    for (const [no, share] of R.toPairs(shareByNO)) {
        const reward = (share * totalShares) / sumOfShares;
        Cache.addReward(Number(no), reward);
        distributed += reward;
    }

    return distributed;
}

function hashReport(s: CSFeeOracle.ReportDataStruct) {
    return keccak256(
        AbiCoder.defaultAbiCoder().encode(
            ['tuple(uint256,uint256,bytes32,string,uint256)'],
            [R.values(s)],
        ),
    );
}

function addBn(a: bigint, b: bigint) {
    return a + b;
}
