import { Epoch, ValidatorIndex } from '@lodestar/types';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

export type Config = {
    EL_URI: string;
    CL_URI: string;
    CL_TIMEOUT: number;
    CSM_ADDRESS: string;
    STETH_ADDRESS: string;
    ORACLE_ADDRESS: string;
    CONSENSUS_ADDRESS: string;
    PINATA_API_KEY: string;
    PINATA_SECRET_API_KEY: string;
    SIGNER_KEY: string;
    ARTIFACTS_DIR: string;
    MAX_CONCURRENCY: number;
    DEBUG: boolean;
};

export type CommitteePosition = {
    validatorIndex: ValidatorIndex;
    position: number;
};

export type ValidatorInfo = {
    assignedAttestations: number;
    missedAttestations: number;
};

export type NodeOperatodID = number;

export type PubkeyHex = string;

export type MerkleTree = StandardMerkleTree<[number, bigint]>;

export type Artifact = {
    distributed: bigint;
    sourceEpoch: Epoch;
    targetEpoch: Epoch;
    tree: MerkleTree;
};

