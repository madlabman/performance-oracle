import fs from 'fs';

import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { parse, stringify } from 'yaml';

import { MerkleTree } from './types.js';

export function buildTree(values: [number, bigint][]): MerkleTree {
    return StandardMerkleTree.of(values, ['uint64', 'uint256']);
}

export function loadTree(input: string): StandardMerkleTree<[number, bigint]> {
    const data = parse(input, {
        intAsBigInt: true,
    });
    return StandardMerkleTree.load(data);
}

export function toString(t: MerkleTree): string {
    return stringify(t.dump());
}

export function toFile(t: MerkleTree, p: string) {
    fs.writeFileSync(p, toString(t));
}
