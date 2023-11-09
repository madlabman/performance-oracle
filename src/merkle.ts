import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

import { MerkleTree } from './types.js';

export function buildTree(values: [number, bigint][]): MerkleTree {
    return StandardMerkleTree.of(values, ['uint256', 'uint256']);
}
